import { BackSide, CanvasTexture, Mesh, MeshStandardMaterial, SRGBColorSpace } from "three";
import { createDeskWallGeometry } from "./stageDeskGeometry.js";
import { DESK, DESK_SCREEN_TEXT, DESK_WALL_HEIGHT } from "./stageDeskDimensions.js";

const TAU = Math.PI * 2;
const circumference = TAU * DESK.innerTopRadius;

export function createDeskScreenGeometry() {
  // Put the UV seam on the low front arc, away from the host. Reverse U for
  // reading from inside the cylinder: outward-facing UVs would mirror text.
  const geometry = createDeskWallGeometry("inner", { thetaStart: -Math.PI });
  const uv = geometry.getAttribute("uv");
  for (let index = 0; index < uv.count; index++) uv.setX(index, 1 - uv.getX(index));
  return geometry;
}

function screenFields(contestants, economy) {
  return contestants.map(contestant => {
    const member = economy?.members?.[contestant.id];
    return { name: contestant.nick, color: contestant.color,
      angle: Math.atan2(contestant.position[0], contestant.position[2]),
      amount: economy?.hidden ? "CAGNOTTE MASQUÉE"
        : Number.isFinite(member?.bank) ? `${member.bank.toLocaleString("fr-FR")} €` : "—",
      hidden: Boolean(economy?.hidden),
      caption: contestant.isBot ? "PRÉSENTATEUR INVITÉ"
        : contestant.rank ? `CANDIDAT · ${contestant.rank}${contestant.rank === 1 ? "er" : "e"}` : "CANDIDAT",
    };
  });
}

function paintScreen(canvas, fields) {
  const ctx = canvas.getContext("2d"), height = DESK_WALL_HEIGHT;
  // Draw in physical surface units so fonts keep their proportions at either
  // texture resolution. Only the low front/shoulder background is compressed.
  ctx.setTransform(canvas.width / circumference, 0, 0, canvas.height / height, 0, 0);
  const background = ctx.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, "#153d59"); background.addColorStop(0.32, "#0a243b");
  background.addColorStop(1, "#020a15");
  ctx.fillStyle = background; ctx.fillRect(0, 0, circumference, height);

  // Wide colour washes blend into a single continuous picture, without boxes
  // or borders around the names. The extra copies make the wrap seamless.
  for (const field of [{ angle: 0, color: "#e6b56a" }, ...fields]) {
    for (const wrap of [-circumference, 0, circumference]) {
      const x = (0.5 - field.angle / TAU) * circumference + wrap;
      const tint = ctx.createRadialGradient(x, 45, 0, x, 45, 260);
      tint.addColorStop(0, field.color); tint.addColorStop(1, "transparent");
      ctx.globalAlpha = 0.18; ctx.fillStyle = tint; ctx.fillRect(x - 260, 0, 520, height);
    }
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#3b7c9955"; ctx.lineWidth = 0.7;
  for (const y of [90, 106, 192]) {
    ctx.beginPath(); ctx.moveTo(0, y);
    ctx.bezierCurveTo(circumference * 0.25, y - 22, circumference * 0.75, y + 22, circumference, y);
    ctx.stroke();
  }
  ctx.fillStyle = "#82c9df22";
  for (let y = 1; y < height; y += 3) ctx.fillRect(0, y, circumference, 0.16);

  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  function text(value, x, worldY, size, color, weight = 700) {
    ctx.font = `${weight} ${size}px Arial, sans-serif`; ctx.fillStyle = color;
    ctx.fillText(value, x, DESK.topBaseY - worldY, DESK_SCREEN_TEXT.arcWidth * DESK.innerTopRadius * 0.94);
  }
  const center = circumference / 2;
  text("LA ROUE DE", center, DESK_SCREEN_TEXT.nameY, 11, "#e3c691", 600);
  text("L’INFORTUNE", center, DESK_SCREEN_TEXT.amountY, 22, "#ffe1a1", 800);
  text("gobble", center, DESK_SCREEN_TEXT.captionY, 9, "#d5bf99");
  for (const field of fields) {
    const x = (0.5 - field.angle / TAU) * circumference;
    text(field.name, x, DESK_SCREEN_TEXT.nameY, 15, "#f1f7ff");
    text(field.amount, x, DESK_SCREEN_TEXT.amountY, field.hidden ? 11 : 24, field.color, 800);
    text(field.caption, x, DESK_SCREEN_TEXT.captionY, 7.5, "#bad1e0", 600);
  }
}

export function createDeskScreen(contestants, { textureWidth = 4096, createCanvas = () => document.createElement("canvas") } = {}) {
  const canvas = createCanvas(); canvas.width = textureWidth; canvas.height = Math.round(textureWidth / 8);
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; texture.anisotropy = 4;
  texture.name = "continuous-desk-screen";
  const material = new MeshStandardMaterial({ map: texture, color: "#08111a", roughness: 0.4, metalness: 0.05,
    emissive: "#ffffff", emissiveMap: texture, emissiveIntensity: 1.1, side: BackSide });
  const mesh = new Mesh(createDeskScreenGeometry(), material); mesh.name = "desk-inner-screen";
  mesh.castShadow = true; mesh.receiveShadow = true;
  let signature;
  function setBanks(economy) {
    const fields = screenFields(contestants, economy), next = JSON.stringify(fields);
    if (next === signature) return;
    signature = next; paintScreen(canvas, fields); texture.needsUpdate = true;
  }
  setBanks(null);
  // Geometry, material and the single reusable texture belong to the stage's
  // existing disposal traversal. No animation loop or additional render pass.
  return { mesh, setBanks };
}
