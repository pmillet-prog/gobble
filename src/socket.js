// src/socket.js
import { io } from "socket.io-client";

// URL WebSocket configurable :
// - VITE_WS_URL si défini (prioritaire)
// - sinon VITE_WS_HOST/VITE_WS_PORT
// - sinon même origin que la page
const envWsUrl = import.meta.env.VITE_WS_URL;
const envWsHost = import.meta.env.VITE_WS_HOST;
const envWsPort = import.meta.env.VITE_WS_PORT;
const pageHostname = window.location.hostname || "";
const isLocalNetworkHost =
  pageHostname === "localhost" ||
  pageHostname === "127.0.0.1" ||
  pageHostname === "::1" ||
  /^192\.168\./.test(pageHostname) ||
  /^10\./.test(pageHostname) ||
  /^172\.(1[6-9]|2\d|3[0-1])\./.test(pageHostname);

const hasExplicitSocketTarget =
  !!envWsUrl || !!envWsHost || (envWsPort !== undefined && envWsPort !== null && envWsPort !== "");
const WS_URL = envWsUrl
  || (hasExplicitSocketTarget
    ? `${window.location.protocol === "https:" ? "wss" : "ws"}://${envWsHost || pageHostname}${envWsPort ? `:${envWsPort}` : ""}`
    : window.location.origin);
const forcePollingInLocalDev =
  !hasExplicitSocketTarget &&
  window.location.protocol === "http:" &&
  isLocalNetworkHost;

const socket = io(WS_URL, {
  autoConnect: false, // on se connecte après le login
  path: "/socket.io",
  transports: forcePollingInLocalDev ? ["polling"] : ["websocket", "polling"],
  upgrade: !forcePollingInLocalDev,
  withCredentials: true,
  reconnectionDelay: 500,
  reconnectionDelayMax: 4000,
  timeout: 10000,
});

export default socket;
