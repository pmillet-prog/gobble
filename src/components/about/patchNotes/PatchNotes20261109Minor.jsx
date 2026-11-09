import React from "react";
import notes from "../../../../docs/patch-notes/2026-11-09-mineure.md?raw";

const [heading, introduction, ...entries] = notes.trim().split(/\r?\n\s*\r?\n/);
function Emphasis({ text }) {
  return text.split("**").map((part, index) => index % 2
    ? <strong key={index}>{part}</strong> : part);
}

export default function PatchNotes20261109Minor({ menuDarkMode = false }) {
  return <article className={`rounded-xl border p-3 ${menuDarkMode
    ? "border-sky-300/25 bg-sky-400/10" : "border-sky-200 bg-sky-50/75"}`}>
    <h2 className="text-[12px] font-extrabold uppercase tracking-wide opacity-90">{heading.replace(/^#\s+/, "")}</h2>
    <p className="mt-2"><Emphasis text={introduction} /></p>
    <ul className="mt-2 list-disc pl-5 space-y-2">
      {entries.map((entry, index) => <li key={index}><Emphasis text={entry.replace(/^-\s+/, "")} /></li>)}
    </ul>
  </article>;
}
