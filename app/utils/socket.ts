import AsyncStorage from "@react-native-async-storage/async-storage";
import { io } from "socket.io-client";

import { type BusRoute, isBusRoute } from "@/types/govbus";

const DEFAULT_SOCKET_URL = "https://gov-bus-backend.onrender.com";
const CURRENT_BUS_STORAGE_KEY = "govbus.currentBus";
const socketUrl = process.env.EXPO_PUBLIC_SOCKET_URL || DEFAULT_SOCKET_URL;

export type CurrentBusRegistration = BusRoute & {
  expiresAt?: number;
};

let currentBus: CurrentBusRegistration | null = null;

const socket = io(socketUrl, {
  transports: ["websocket"],
  reconnection: true,
  autoConnect: false,
});

function applyBusRegistration(bus: CurrentBusRegistration | null) {
  currentBus = bus;

  socket.auth = bus
    ? {
        routeId: bus.routeId,
        label: bus.label,
        expiresAt: bus.expiresAt,
      }
    : {};
}

export async function setCurrentBusRegistration(
  bus: BusRoute,
  expiresAt?: number,
) {
  const registration = { ...bus, expiresAt };

  applyBusRegistration(registration);
  await AsyncStorage.setItem(
    CURRENT_BUS_STORAGE_KEY,
    JSON.stringify(registration),
  );
}

export async function clearCurrentBusRegistration() {
  applyBusRegistration(null);
  await AsyncStorage.removeItem(CURRENT_BUS_STORAGE_KEY);
}

export async function getCurrentBusRegistration() {
  if (currentBus) {
    if (currentBus.expiresAt && currentBus.expiresAt <= Date.now()) {
      await clearCurrentBusRegistration();
      return null;
    }

    return currentBus;
  }

  const savedBus = await AsyncStorage.getItem(CURRENT_BUS_STORAGE_KEY);

  if (!savedBus) {
    return null;
  }

  try {
    const parsedBus = JSON.parse(savedBus) as unknown;

    if (!isBusRoute(parsedBus)) {
      await AsyncStorage.removeItem(CURRENT_BUS_STORAGE_KEY);
      return null;
    }

    const registration = parsedBus as CurrentBusRegistration;

    if (registration.expiresAt && registration.expiresAt <= Date.now()) {
      await AsyncStorage.removeItem(CURRENT_BUS_STORAGE_KEY);
      return null;
    }

    applyBusRegistration(registration);

    return registration;
  } catch {
    await AsyncStorage.removeItem(CURRENT_BUS_STORAGE_KEY);
    return null;
  }
}

socket.on("connect", async () => {
  const bus = await getCurrentBusRegistration();

  if (!bus) {
    return;
  }

  socket.emit("register_bus", {
    routeId: bus.routeId,
    label: bus.label,
    expiresAt: bus.expiresAt,
  });
});

export { socketUrl };
export default socket;
