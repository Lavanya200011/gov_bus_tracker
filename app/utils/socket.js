import { io } from "socket.io-client";

// Ensure this IP matches exactly what you typed in your phone browser
const URL = "https://gov-bus-tracker-backend.onrender.com";

const socket = io(URL, {
  transports: ["websocket"], // Force websocket ONLY
  jsonp: false, // Disable older web-only protocols
  reconnection: true,
  autoConnect: false,
});

export default socket;
