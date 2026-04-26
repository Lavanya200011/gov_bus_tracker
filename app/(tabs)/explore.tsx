import { useLocalSearchParams } from "expo-router";
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
  const { selectedRoute } = useLocalSearchParams();
  const [busLocation, setBusLocation] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [inputRoute, setInputRoute] = useState("101");
  const [activeRoute, setActiveRoute] = useState(null);
  const [isSearching, setIsSearching] = useState(false);

  const mapRef = useRef(null);
  const timerRef = useRef(null);
  const hasSnapped = useRef(false);

  useEffect(() => {
    if (selectedRoute) {
      setInputRoute(selectedRoute as string);
      setTimeout(() => handleShowBus(), 500);
    }
  }, [selectedRoute]);

  useEffect(() => {
    socket.connect();
    socket.on("connect", () => setIsConnected(true));

    socket.on("bus_moved", (data) => {
      // ⚡ SAFETY CHECK 1: Ensure incoming data has valid coordinates
      if (data && data.routeId === activeRoute && data.lat && data.lng) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        setIsSearching(false);
        setBusLocation(data);

        if (!hasSnapped.current) {
          mapRef.current?.animateToRegion(
            {
              latitude: data.lat,
              longitude: data.lng,
              latitudeDelta: 0.05,
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

    hasSnapped.current = false;
    setBusLocation(null);
    setActiveRoute(inputRoute);
    setIsSearching(true);

    socket.emit("join_route", inputRoute);

    timerRef.current = setTimeout(() => {
      setBusLocation((current) => {
        // ⚡ SAFETY CHECK 2: Ensure data exists before trying to animate map
        if (!current || !current.lat || !current.lng) {
          Alert.alert("Bus Not Found", `Route ${inputRoute} is not active.`);
          setIsSearching(false);
          return null;
        } else {
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

      {/* ⚡ SAFETY CHECK 3: Only render MapView if coordinates are valid */}
      {busLocation && busLocation.lat && busLocation.lng ? (
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
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

      {/* ⚡ SAFETY CHECK 4: Ensure UI components don't crash on null properties */}
      {busLocation && busLocation.routeId && (
        <View style={styles.statusCard}>
          <View style={styles.routeBadge}>
            <Text style={styles.badgeText}>{busLocation.routeId}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>
              {busLocation.label || "Active Route"}
            </Text>
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
