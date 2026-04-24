import { useLocalSearchParams } from "expo-router"; // Added for navigation from Buses tab
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import socket from "../utils/socket";

export default function ExploreScreen() {
  const { selectedRoute } = useLocalSearchParams(); // Catch ID from Buses tab
  const [busLocation, setBusLocation] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [inputRoute, setInputRoute] = useState("101");
  const [activeRoute, setActiveRoute] = useState(null);
  const [isSearching, setIsSearching] = useState(false);

  const mapRef = useRef(null);
  const timerRef = useRef(null);
  // ⚡ FIX: Tracking if we have already centered on the current active bus
  const hasSnapped = useRef(false);

  // Handle incoming route from the "Active Buses" tab
  useEffect(() => {
    if (selectedRoute) {
      setInputRoute(selectedRoute as string);
      // Small delay to ensure component is ready
      setTimeout(() => handleShowBus(), 500);
    }
  }, [selectedRoute]);

  useEffect(() => {
    socket.connect();
    socket.on("connect", () => setIsConnected(true));

    socket.on("bus_moved", (data) => {
      if (data.routeId === activeRoute) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        setIsSearching(false);
        setBusLocation(data);

        // ⚡ FIX: Force map to move to the bus if it's the first data point
        if (!hasSnapped.current) {
          mapRef.current?.animateToRegion(
            {
              latitude: data.lat,
              longitude: data.lng,
              latitudeDelta: 0.05, // Slightly wider zoom for better context
              longitudeDelta: 0.05,
            },
            1000,
          );
          hasSnapped.current = true;
        }
      }
    });

    socket.on("route_not_active", (badRouteId) => {
      if (badRouteId === activeRoute) {
        if (timerRef.current) clearTimeout(timerRef.current);
        setIsSearching(false);
        setBusLocation(null);
        Alert.alert("Bus Not Found", `Route ${badRouteId} is not active.`);
      }
    });

    return () => {
      socket.off("bus_moved");
      socket.off("route_not_active");
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [activeRoute]);

  const handleShowBus = () => {
    if (!inputRoute.trim()) return Alert.alert("Error", "Enter Route ID");

    if (timerRef.current) clearTimeout(timerRef.current);

    // ⚡ RESET: Prepare for a new camera snap
    hasSnapped.current = false;
    setBusLocation(null);
    setActiveRoute(inputRoute);
    setIsSearching(true);

    socket.emit("join_route", inputRoute);

    timerRef.current = setTimeout(() => {
      setBusLocation((current) => {
        if (!current) {
          Alert.alert("Bus Not Found", `Route ${inputRoute} is not active.`);
          setIsSearching(false);
        } else {
          // Fallback snap if location existed but map didn't move
          mapRef.current?.animateToRegion(
            {
              latitude: current.lat,
              longitude: current.lng,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            },
            1000,
          );
        }
        return current;
      });
    }, 3000);
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.searchLabel}>TARGET ROUTE</Text>
          <TextInput
            style={styles.searchInput}
            value={inputRoute}
            onChangeText={setInputRoute}
            placeholder="ID"
            keyboardType="numeric"
          />
        </View>
        <TouchableOpacity style={styles.showButton} onPress={handleShowBus}>
          <Text style={styles.showButtonText}>SHOW</Text>
        </TouchableOpacity>
      </View>

      {busLocation ? (
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          // Default start to avoid jumping if data is slow
          initialRegion={{
            latitude: busLocation.lat,
            longitude: busLocation.lng,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
        >
          <Marker
            coordinate={{
              latitude: busLocation.lat,
              longitude: busLocation.lng,
            }}
            rotation={busLocation.heading || 0}
            flat={true}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <Text style={{ fontSize: 25 }}>🚌</Text>
          </Marker>
        </MapView>
      ) : (
        <View style={styles.loadingArea}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>
            {activeRoute && isSearching
              ? `LOCATING BUS ${activeRoute}...`
              : "READY TO SEARCH"}
          </Text>
          <Text style={styles.subText}>
            {isConnected ? "Connected to Server" : "Reconnecting..."}
          </Text>
        </View>
      )}

      {busLocation && (
        <View style={styles.statusCard}>
          <View style={styles.routeBadge}>
            <Text style={styles.badgeText}>{busLocation.routeId}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{busLocation.label}</Text>
            <Text style={styles.cardSub}>Live Location Tracking</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  map: { width: "100%", height: "100%" },
  searchHeader: {
    position: "absolute",
    top: 50,
    left: 20,
    right: 20,
    zIndex: 10,
    backgroundColor: "white",
    padding: 12,
    borderRadius: 20,
    elevation: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  searchLabel: { fontSize: 9, fontWeight: "900", color: "#9ca3af" },
  searchInput: { fontSize: 18, fontWeight: "bold", color: "#1f2937" },
  showButton: {
    backgroundColor: "#2563eb",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginLeft: 10,
  },
  showButtonText: { color: "white", fontWeight: "900", fontSize: 12 },
  loadingArea: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 20, fontWeight: "900", color: "#374151" },
  subText: { color: "#9ca3af", fontSize: 10, marginTop: 5, fontWeight: "bold" },
  statusCard: {
    position: "absolute",
    bottom: 40,
    alignSelf: "center",
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 25,
    elevation: 10,
    width: "90%",
    flexDirection: "row",
    alignItems: "center",
  },
  routeBadge: {
    backgroundColor: "#2563eb",
    padding: 10,
    borderRadius: 15,
    marginRight: 15,
  },
  badgeText: { color: "white", fontWeight: "bold", fontSize: 16 },
  cardTitle: { fontWeight: "900", fontSize: 14, color: "#1f2937" },
  cardSub: { fontSize: 10, color: "#10b981", fontWeight: "bold" },
});
