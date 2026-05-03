import { BusLocation, isBusLocation } from "@/types/govbus";
import * as Location from "expo-location";
import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

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
  const [locationName, setLocationName] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRouteRef = useRef<string | null>(null);

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
      activeRouteRef.current = routeId;
      setBusLocation(null);
      setLocationName(null);
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
    };

    const handleRouteNotActive = (badRouteId: unknown) => {
      if (badRouteId !== activeRouteRef.current) {
        return;
      }

      clearSearchTimer();
      setIsSearching(false);
      setBusLocation(null);
      setLocationName(null);
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

  useEffect(() => {
    if (!busLocation) {
      setLocationName(null);
      return;
    }

    let isCancelled = false;

    setLocationName("Finding place...");

    Location.reverseGeocodeAsync({
      latitude: busLocation.lat,
      longitude: busLocation.lng,
    })
      .then((addresses) => {
        if (isCancelled) {
          return;
        }

        const address = addresses[0];
        const placeName =
          address?.city ||
          address?.district ||
          address?.subregion ||
          address?.region ||
          address?.name ||
          "Location name unavailable";

        setLocationName(placeName);
      })
      .catch(() => {
        if (!isCancelled) {
          setLocationName("Location name unavailable");
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [busLocation]);

  const openInMaps = async () => {
    if (!busLocation) {
      return;
    }

    const query = `${busLocation.lat},${busLocation.lng}`;
    const url = `https://www.google.com/maps/search/?api=1&query=${query}`;

    await Linking.openURL(url);
  };

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
        <View style={styles.trackingArea}>
          <View style={styles.locationPanel}>
            <Text style={styles.panelLabel}>LIVE LOCATION</Text>
            <Text style={styles.placeText}>
              {locationName || busLocation.label || "Tracked bus"}
            </Text>
            <Text style={styles.coordinateText}>
              {busLocation.lat.toFixed(6)}
            </Text>
            <Text style={styles.coordinateText}>
              {busLocation.lng.toFixed(6)}
            </Text>
            <Text style={styles.headingText}>
              Heading {Math.round(busLocation.heading ?? 0)} deg
            </Text>
            <TouchableOpacity style={styles.mapsButton} onPress={openInMaps}>
              <Text style={styles.mapsButtonText}>OPEN IN MAPS</Text>
            </TouchableOpacity>
          </View>
        </View>
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
  trackingArea: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "#eef2ff",
    justifyContent: "center",
    padding: 20,
  },
  locationPanel: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 20,
    elevation: 8,
    padding: 24,
  },
  panelLabel: {
    color: "#9ca3af",
    fontSize: 10,
    fontWeight: "900",
    marginBottom: 16,
    textAlign: "center",
  },
  placeText: {
    color: "#111827",
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 18,
    textAlign: "center",
  },
  coordinateText: {
    color: "#1f2937",
    fontSize: 28,
    fontWeight: "900",
    marginBottom: 8,
    textAlign: "center",
  },
  headingText: {
    color: "#4b5563",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 8,
    textAlign: "center",
  },
  mapsButton: {
    alignItems: "center",
    backgroundColor: "#2563eb",
    borderRadius: 14,
    marginTop: 22,
    padding: 14,
  },
  mapsButtonText: { color: "#fff", fontSize: 12, fontWeight: "900" },
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
