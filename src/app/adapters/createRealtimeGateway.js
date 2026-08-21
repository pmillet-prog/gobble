export function createRealtimeGateway(socketClient) {
  if (!socketClient) {
    throw new Error("createRealtimeGateway requires a Socket.IO client");
  }

  return Object.freeze({
    get auth() {
      return socketClient.auth;
    },
    set auth(value) {
      socketClient.auth = value;
    },
    get connected() {
      return !!socketClient.connected;
    },
    bind(handlers) {
      const entries = Object.entries(handlers || {}).filter(
        ([eventName, handler]) => !!eventName && typeof handler === "function"
      );
      for (const [eventName, handler] of entries) {
        socketClient.on(eventName, handler);
      }
      return () => {
        for (const [eventName, handler] of entries) {
          socketClient.off(eventName, handler);
        }
      };
    },
    connect: () => socketClient.connect(),
    disconnect: () => socketClient.disconnect(),
    emit: (eventName, ...args) => socketClient.emit(eventName, ...args),
    emitReserved: (eventName, ...args) =>
      typeof socketClient.emitReserved === "function"
        ? socketClient.emitReserved(eventName, ...args)
        : socketClient.emit(eventName, ...args),
    off: (eventName, handler) => socketClient.off(eventName, handler),
    on: (eventName, handler) => socketClient.on(eventName, handler),
    once: (eventName, handler) => socketClient.once(eventName, handler),
  });
}
