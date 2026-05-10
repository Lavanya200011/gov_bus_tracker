import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

import socket, {
  getCurrentBusRegistration,
  getDriverAuthToken,
} from "../utils/socket";

export const LOCATION_TASK_NAME = "govbus-location-task";
const LAST_SENT_LOCATION_STORAGE_KEY = "govbus.lastSentLocation";
const MIN_SEND_INTERVAL_MS = 30000;
const MIN_SEND_DISTANCE_METERS = 20;
const MAX_GPS_NOISE_THRESHOLD_METERS = 50;

type LocationTaskData = {
  locations?: Location.LocationObject[];
};

type SentLocation = {
  lat: number;
  lng: number;
  accuracy: number | null;
  timestamp: number;
};

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function getDistanceInMeters(
  from: Pick<SentLocation, "lat" | "lng">,
  to: Pick<SentLocation, "lat" | "lng">,
) {
  const earthRadiusMeters = 6371000;
  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLng = toRadians(to.lng - from.lng);
  const fromLat = toRadians(from.lat);
  const toLat = toRadians(to.lat);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(fromLat) *
      Math.cos(toLat) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getLastSentLocation() {
  const savedLocation = await AsyncStorage.getItem(
    LAST_SENT_LOCATION_STORAGE_KEY,
  );

  if (!savedLocation) {
    return null;
  }

  try {
    const parsedLocation = JSON.parse(savedLocation) as Partial<SentLocation>;

    if (
      typeof parsedLocation.lat !== "number" ||
      typeof parsedLocation.lng !== "number" ||
      (parsedLocation.accuracy !== null &&
        typeof parsedLocation.accuracy !== "number") ||
      typeof parsedLocation.timestamp !== "number"
    ) {
      await AsyncStorage.removeItem(LAST_SENT_LOCATION_STORAGE_KEY);
      return null;
    }

    return parsedLocation as SentLocation;
  } catch {
    await AsyncStorage.removeItem(LAST_SENT_LOCATION_STORAGE_KEY);
    return null;
  }
}

async function setLastSentLocation(location: SentLocation) {
  await AsyncStorage.setItem(
    LAST_SENT_LOCATION_STORAGE_KEY,
    JSON.stringify(location),
  );
}

export async function clearLastSentBusLocation() {
  await AsyncStorage.removeItem(LAST_SENT_LOCATION_STORAGE_KEY);
}

TaskManager.defineTask<LocationTaskData>(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error("Location task failed:", error.message);
    return;
  }

  const location = data?.locations?.[0];

  if (!location) {
    return;
  }

  const { accuracy, latitude, longitude, heading } = location.coords;
  const bus = await getCurrentBusRegistration();
  const driverAuthToken = await getDriverAuthToken();

  if (!bus || !driverAuthToken) {
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(
      LOCATION_TASK_NAME,
    );

    if (hasStarted) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }

    await clearLastSentBusLocation();
    socket.emit("stop_bus");
    return;
  }

  const nextLocation = {
    lat: latitude,
    lng: longitude,
    accuracy: typeof accuracy === "number" ? accuracy : null,
    timestamp: Date.now(),
  };
  const lastSentLocation = await getLastSentLocation();

  if (lastSentLocation) {
    const timeSinceLastSend = nextLocation.timestamp - lastSentLocation.timestamp;
    const distanceSinceLastSend = getDistanceInMeters(
      lastSentLocation,
      nextLocation,
    );
    const accuracyNoiseThreshold = Math.min(
      Math.max(
        lastSentLocation.accuracy ?? 0,
        nextLocation.accuracy ?? 0,
        MIN_SEND_DISTANCE_METERS,
      ),
      MAX_GPS_NOISE_THRESHOLD_METERS,
    );

    if (
      timeSinceLastSend < MIN_SEND_INTERVAL_MS ||
      distanceSinceLastSend < accuracyNoiseThreshold
    ) {
      return;
    }
  }

  if (!socket.connected) {
    socket.connect();
  }

  socket.emit("update_location", {
    routeId: bus?.routeId,
    label: bus?.label,
    lat: latitude,
    lng: longitude,
    heading: heading ?? 0,
    timestamp: Date.now(),
    driverAuthToken,
  });
  await setLastSentLocation(nextLocation);
});
