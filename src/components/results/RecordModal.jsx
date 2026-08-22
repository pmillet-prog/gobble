import React from "react";
import { createPortal } from "react-dom";
import { formatTargetTime } from "./useFinalRanking.jsx";

function formatRankLabel(record) {
  if (!record) return "Hors classement";
  const rank = record.rank;
  const total = record.rankTotal;
  if (Number.isFinite(rank)) {
    return Number.isFinite(total) ? `#${rank} / ${total}` : `#${rank}`;
  }
  return "Hors classement";
}

function formatValueLabel(record) {
  if (!record) return "";
  if (record.categoryKey === "bestWord") {
    if (!record.word) return "";
    const pts = Number.isFinite(record.pts) ? ` (${record.pts} pts)` : "";
    return `Mot : ${record.word}${pts}`;
  }
  if (record.categoryKey === "bestRoundScore") {
    return Number.isFinite(record.pts) ? `Score : ${record.pts} pts` : "";
  }
  if (record.categoryKey === "longestWord") {
    if (!record.word) return "";
    const len = Number.isFinite(record.len) ? ` (${record.len} lettres)` : "";
    return `Mot : ${record.word}${len}`;
  }
  if (record.categoryKey === "mostWordsInGame") {
    return Number.isFinite(record.wordsCount)
      ? `Mots : ${record.wordsCount} par manche`
      : "";
  }
  if (
    record.categoryKey === "bestTimeTargetLong" ||
    record.categoryKey === "bestTimeTargetScore"
  ) {
    return Number.isFinite(record.timeMs)
      ? `Temps : ${formatTargetTime(record.timeMs)}`
      : "";
  }
  return "";
}

export default function RecordModal({ darkMode, onClose, playCloseSound, recordModal }) {
  if (!recordModal?.open || typeof document === "undefined") return null;

  const records =
    Array.isArray(recordModal.records) && recordModal.records.length
      ? recordModal.records
      : recordModal.categoryKey
      ? [recordModal]
      : [];
  const subtitle =
    records.length > 1
      ? "Plusieurs categories"
      : records[0]?.categoryLabel || "Record";

  return createPortal(
    <div
      className="fixed inset-0 z-[12060] bg-black/55 backdrop-blur-sm flex items-center justify-center px-4 py-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full max-w-sm rounded-2xl border shadow-2xl overflow-hidden ${
          darkMode
            ? "bg-slate-900/90 border-white/10 text-white"
            : "bg-white/90 border-slate-200 text-slate-900"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="absolute top-3 right-3 z-20 rounded-full h-9 w-12 flex items-center justify-center text-base font-bold text-white cursor-pointer pointer-events-auto select-none"
          onClick={() => {
            playCloseSound();
            onClose();
          }}
          aria-label="Fermer"
        >
          <span className="pointer-events-none">X</span>
        </button>
        <div className="p-4 pb-5 space-y-3">
          <div className="flex justify-center">
            <span className="record-rainbow px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest">
              Nouveau record
            </span>
          </div>
          <div className="text-center text-base font-extrabold">{subtitle}</div>
          <div className="text-center text-xs">
            Joueur : <span className="font-semibold">{recordModal.nick || "?"}</span>
          </div>
          {records.length === 1 ? (
            <>
              <div className="text-center text-xs opacity-75">
                Classement hebdo : {formatRankLabel(records[0])}
              </div>
              {formatValueLabel(records[0]) ? (
                <div className="text-center text-sm font-semibold">
                  {formatValueLabel(records[0])}
                </div>
              ) : null}
            </>
          ) : (
            <div className="space-y-2">
              {records.map((record) => (
                <div
                  key={record.id || `${record.categoryKey}-${record.nick}`}
                  className={`rounded-xl border px-3 py-2 ${
                    darkMode
                      ? "border-white/10 bg-slate-900/40"
                      : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <div className="text-xs font-extrabold">
                    {record.categoryLabel || "Record"}
                  </div>
                  <div className="text-[10px] opacity-70">
                    Classement hebdo : {formatRankLabel(record)}
                  </div>
                  {formatValueLabel(record) ? (
                    <div className="text-[11px] font-semibold">
                      {formatValueLabel(record)}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
