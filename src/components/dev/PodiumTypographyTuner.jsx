import React from "react";
import {
  PODIUM_MATERIALS,
  applyPodiumTypographySettings,
  getDefaultPodiumTypographySettings,
  loadPodiumTypographySettings,
  savePodiumTypographySettings,
} from "../../utils/podiumTypographySettings.js";

const CHANNELS = [
  { key: "r", label: "R", accentClass: "accent-red-500" },
  { key: "g", label: "V", accentClass: "accent-emerald-500" },
  { key: "b", label: "B", accentClass: "accent-blue-500" },
];

const COLOR_CONTROLS = [
  { key: "base", label: "Face des lettres", hasAlpha: false },
  { key: "shadow", label: "Relief / tranche arrière", hasAlpha: true },
  { key: "halo", label: "Halo arrière", hasAlpha: true },
  { key: "reflection", label: "Reflet sur la face", hasAlpha: true },
];

function toHex({ r, g, b }) {
  return `#${[r, g, b]
    .map((value) => Math.round(value).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

function ColorSliders({ label, value, hasAlpha, onChange, darkMode }) {
  const alphaPercent = Math.round((value.a ?? 1) * 100);
  return (
    <div
      className={`rounded-xl border px-2.5 py-2.5 ${
        darkMode ? "border-white/10 bg-slate-950/30" : "border-amber-300/30 bg-white/45"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-extrabold">{label}</span>
        <span className="flex items-center gap-1.5 text-[10px] font-bold tabular-nums opacity-80">
          <span
            className="h-4 w-4 rounded border border-black/20 shadow-inner"
            style={{
              backgroundColor: `rgb(${value.r} ${value.g} ${value.b})`,
            }}
            aria-hidden="true"
          />
          {toHex(value)}
          {hasAlpha ? ` · ${alphaPercent}%` : ""}
        </span>
      </div>
      <div className="space-y-1.5">
        {CHANNELS.map((channel) => (
          <label key={channel.key} className="grid grid-cols-[14px_1fr_30px] items-center gap-2">
            <span className="text-[10px] font-black">{channel.label}</span>
            <input
              type="range"
              min="0"
              max="255"
              step="1"
              value={value[channel.key]}
              onChange={(event) => onChange(channel.key, Number(event.target.value))}
              className={`h-1.5 w-full cursor-pointer ${channel.accentClass}`}
              aria-label={`${label} · canal ${channel.label}`}
            />
            <span className="text-right text-[10px] font-bold tabular-nums">
              {value[channel.key]}
            </span>
          </label>
        ))}
        {hasAlpha ? (
          <label className="grid grid-cols-[14px_1fr_30px] items-center gap-2">
            <span className="text-[10px] font-black">A</span>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={alphaPercent}
              onChange={(event) => onChange("a", Number(event.target.value) / 100)}
              className="h-1.5 w-full cursor-pointer accent-violet-500"
              aria-label={`${label} · opacité`}
            />
            <span className="text-right text-[10px] font-bold tabular-nums">
              {alphaPercent}%
            </span>
          </label>
        ) : null}
      </div>
    </div>
  );
}

function GeometrySliders({ settings, onChange, darkMode }) {
  const controls = [
    {
      key: "reliefOffsetX",
      label: "Décalage latéral",
      min: -5,
      max: 5,
      step: 0.25,
      signed: true,
    },
    {
      key: "reliefOffset",
      label: "Décalage vertical",
      min: 0,
      max: 5,
      step: 0.25,
    },
    {
      key: "haloBlur",
      label: "Diffusion du halo",
      min: 0,
      max: 10,
      step: 0.5,
    },
  ];
  return (
    <div
      className={`rounded-xl border px-2.5 py-2.5 ${
        darkMode ? "border-white/10 bg-slate-950/30" : "border-amber-300/30 bg-white/45"
      }`}
    >
      <div className="space-y-2">
        {controls.map((control) => (
          <label key={control.key} className="block">
            <span className="mb-1 flex items-center justify-between gap-2 text-[11px] font-extrabold">
              <span>{control.label}</span>
              <span className="tabular-nums opacity-75">
                {control.signed && settings[control.key] > 0 ? "+" : ""}
                {settings[control.key]} px
              </span>
            </span>
            <input
              type="range"
              min={control.min}
              max={control.max}
              step={control.step}
              value={settings[control.key]}
              onChange={(event) => onChange(control.key, Number(event.target.value))}
              className="h-1.5 w-full cursor-pointer accent-amber-500"
            />
            {control.signed ? (
              <span className="mt-0.5 flex justify-between text-[9px] font-bold opacity-55">
                <span>− gauche</span>
                <span>droite +</span>
              </span>
            ) : null}
          </label>
        ))}
      </div>
    </div>
  );
}

