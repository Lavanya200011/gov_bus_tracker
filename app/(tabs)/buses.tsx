import { BusRoute, isBusRoute } from "@/types/govbus";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import socket from "../utils/socket";

export default function BusesScreen() {
  const [allRoutes, setAllRoutes] = useState<BusRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();

  useEffect(() => {
    if (!socket.connected) {
      socket.connect();
    }

    socket.emit("request_bus_list");

    const handleBusList = (data: unknown) => {
      const routes = Array.isArray(data) ? data.filter(isBusRoute) : [];
      setAllRoutes(routes);
      setLoading(false);
    };

    const handleBusOnline = (busData: unknown) => {
      if (!isBusRoute(busData)) {
        return;
      }

      setAllRoutes((previousRoutes) =>
        previousRoutes.map((bus) =>
          bus.routeId === busData.routeId ? { ...bus, isLive: true } : bus,
        ),
      );
    };

    const handleBusOffline = (busData: unknown) => {
      if (!isBusRoute(busData)) {
        return;
      }

      setAllRoutes((previousRoutes) =>
        previousRoutes.map((bus) =>
          bus.routeId === busData.routeId ? { ...bus, isLive: false } : bus,
        ),
      );
    };

    socket.on("active_buses_list", handleBusList);
    socket.on("bus_online", handleBusOnline);
    socket.on("bus_offline", handleBusOffline);

    return () => {
      socket.off("active_buses_list", handleBusList);
      socket.off("bus_online", handleBusOnline);
      socket.off("bus_offline", handleBusOffline);
    };
  }, []);

  const handleSelectBus = (bus: BusRoute) => {
    if (!bus.isLive) {
      Alert.alert(
        "Offline",
        "This bus is not currently broadcasting its location.",
      );
      return;
    }

    router.push({
      pathname: "/explore",
      params: { selectedRoute: bus.routeId },
    });
  };

  const filteredRoutes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return allRoutes;
    }

    return allRoutes.filter((bus) => {
      return (
        bus.label.toLowerCase().includes(query) ||
        bus.routeId.toLowerCase().includes(query)
      );
    });
  }, [allRoutes, searchQuery]);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>SYSTEM ROUTES</Text>

      <View style={styles.listContainer}>
        {loading ? (
          <ActivityIndicator
            size="large"
            color="#2563eb"
            style={styles.loader}
          />
        ) : (
          <FlatList
            data={filteredRoutes}
            keyExtractor={(item) => item.routeId}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.busCard, !item.isLive && styles.offlineCard]}
                onPress={() => handleSelectBus(item)}
              >
                <View
                  style={[styles.badge, !item.isLive && styles.offlineBadge]}
                >
                  <Text style={styles.badgeText}>{item.routeId}</Text>
                </View>
                <View style={styles.busInfo}>
                  <Text style={styles.label}>{item.label}</Text>
                  <Text
                    style={
                      item.isLive ? styles.liveStatus : styles.offlineStatus
                    }
                  >
                    {item.isLive ? "LIVE NOW" : "OFFLINE"}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={styles.empty}>No routes found.</Text>
            }
          />
        )}
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search routes..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f4f6", paddingTop: 60 },
  header: {
    fontSize: 26,
    fontWeight: "900",
    color: "#1f2937",
    marginBottom: 10,
    paddingHorizontal: 20,
  },
  listContainer: { flex: 1, paddingHorizontal: 20 },
  loader: { marginTop: 50 },
  busCard: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    elevation: 4,
  },
  offlineCard: { opacity: 0.7, elevation: 1 },
  badge: {
    backgroundColor: "#2563eb",
    width: 55,
    height: 55,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  offlineBadge: { backgroundColor: "#9ca3af" },
  badgeText: { color: "#fff", fontWeight: "bold", fontSize: 18 },
  busInfo: { flex: 1 },
  label: { fontSize: 16, fontWeight: "bold", color: "#374151" },
  liveStatus: {
    fontSize: 10,
    color: "#10b981",
    fontWeight: "900",
    marginTop: 4,
  },
  offlineStatus: {
    fontSize: 10,
    color: "#9ca3af",
    fontWeight: "900",
    marginTop: 4,
  },
  searchContainer: {
    backgroundColor: "#fff",
    margin: 20,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 18,
    elevation: 10,
  },
  searchInput: { fontSize: 16, fontWeight: "600", color: "#1f2937" },
  empty: {
    textAlign: "center",
    marginTop: 50,
    color: "#9ca3af",
    fontWeight: "bold",
  },
});
