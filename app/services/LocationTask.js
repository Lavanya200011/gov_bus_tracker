import * as TaskManager from "expo-task-manager";
import socket from "../utils/socket";

export const LOCATION_TASK_NAME = "background-location-task";

TaskManager.defineTask(LOCATION_TASK_NAME, ({ data, error }) => {
  if (error) {
    console.error("Task Error:", error);
    return;
  }
  if (data) {
    const { locations } = data;
    const { latitude, longitude, heading } = locations[0].coords;

    // This is the actual data being sent to your server
    socket.emit("update_location", {
      lat: latitude,
      lng: longitude,
      heading: heading || 0,
      timestamp: Date.now(),
    });

    console.log("📍 Background Update Sent:", latitude, longitude);
  }
});

// Add this at the end of LocationTask.js
export default function LocationTaskDummy() {
  return null;
}
