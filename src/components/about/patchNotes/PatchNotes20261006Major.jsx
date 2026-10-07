import React from "react";
import notes from "../../../../docs/patch-notes/2026-10-06-majeure.md?raw";

// Keep the approved draft as the single source of this release's wording.
// Its format is one heading, an introduction and a list with bold emphasis.
const [heading, introduction, ...entries] = notes.trim().split(/\r?\n\s*\r?\n/);
function Emphasis({ text }) {
  return text.split("**").map((part, index) => index % 2
    ? <strong key={index}>{part}</strong> : part);
}

export default function PatchNotes20261006Major({ menuDarkMode = false }) {
  return (
    <article className={`rounded-xl border p-4 ${menuDarkMode
      ? "border-amber-300/30 bg-amber-400/10"
      : "border-amber-300 bg-amber-50/80"}`}>
      <h2 className="text-base font-extrabold">{heading.replace(/^#\s+/, "")}</h2>
      <p className="mt-2"><Emphasis text={introduction} /></p>
      <ul className="mt-3 list-disc pl-5 space-y-3">
        {entries.map((entry, index) => <li key={index}><Emphasis text={entry.replace(/^-\s+/, "")} /></li>)}
      </ul>
    </article>
  );
}
