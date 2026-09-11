import React from "react";

const WORLD_WIDTH = 24_000;
const WORLD_HEIGHT = 1_000;

const DECALS = Object.freeze([
  [-180, -110, 2_350, "decal-diagonal-wipe-v3", -4, 0.34],
  [2_050, 330, 2_100, "decal-ghost-field-v3", 3, 0.3],
  [4_250, -160, 1_850, "decal-vertical-wipes-v3", -7, 0.28],
  [6_150, 270, 2_450, "decal-handled-grime-v3", 5, 0.3],
  [8_750, -90, 2_050, "decal-wipe-wide-v2", -3, 0.3],
  [10_820, 390, 2_250, "decal-eraser-streaks-v2", 4, 0.32],
  [13_050, -130, 2_400, "decal-ghost-field-v3", -4, 0.28],
  [15_500, 300, 1_950, "decal-wipe-round-v2", 7, 0.27],
  [17_350, -120, 2_550, "decal-diagonal-wipe-v3", 6, 0.31],
  [19_850, 340, 2_300, "decal-handled-grime-v3", -5, 0.3],
  [21_950, -100, 2_050, "decal-vertical-wipes-v3", 5, 0.29],
  [22_850, 520, 1_700, "decal-chalk-scuffs-v2", -8, 0.3],
]);

function ChalkboardBackdrop() {
  return (
    <div className="chalkboard-decals" aria-hidden="true">
      {DECALS.map(([x, y, width, decal, rotation, opacity], index) => (
        <img
          key={`${decal}-${x}`}
          src={`/chalkboard/surface/${decal}.webp`}
          alt=""
          loading={index < 2 ? "eager" : "lazy"}
          decoding="async"
          draggable="false"
          style={{
            left: `${(x / WORLD_WIDTH) * 100}%`,
            top: `${(y / WORLD_HEIGHT) * 100}%`,
            width: `${(width / WORLD_WIDTH) * 100}%`,
            opacity,
            transform: `rotate(${rotation}deg) scale(var(--chalkboard-decal-scale, 1))`,
          }}
        />
      ))}
    </div>
  );
}

export default React.memo(ChalkboardBackdrop);
