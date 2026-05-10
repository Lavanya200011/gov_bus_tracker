import { Picker } from "@react-native-picker/picker";
import * as Location from "expo-location";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { BusRoute, isBusRoute } from "@/types/govbus";
import {
  clearLastSentBusLocation,
  LOCATION_TASK_NAME,
} from "../services/LocationTask";
import type { DriverSession } from "../utils/socket";
import socket, {
  clearCurrentBusRegistration,
  getDriverAuthToken,
  getDriverSession,
  loginDriver,
  logoutDriver,
  setCurrentBusRegistration,
} from "../utils/socket";

const DURATIONS_IN_MINUTES = [5, 60, 90, 120];
const LOCATION_UPDATE_INTERVAL_MS = 30000;
const LOCATION_DISTANCE_INTERVAL_METERS = 20;

export default function HomeScreen() {
  const [isTracking, setIsTracking] = useState(false);
  const [availableRoutes, setAvailableRoutes] = useState<BusRoute[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<BusRoute | null>(null);
  const [loading, setLoading] = useState(true);
  const [duration, setDuration] = useState(60);
  const [timeLeft, setTimeLeft] = useState(0);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [driverSession, setDriverSession] = useState<DriverSession | null>(
    null,
  );
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopTracking = useCallback(async () => {
    const hasStarted =
      await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);

    if (hasStarted) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }

    socket.emit("stop_bus");
    await clearLastSentBusLocation();
    await clearCurrentBusRegistration();
    setIsTracking(false);
    setTimeLeft(0);
    setExpiresAt(null);
    clearTimer();
  }, [clearTimer]);

  useEffect(() => {
    getDriverSession()
      .then(setDriverSession)
      .catch(() => setDriverSession(null));
  }, []);

  useEffect(() => {
    if (!socket.connected) {
      socket.connect();
    }

    socket.emit("request_bus_list");

    const handleBusList = (data: unknown) => {
      const routes = Array.isArray(data) ? data.filter(isBusRoute) : [];
      const allowedRouteIds = driverSession?.driver.allowedRouteIds ?? [];
      const driverRoutes =
        allowedRouteIds.length > 0
          ? routes.filter((route) => allowedRouteIds.includes(route.routeId))
          : routes;

      setAvailableRoutes(driverRoutes);
      setSelectedRoute((currentRoute) => {
        if (
          currentRoute &&
          driverRoutes.some((route) => route.routeId === currentRoute.routeId)
        ) {
          return currentRoute;
        }

        return driverRoutes[0] ?? null;
      });
      setLoading(false);
    };

    socket.on("active_buses_list", handleBusList);

    return () => {
      socket.off("active_buses_list", handleBusList);
      clearTimer();
    };
  }, [clearTimer, driverSession]);

  useEffect(() => {
    if (!isTracking || !expiresAt) {
      clearTimer();
      return;
    }

    const updateRemainingTime = () => {
      const nextTimeLeft = Math.max(
        Math.ceil((expiresAt - Date.now()) / 1000),
        0,
      );

      setTimeLeft(nextTimeLeft);

      if (nextTimeLeft === 0) {
        clearTimer();
      }
    };

    updateRemainingTime();
    timerRef.current = setInterval(updateRemainingTime, 1000);

    return clearTimer;
  }, [clearTimer, expiresAt, isTracking]);

  useEffect(() => {
    const handleBusRegistered = (data: unknown) => {
      const registeredBus = data as { expiresAt?: unknown };
      const serverExpiresAt = Number(registeredBus?.expiresAt);

      if (!Number.isFinite(serverExpiresAt)) {
        return;
      }

      setExpiresAt(serverExpiresAt);
      setTimeLeft(
        Math.max(Math.ceil((serverExpiresAt - Date.now()) / 1000), 0),
      );
    };

    const handleBusTimerExpired = () => {
      void stopTracking();
      Alert.alert(
        "Broadcast ended",
        "Your selected broadcast duration is complete.",
      );
    };

    const handleAuthError = async (message: unknown) => {
      if (isTracking) {
        await stopTracking();
      }

      await logoutDriver();
      setDriverSession(null);
      Alert.alert(
        "Driver login expired",
        typeof message === "string" ? message : "Please login again.",
      );
    };

    socket.on("bus_registered", handleBusRegistered);
    socket.on("bus_timer_expired", handleBusTimerExpired);
    socket.on("registration_error", handleAuthError);
    socket.on("location_error", handleAuthError);

    return () => {
      socket.off("bus_registered", handleBusRegistered);
      socket.off("bus_timer_expired", handleBusTimerExpired);
      socket.off("registration_error", handleAuthError);
      socket.off("location_error", handleAuthError);
    };
  }, [isTracking, stopTracking]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    return `${h > 0 ? `${h}h ` : ""}${m}m ${s}s`;
  };

  const startTracking = async () => {
    const driverAuthToken = await getDriverAuthToken();

    if (!driverAuthToken) {
      Alert.alert("Login required", "Driver login is required to broadcast.");
      return;
    }

    if (!selectedRoute) {
      Alert.alert("Error", "No route selected.");
      return;
    }

    const { status: foregroundStatus } =
      await Location.requestForegroundPermissionsAsync();

    if (foregroundStatus !== "granted") {
      Alert.alert(
        "Permission required",
        "Location access is required before the bus can broadcast.",
      );
      return;
    }

    const { status: backgroundStatus } =
      await Location.requestBackgroundPermissionsAsync();

    if (backgroundStatus !== "granted") {
      Alert.alert(
        "Background permission required",
        "Background location is required so commuters can see the bus when this app is minimized.",
      );
      return;
    }

    const selectedExpiresAt = Date.now() + duration * 60 * 1000;

    await clearLastSentBusLocation();
    await setCurrentBusRegistration(selectedRoute, selectedExpiresAt);

    const registerBus = () => {
      socket.emit("register_bus", {
        routeId: selectedRoute.routeId,
        label: selectedRoute.label,
        durationMinutes: duration,
        expiresAt: selectedExpiresAt,
        driverAuthToken,
      });
    };

    if (socket.connected) {
      registerBus();
    } else {
      socket.once("connect", registerBus);
      socket.connect();
    }

    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.High,
      timeInterval: LOCATION_UPDATE_INTERVAL_MS,
      distanceInterval: LOCATION_DISTANCE_INTERVAL_METERS,
      foregroundService: {
        notificationTitle: `GovBus ${selectedRoute.routeId}: Active`,
        notificationBody: `Broadcasting for ${formatTime(duration * 60)}`,
        notificationColor: "#2563eb",
      },
    });

    setExpiresAt(selectedExpiresAt);
    setTimeLeft(
      Math.max(Math.ceil((selectedExpiresAt - Date.now()) / 1000), 0),
    );
    setIsTracking(true);
  };

  const handleLogin = async () => {
    const nextUsername = username.trim();

    if (!nextUsername || !password) {
      Alert.alert("Login required", "Enter driver username and password.");
      return;
    }

    setIsLoggingIn(true);

    try {
      const session = await loginDriver(nextUsername, password);
      setDriverSession(session);
      setPassword("");
      socket.emit("request_bus_list");
    } catch (error) {
      Alert.alert(
        "Login failed",
        error instanceof Error ? error.message : "Driver login failed.",
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    if (isTracking) {
      await stopTracking();
    }

    await logoutDriver();
    setDriverSession(null);
    setAvailableRoutes([]);
    setSelectedRoute(null);
  };

  if (!driverSession) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>DRIVER LOGIN</Text>

        <View style={styles.card}>
          <Text style={styles.label}>USERNAME</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setUsername}
            placeholder="driver1"
            style={styles.input}
            value={username}
          />

          <Text style={styles.label}>PASSWORD</Text>
          <TextInput
            onChangeText={setPassword}
            placeholder="password"
            secureTextEntry
            style={styles.input}
            value={password}
          />

          <TouchableOpacity
            disabled={isLoggingIn}
            onPress={handleLogin}
            style={[styles.mainBtn, styles.startBtn]}
          >
            <Text style={styles.mainBtnText}>
              {isLoggingIn ? "LOGGING IN..." : "LOGIN"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>BUS LIVE</Text>

      <View style={styles.card}>
        <Text style={styles.label}>DRIVER CONSOLE</Text>
        <Text style={styles.driverName}>
          {driverSession.driver.username.toUpperCase()}
        </Text>

        {loading ? (
          <ActivityIndicator size="small" color="#2563eb" />
        ) : (
          <View style={styles.pickerContainer}>
            <Picker
              enabled={!isTracking}
              selectedValue={selectedRoute?.routeId}
              onValueChange={(routeId: string) => {
                const nextRoute =
                  availableRoutes.find((route) => route.routeId === routeId) ??
                  null;
                setSelectedRoute(nextRoute);
              }}
            >
              {availableRoutes.map((route) => (
                <Picker.Item
                  key={route.routeId}
                  label={`${route.routeId} - ${route.label}`}
                  value={route.routeId}
                />
              ))}
            </Picker>
          </View>
        )}

        <Text style={styles.label}>BROADCAST DURATION</Text>
        <View style={styles.pickerContainer}>
          <Picker
            enabled={!isTracking}
            selectedValue={duration}
            onValueChange={(minutes: number) => setDuration(minutes)}
          >
            {DURATIONS_IN_MINUTES.map((minutes) => (
              <Picker.Item
                key={minutes}
                label={minutes === 5 ? "5 Minutes" : `${minutes / 60} Hours`}
                value={minutes}
              />
            ))}
          </Picker>
        </View>

        {isTracking && (
          <View style={styles.timerDisplay}>
            <Text style={styles.timerLabel}>AUTO-STOP IN</Text>
            <Text style={styles.timerText}>{formatTime(timeLeft)}</Text>
          </View>
        )}

        <TouchableOpacity
          onPress={isTracking ? stopTracking : startTracking}
          style={[
            styles.mainBtn,
            isTracking ? styles.stopBtn : styles.startBtn,
          ]}
        >
          <Text style={styles.mainBtnText}>
            {isTracking ? "STOP BROADCAST" : "START BROADCAST"}
          </Text>
        </TouchableOpacity>

        {!isTracking && (
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>LOGOUT</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    padding: 20,
    justifyContent: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: "#374151",
    textAlign: "center",
    marginBottom: 30,
  },
  card: {
    backgroundColor: "#fff",
    padding: 25,
    borderRadius: 14,
    elevation: 5,
  },
  label: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#9ca3af",
    marginBottom: 8,
    textAlign: "center",
    letterSpacing: 1,
  },
  driverName: {
    color: "#1f2937",
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 15,
    textAlign: "center",
  },
  input: {
    backgroundColor: "#f9fafb",
    borderColor: "#e5e7eb",
    borderRadius: 12,
    borderWidth: 1,
    color: "#1f2937",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pickerContainer: {
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 15,
    overflow: "hidden",
  },
  timerDisplay: {
    backgroundColor: "#eff6ff",
    padding: 15,
    borderRadius: 15,
    marginBottom: 20,
    alignItems: "center",
  },
  timerLabel: { fontSize: 10, fontWeight: "bold", color: "#2563eb" },
  timerText: { fontSize: 20, fontWeight: "900", color: "#1e40af" },
  mainBtn: { padding: 18, borderRadius: 6, alignItems: "center" },
  startBtn: { backgroundColor: "rgb(58, 231, 130)" },
  stopBtn: { backgroundColor: "#ef4444" },
  mainBtnText: { color: "#fff", fontWeight: "800" },
  logoutBtn: { alignItems: "center", marginTop: 14, padding: 10 },
  logoutText: { color: "#6b7280", fontSize: 12, fontWeight: "900" },
});
