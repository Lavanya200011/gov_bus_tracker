import { Picker } from "@react-native-picker/picker";
import * as Location from "expo-location";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LOCATION_TASK_NAME } from "../services/LocationTask";
import socket from "../utils/socket";

export default function HomeScreen() {
  const [isTracking, setIsTracking] = useState(false);
  const [availableRoutes, setAvailableRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [loading, setLoading] = useState(true);

  // --- TIMER STATES ---
  const [duration, setDuration] = useState(60); // Default 60 mins
  const [timeLeft, setTimeLeft] = useState(0); // Seconds remaining
  const timerRef = useRef(null);

  useEffect(() => {
    if (!socket.connected) socket.connect();
    socket.emit("request_bus_list");

    socket.on("active_buses_list", (data) => {
      setAvailableRoutes(data);
      if (data.length > 0 && !selectedRoute) {
        setSelectedRoute(data[0]);
      }
      setLoading(false);
    });

    return () => {
      socket.off("active_buses_list");
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Timer Logic
  useEffect(() => {
    if (isTracking && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            stopTracking();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isTracking, timeLeft]);

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h > 0 ? h + "h " : ""}${m}m ${s}s`;
  };

  const startTracking = async () => {
    if (!selectedRoute) return Alert.alert("Error", "No route selected");

    const { status: foreStatus } =
      await Location.requestForegroundPermissionsAsync();
    const { status: backStatus } =
      await Location.requestBackgroundPermissionsAsync();

    if (foreStatus !== "granted" || backStatus !== "granted") {
      Alert.alert("Permission Denied", "Background location is required!");
      return;
    }

    const registerBus = () => {
      socket.emit("register_bus", {
        routeId: selectedRoute.routeId,
        label: selectedRoute.label,
      });
    };

    if (socket.connected) registerBus();
    else socket.once("connect", registerBus);

    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.High,
      timeInterval: 5000,
      distanceInterval: 10,
      foregroundService: {
        notificationTitle: `GovBus ${selectedRoute.routeId}: Active`,
        notificationBody: `Time Left: ${formatTime(duration * 60)}`,
        notificationColor: "#2563eb",
      },
    });

    setTimeLeft(duration * 60);
    setIsTracking(true);
  };

  const stopTracking = async () => {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    socket.emit("stop_bus");
    setIsTracking(false);
    setTimeLeft(0);
    clearInterval(timerRef.current);
  };

  return (
    <View style={styles.container}>
      {/* 🚌 Bus Shortcut and dot removed from here */}

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
              onValueChange={(val) =>
                setSelectedRoute(availableRoutes.find((r) => r.routeId === val))
              }
            >
              {availableRoutes.map((r) => (
                <Picker.Item
                  key={r.routeId}
                  label={`${r.routeId} - ${r.label}`}
                  value={r.routeId}
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
            onValueChange={(itemValue) => setDuration(itemValue)}
          >
            <Picker.Item label="5 Minutes" value={5} />
            <Picker.Item label="1 Hour" value={60} />
            <Picker.Item label="1.5 Hours" value={90} />
            <Picker.Item label="2 Hours" value={120} />
          </Picker>
        </View>

        {isTracking && (
          <View style={styles.timerDisplay}>
            <Text style={styles.timerLabel}>AUTO-STOP IN:</Text>
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
    borderRadius: 30,
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
