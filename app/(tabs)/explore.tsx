import { BusLocation, isBusLocation } from "@/types/govbus";
import { useLocalSearchParams } from "expo-router";
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
import MapView, { Marker } from "react-native-maps";

import socket from "../utils/socket";

const DEFAULT_ROUTE = "101";
const SEARCH_TIMEOUT_MS = 3000;

export default function ExploreScreen() {
  const { selectedRoute } = useLocalSearchParams<{ selectedRoute?: string }>();
  const [busLocation, setBusLocation] = useState<BusLocation | null>(null);
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [inputRoute, setInputRoute] = useState(DEFAULT_ROUTE);
  const [activeRoute, setActiveRoute] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const mapRef = useRef<MapView | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRouteRef = useRef<string | null>(null);
  const hasSnapped = useRef(false);

  const clearSearchTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleShowBus = useCallback(
    (routeOverride?: string) => {
      const routeId = (routeOverride ?? inputRoute).trim();

      if (!routeId) {
        Alert.alert("Error", "Enter Route ID.");
        return;
      }

      clearSearchTimer();
      hasSnapped.current = false;
      activeRouteRef.current = routeId;
      setBusLocation(null);
      setActiveRoute(routeId);
      setIsSearching(true);

      socket.emit("join_route", routeId);

      timerRef.current = setTimeout(() => {
        setBusLocation((currentLocation) => {
          if (!currentLocation) {
            Alert.alert("Bus Not Found", `Route ${routeId} is not active.`);
            setIsSearching(false);
            return null;
          }

          mapRef.current?.animateToRegion(
            {
              latitude: currentLocation.lat,
              longitude: currentLocation.lng,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            },
            1000,
          );

          return currentLocation;
        });
      }, SEARCH_TIMEOUT_MS);
    },
    [clearSearchTimer, inputRoute],
  );

  useEffect(() => {
    activeRouteRef.current = activeRoute;
  }, [activeRoute]);

  useEffect(() => {
    if (!socket.connected) {
      socket.connect();
    }

    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);
    const handleBusMoved = (data: unknown) => {
      if (!isBusLocation(data) || data.routeId !== activeRouteRef.current) {
        return;
      }

      clearSearchTimer();
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
    };

    const handleRouteNotActive = (badRouteId: unknown) => {
      if (badRouteId !== activeRouteRef.current) {
        return;
      }

      clearSearchTimer();
      setIsSearching(false);
      setBusLocation(null);
      Alert.alert("Bus Not Found", `Route ${badRouteId} is not active.`);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("bus_moved", handleBusMoved);
    socket.on("route_not_active", handleRouteNotActive);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("bus_moved", handleBusMoved);
      socket.off("route_not_active", handleRouteNotActive);
      clearSearchTimer();
    };
  }, [clearSearchTimer]);

  useEffect(() => {
    if (!selectedRoute) {
      return;
    }

    setInputRoute(selectedRoute);
    handleShowBus(selectedRoute);
  }, [handleShowBus, selectedRoute]);

  return (
    <View style={styles.container}>
      <View style={styles.searchHeader}>
        <View style={styles.searchInputWrap}>
          <Text style={styles.searchLabel}>TARGET ROUTE</Text>
          <TextInput
            style={styles.searchInput}
            value={inputRoute}
            onChangeText={setInputRoute}
            placeholder="ID"
            keyboardType="numeric"
          />
        </View>
        <TouchableOpacity style={styles.showButton} onPress={() => handleShowBus()}>
          <Text style={styles.showButtonText}>SHOW</Text>
        </TouchableOpacity>
      </View>

      {busLocation ? (
        <MapView
          ref={mapRef}
          style={styles.map}
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
            rotation={busLocation.heading ?? 0}
            flat
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <Text style={styles.busMarker}>BUS</Text>
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
          <View style={styles.statusInfo}>
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
    borderRadius: 18,
    elevation: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  searchInputWrap: { flex: 1 },
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
  busMarker: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  statusCard: {
    position: "absolute",
    bottom: 40,
    alignSelf: "center",
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 20,
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
  statusInfo: { flex: 1 },
  cardTitle: { fontWeight: "900", fontSize: 14, color: "#1f2937" },
  cardSub: { fontSize: 10, color: "#10b981", fontWeight: "bold" },
});
