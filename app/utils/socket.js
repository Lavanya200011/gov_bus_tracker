import { io } from "socket.io-client";

// Ensure this IP matches exactly what you typed in your phone browser
const URL = "http://192.168.1.103:5000";

const socket = io(URL, {
  transports: ["websocket"], // Force websocket ONLY
  jsonp: false, // Disable older web-only protocols
  reconnection: true,
  autoConnect: false,
});

export default socket;
