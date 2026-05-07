import React from "react";

const h = React.createElement;
const outline = "#263447";

function buildPath(d) {
  return h("path", { d });
}

export function renderShadow() {
  return h("ellipse", {
    cx: 120,
    cy: 214,
    rx: 48,
    ry: 11,
    fill: "rgba(20, 31, 48, 0.18)",
  });
}

function renderHead(config) {
  if (config.bodyShape === "square") {
    return h("rect", {
      x: 74,
      y: 54,
      width: 92,
      height: 94,
      rx: 30,
      fill: config.skinColor,
      stroke: outline,
      strokeWidth: 5,
    });
  }

  if (config.bodyShape === "blob") {
    return h("path", {
      d: "M73 100C73 68 92 48 123 49C151 50 170 70 168 101C166 132 146 151 119 150C91 149 73 130 73 100Z",
      fill: config.skinColor,
      stroke: outline,
      strokeWidth: 5,
      strokeLinejoin: "round",
    });
  }

  return h("circle", {
    cx: 120,
    cy: 101,
    r: 50,
    fill: config.skinColor,
    stroke: outline,
    strokeWidth: 5,
  });
}

export function renderBody(config) {
  const isFeminine = config.genderPresentation === "feminine";
  const torsoPath = isFeminine
    ? "M70 205L80 170C85 151 101 139 120 139C139 139 155 151 160 170L170 205Z"
    : "M72 205V171C72 151 91 139 120 139C149 139 168 151 168 171V205Z";
  const collarPath = isFeminine ? "M95 150L120 180L145 150" : "M93 150L120 175L147 150";

  return [
    h("path", {
      key: "torso",
      d: torsoPath,
      fill: config.bodyColor,
      stroke: outline,
      strokeWidth: 5,
      strokeLinejoin: "round",
    }),
    h("path", {
      key: "neck",
      d: "M104 145V132H136V145C136 154 129 160 120 160C111 160 104 154 104 145Z",
      fill: config.skinColor,
      stroke: outline,
      strokeWidth: 5,
      strokeLinejoin: "round",
    }),
    h("path", {
      key: "collar",
      d: collarPath,
      fill: "none",
      stroke: config.secondaryColor,
      strokeWidth: 8,
      strokeLinecap: "round",
      strokeLinejoin: "round",
    }),
    h("g", { key: "head" }, renderHead(config)),
  ];
}

export function renderArms(config) {
  return [
    h("g", { key: "left" }, [
      h("path", {
        key: "left-sleeve",
        d: "M75 170C50 174 40 190 48 204",
        fill: "none",
        stroke: config.bodyColor,
        strokeWidth: 16,
        strokeLinecap: "round",
      }),
      h("circle", {
        key: "left-hand",
        cx: 47,
        cy: 205,
        r: 9,
        fill: config.skinColor,
        stroke: outline,
        strokeWidth: 4,
      }),
    ]),
    h("g", { key: "right" }, [
      h("path", {
        key: "right-sleeve",
        d: "M165 170C190 174 200 190 192 204",
        fill: "none",
        stroke: config.bodyColor,
        strokeWidth: 16,
        strokeLinecap: "round",
      }),
      h("circle", {
        key: "right-hand",
        cx: 193,
        cy: 205,
        r: 9,
        fill: config.skinColor,
        stroke: outline,
        strokeWidth: 4,
      }),
    ]),
  ];
}

