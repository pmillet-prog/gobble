import React from "react";

export default function useStandaloneTraining({
  ensureConnection,
  getIdentityPayload,
  onJoinLive,
  onLaunch,
  onReturnLobby,
  roomIdRef,
  showToast,
  socket,
}) {
  const [session, setSession] = React.useState(null);
  const sessionRef = React.useRef(null);
  const [busy, setBusy] = React.useState(false);
  const [joinDialog, setJoinDialog] = React.useState(null);
  const callbacksRef = React.useRef({
    ensureConnection,
    getIdentityPayload,
    onJoinLive,
    onLaunch,
    onReturnLobby,
    showToast,
  });
  callbacksRef.current = {
    ensureConnection,
    getIdentityPayload,
    onJoinLive,
    onLaunch,
    onReturnLobby,
    showToast,
  };

  const commitSession = React.useCallback((next) => {
    sessionRef.current = next;
    setSession(next);
  }, []);

  const connectIfNeeded = React.useCallback(async () => {
    if (socket.connected) return true;
    if (typeof callbacksRef.current.ensureConnection !== "function") return false;
    try {
      return !!(await callbacksRef.current.ensureConnection());
    } catch (_) {
      return false;
    }
  }, [socket]);

  const start = React.useCallback(
    async (type, label, durationMs) => {
      if (busy) return;
      setBusy(true);
      const connected = await connectIfNeeded();
      if (!connected) {
        setBusy(false);
        callbacksRef.current.showToast?.(
          "Connexion nécessaire pour récupérer une nouvelle grille.",
          3200
        );
        return;
      }
      const identity = callbacksRef.current.getIdentityPayload?.() || {};
      socket.emit(
        "training:standalone:start",
        {
          ...identity,
          roomId: identity.roomId || roomIdRef.current,
          type,
          durationMs,
        },
        (response) => {
          setBusy(false);
          if (!response?.ok || !response?.training) {
            const message =
              response?.error === "maintenance_mode"
                ? "Maintenance en cours."
                : response?.error === "auth_required"
                  ? "Connecte-toi à ton compte pour apparaître dans le live."
                  : response?.error === "training_pool_unavailable"
                    ? "Le stock de grilles est momentanément indisponible."
                    : "Impossible de lancer cet entraînement.";
            callbacksRef.current.showToast?.(message, 3400);
            return;
          }
          const next = {
            ...response.training,
            serverPreparedAt: response.training.startedAt || null,
            startedAt: Date.now(),
            requestedLabel: label || response.training.label,
          };
          commitSession(next);
          setJoinDialog(null);
          callbacksRef.current.onLaunch?.(next, response.liveStatus || null);
        }
      );
    },
    [busy, commitSession, connectIfNeeded, roomIdRef, socket]
  );

  const requestJoinLive = React.useCallback(async () => {
    const active = sessionRef.current;
    if (!active || busy) return;
    setBusy(true);
    const connected = await connectIfNeeded();
    if (!connected) {
      setBusy(false);
      callbacksRef.current.showToast?.("Le live est actuellement inaccessible.", 2600);
      return;
    }
    const identity = callbacksRef.current.getIdentityPayload?.() || {};
    socket.emit(
      "training:standalone:status",
      {
        ...identity,
        roomId: identity.roomId || roomIdRef.current,
        sessionId: active.sessionId,
        type: active.mode,
      },
      (response) => {
        setBusy(false);
        if (!response?.ok) {
          callbacksRef.current.showToast?.("Impossible de consulter le live.", 2600);
          return;
        }
        setJoinDialog(response.liveStatus || {});
      }
    );
  }, [busy, connectIfNeeded, roomIdRef, socket]);

  const confirmJoinLive = React.useCallback(async () => {
    if (!sessionRef.current || busy) return;
    setBusy(true);
    const connected = await connectIfNeeded();
    if (!connected) {
      setBusy(false);
      callbacksRef.current.showToast?.("Impossible de rejoindre le live.", 3000);
      return;
    }
    const identity = callbacksRef.current.getIdentityPayload?.() || {};
    socket.emit(
      "training:standalone:stop",
      { ...identity, roomId: identity.roomId || roomIdRef.current, joinLive: true },
      (response) => {
        setBusy(false);
        if (!response?.ok || !response?.snapshot) {
          callbacksRef.current.showToast?.("Impossible de rejoindre le live.", 3000);
          return;
        }
        commitSession(null);
        setJoinDialog(null);
        callbacksRef.current.onJoinLive?.(response.snapshot);
      }
    );
  }, [busy, commitSession, connectIfNeeded, roomIdRef, socket]);

  const returnToLobby = React.useCallback(() => {
    if (busy) return;
    const finish = () => {
      commitSession(null);
      setJoinDialog(null);
      callbacksRef.current.onReturnLobby?.();
    };
    if (!socket.connected || !sessionRef.current) {
      finish();
      return;
    }
    setBusy(true);
    const identity = callbacksRef.current.getIdentityPayload?.() || {};
    socket.emit(
      "training:standalone:stop",
      { ...identity, roomId: identity.roomId || roomIdRef.current, joinLive: false },
      () => {
        setBusy(false);
        finish();
      }
    );
  }, [busy, commitSession, roomIdRef, socket]);

  React.useEffect(() => {
    const restorePresence = () => {
      const active = sessionRef.current;
      if (!active) return;
      const identity = callbacksRef.current.getIdentityPayload?.() || {};
      socket.emit("training:standalone:presence", {
        ...identity,
        roomId: identity.roomId || roomIdRef.current,
        sessionId: active.sessionId,
        gridId: active.gridId,
        type: active.mode,
        startedAt: active.startedAt,
        durationMs: active.durationMs,
      });
    };
    const timers = [];
    const onConnect = () => {
      timers.push(window.setTimeout(restorePresence, 900));
      timers.push(window.setTimeout(restorePresence, 2400));
    };
    socket.on("connect", onConnect);
    return () => {
      socket.off("connect", onConnect);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [roomIdRef, socket]);

  return {
    busy,
    cancelJoinDialog: () => setJoinDialog(null),
    clearSession: () => commitSession(null),
    confirmJoinLive,
    joinDialog,
    requestJoinLive,
    returnToLobby,
    session,
    sessionRef,
    start,
  };
}
