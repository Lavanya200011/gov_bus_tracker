import { Picker } from "@react-native-picker/picker";
import * as Location from "expo-location";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { LOCATION_TASK_NAME } from "../services/LocationTask";
import socket, {
  clearCurrentBusRegistration,
  setCurrentBusRegistration,
} from "../utils/socket";
import { BusRoute, isBusRoute } from "@/types/govbus";

const DURATIONS_IN_MINUTES = [5, 60, 90, 120];

export default function HomeScreen() {
  const [isTracking, setIsTracking] = useState(false);
  const [availableRoutes, setAvailableRoutes] = useState<BusRoute[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<BusRoute | null>(null);
  const [loading, setLoading] = useState(true);
  const [duration, setDuration] = useState(60);
  const [timeLeft, setTimeLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopTracking = useCallback(async () => {
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(
      LOCATION_TASK_NAME,
    );

    if (hasStarted) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }

    socket.emit("stop_bus");
    await clearCurrentBusRegistration();
    setIsTracking(false);
    setTimeLeft(0);
    clearTimer();
  }, [clearTimer]);

  useEffect(() => {
    if (!socket.connected) {
      socket.connect();
    }

    socket.emit("request_bus_list");

    const handleBusList = (data: unknown) => {
      const routes = Array.isArray(data) ? data.filter(isBusRoute) : [];

      setAvailableRoutes(routes);
      setSelectedRoute((currentRoute) => currentRoute ?? routes[0] ?? null);
      setLoading(false);
    };

    socket.on("active_buses_list", handleBusList);

    return () => {
      socket.off("active_buses_list", handleBusList);
      clearTimer();
    };
  }, [clearTimer]);

  useEffect(() => {
    if (!isTracking) {
      clearTimer();
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeLeft((previousTimeLeft) => {
        if (previousTimeLeft <= 1) {
          void stopTracking();
          return 0;
        }

        return previousTimeLeft - 1;
      });
    }, 1000);

    return clearTimer;
  }, [clearTimer, isTracking, stopTracking]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    return `${h > 0 ? `${h}h ` : ""}${m}m ${s}s`;
  };

  const startTracking = async () => {
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

    await setCurrentBusRegistration(selectedRoute);

    const registerBus = () => {
      socket.emit("register_bus", {
        routeId: selectedRoute.routeId,
        label: selectedRoute.label,
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
      timeInterval: 5000,
      distanceInterval: 10,
      foregroundService: {
        notificationTitle: `GovBus ${selectedRoute.routeId}: Active`,
        notificationBody: `Broadcasting for ${formatTime(duration * 60)}`,
        notificationColor: "#2563eb",
      },
    });

    setTimeLeft(duration * 60);
    setIsTracking(true);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>GOVBUS LIVE</Text>

      <View style={styles.card}>
        <Text style={styles.label}>DRIVER CONSOLE</Text>

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
    borderRadius: 24,
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
  mainBtn: { padding: 18, borderRadius: 18, alignItems: "center" },
  startBtn: { backgroundColor: "#2563eb" },
  stopBtn: { backgroundColor: "#ef4444" },
  mainBtnText: { color: "#fff", fontWeight: "800" },
});
