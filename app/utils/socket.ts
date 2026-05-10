import AsyncStorage from "@react-native-async-storage/async-storage";
import { io } from "socket.io-client";

import { type BusRoute, isBusRoute } from "@/types/govbus";

const DEFAULT_SOCKET_URL = "https://gov-bus-backend.onrender.com";
const CURRENT_BUS_STORAGE_KEY = "govbus.currentBus";
const DRIVER_AUTH_STORAGE_KEY = "govbus.driverAuth";
const socketUrl = process.env.EXPO_PUBLIC_SOCKET_URL || DEFAULT_SOCKET_URL;

export type CurrentBusRegistration = BusRoute & {
  expiresAt?: number;
};

export type DriverSession = {
  token: string;
  driver: {
    id: string;
    username: string;
    allowedRouteIds: string[];
  };
};

let currentBus: CurrentBusRegistration | null = null;
let currentDriverSession: DriverSession | null = null;

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
        driverAuthToken: currentDriverSession?.token,
      }
    : currentDriverSession?.token
      ? { driverAuthToken: currentDriverSession.token }
      : {};
}

function isDriverSession(value: unknown): value is DriverSession {
  if (!value || typeof value !== "object") {
    return false;
  }

  const session = value as Partial<DriverSession>;
  const driver = session.driver as Partial<DriverSession["driver"]>;

  return (
    typeof session.token === "string" &&
    Boolean(session.token) &&
    Boolean(driver) &&
    typeof driver.id === "string" &&
    typeof driver.username === "string" &&
    Array.isArray(driver.allowedRouteIds) &&
    driver.allowedRouteIds.every((routeId) => typeof routeId === "string")
  );
}

function getApiUrl(path: string) {
  return `${socketUrl.replace(/\/$/, "")}${path}`;
}

function applyDriverSession(session: DriverSession | null) {
  currentDriverSession = session;
  applyBusRegistration(currentBus);
}

export async function getDriverSession() {
  if (currentDriverSession) {
    return currentDriverSession;
  }

  const savedSession = await AsyncStorage.getItem(DRIVER_AUTH_STORAGE_KEY);

  if (!savedSession) {
    return null;
  }

  try {
    const parsedSession = JSON.parse(savedSession) as unknown;

    if (!isDriverSession(parsedSession)) {
      await AsyncStorage.removeItem(DRIVER_AUTH_STORAGE_KEY);
      return null;
    }

    applyDriverSession(parsedSession);

    return parsedSession;
  } catch {
    await AsyncStorage.removeItem(DRIVER_AUTH_STORAGE_KEY);
    return null;
  }
}

export async function getDriverAuthToken() {
  const session = await getDriverSession();

  return session?.token;
}

export async function loginDriver(username: string, password: string) {
  const response = await fetch(getApiUrl("/drivers/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const responseText = await response.text();
  let data: unknown = null;

  try {
    data = responseText ? JSON.parse(responseText) : null;
  } catch {
    throw new Error(
      `Backend did not return JSON for driver login. Check ${getApiUrl(
        "/drivers/login",
      )}`,
    );
  }

  if (!response.ok || !isDriverSession(data)) {
    const error = data as { error?: unknown };
    throw new Error(
      typeof error?.error === "string" ? error.error : "Driver login failed",
    );
  }

  applyDriverSession(data);
  await AsyncStorage.setItem(DRIVER_AUTH_STORAGE_KEY, JSON.stringify(data));

  return data;
}

export async function logoutDriver() {
  applyDriverSession(null);
  await clearCurrentBusRegistration();
  await AsyncStorage.removeItem(DRIVER_AUTH_STORAGE_KEY);
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
  const driverAuthToken = await getDriverAuthToken();

  if (!bus || !driverAuthToken) {
    return;
  }

  socket.emit("register_bus", {
    routeId: bus.routeId,
    label: bus.label,
    expiresAt: bus.expiresAt,
    driverAuthToken,
  });
});

export { socketUrl };
export default socket;
