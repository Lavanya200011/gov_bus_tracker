import { Picker } from "@react-native-picker/picker"; // Import the Picker
import * as Location from "expo-location";
import React, { useEffect, useState } from "react";
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
  const [availableRoutes, setAvailableRoutes] = useState([]); // Database routes
  const [selectedRoute, setSelectedRoute] = useState(null); // The object {routeId, label}
  const [loading, setLoading] = useState(true);

  // 1. Fetch official routes from MongoDB via Socket
  useEffect(() => {
    if (!socket.connected) socket.connect();

    socket.emit("request_bus_list");

    socket.on("active_buses_list", (data) => {
      setAvailableRoutes(data);
      if (data.length > 0 && !selectedRoute) {
        setSelectedRoute(data[0]); // Default to first route
      }
      setLoading(false);
    });

    return () => socket.off("active_buses_list");
  }, []);

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
      console.log("✅ Registering Official Bus...");
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
        notificationBody: `Broadcasting: ${selectedRoute.label}`,
        notificationColor: "#2563eb",
      },
    });

    setIsTracking(true);
  };

  const stopTracking = async () => {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    setIsTracking(false);
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
              onValueChange={(itemValue) => {
                const route = availableRoutes.find(
                  (r) => r.routeId === itemValue,
                );
                setSelectedRoute(route);
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

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            {selectedRoute
              ? `Destination: ${selectedRoute.label}`
              : "Select a route to begin"}
          </Text>
        </View>

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
    fontSize: 10,
    fontWeight: "bold",
    color: "#9ca3af",
    marginBottom: 10,
    textAlign: "center",
  },
  pickerContainer: {
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 15,
    overflow: "hidden",
  },
  infoBox: { padding: 10, marginBottom: 20 },
  infoText: {
    textAlign: "center",
    color: "#6b7280",
    fontSize: 13,
    fontWeight: "600",
  },
  mainBtn: { padding: 18, borderRadius: 18, alignItems: "center" },
  startBtn: { backgroundColor: "#2563eb" },
  stopBtn: { backgroundColor: "#ef4444" },
  mainBtnText: { color: "#fff", fontWeight: "800" },
});
