import React, { useEffect, useMemo, useRef, useState } from "react";

export function buildMixedFeed({ announcements = [], lastWords = [] }) {
  const annWithTs = (announcements || [])
    .map((a) => {
      // IMPORTANT: pas de Date.now() ici (sinon les anciennes annonces "ressortent" en permanence)
      // et cassent la chronologie du flux.
      const rawTs = a?.ts ?? a?.id ?? 0;
      const ts = Number.isFinite(rawTs) ? rawTs : Number(rawTs) || 0;
      return {
        ...a,
        ts,
        id: a?.id ?? `ann-${ts}-${a?.type || "generic"}-${a?.nick || ""}`,
        kind: "announcement",
      };
    })
    // on garde l'ordre naturel d'arrivée pour dédoublonner correctement
    .sort((a, b) => (a.ts || 0) - (b.ts || 0));

  const superlativeSeen = new Set();
  const filteredAnnRaw = annWithTs.filter((a) => {
    const key = `${a.type || "generic"}|${a.nick || ""}`;
    if (a.type === "longest_possible" || a.type === "best_possible_score") {
      superlativeSeen.add(key);
      return true;
    }
    if (a.type === "long_word" && superlativeSeen.has(`longest_possible|${a.nick || ""}`)) {
      return false;
    }
    if (a.type === "big_word" && superlativeSeen.has(`best_possible_score|${a.nick || ""}`)) {
      return false;
    }
    return true;
  });

  // Dédoublonnage fin : si deux annonces du même joueur arrivent dans la même seconde,
  // on garde la plus "forte" (superlatif > égalisation > générique).
  const PRIORITY = {
    best_possible_score: 3,
    longest_possible: 3,
    big_word: 2,
    long_word: 2,
  };
  const bucket = new Map(); // key -> { idx, p, type }
  const filteredAnn = [];
  filteredAnnRaw.forEach((a) => {
    const tsBucket = Math.floor((a.ts || Date.now()) / 1000);
    const key = `${a.nick || "_"}|${tsBucket}`;
    const p = PRIORITY[a.type] ?? 0;
    const existing = bucket.get(key);
    if (!existing) {
      bucket.set(key, { idx: filteredAnn.length, p, type: a.type });
      filteredAnn.push(a);
      return;
    }
    if (p > existing.p) {
      filteredAnn[existing.idx] = a;
      bucket.set(key, { idx: existing.idx, p, type: a.type });
    }
    // si priorité plus faible ou égale, on ignore l'annonce courante
  });

  const wordItems = (lastWords || []).map((w) => {
    const ts = w.ts || w.id || Date.now();
    const id = w.id ?? ts;
    return {
      id: `word-${id}`,
      ts,
      kind: "word",
      display: w.display || "",
      pts: w.pts,
      label: w.label || null,
    };
  });

  const merged = [...filteredAnn, ...wordItems].sort((a, b) => (a.ts || 0) - (b.ts || 0));

  return merged;
}

const FALLBACK_VISIBLE = 18; // limite de secours pour éviter l'inflation du DOM
const ROW_ESTIMATE = 17; // hauteur approx. d'une ligne (text-[11px] + leading-tight)
const GAP_ESTIMATE = 4; // gap-1 en Tailwind

function LiveFeed({ items = [], darkMode, maxHeight = "220px" }) {
  const color = darkMode ? "text-slate-200" : "text-slate-800";
  const listRef = useRef(null);
  const [maxVisible, setMaxVisible] = useState(FALLBACK_VISIBLE);

  // Calcule combien de lignes peuvent tenir dans le bloc pour masquer automatiquement les anciennes.
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const compute = () => {
      const h = el.clientHeight || 0;
      if (!h) return;
      const estimatedRows = Math.floor((h + GAP_ESTIMATE) / (ROW_ESTIMATE + GAP_ESTIMATE));
      setMaxVisible(Math.max(4, estimatedRows || FALLBACK_VISIBLE));
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sortedItems = useMemo(
    () => [...(items || [])].sort((a, b) => (b.ts || 0) - (a.ts || 0)),
    [items]
  );

  const visibleItems = useMemo(() => {
    const cap = Number.isFinite(maxVisible) ? maxVisible : FALLBACK_VISIBLE;
    // newest first, capped to the available height
    return sortedItems.slice(0, cap);
  }, [sortedItems, maxVisible]);

  const escapeRegex = (str = "") => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const renderRichText = (text = "", nick) => {
    if (!text) return null;
    const escapedNick = nick ? escapeRegex(nick) : null;
    const regex = escapedNick ? new RegExp(`(${escapedNick})|(\\d+)`, "gi") : /(\d+)/g;
    const parts = text.split(regex);
    return parts.map((part, idx) => {
      if (!part) return null;
      const isNick = escapedNick && nick && part.toLowerCase() === nick.toLowerCase();
      const isNumber = /^\d+$/.test(part.trim());
      if (isNick || isNumber) {
        return (
          <strong key={idx} className="font-bold">
            {part}
          </strong>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  const renderAnnouncementText = (text = "", nick) => {
    if (!text) return null;
    const emphasisSplitRe =
      /(record de mot|mot le plus long|mot en or|meilleur mot|record de score)/gi;
    const emphasisTestRe =
      /^(record de mot|mot le plus long|mot en or|meilleur mot|record de score)$/i;
    const chunks = text.split(emphasisSplitRe);
    return chunks.map((chunk, idx) => {
      if (!chunk) return null;
      if (emphasisTestRe.test(chunk)) {
        return (
          <em key={`em-${idx}`} className="text-blue-600">
            {chunk}
          </em>
        );
      }
      return <span key={`rt-${idx}`}>{renderRichText(chunk, nick)}</span>;
    });
  };

  return (
    <div
      className={`flex flex-col gap-2 ${color}`}
      style={{ maxHeight, minHeight: maxHeight, height: maxHeight, overflow: "hidden" }}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Flux live
      </div>
      <div ref={listRef} className="flex-1 min-h-0 overflow-hidden flex flex-col gap-1">
        {visibleItems.length === 0 && (
          <div className="text-[11px] italic text-slate-400">Rien à signaler.</div>
        )}
        {visibleItems.map((item, idx) => {
          const key = item.id ?? `${item.kind || "item"}-${item.ts || idx}-${idx}`;
          if (item.kind === "word") {
            return (
              <div
                key={key}
                className="text-[11px] leading-tight italic flex items-center justify-between gap-2"
              >
                <span className="font-semibold not-italic truncate">{item.display.toUpperCase()}</span>
                {item.label ? (
                  <span className="text-orange-700 dark:text-amber-300 font-extrabold whitespace-nowrap">
                    {item.label}
                  </span>
                ) : (
                  <span className="text-orange-700 dark:text-amber-300 font-bold whitespace-nowrap">
                    +{item.pts} pts
                  </span>
                )}
              </div>
            );
          }
          return (
            <div key={key} className="text-[11px] leading-tight italic">
              {renderAnnouncementText(item.text, item.nick)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default React.memo(LiveFeed);
