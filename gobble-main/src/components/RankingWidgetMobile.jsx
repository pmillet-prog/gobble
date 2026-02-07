import React from "react";

function clampValue(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function buildRightLabel(entry, scoreValue, wordsCount) {
  if (entry && typeof entry.rightLabel === "string") {
    return entry.rightLabel;
  }
  if (typeof scoreValue === "number") {
    return `${wordsCount != null ? `${wordsCount} mots · ` : ""}${scoreValue} pts`;
  }
  return "-";
}

export function RankWheel({ fullRanking, displayRank, selfNick, expanded = false }) {
  const ROWS = 5;
  const rowEm = 1.6;
  const wheelHeight = `calc(${rowEm}em * ${ROWS})`;
  const wheelHeightStyle = {
    height: wheelHeight,
    minHeight: wheelHeight,
    maxHeight: wheelHeight,
    flex: "0 0 auto",
    paddingTop: "2px",
    paddingBottom: "2px",
  };
  const me = (selfNick || "").trim();
  const youIdx =
    me && fullRanking && fullRanking.length
      ? fullRanking.findIndex((e) => e.nick === me)
      : -1;
  const youRank = youIdx >= 0 ? youIdx + 1 : null;

  // On se cale sur la même "fenêtre" que NamesWindowMobile
  const centerRankIndex =
    typeof displayRank === "number" && displayRank > 0
      ? displayRank - 1
      : youIdx >= 0
      ? youIdx
      : -1;

  const OFFSETS = [-2, -1, 0, 1, 2]; // wheel toujours sur 5 lignes fixes

  function getSlotConfig(offset) {
    switch (offset) {
      case 0:
        return { rankClass: "text-[14px]", opacity: 1 };
      case -1:
      case 1:
        return { rankClass: "text-[11px]", opacity: 0.8 };
      case -2:
      case 2:
      default:
        return { rankClass: "text-[9px]", opacity: 0.3 };
    }
  }

  return (
    <div
      className="mr-2 flex flex-none items-center"
      style={wheelHeightStyle}
    >
      {/* même structure verticale que NamesWindowMobile : flex-col + space-y-1 */}
      <div
        className="relative flex flex-col justify-center items-center space-y-1"
        style={wheelHeightStyle}
      >
        {OFFSETS.map((off) => {
          const cfg = getSlotConfig(off);

          // Slot central : la bague avec TON rang
          if (off === 0) {
            const centerLabel =
              typeof displayRank === "number" && displayRank > 0
                ? displayRank
                : youRank != null
                ? youRank
                : "?";

            return (
              <div
                key="center"
                className="flex items-center justify-center transition-all duration-150"
                style={{ opacity: cfg.opacity }}
              >
                <div className="relative w-10 h-10 rounded-full border-2 border-amber-500/80 dark:border-amber-300/80 bg-gradient-to-br from-amber-100/90 via-white to-amber-200/60 dark:from-slate-900 dark:via-slate-800 dark:to-amber-800/30 shadow-inner flex items-center justify-center overflow-hidden">
                  <span className="text-[32px] font-extrabold text-slate-800 dark:text-slate-100 transition-transform duration-150">
                    {centerLabel}
                  </span>
                </div>
              </div>
            );
          }

          // Slots voisins : numéros sur le cylindre
          const idx =
            centerRankIndex >= 0 ? centerRankIndex + off : Number.NaN;

          const outOfRange =
            !fullRanking ||
            !fullRanking.length ||
            !Number.isFinite(idx) ||
            idx < 0 ||
            idx >= fullRanking.length;

          // Hors tableau = ligne vide (comme NamesWindow – deux lignes vides si 1er / dernier)
          if (outOfRange) {
            return (
              <div
                key={off}
                className="flex items-center justify-center transition-all duration-150"
                style={{ opacity: 0 }}
              >
                <span
                  className={[
                    "tabular-nums text-slate-700 dark:text-slate-100",
                    cfg.rankClass,
                  ].join(" ")}
                >
                  {/* ligne vide pour garder la hauteur */}
                </span>
              </div>
            );
          }

          const rankLabel = idx + 1;

          return (
            <div
              key={off}
              className="flex items-center justify-center transition-all duration-150"
              style={{ opacity: cfg.opacity }}
            >
              <span
                className={[
                  "tabular-nums text-slate-700 dark:text-slate-100",
                  cfg.rankClass,
                ].join(" ")}
              >
                {rankLabel}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function NamesWindowMobile({ fullRanking, displayRank, selfNick }) {
  const me = (selfNick || "").trim();
  const safeRanking = Array.isArray(fullRanking) ? fullRanking : [];

  if (!safeRanking || safeRanking.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-[11px] text-slate-400">
        En attente des premiers scores.
      </div>
    );
  }

  const youIdx = me ? safeRanking.findIndex((e) => e.nick === me) : -1;
  const youEntry = youIdx >= 0 ? safeRanking[youIdx] : null;

  // centre de la fenêtre = rang affiché par la bague
  const rankIndex =
    typeof displayRank === "number" && displayRank > 0
      ? displayRank - 1
      : youIdx;

  const OFFSETS = [-2, -1, 0, 1, 2];

  // on prépare la fenêtre des 5 lignes
  const windowEntries = OFFSETS.map((off) => {
    // Ligne centrale = TOI, quoi qu'il arrive
    if (off === 0) {
      return {
        type: "self",
        entry: youEntry,
        rank:
          typeof displayRank === "number" && displayRank > 0
            ? displayRank
            : youIdx >= 0
            ? youIdx + 1
            : null,
      };
    }

    if (rankIndex == null || rankIndex < 0) return null;
    const idx = rankIndex + off;
    if (idx < 0 || idx >= safeRanking.length) return null;

    return {
      type: "other",
      entry: safeRanking[idx],
      rank: idx + 1,
    };
  });

  function getSlotConfig(offset) {
    switch (offset) {
      case 0:
        return {
          pseudoClass: "text-[19px]",
          scoreClass: "text-[14px]",
          opacity: 1,
        };
      case -1:
      case 1:
        return {
          pseudoClass: "text-[15px]",
          scoreClass: "text-[11px]",
          opacity: 0.8,
        };
      case -2:
      case 2:
      default:
        return {
          pseudoClass: "text-[11px]",
          scoreClass: "text-[9px]",
          opacity: 0.3,
        };
    }
  }

  const ROWS = 5;
  const rowEm = expanded ? 1.4 : 1.6;
  const wheelHeight = `calc(${rowEm}em * ${ROWS})`;
  const wheelHeightStyle = {
    height: wheelHeight,
    minHeight: wheelHeight,
    maxHeight: wheelHeight,
    flex: "0 0 auto",
  };

  return (
    <div className="relative overflow-hidden flex-none" style={wheelHeightStyle}>
      <div className="absolute inset-0 flex flex-col justify-center space-y-1 px-0.5">
        {windowEntries.map((slot, i) => {
          const offset = OFFSETS[i];
          const cfg = getSlotConfig(offset);

          if (!slot) {
            // ligne vide pour garder la structure (effet rouleau)
            return (
              <div
                key={"empty-" + i}
                className={[
                  "flex items-baseline justify-between w-full transition-all duration-200",
                  cfg.pseudoClass,
                  "text-slate-700 dark:text-slate-200",
                ].join(" ")}
                style={{ opacity: 0 }}
              >
                <span className="opacity-0">.</span>
              </div>
            );
          }

          const { entry, type } = slot;
          const isSelfLine = type === "self";

          const lineClasses = [
            "flex items-baseline justify-between w-full transition-all duration-200",
            cfg.pseudoClass,
            isSelfLine
              ? "text-emerald-600 dark:text-emerald-300 font-bold"
              : "text-slate-700 dark:text-slate-200",
          ].join(" ");

          const style = { opacity: cfg.opacity };

          // Pseudo : ligne centrale = ton pseudo, figé
          let displayNick = entry ? entry.nick : "";
          if (isSelfLine && me) {
            displayNick = me;
          }

          // Score : pour la ligne centrale, on prend ton score réel si dispo
          let scoreValue = entry && typeof entry.score === "number"
              ? entry.score
              : undefined;

          if (isSelfLine && youEntry && typeof youEntry.score === "number") {
            scoreValue = youEntry.score;
          }

          const labelEntry = isSelfLine && youEntry ? youEntry : entry;
          const wordsCount =
            typeof labelEntry?.wordsCount === "number" ? labelEntry.wordsCount : null;
          const scoreLabel = buildRightLabel(labelEntry, scoreValue, wordsCount);

          return (
            <div key={displayNick + "-" + i} className={lineClasses} style={style}>
              {/* ATTENTION : plus de #n ici, juste pseudo + score */}
              <span className="flex-1 truncate">{displayNick}</span>
              <span
                className={["ml-2 tabular-nums font-bold", cfg.scoreClass].join(" ")}
              >
                {scoreLabel}
              </span>
            </div>
          );
        })}
      </div>

      {/* gradients haut/bas pour l'effet fenêtre */}
      <div className="pointer-events-none absolute inset-0">
        <div className="h-2 bg-gradient-to-b from-white dark:from-[#0b1020] to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-2 bg-gradient-to-t from-white dark:from-[#0b1020] to-transparent" />
      </div>

      {/* barre centrale type "loupe" */}
      <div className="pointer-events-none absolute top-1/2 left-0 right-0 -translate-y-1/2 h-[26px] border-y border-slate-300/70 dark:border-slate-500/70 bg-slate-200/15 dark:bg-slate-800/25" />
    </div>
  );
}

function RankingWidgetMobile({
  fullRanking,
  selfNick,
  darkMode,
  expanded,
  fitHeight = true,
  animateRank = true,
  showWheel = true,
  showBadge = false,
  flatStyle = false,
  showRoundAward = false,
  highlightedPlayers = [],
  renderNickSuffix = null,
  renderAfterRank = null,
  className = "",
}) {
  const me = (selfNick || "").trim();
  const safeRanking = Array.isArray(fullRanking) ? fullRanking : [];
  const [displayRank, setDisplayRank] = React.useState(null);
  const [targetRank, setTargetRank] = React.useState(null);
  const [displayRanking, setDisplayRanking] = React.useState(safeRanking);
  const rankAnimRef = React.useRef({ id: null, pending: null, running: false });
  const pendingRankingRef = React.useRef(null);
  const containerRef = React.useRef(null);
  const [rowPx, setRowPx] = React.useState(null);
  const [rowsCount, setRowsCount] = React.useState(5);
  const WHEEL_ROWS = 5;
  const BASE_ROW_PX = 26;
  const BASE_RING_SIZE = 40;
  const BASE_RING_FONT = 18;
  const wheelRowEm = expanded ? 1.4 : 1.6;
  const wheelHeight = `calc(${wheelRowEm}em * ${WHEEL_ROWS})`;
  const wheelHeightStyle = {
    height: wheelHeight,
    minHeight: wheelHeight,
    maxHeight: wheelHeight,
    flex: "0 0 auto",
  };
  const gapPx = 4;

  React.useEffect(() => {
    if (!fitHeight || expanded) {
      setRowPx(null);
      return;
    }
    const node = containerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;

    const minRowPx = 10;
    const compute = () => {
      const height = node.clientHeight || 0;
      if (!height) return;
      const baseHeight = BASE_ROW_PX * 5 + gapPx * 4;
      if (height >= baseHeight) {
        setRowsCount(5);
        setRowPx(BASE_ROW_PX);
        return;
      }
      let nextRows = 5;
      if (height < minRowPx * 5 + gapPx * 4) {
        nextRows = 3;
      }
      const totalGaps = gapPx * (nextRows - 1);
      const next = Math.floor((height - totalGaps) / nextRows);
      setRowsCount(nextRows);
      setRowPx(clampValue(next, minRowPx, BASE_ROW_PX));
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(node);
    return () => ro.disconnect();
  }, [fitHeight, expanded]);

  // Met à jour le rang cible quand le classement bouge
  React.useEffect(() => {
    if (!safeRanking || safeRanking.length === 0 || !me) return;
    const youIdx = safeRanking.findIndex((e) => e.nick === me);
    if (youIdx === -1) return;
    const actualRank = youIdx + 1;

    setTargetRank(actualRank);
    setDisplayRank((prev) => {
      if (prev == null || !animateRank) return actualRank;
      return prev;
    });
  }, [safeRanking, me, animateRank]);

  // Fige le classement affiché pendant une animation de rang, pour éviter les désync bague/liste.
  React.useEffect(() => {
    if (!animateRank) {
      pendingRankingRef.current = null;
      setDisplayRanking(safeRanking);
      return;
    }

    const anim = rankAnimRef.current;
    if (anim.running) {
      pendingRankingRef.current = safeRanking;
      return;
    }

    pendingRankingRef.current = null;
    setDisplayRanking(safeRanking);
  }, [safeRanking, animateRank]);

  // Anime displayRank jusqu'… targetRank avec file d'attente pour ne pas casser la roue
  React.useEffect(() => {
    if (!animateRank) {
      if (targetRank != null) setDisplayRank(targetRank);
      return;
    }

    if (targetRank == null) return;
    const anim = rankAnimRef.current;
    if (anim.running) {
      anim.pending = targetRank;
      return;
    }

    if (displayRank == null || targetRank === displayRank) {
      setDisplayRank(targetRank);
      return;
    }

    const startAnimation = (from, to) => {
      const delta = to - from;
      const direction = delta > 0 ? 1 : -1;
      const steps = Math.min(Math.abs(delta), 30);
      const totalDuration = 500;
      const stepDuration = Math.max(40, totalDuration / steps);

      anim.running = true;
      anim.pending = null;
      let current = from;
      let count = 0;

      anim.id = window.setInterval(() => {
        current += direction;
        count += 1;
        setDisplayRank(current);
        const finished = count >= steps || current === to;
        if (finished) {
          window.clearInterval(anim.id);
          anim.id = null;
          setDisplayRank(to);
          anim.running = false;
          if (pendingRankingRef.current != null) {
            const pendingRanking = pendingRankingRef.current;
            pendingRankingRef.current = null;
            setDisplayRanking(pendingRanking);
          }
          if (anim.pending !== null && anim.pending !== to) {
            const next = anim.pending;
            anim.pending = null;
            startAnimation(to, next);
          }
        }
      }, stepDuration);
    };

    startAnimation(displayRank, targetRank);

    return () => {
      if (anim.id) window.clearInterval(anim.id);
      anim.running = false;
      anim.pending = null;
      anim.id = null;
      pendingRankingRef.current = null;
    };
  }, [targetRank, displayRank, animateRank]);

  const containerBase = flatStyle ? "rounded-2xl" : "rounded-2xl p-2";
  const containerTheme = flatStyle
    ? darkMode
      ? "bg-transparent text-slate-200"
      : "bg-transparent text-slate-700"
    : darkMode
    ? "bg-slate-900/80 border-slate-700/80"
    : "bg-white/80 border-slate-200/60";

  const waitingTextColor = darkMode ? "text-slate-400" : "text-slate-500";
  const normalTextColor = darkMode ? "text-slate-200" : "text-slate-700";
  const selfTextColor = darkMode ? "text-white" : normalTextColor;

  // Anneau : noir en clair, blanc en sombre
  const ringBorderColor = darkMode ? "border-white" : "border-black";
  const ringBg = darkMode ? "bg-slate-900" : "bg-white";
  const ringTextColor = darkMode ? "text-white" : "text-black";

  const gradFromColor = darkMode ? "from-slate-900" : "from-white";
  const centerBarBorderColor = darkMode
    ? "border-slate-500/70"
    : "border-slate-300/70";
  const centerBarBgColor = darkMode
    ? "bg-slate-800/25"
    : "bg-slate-200/15";

  const extendedBg = flatStyle
    ? "bg-transparent"
    : darkMode
    ? "bg-slate-900/95"
    : "bg-white/90";
  const extendedBorder = flatStyle
    ? "border-transparent"
    : darkMode
    ? "border-slate-700/80"
    : "border-slate-200/60";
  const extendedDivider = darkMode ? "border-slate-700/40" : "border-slate-200/40";
  const extendedSelfColor = darkMode ? "text-sky-300" : "text-sky-700";
  const extendedOtherColor = normalTextColor;
  const containerClass =
    containerBase +
    " " +
    containerTheme +
    " flex flex-col h-full" +
    (className ? ` ${className}` : "");
  const highlightSet = new Set(highlightedPlayers || []);

  const flatList = (
    <div
      className={
        "text-[11px] rounded-xl border h-full min-h-0 overflow-y-auto pr-1 " +
        extendedBg +
        " " +
        extendedBorder
      }
    >
      {safeRanking.map((entry, index) => {
        const isSelf = selfNick && entry.nick === selfNick;
        const isHighlighted = entry.nick && highlightSet.has(entry.nick);
        const rank = index + 1;
        const wordsCount =
          typeof entry?.wordsCount === "number" ? entry.wordsCount : null;
        const gobbles = typeof entry?.gobbles === "number" ? entry.gobbles : null;
        const scoreLabelBase = buildRightLabel(entry, entry.score, wordsCount);
        let scoreLabelInner = scoreLabelBase;
        if (!entry?.rightLabel && typeof entry.score === "number" && gobbles != null) {
          scoreLabelInner = `${scoreLabelBase} · G:${gobbles}`;
        }
        const roundPoints =
          showRoundAward && typeof entry?.roundPoints === "number"
            ? entry.roundPoints
            : null;
        const roundGobbles =
          showRoundAward && typeof entry?.roundGobbles === "number"
            ? entry.roundGobbles
            : 0;

        const rowColor = isSelf
          ? darkMode
            ? "text-slate-900"
            : "text-white"
          : isHighlighted
          ? darkMode
            ? "text-amber-200"
            : "text-amber-700"
          : extendedOtherColor;
        const rowBg = isSelf
          ? darkMode
            ? "bg-slate-100/90"
            : "bg-slate-900/80"
          : isHighlighted
          ? darkMode
            ? "bg-amber-900/30"
            : "bg-amber-50"
          : "";

        return (
          <div
            key={entry.nick + "-" + index}
            className={
              "flex items-baseline justify-between px-2 py-[3px] border-b last:border-b-0 rounded " +
              extendedDivider +
              " " +
              rowColor +
              " transition " +
              rowBg
            }
          >
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="tabular-nums text-[11px] opacity-80 inline-flex items-baseline gap-1">
                <span>{rank}</span>
                {renderAfterRank ? (
                  <span className="inline-flex">{renderAfterRank(entry, rank)}</span>
                ) : null}
              </span>
              <span className="min-w-0 flex items-baseline gap-1">
                <span className="truncate">{entry.nick}</span>
                {renderNickSuffix ? (
                  <span className="flex-none">{renderNickSuffix(entry.nick)}</span>
                ) : null}
              </span>
            </div>
            <span className="tabular-nums text-[11px] opacity-80 font-bold">
              {roundGobbles > 0 ? (
                <span className="mr-1 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-amber-200 text-amber-900 text-[9px] font-black">
                  {`G${roundGobbles > 1 ? `x${roundGobbles}` : ""}`}
                </span>
              ) : null}
              {roundPoints != null && roundPoints > 0 ? (
                <span className="mr-1 text-blue-600 dark:text-blue-300 font-extrabold">
                  +{roundPoints}
                </span>
              ) : null}
              {scoreLabelInner}
            </span>
          </div>
        );
      })}
    </div>
  );

  if (!safeRanking || safeRanking.length === 0) {
    return (
      <div
        className={
          containerBase +
          " " +
          containerTheme +
          " text-[11px] " +
          waitingTextColor
        }
      >
        En attente du premier score
      </div>
    );
  }

  const youIdx = me ? safeRanking.findIndex((e) => e.nick === me) : -1;
  const youEntry = youIdx >= 0 ? safeRanking[youIdx] : null;
  const youRank = youIdx >= 0 ? youIdx + 1 : null;

  const OFFSETS = expanded
    ? safeRanking.map((_, idx) => idx - (youIdx >= 0 ? youIdx : 0))
    : rowsCount === 3
    ? [-1, 0, 1]
    : [-2, -1, 0, 1, 2];

  function getSlotConfig(offset) {
    if (expanded) {
      return {
        pseudoClass: "text-[12px]",
        scoreClass: "text-[11px]",
        rankClass: "text-[11px]",
        opacity: 1,
      };
    }
    if (rowPx) {
      const ratio = rowPx / BASE_ROW_PX;
      const base =
        offset === 0
          ? { pseudo: 19, score: 14, rank: 14, opacity: 1 }
          : offset === -1 || offset === 1
          ? { pseudo: 15, score: 11, rank: 11, opacity: 0.8 }
          : { pseudo: 11, score: 9, rank: 9, opacity: 0.3 };
      return {
        pseudoFontPx: Math.max(6, Math.round(base.pseudo * ratio)),
        scoreFontPx: Math.max(6, Math.round(base.score * ratio)),
        rankFontPx: Math.max(6, Math.round(base.rank * ratio)),
        opacity: base.opacity,
      };
    }
    if (offset === 0) {
      return {
        pseudoClass: "text-[19px]",
        scoreClass: "text-[14px]",
        rankClass: "text-[14px]",
        opacity: 1,
      };
    }
    if (offset === -1 || offset === 1) {
      return {
        pseudoClass: "text-[15px]",
        scoreClass: "text-[11px]",
        rankClass: "text-[11px]",
        opacity: 0.8,
      };
    }
    return {
      pseudoClass: "text-[11px]",
      scoreClass: "text-[9px]",
      rankClass: "text-[9px]",
      opacity: 0.3,
    };
  }

  const wheelOffsets = showWheel && expanded ? [-2, -1, 0, 1, 2] : OFFSETS;

  const rankingForRoll = animateRank ? displayRanking : safeRanking;
  const selfEntryForRoll = youEntry || (me ? { nick: me } : null);
  const otherEntriesForRoll = me
    ? rankingForRoll.filter((entry) => entry.nick !== me)
    : rankingForRoll;
  const desiredRankIndex =
    typeof displayRank === "number" && displayRank > 0
      ? displayRank - 1
      : youIdx >= 0
      ? youIdx
      : 0;
  const selfInsertIndex = Math.max(
    0,
    Math.min(desiredRankIndex, otherEntriesForRoll.length)
  );
  const virtualRanking =
    selfEntryForRoll && me
      ? [
          ...otherEntriesForRoll.slice(0, selfInsertIndex),
          selfEntryForRoll,
          ...otherEntriesForRoll.slice(selfInsertIndex),
        ]
      : [...otherEntriesForRoll];
  const baseCenterIndex = selfEntryForRoll && me ? selfInsertIndex : -1;

  const rows = wheelOffsets.map((offset) => {
    if (offset === 0) {
      return {
        offset,
        type: "self",
        rank:
          typeof displayRank === "number" && displayRank > 0
            ? displayRank
            : youRank,
        entry: selfEntryForRoll,
      };
    }

    if (baseCenterIndex == null || baseCenterIndex < 0) {
      return { offset, type: "empty", rank: null, entry: null };
    }

    const idx = baseCenterIndex + offset;
    if (idx < 0 || idx >= virtualRanking.length) {
      return { offset, type: "empty", rank: null, entry: null };
    }

    return {
      offset,
      type: "other",
      rank: idx + 1,
      entry: virtualRanking[idx],
    };
  });

  const rollContainerClass = "relative overflow-hidden flex-none";
  const effectiveRowPx = rowPx && !expanded ? rowPx : null;
  const rowsHeightPx = effectiveRowPx
    ? effectiveRowPx * rowsCount + gapPx * (rowsCount - 1)
    : null;
  const rollContainerStyle = rowsHeightPx
    ? { height: `${rowsHeightPx}px`, minHeight: `${rowsHeightPx}px` }
    : wheelHeightStyle;
  const rowStyle = effectiveRowPx ? { height: `${effectiveRowPx}px` } : null;
  const centerRingSize = effectiveRowPx
    ? clampValue(Math.round(BASE_RING_SIZE * (effectiveRowPx / BASE_ROW_PX)), 16, BASE_RING_SIZE)
    : BASE_RING_SIZE;
  const centerRingFontPx = effectiveRowPx
    ? clampValue(
        Math.round(BASE_RING_FONT * (effectiveRowPx / BASE_ROW_PX)),
        10,
        Math.max(10, Math.floor(centerRingSize * 0.6))
      )
    : BASE_RING_FONT;
  const centerBarHeight = effectiveRowPx ? `${effectiveRowPx}px` : "26px";
  const centerBarLeft = `${Math.round(centerRingSize + 8)}px`;

  return (
    <div
      className={containerClass}
      ref={containerRef}
      style={
        expanded
          ? { minHeight: "220px" }
          : fitHeight
          ? { height: "100%", minHeight: 0 }
          : { flex: "0 0 auto" }
      }
    >
      {/* Wheel compacte en haut */}
      {showBadge && (
        <div className="flex items-center justify-center mb-2">
          <div
            className={
              "w-14 h-14 rounded-full flex items-center justify-center font-extrabold text-xl border-2 " +
              (darkMode ? "border-white text-white bg-slate-800/40" : "border-black text-black bg-white/70")
            }
          >
            {displayRank ?? youRank ?? "?"}
          </div>
        </div>
      )}

      {showWheel && !expanded && (
        <div className={rollContainerClass} style={rollContainerStyle}>
          <div
            className="absolute inset-0 grid grid-cols-[auto,1fr] items-center gap-y-1 gap-x-3"
            style={{
              gridTemplateRows: effectiveRowPx
                ? `repeat(${rows.length}, ${effectiveRowPx}px)`
                : `repeat(${rows.length}, minmax(0,1fr))`,
            }}
          >
            {rows.map((row, index) => {
              const cfg = getSlotConfig(row.offset);
            const isSelfLine = row.type === "self";
            const isHighlighted =
              row.entry && row.entry.nick && highlightSet.has(row.entry.nick);

              // Colonne gauche : rangs + bague
              let leftContent = null;

              if (row.offset === 0) {
                const centerLabel =
                  typeof displayRank === "number" && displayRank > 0
                    ? displayRank
                    : youRank != null
                    ? youRank
                    : "?";

                leftContent = (
                  <div
                    className="flex items-center justify-center"
                    style={{ opacity: cfg.opacity, ...(rowStyle || {}) }}
                  >
                    <div
                      className={
                        "relative w-10 h-10 rounded-full border-2 shadow-inner flex items-center justify-center overflow-hidden " +
                        ringBorderColor +
                        " " +
                        ringBg
                      }
                      style={{
                        width: `${centerRingSize}px`,
                        height: `${centerRingSize}px`,
                      }}
                    >
                      <span
                        className={
                          "font-extrabold " + ringTextColor
                        }
                        style={{ fontSize: `${centerRingFontPx}px` }}
                      >
                        {centerLabel}
                      </span>
                    </div>
                  </div>
                );
              } else if (row.type === "empty") {
                leftContent = (
                  <div
                    className="flex items-center justify-center"
                    style={{ opacity: 0, ...(rowStyle || {}) }}
                  >
                    <span
                      className={
                        "tabular-nums opacity-0 " + (cfg.rankClass || "")
                      }
                      style={
                        cfg.rankFontPx ? { fontSize: `${cfg.rankFontPx}px` } : undefined
                      }
                    >
                      0
                    </span>
                  </div>
                );
              } else {
                const rankColor = darkMode ? "text-slate-100" : "text-slate-700";
                leftContent = (
                  <div
                    className="flex items-center justify-center transition-all duration-150"
                    style={{ opacity: cfg.opacity, ...(rowStyle || {}) }}
                  >
                    <span
                      className={
                        "tabular-nums " + rankColor + " " + (cfg.rankClass || "")
                      }
                      style={
                        cfg.rankFontPx ? { fontSize: `${cfg.rankFontPx}px` } : undefined
                      }
                    >
                      {row.rank}
                    </span>
                  </div>
                );
              }

              // Colonne droite : pseudo + score
              let displayNick = row.entry ? row.entry.nick : "";
              if (isSelfLine && me) {
                displayNick = me;
              }

              let scoreValue =
                row.entry && typeof row.entry.score === "number"
                  ? row.entry.score
                  : undefined;

              if (isSelfLine && youEntry && typeof youEntry.score === "number") {
                scoreValue = youEntry.score;
              }

              const labelEntry = isSelfLine && youEntry ? youEntry : row.entry;
              const wordsCount =
                typeof labelEntry?.wordsCount === "number" ? labelEntry.wordsCount : null;
              const scoreLabel = buildRightLabel(labelEntry, scoreValue, wordsCount);
              const roundPoints =
                showRoundAward && typeof labelEntry?.roundPoints === "number"
                  ? labelEntry.roundPoints
                  : null;
              const roundGobbles =
                showRoundAward && typeof labelEntry?.roundGobbles === "number"
                  ? labelEntry.roundGobbles
                  : 0;

              const lineColor = isSelfLine
                ? selfTextColor
                : isHighlighted
                ? darkMode
                  ? "text-amber-200"
                  : "text-amber-700"
                : normalTextColor;
              const lineBg = isSelfLine
                ? darkMode
                  ? "bg-slate-800/60"
                  : "bg-blue-50"
                : isHighlighted
                ? darkMode
                  ? "bg-amber-900/30"
                  : "bg-amber-50"
                : "";

              const rightClasses =
                "flex items-baseline justify-between w-full transition-all duration-200 " +
                (cfg.pseudoClass || "") +
                " " +
                lineColor +
                (isSelfLine ? " font-bold" : "") +
                (lineBg ? " " + lineBg : "");

              const rightStyle = {
                opacity: row.type === "empty" ? 0 : cfg.opacity,
                fontSize: cfg.pseudoFontPx ? `${cfg.pseudoFontPx}px` : undefined,
                ...(rowStyle || {}),
                lineHeight: effectiveRowPx ? `${effectiveRowPx}px` : undefined,
              };

              return (
                <React.Fragment key={index}>
                  <div className={"col-start-1 row-start-" + (index + 1)}>
                    {leftContent}
                  </div>

                  <div
                    className={
                      "col-start-2 row-start-" +
                      (index + 1) +
                      " " +
                      rightClasses
                    }
                    style={rightStyle}
                  >
                    <span className="flex-1 min-w-0 flex items-baseline gap-1">
                      <span className="truncate">{row.type === "empty" ? "" : displayNick}</span>
                      {renderNickSuffix && row.type !== "empty" ? (
                        <span className="flex-none">
                          {renderNickSuffix(row.entry ? row.entry.nick : displayNick)}
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={"ml-2 tabular-nums " + (cfg.scoreClass || "")}
                      style={
                        cfg.scoreFontPx ? { fontSize: `${cfg.scoreFontPx}px` } : undefined
                      }
                    >
                      {row.type === "empty" ? (
                        ""
                      ) : (
                        <>
                          {roundGobbles > 0 ? (
                            <span className="mr-1 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-amber-200 text-amber-900 text-[9px] font-black">
                              {`G${roundGobbles > 1 ? `x${roundGobbles}` : ""}`}
                            </span>
                          ) : null}
                          {roundPoints != null && roundPoints > 0 ? (
                            <span className="mr-1 text-blue-600 dark:text-blue-300 font-extrabold">
                              +{roundPoints}
                            </span>
                          ) : null}
                          {scoreLabel}
                        </>
                      )}
                    </span>
                  </div>
                </React.Fragment>
              );
            })}
          </div>

          {/* gradients haut/bas */}
          <div className="pointer-events-none absolute inset-0">
            <div
              className={
                "h-2 bg-gradient-to-b to-transparent " + gradFromColor
              }
            />
            <div
              className={
                "absolute bottom-0 left-0 right-0 h-2 bg-gradient-to-t to-transparent " +
                gradFromColor
              }
            />
          </div>

          {/* barre centrale, qui commence à droite du cercle */}
          <div
            className={
              "pointer-events-none absolute top-1/2 -translate-y-1/2 border-y " +
              centerBarBorderColor +
              " " +
              centerBarBgColor
            }
            style={{ height: centerBarHeight, left: centerBarLeft, right: 0 }}
          />
        </div>
      )}

      {expanded && <div className="mt-2 flex-1 min-h-0">{flatList}</div>}
    </div>
  );
}

export default React.memo(RankingWidgetMobile);

