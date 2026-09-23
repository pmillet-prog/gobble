import { getMedalPins } from "../../../shared/dailyMedals.js";
import { applyAvatarViewport } from "./avatarSilhouette.js";

const METALS = {
  gold: { light: "#fff4bb", mid: "#efb83e", dark: "#92531d", edge: "#603914" },
  silver: { light: "#f5fcff", mid: "#b8cbd6", dark: "#667e92", edge: "#354956" },
  bronze: { light: "#ffd0a0", mid: "#ce874d", dark: "#87472b", edge: "#512e20" },
};

function path(ctx, points) {
  ctx.beginPath();
  points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
}

// Small vector insignia stay sharp at the size of a shirt pin, with no raster
// downloads. Coordinates are local to a 48 x 72 medal, with the pin at the top.
export function drawAvatarMedal(ctx, color) {
  const metal = METALS[color] || METALS.gold;
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = metal.edge;
  const gilding = ctx.createLinearGradient(6, 12, 39, 65);
  gilding.addColorStop(0, metal.light);
  gilding.addColorStop(.34, metal.mid);
  gilding.addColorStop(.57, metal.light);
  gilding.addColorStop(1, metal.dark);

  path(ctx, [[8, 8], [40, 8], [37, 30], [24, 40], [11, 30]]);
  const ribbon = ctx.createLinearGradient(8, 0, 40, 0);
  ribbon.addColorStop(0, "#6f203b"); ribbon.addColorStop(.45, "#d34b57"); ribbon.addColorStop(1, "#7d263c");
  ctx.fillStyle = ribbon; ctx.fill(); ctx.stroke();
  ctx.save(); ctx.clip();
  ctx.fillStyle = "#fff1c7"; ctx.fillRect(14, 8, 4, 30); ctx.fillRect(30, 8, 4, 30);
  ctx.fillStyle = "#ffffff20"; ctx.fillRect(20, 8, 2, 29); ctx.restore();
  ctx.fillStyle = gilding;
  ctx.beginPath(); ctx.roundRect(5, 2, 38, 8, 3); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#fff5c7"; ctx.fillRect(9, 3.5, 30, 1.5);
  ctx.fillStyle = metal.dark;
  for (const x of [10, 38]) { ctx.beginPath(); ctx.arc(x, 6, 1.3, 0, Math.PI * 2); ctx.fill(); }

  ctx.strokeStyle = metal.dark; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(24, 36, 4, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = gilding; ctx.strokeStyle = metal.edge; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(24, 53, 18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = metal.light; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.arc(24, 53, 15.2, Math.PI * 1.02, Math.PI * 1.92); ctx.stroke();
  ctx.strokeStyle = metal.dark; ctx.lineWidth = .9;
  ctx.beginPath(); ctx.arc(24, 53, 13.5, 0, Math.PI * 2); ctx.stroke();
  const star = Array.from({ length: 10 }, (_, index) => {
    const angle = -Math.PI / 2 + index * Math.PI / 5;
    const radius = index % 2 ? 4.7 : 10;
    return [24 + Math.cos(angle) * radius, 53 + Math.sin(angle) * radius];
  });
  path(ctx, star); ctx.fillStyle = metal.dark; ctx.fill();
  ctx.strokeStyle = metal.light; ctx.lineWidth = .8; ctx.stroke();
  ctx.restore();
}

export function drawAvatarMedals(ctx, viewport, counts) {
  const pins = getMedalPins(counts);
  if (!pins.length || !viewport) return;
  ctx.save();
  applyAvatarViewport(ctx, viewport);
  // Wearer's left chest. All overlays use the same camera as the assembled
  // head, outfit and hat, including the editor's downward portrait offset.
  const spacing = 112, width = 90;
  const firstX = 682 - ((pins.length - 1) * spacing + width) / 2;
  pins.forEach((pin, index) => {
    ctx.save(); ctx.translate(firstX + index * spacing, 714); ctx.scale(width / 48, width / 48);
    ctx.shadowColor = "#07121b80"; ctx.shadowBlur = 3; ctx.shadowOffsetY = 2;
    const layers = Math.min(pin.count, 3);
    for (let layer = layers - 1; layer >= 0; layer--) {
      ctx.save(); ctx.translate(layer * 3.5, -layer * 4); drawAvatarMedal(ctx, pin.color); ctx.restore();
    }
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    if (pin.count > 1) {
      const text = pin.count > 99 ? "99+" : `×${pin.count}`;
      ctx.font = "900 25px Arial, sans-serif";
      const labelWidth = Math.max(43, ctx.measureText(text).width + 12);
      ctx.fillStyle = "#102333"; ctx.strokeStyle = METALS[pin.color].mid; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.roundRect(24 - labelWidth / 2, 64, labelWidth, 29, 9); ctx.fill(); ctx.stroke();
      ctx.fillStyle = METALS[pin.color].light; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(text, 24, 79);
    }
    ctx.restore();
  });
  ctx.restore();
}
