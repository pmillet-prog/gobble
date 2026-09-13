import React from "react";

export default function AboutCredits({ darkMode }) {
  return <details className={`rounded-xl border px-3 py-2 ${darkMode
    ? "bg-slate-800/90 border-white/15 text-slate-100" : "bg-slate-50 border-slate-200 text-slate-900"}`}>
    <summary className="cursor-pointer text-[12px] font-semibold">Crédits</summary>
    <div className="mt-3 space-y-2 text-[12px] leading-relaxed">
      <p className="font-bold">Sons et ambiances</p>
      <p>Merci à <strong>Joseph Sardin</strong> et à son site {" "}
        <a href="https://lasonotheque.org/" target="_blank" rel="noopener noreferrer"
          className="font-semibold underline underline-offset-2">LaSonotheque.org</a>
        {" "}pour ses sons libres de droits utilisés dans différents bruitages et sons d’ambiance de Gobble.
      </p>
    </div>
  </details>;
}
