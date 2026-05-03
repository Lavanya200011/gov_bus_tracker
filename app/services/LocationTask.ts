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