export default function PodiumTypographyTuner({ darkMode = false }) {
  const [selectedKey, setSelectedKey] = React.useState("gold");
  const [settings, setSettings] = React.useState(() => loadPodiumTypographySettings());

  React.useEffect(() => {
    applyPodiumTypographySettings(settings);
    savePodiumTypographySettings(settings);
  }, [settings]);

  const selectedMaterial =
    PODIUM_MATERIALS.find((material) => material.key === selectedKey) || PODIUM_MATERIALS[0];
  const selectedSettings = settings[selectedMaterial.key];

  const updateColor = (part, channel, value) => {
    setSettings((current) => ({
      ...current,
      [selectedMaterial.key]: {
        ...current[selectedMaterial.key],
        [part]: {
          ...current[selectedMaterial.key][part],
          [channel]: value,
        },
      },
    }));
  };

  const updateGeometry = (key, value) => {
    setSettings((current) => ({
      ...current,
      [selectedMaterial.key]: {
        ...current[selectedMaterial.key],
        [key]: value,
      },
    }));
  };

  const resetSelectedMaterial = () => {
    const defaults = getDefaultPodiumTypographySettings();
    setSettings((current) => ({
      ...current,
      [selectedMaterial.key]: defaults[selectedMaterial.key],
    }));
  };

  return (
    <details
      className={`group rounded-xl border ${
        darkMode
          ? "border-amber-200/25 bg-slate-950/35 text-amber-50"
          : "border-amber-300/45 bg-white/65 text-slate-800"
      }`}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs font-extrabold uppercase tracking-widest marker:hidden">
        <span>Typographie podium</span>
        <span className="material-symbols-outlined text-[18px] transition-transform group-open:rotate-180">
          expand_more
        </span>
      </summary>

      <div className="border-t border-amber-300/25 px-3 pb-3 pt-2.5">
        <div className="grid grid-cols-3 gap-1.5">
          {PODIUM_MATERIALS.map((material) => {
            const selected = material.key === selectedMaterial.key;
            const disabled = material.key !== "gold";
            return (
              <button
                key={material.key}
                type="button"
                disabled={disabled}
                onClick={() => setSelectedKey(material.key)}
                className={`rounded-lg border px-2 py-1.5 text-xs font-extrabold transition ${
                  disabled
                    ? "cursor-not-allowed border-amber-300/20 bg-white/5 opacity-35"
                    : selected
                    ? darkMode
                      ? "border-amber-200/70 bg-amber-300/20"
                      : "border-amber-500/70 bg-amber-100"
                    : "border-amber-300/25 bg-white/10 opacity-70 hover:opacity-100"
                }`}
                aria-pressed={selected}
                title={disabled ? "Rendu précédent conservé pour le moment" : undefined}
              >
                {material.label}
              </button>
            );
          })}
        </div>

        <div
          className={`gold-nick-fx-enabled my-3 flex min-h-16 items-center justify-center overflow-hidden rounded-xl border px-3 ${
            darkMode ? "border-white/10 bg-slate-900/80" : "border-amber-200/70 bg-slate-800"
          }`}
        >
          <span className={`${selectedMaterial.className} text-2xl font-black tracking-wide`}>
            GOBBLE +42
          </span>
        </div>

        <div className="space-y-2">
          <GeometrySliders
            settings={selectedSettings}
            darkMode={darkMode}
            onChange={updateGeometry}
          />
          {COLOR_CONTROLS.map((control) => (
            <ColorSliders
              key={control.key}
              label={control.label}
              value={selectedSettings[control.key]}
              hasAlpha={control.hasAlpha}
              darkMode={darkMode}
              onChange={(channel, value) => updateColor(control.key, channel, value)}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={resetSelectedMaterial}
          className="mt-2.5 w-full rounded-lg border border-amber-300/35 px-2 py-1.5 text-[11px] font-bold opacity-80 hover:opacity-100"
        >
          Réinitialiser {selectedMaterial.label.toLowerCase()}
        </button>
      </div>
    </details>
  );
}