export function renderHair(config) {
  if (config.hair === "none") return null;

  if (config.hair === "bob") {
    const bobPath =
      config.genderPresentation === "feminine"
        ? "M70 114C60 80 82 45 120 43C159 45 181 80 170 114C166 139 153 153 136 158C145 137 142 92 120 82C98 92 95 137 104 158C87 153 74 139 70 114Z"
        : "M72 107C64 77 83 47 120 45C158 47 176 78 168 108C159 90 143 81 120 81C97 81 81 90 72 107Z";
    return h("path", {
      d: bobPath,
      fill: config.hairColor,
      stroke: outline,
      strokeWidth: 5,
      strokeLinejoin: "round",
    });
  }

  if (config.hair === "curly") {
    return [
      h("circle", { key: "curl-1", cx: 84, cy: 76, r: 16, fill: config.hairColor, stroke: outline, strokeWidth: 4 }),
      h("circle", { key: "curl-2", cx: 106, cy: 60, r: 18, fill: config.hairColor, stroke: outline, strokeWidth: 4 }),
      h("circle", { key: "curl-3", cx: 132, cy: 60, r: 18, fill: config.hairColor, stroke: outline, strokeWidth: 4 }),
      h("circle", { key: "curl-4", cx: 156, cy: 77, r: 16, fill: config.hairColor, stroke: outline, strokeWidth: 4 }),
      h("path", {
        key: "curl-base",
        d: "M78 92C90 75 150 75 162 92C151 85 92 85 78 92Z",
        fill: config.hairColor,
      }),
    ];
  }

  return h("path", {
    d:
      config.genderPresentation === "feminine"
        ? "M73 98C76 64 98 45 124 48C148 50 164 67 167 98C151 82 111 73 73 98Z"
        : "M73 91C78 62 98 46 124 48C146 50 162 63 167 89C145 75 107 70 73 91Z",
    fill: config.hairColor,
    stroke: outline,
    strokeWidth: 5,
    strokeLinejoin: "round",
  });
}

export function renderHorns(config) {
  if (config.horns === "none") return null;

  if (config.horns === "curved") {
    return [
      h("path", {
        key: "left-curved",
        d: "M85 60C70 38 81 25 101 43C93 45 88 51 85 60Z",
        fill: "#fff4d2",
        stroke: outline,
        strokeWidth: 4,
        strokeLinejoin: "round",
      }),
      h("path", {
        key: "right-curved",
        d: "M155 60C170 38 159 25 139 43C147 45 152 51 155 60Z",
        fill: "#fff4d2",
        stroke: outline,
        strokeWidth: 4,
        strokeLinejoin: "round",
      }),
    ];
  }

  return [
    h("path", {
      key: "left-small",
      d: "M90 60L97 39L110 63Z",
      fill: "#fff4d2",
      stroke: outline,
      strokeWidth: 4,
      strokeLinejoin: "round",
    }),
    h("path", {
      key: "right-small",
      d: "M150 60L143 39L130 63Z",
      fill: "#fff4d2",
      stroke: outline,
      strokeWidth: 4,
      strokeLinejoin: "round",
    }),
  ];
}

export function renderPatterns(config) {
  if (config.pattern === "none") return null;

  if (config.pattern === "stripes") {
    return [
      h("path", {
        key: "stripe-1",
        d: "M85 174H155",
        fill: "none",
        stroke: config.secondaryColor,
        strokeWidth: 8,
        strokeLinecap: "round",
        opacity: 0.55,
      }),
      h("path", {
        key: "stripe-2",
        d: "M82 194H158",
        fill: "none",
        stroke: config.secondaryColor,
        strokeWidth: 8,
        strokeLinecap: "round",
        opacity: 0.45,
      }),
    ];
  }

  return [
    h("circle", { key: "spot-1", cx: 96, cy: 174, r: 6, fill: config.secondaryColor, opacity: 0.65 }),
    h("circle", { key: "spot-2", cx: 141, cy: 187, r: 8, fill: config.secondaryColor, opacity: 0.55 }),
    h("circle", { key: "spot-3", cx: 114, cy: 198, r: 5, fill: config.secondaryColor, opacity: 0.55 }),
  ];
}

