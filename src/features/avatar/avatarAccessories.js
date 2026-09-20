let markerFont;
export function loadAvatarMarkerFont() {
  if (typeof FontFace === "undefined" || !document.fonts) return Promise.resolve();
  if (!markerFont) markerFont = new FontFace("AvatarMarker", 'url("/fonts/caveat/Caveat-VariableFont_wght.ttf")', { weight: "100 900" }).load()
    .then(font => { document.fonts.add(font); }).catch(() => { markerFont = null; });
  return markerFont;
}

export function drawParticipantTag(ctx, image, nickname = "Joueur") {
  ctx.save();
  ctx.drawImage(image, 0, 0, 320, 192);
  ctx.translate(160, 98); ctx.rotate(-.045);
  // Fit the complete nickname, including spaces and accents, with no truncation.
  const name = String(nickname || "Joueur").replace(/[\r\n\t]/g, " ").toLocaleUpperCase("fr-FR");
  let fontSize = 76;
  ctx.font = `700 ${fontSize}px AvatarMarker, cursive`;
  fontSize = Math.max(15, Math.min(fontSize, fontSize * 235 / Math.max(1, ctx.measureText(name).width)));
  ctx.font = `700 ${fontSize}px AvatarMarker, cursive`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = "#202022"; ctx.strokeStyle = "#202022"; ctx.lineWidth = 1.2;
  ctx.fillText(name, 0, 0, 235); ctx.strokeText(name, 0, 0, 235);
  ctx.restore();
}

export function drawAvatarAccessories(ctx, viewport, image, nickname) {
  if (!viewport || !image) return;
  const { crop, ratio, ox, oy } = viewport;
  ctx.save();
  ctx.translate(ox, oy); ctx.scale(ratio, ratio); ctx.translate(-crop[0], -crop[1]);
  // Viewer's left chest, opposite daily medals. Same portrait camera as the outfit.
  ctx.translate(218, 736); ctx.scale(230 / 320, 230 / 320);
  drawParticipantTag(ctx, image, nickname);
  ctx.restore();
}

export function drawAvatarCompanion(ctx, viewport, image) {
  if (!viewport || !image) return;
  const { crop, ratio, ox, oy } = viewport;
  ctx.save();
  ctx.translate(ox, oy); ctx.scale(ratio, ratio); ctx.translate(-crop[0], -crop[1]);
  // Anchor the paws to the frame, including portraits reframed for a tall hat.
  // The source's visible lower edge is at 1240 / 1254 (transparent padding).
  const bottom = crop[1] + (ctx.canvas.height - oy) / ratio;
  ctx.drawImage(image, 100, bottom - 300 * 1240 / 1254, 300, 300);
  ctx.restore();
}
