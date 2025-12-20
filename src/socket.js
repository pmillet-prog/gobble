// src/socket.js
import { io } from "socket.io-client";

// URL WebSocket configurable :
// - VITE_WS_URL si défini (prioritaire)
// - sinon VITE_WS_HOST/VITE_WS_PORT
// - sinon on pointe sur le même host que la page (443/https -> wss sans port explicite)
const envWsUrl = import.meta.env.VITE_WS_URL;
const envWsHost = import.meta.env.VITE_WS_HOST;
const envWsPort = import.meta.env.VITE_WS_PORT;

const isHttps = window.location.protocol === "https:";
const WS_PROTOCOL = isHttps ? "wss" : "ws";
const WS_HOST = envWsHost || window.location.hostname;
// Par défaut : 4000 en local HTTP, pas de port explicite en HTTPS
const WS_PORT =
  envWsPort !== undefined && envWsPort !== null
    ? envWsPort
    : isHttps
    ? ""
    : 4000; // en local/dev on garde 4000

const WS_URL =
  envWsUrl || `${WS_PROTOCOL}://${WS_HOST}${WS_PORT ? `:${WS_PORT}` : ""}`;

const socket = io(WS_URL, {
  autoConnect: false, // on se connecte après le login
  transports: ["websocket"],
  reconnectionDelay: 500,
  reconnectionDelayMax: 1500,
  timeout: 2500,
});

export default socket;