function getEyeShape(eyeStyle, side) {
  const cx = side === "left" ? 101 : 139;
  if (eyeStyle === "sleepy") {
    return h("path", {
      d: `M${cx - 12} 102C${cx - 5} 97 ${cx + 5} 97 ${cx + 12} 102`,
      fill: "none",
      stroke: outline,
      strokeWidth: 5,
      strokeLinecap: "round",
    });
  }
  if (eyeStyle === "wide") {
    return h("ellipse", { cx, cy: 103, rx: 13, ry: 16, fill: "#fffdf4", stroke: outline, strokeWidth: 4 });
  }
  return h("circle", { cx, cy: 103, r: 12, fill: "#fffdf4", stroke: outline, strokeWidth: 4 });
}

export function renderEyes(config, mood) {
  const eyeStyle = mood === "annoyed" ? "sleepy" : config.eyeStyle;
  return [
    h("g", { key: "left", className: "avatar-eye-left" }, getEyeShape(eyeStyle, "left")),
    h("g", { key: "right", className: "avatar-eye-right" }, getEyeShape(eyeStyle, "right")),
  ];
}

export function renderPupils(config, mood) {
  if (config.eyeStyle === "sleepy" || mood === "annoyed") return null;
  const pupilY = mood === "happy" ? 100 : 104;
  return [
    h("circle", { key: "left", className: "avatar-pupil-left", cx: 103, cy: pupilY, r: 4.8, fill: "#1f2937" }),
    h("circle", { key: "right", className: "avatar-pupil-right", cx: 141, cy: pupilY, r: 4.8, fill: "#1f2937" }),
  ];
}

export function renderBrows(mood) {
  if (mood !== "annoyed") return null;
  return [
    h("path", {
      key: "left-brow",
      d: "M90 88L111 96",
      fill: "none",
      stroke: outline,
      strokeWidth: 5,
      strokeLinecap: "round",
    }),
    h("path", {
      key: "right-brow",
      d: "M150 88L129 96",
      fill: "none",
      stroke: outline,
      strokeWidth: 5,
      strokeLinecap: "round",
    }),
  ];
}

export function renderMouth(config, mood) {
  const mouthStyle = mood === "happy" || mood === "win" ? "open" : mood === "lose" ? "sad" : config.mouthStyle;
  const base = {
    fill: "none",
    stroke: outline,
    strokeWidth: 5,
    strokeLinecap: "round",
  };

  if (mouthStyle === "neutral") {
    return h("path", { d: "M105 127H135", fill: base.fill, stroke: base.stroke, strokeWidth: base.strokeWidth, strokeLinecap: base.strokeLinecap });
  }

  if (mouthStyle === "sad") {
    return h("path", { d: "M104 135C113 126 127 126 136 135", fill: base.fill, stroke: base.stroke, strokeWidth: base.strokeWidth, strokeLinecap: base.strokeLinecap });
  }

  if (mouthStyle === "open") {
    return h("path", {
      d: "M104 126C110 143 130 143 136 126C127 132 113 132 104 126Z",
      fill: outline,
      stroke: outline,
      strokeWidth: 4,
      strokeLinejoin: "round",
    });
  }

  return h("path", { d: "M103 124C111 138 129 138 137 124", fill: base.fill, stroke: base.stroke, strokeWidth: base.strokeWidth, strokeLinecap: base.strokeLinecap });
}

export function renderAccessory(config) {
  if (config.accessory === "none") return null;

  if (config.accessory === "glasses") {
    return [
      h("circle", { key: "left-glass", cx: 101, cy: 103, r: 18, fill: "none", stroke: outline, strokeWidth: 4 }),
      h("circle", { key: "right-glass", cx: 139, cy: 103, r: 18, fill: "none", stroke: outline, strokeWidth: 4 }),
      h("path", { key: "bridge", d: "M119 103H121", fill: "none", stroke: outline, strokeWidth: 4, strokeLinecap: "round" }),
    ];
  }

  if (config.accessory === "crown") {
    return h("path", {
      d: "M86 56L99 34L118 54L138 34L154 56L149 72H91Z",
      fill: "#ffd166",
      stroke: outline,
      strokeWidth: 4,
      strokeLinejoin: "round",
    });
  }

  return null;
}

export { buildPath };
