import * as TaskManager from "expo-task-manager";
import socket from "../utils/socket";

export const LOCATION_TASK_NAME = "background-location-task";

TaskManager.defineTask(LOCATION_TASK_NAME, ({ data, error }) => {
  if (error) {
    console.error("Task Error:", error.message);
    return;
  }

  // ⚡ SAFETY CHECK 1: सुनिश्चित करें कि data और locations array सच में मौजूद हैं
  if (data && data.locations && data.locations.length > 0) {
    const { latitude, longitude, heading } = data.locations[0].coords;

    // ⚡ SAFETY CHECK 2: अगर बैकग्राउंड में सॉकेट सो गया है, तो उसे जगाएं
    if (!socket.connected) {
      socket.connect();
    }

    // अब सुरक्षित तरीके से डेटा भेजें
    socket.emit("update_location", {
      lat: latitude,
      lng: longitude,
      heading: heading || 0,
      timestamp: Date.now(),
    });

    console.log("📍 Background Update Sent:", latitude, longitude);
  } else {
    console.log("⚠️ Background Task ran, but no valid location data found.");
  }
});

// आप इस Dummy component को हटा सकते हैं, इसकी कोई जरूरत नहीं है।
