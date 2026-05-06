import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

import socket, { getCurrentBusRegistration } from "../utils/socket";

export const LOCATION_TASK_NAME = "govbus-location-task";

type LocationTaskData = {
  locations?: Location.LocationObject[];
};

TaskManager.defineTask<LocationTaskData>(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error("Location task failed:", error.message);
    return;
  }

  const location = data?.locations?.[0];

  if (!location) {
    return;
  }

  const { latitude, longitude, heading } = location.coords;
  const bus = await getCurrentBusRegistration();

  if (!bus) {
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(
      LOCATION_TASK_NAME,
    );

    if (hasStarted) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }

    socket.emit("stop_bus");
    return;
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
  });
});
