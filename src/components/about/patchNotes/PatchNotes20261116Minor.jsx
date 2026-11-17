import React from "react";
import notes from "../../../../docs/patch-notes/2026-11-16-mineure.md?raw";

// The Markdown file is the editable source of the notes displayed in About.
const [heading, ...entries] = notes.trim().split(/\r?\n\s*\r?\n/);
function Emphasis({ text }) {
  return text.split("**").map((part, index) => index % 2
    ? <strong key={index}>{part}</strong> : part);
}

export default function PatchNotes20261116Minor({ menuDarkMode = false }) {
  return (
    <article className={`rounded-xl border p-3 ${menuDarkMode
      ? "border-violet-300/25 bg-violet-400/10"
      : "border-violet-200 bg-violet-50/75"}`}>
      <h2 className="text-[12px] font-extrabold uppercase tracking-wide opacity-90">
        {heading.replace(/^#\s+/, "")}
      </h2>
      <ul className="mt-2 list-disc pl-5 space-y-2">
        {entries.map((entry, index) => <li key={index}><Emphasis text={entry.replace(/^-\s+/, "")} /></li>)}
      </ul>
    </article>
  );
}
