import React from "react";
import socket from "../socket";

const PARIS_TIME_ZONE = "Europe/Paris";
const PLAYTIME_ALERT_THRESHOLDS_MS = [30, 20, 10, 5, 1].map(
  (minutes) => minutes * 60 * 1000
);

function getParisDayId(at = Date.now()) {
  try {
    const parts = new Intl.DateTimeFormat("fr-CA", {
      timeZone: PARIS_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(at));
    const get = (type) => parts.find((part) => part.type === type)?.value || "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch (_) {
    return new Date(at).toISOString().slice(0, 10);
  }
}

function getAllowedPlaytimeAlertThresholds(limitMs) {
  const safeLimit = Math.max(0, Number(limitMs) || 0);
  return PLAYTIME_ALERT_THRESHOLDS_MS.filter((threshold) => threshold < safeLimit);
}

export function usePlaytimeLimit({
  appView,
  authenticatedUserId,
  isAccountAuthenticated,
  isLoggedIn,
  onBlocked,
  setDevControlsBusy,
  showGlobalRedAnnouncement,
  showToast,
}) {
  const [devPlaytimeLimits, setDevPlaytimeLimits] = React.useState([]);
  const [playtimeLimit, setPlaytimeLimit] = React.useState(null);
  const [playtimeRemainingMs, setPlaytimeRemainingMs] = React.useState(null);
  const playtimeLimitRef = React.useRef(null);
  const playtimeUsageBufferRef = React.useRef(0);
  const playtimeLastAccountingAtRef = React.useRef(Date.now());
  const playtimeAlertedThresholdsRef = React.useRef(new Set());
  const onBlockedRef = React.useRef(onBlocked);
  const showGlobalRedAnnouncementRef = React.useRef(showGlobalRedAnnouncement);
  const showToastRef = React.useRef(showToast);

  React.useEffect(() => {
    playtimeLimitRef.current = playtimeLimit;
  }, [playtimeLimit]);

  React.useEffect(() => {
    onBlockedRef.current = onBlocked;
  }, [onBlocked]);

  React.useEffect(() => {
    showGlobalRedAnnouncementRef.current = showGlobalRedAnnouncement;
  }, [showGlobalRedAnnouncement]);

  React.useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  const applyPlaytimeLimitStatus = React.useCallback((status) => {
    if (!status || typeof status !== "object") {
      setPlaytimeLimit(null);
      setPlaytimeRemainingMs(null);
      return;
    }

    setPlaytimeLimit(status);
    setPlaytimeRemainingMs(
      status.active ? Math.max(0, Number(status.remainingMs) || 0) : null
    );
    if (status.active && !status.exhausted) {
      const allowedThresholds = new Set(getAllowedPlaytimeAlertThresholds(status.limitMs));
      playtimeAlertedThresholdsRef.current = new Set(
        Array.from(playtimeAlertedThresholdsRef.current).filter(
          (threshold) =>
            allowedThresholds.has(threshold) && (Number(status.remainingMs) || 0) <= threshold
        )
      );
    }
  }, []);

  const fetchDevPlaytimeLimits = React.useCallback(() => {
    if (!socket?.connected) return;
    setDevControlsBusy?.(true);
    socket.emit("dev:playtimeLimits:list", {}, (res) => {
      setDevControlsBusy?.(false);
      if (res?.ok && Array.isArray(res.limits)) {
        setDevPlaytimeLimits(res.limits);
        return;
      }
      showToastRef.current?.("Liste des limites indisponible.", 2200);
    });
  }, [setDevControlsBusy]);

  const clearDevPlaytimeLimit = React.useCallback(
    (userId) => {
      const safeUserId = Number(userId);
      if (!Number.isInteger(safeUserId) || safeUserId <= 0 || !socket?.connected) return;
      setDevControlsBusy?.(true);
      socket.emit("dev:playtimeLimits:clear", { userId: safeUserId }, (res) => {
        setDevControlsBusy?.(false);
        if (res?.ok) {
          setDevPlaytimeLimits(Array.isArray(res.limits) ? res.limits : []);
          showToastRef.current?.(
            res.removed ? "Limite supprimée." : "Limite déjà absente.",
            2200
          );
          if (authenticatedUserId === safeUserId) {
            applyPlaytimeLimitStatus(null);
          }
          return;
        }
        showToastRef.current?.("Suppression refusée.", 2200);
      });
    },
    [applyPlaytimeLimitStatus, authenticatedUserId, setDevControlsBusy]
  );

  const refreshPlaytimeLimitStatus = React.useCallback(
    () =>
      new Promise((resolve) => {
        if (!socket?.connected || !isAccountAuthenticated) {
          resolve(null);
          return;
        }
        socket.emit("playtimeLimit:status", {}, (res) => {
          if (res?.ok) {
            applyPlaytimeLimitStatus(res.playtimeLimit);
            resolve(res.playtimeLimit || null);
            return;
          }
          resolve(null);
        });
      }),
    [applyPlaytimeLimitStatus, isAccountAuthenticated]
  );

  const setPlaytimeLimitFromSettings = React.useCallback(
    (limitMs) =>
      new Promise((resolve) => {
        if (!isAccountAuthenticated) {
          showToastRef.current?.("Connecte-toi pour activer une limite par compte.", 2600);
          resolve(false);
          return;
        }
        if (!socket?.connected) {
          showToastRef.current?.("Serveur indisponible.", 2200);
          resolve(false);
          return;
        }
        socket.emit("playtimeLimit:set", { limitMs }, (res) => {
          if (res?.ok) {
            applyPlaytimeLimitStatus(res.playtimeLimit);
            playtimeAlertedThresholdsRef.current = new Set();
            showToastRef.current?.("Limite de temps activée pour aujourd'hui.", 2600);
            resolve(true);
            return;
          }
          if (res?.playtimeLimit) applyPlaytimeLimitStatus(res.playtimeLimit);
          showToastRef.current?.(
            res?.error === "already_active"
              ? "Une limite est déjà active aujourd'hui."
              : "Impossible d'activer la limite.",
            2800
          );
          resolve(false);
        });
      }),
    [applyPlaytimeLimitStatus, isAccountAuthenticated]
  );

  const flushPlaytimeUsage = React.useCallback(
    (reason = "interval") => {
      const buffered = Math.round(playtimeUsageBufferRef.current || 0);
      if (buffered < 1000) return;
      if (!socket?.connected || !playtimeLimitRef.current?.active) return;
      playtimeUsageBufferRef.current = 0;
      socket.emit("playtimeLimit:usage", { deltaMs: buffered, reason }, (res) => {
        if (res?.playtimeLimit) {
          applyPlaytimeLimitStatus(res.playtimeLimit);
        }
      });
    },
    [applyPlaytimeLimitStatus]
  );

  React.useEffect(() => {
    function onPlaytimeLimitBlocked(payload = {}) {
      if (payload?.playtimeLimit) {
        applyPlaytimeLimitStatus(payload.playtimeLimit);
      }
      const message =
        typeof payload?.message === "string" && payload.message.trim()
          ? payload.message.trim()
          : "Ton temps de jeu live est écoulé pour aujourd'hui.";
      showGlobalRedAnnouncementRef.current?.(
        {
          title: "Contrôle de temps pour joueurs compulsifs",
          body: message,
        },
        6500
      );
      onBlockedRef.current?.();
    }

    socket.on("playtimeLimit:blocked", onPlaytimeLimitBlocked);
    return () => socket.off("playtimeLimit:blocked", onPlaytimeLimitBlocked);
  }, [applyPlaytimeLimitStatus]);

  React.useEffect(() => {
    if (!isAccountAuthenticated) {
      applyPlaytimeLimitStatus(null);
      return;
    }
    if (!socket.connected) return;
    void refreshPlaytimeLimitStatus();
  }, [applyPlaytimeLimitStatus, isAccountAuthenticated, refreshPlaytimeLimitStatus]);

  React.useEffect(() => {
    const onConnect = () => {
      if (isAccountAuthenticated) void refreshPlaytimeLimitStatus();
    };
    socket.on("connect", onConnect);
    return () => socket.off("connect", onConnect);
  }, [isAccountAuthenticated, refreshPlaytimeLimitStatus]);

  React.useEffect(() => {
    if (!playtimeLimit?.active) return undefined;
    const checkDayRollover = () => {
      const statusDayId = String(playtimeLimitRef.current?.dayId || "");
      if (!statusDayId || statusDayId === getParisDayId()) return;
      applyPlaytimeLimitStatus(null);
      if (socket?.connected && isAccountAuthenticated) {
        void refreshPlaytimeLimitStatus();
      }
    };
    checkDayRollover();
    const id = setInterval(checkDayRollover, 60 * 1000);
    return () => clearInterval(id);
  }, [
    applyPlaytimeLimitStatus,
    isAccountAuthenticated,
    playtimeLimit?.active,
    refreshPlaytimeLimitStatus,
  ]);

  React.useEffect(() => {
    const isLiveCounting = isLoggedIn && appView === "live" && !!playtimeLimit?.active;
    playtimeLastAccountingAtRef.current = Date.now();
    if (!isLiveCounting) {
      flushPlaytimeUsage("pause");
      return undefined;
    }

    const id = setInterval(() => {
      const now = Date.now();
      const delta = Math.max(0, now - (playtimeLastAccountingAtRef.current || now));
      playtimeLastAccountingAtRef.current = now;
      if (delta <= 0) return;
      playtimeUsageBufferRef.current += delta;
      setPlaytimeRemainingMs((prev) => {
        if (!Number.isFinite(Number(prev))) return prev;
        return Math.max(0, Number(prev) - delta);
      });
      if (playtimeUsageBufferRef.current >= 15000) {
        flushPlaytimeUsage("interval");
      }
    }, 1000);

    return () => {
      clearInterval(id);
      flushPlaytimeUsage("stop");
    };
  }, [appView, flushPlaytimeUsage, isLoggedIn, playtimeLimit?.active]);

  React.useEffect(() => {
    if (!playtimeLimit?.active) return;
    if (!Number.isFinite(Number(playtimeRemainingMs))) return;
    const remaining = Math.max(0, Number(playtimeRemainingMs) || 0);
    const allowedThresholds = getAllowedPlaytimeAlertThresholds(playtimeLimit?.limitMs);
    const threshold = allowedThresholds.find(
      (value) => remaining <= value && !playtimeAlertedThresholdsRef.current.has(value)
    );
    if (!threshold) return;

    playtimeAlertedThresholdsRef.current.add(threshold);
    const minutes = Math.max(1, Math.round(threshold / 60000));
    showGlobalRedAnnouncementRef.current?.(
      {
        title: "Contrôle de temps pour joueurs compulsifs",
        body: `Plus que ${minutes} min de temps de jeu live.`,
      },
      5000
    );
  }, [playtimeLimit?.active, playtimeLimit?.limitMs, playtimeRemainingMs]);

  return {
    applyPlaytimeLimitStatus,
    clearDevPlaytimeLimit,
    devPlaytimeLimits,
    fetchDevPlaytimeLimits,
    playtimeLimit,
    playtimeRemainingMs,
    setPlaytimeLimitFromSettings,
  };
}
