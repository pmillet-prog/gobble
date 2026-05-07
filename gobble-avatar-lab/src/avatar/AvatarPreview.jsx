import { useMemo, useState } from "react";

import Avatar from "./Avatar.jsx";
import { avatarPresets, defaultAvatarConfig } from "./avatarPresets.js";
import { avatarOptions, getReadableLabel } from "./avatarUtils.js";

const previewStyles = `
  .avatar-preview {
    display: grid;
    grid-template-columns: minmax(280px, 380px) 1fr;
    gap: 20px;
    align-items: start;
  }

  .avatar-preview-card,
  .avatar-controls-card {
    border: 1px solid rgba(22, 32, 50, 0.12);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.86);
    box-shadow: 0 18px 42px rgba(22, 32, 50, 0.08);
  }

  .avatar-preview-card {
    display: flex;
    min-height: 420px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  .avatar-current-name {
    margin-top: 14px;
    font-size: 0.85rem;
    font-weight: 800;
    color: #5c6a7d;
  }

  .avatar-controls-card {
    padding: 18px;
  }

  .avatar-controls-section {
    display: grid;
    gap: 12px;
  }

  .avatar-section-title {
    margin: 0 0 10px;
    font-size: 0.78rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #5c6a7d;
  }

  .avatar-control-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .avatar-control {
    display: grid;
    gap: 6px;
  }

  .avatar-control label {
    font-size: 0.78rem;
    font-weight: 800;
    color: #344055;
  }

  .avatar-control select,
  .avatar-control input[type="color"] {
    width: 100%;
    min-height: 38px;
    border: 1px solid rgba(22, 32, 50, 0.18);
    border-radius: 8px;
    background: white;
    color: #162032;
  }

  .avatar-button-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .avatar-pill {
    border: 1px solid rgba(22, 32, 50, 0.16);
    border-radius: 999px;
    background: #ffffff;
    color: #162032;
    padding: 8px 12px;
    font-size: 0.82rem;
    font-weight: 800;
    cursor: pointer;
  }

  .avatar-pill-active {
    border-color: #38ada9;
    background: #dcfffb;
    color: #0f6b68;
  }

  .avatar-json {
    max-height: 210px;
    overflow: auto;
    border-radius: 8px;
    background: #162032;
    color: #e8f3ff;
    padding: 12px;
    font-size: 0.78rem;
    line-height: 1.5;
  }

  @media (max-width: 820px) {
    .avatar-preview {
      grid-template-columns: 1fr;
    }

    .avatar-preview-card {
      min-height: 320px;
    }
  }

  @media (max-width: 520px) {
    .avatar-control-grid {
      grid-template-columns: 1fr;
    }
  }
`;

const editableFields = [
  ["genderPresentation", "Presentation"],
  ["bodyShape", "Forme"],
  ["hair", "Cheveux"],
  ["eyeStyle", "Yeux"],
  ["mouthStyle", "Bouche"],
  ["horns", "Cornes costume"],
  ["pattern", "Motif"],
  ["accessory", "Accessoire"],
];

function cloneConfig(config) {
  return JSON.parse(JSON.stringify(config));
}

const presentationDefaults = {
  masculine: {
    genderPresentation: "masculine",
    bodyShape: "round",
    hair: "short",
    accessory: "none",
  },
  feminine: {
    genderPresentation: "feminine",
    bodyShape: "blob",
    hair: "bob",
    accessory: "none",
  },
};

export default function AvatarPreview() {
  const [config, setConfig] = useState(() => cloneConfig(defaultAvatarConfig));
  const [mood, setMood] = useState("idle");
  const [activePreset, setActivePreset] = useState("goblinGreen");

  const configJson = useMemo(() => JSON.stringify(config, null, 2), [config]);

  function updateConfigField(field, value) {
    setConfig((current) => Object.assign({}, current, { [field]: value }));
    setActivePreset("");
  }

  function applyGenderPresentation(value) {
    const defaults = presentationDefaults[value];
    if (!defaults) return;
    setConfig((current) => Object.assign({}, current, defaults));
    setActivePreset("");
  }

  function applyPreset(name) {
    const preset = avatarPresets[name];
    if (!preset) return;
    setConfig(cloneConfig(preset));
    setActivePreset(name);
  }

  return (
    <section className="avatar-preview">
      <style>{previewStyles}</style>
      <div className="avatar-preview-card">
        <Avatar config={config} size={260} mood={mood} />
        <div className="avatar-current-name">{activePreset || "custom"}</div>
      </div>

      <div className="avatar-controls-card">
        <div className="avatar-controls-section">
          <div>
            <h2 className="avatar-section-title">Presets</h2>
            <div className="avatar-button-row">
              {Object.keys(avatarPresets).map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`avatar-pill ${activePreset === name ? "avatar-pill-active" : ""}`}
                  onClick={() => applyPreset(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h2 className="avatar-section-title">Masculin / féminin</h2>
            <div className="avatar-button-row">
              {avatarOptions.genderPresentation.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`avatar-pill ${
                    config.genderPresentation === value ? "avatar-pill-active" : ""
                  }`}
                  onClick={() => applyGenderPresentation(value)}
                >
                  {getReadableLabel(value)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h2 className="avatar-section-title">Animation</h2>
            <div className="avatar-button-row">
              {avatarOptions.mood.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`avatar-pill ${mood === value ? "avatar-pill-active" : ""}`}
                  onClick={() => setMood(value)}
                >
                  {getReadableLabel(value)}
                </button>
              ))}
            </div>
          </div>

          <div className="avatar-control-grid">
            <div className="avatar-control">
              <label htmlFor="bodyColor">Vêtement</label>
              <input
                id="bodyColor"
                type="color"
                value={config.bodyColor}
                onChange={(event) => updateConfigField("bodyColor", event.target.value)}
              />
            </div>
            <div className="avatar-control">
              <label htmlFor="secondaryColor">Accent</label>
              <input
                id="secondaryColor"
                type="color"
                value={config.secondaryColor}
                onChange={(event) => updateConfigField("secondaryColor", event.target.value)}
              />
            </div>
            <div className="avatar-control">
              <label htmlFor="skinColor">Peau</label>
              <input
                id="skinColor"
                type="color"
                value={config.skinColor}
                onChange={(event) => updateConfigField("skinColor", event.target.value)}
              />
            </div>
            <div className="avatar-control">
              <label htmlFor="hairColor">Cheveux</label>
              <input
                id="hairColor"
                type="color"
                value={config.hairColor}
                onChange={(event) => updateConfigField("hairColor", event.target.value)}
              />
            </div>
            {editableFields.map(([field, label]) => (
              <div key={field} className="avatar-control">
                <label htmlFor={field}>{label}</label>
                <select
                  id={field}
                  value={config[field]}
                  onChange={(event) => updateConfigField(field, event.target.value)}
                >
                  {avatarOptions[field].map((value) => (
                    <option key={value} value={value}>
                      {getReadableLabel(value)}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div>
            <h2 className="avatar-section-title">Config JSON</h2>
            <pre className="avatar-json">{configJson}</pre>
          </div>
        </div>
      </div>
    </section>
  );
}
