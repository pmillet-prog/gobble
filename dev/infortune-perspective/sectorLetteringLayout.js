// One lettering layout for the painted tile and the characters lifted from it.
// Coordinates use the tile texture's 72 × 178 drawing space (top = outer rim).
export function sectorLetteringLayout(sector, measure) {
  function glyph(character, size, family = "Georgia", weight = 700) {
    return { character, size, family, weight, rotation: 0, ...measure(character, size, family, weight) };
  }
  if (sector.kind === "amount" && Number.isFinite(sector.amount)) {
    const digits = Array.from(String(sector.amount), (character, index) => {
      const item = glyph(character, 38);
      return { ...item, x: 36, y: 34 + index * 29 - (item.ascent - item.descent) / 2 };
    });
    const euro = glyph("€", 18, "Georgia", 600);
    return [...digits, { ...euro, x: 36, y: 152 - (euro.ascent - euro.descent) / 2 }];
  }
  const bankrupt = sector.kind === "bankrupt", bonus = sector.kind === "bonus";
  const text = bankrupt ? "BANQUEROUTE" : bonus ? "BONUS" : (sector.label || "ÉCHANGE").toLocaleUpperCase("fr-FR");
  const family = bonus ? "Georgia" : "Arial", outer = bonus ? 42 : 28, inner = bonus ? 18 : 12;
  const gap = bonus ? 5 : 1.5;
  const letters = Array.from(text, (character, index) => glyph(character,
    outer + (inner - outer) * index / Math.max(1, text.length - 1), family));
  const extent = item => bankrupt ? item.width : item.ascent + item.descent;
  const length = letters.reduce((sum, item) => sum + extent(item), 0) + gap * (letters.length - 1);
  const scale = 148 / length;
  let cursor = 0;
  return letters.map(item => {
    const y = 12 + (cursor + extent(item) / 2) * scale;
    cursor += extent(item) + gap;
    return { ...item, x: 36, y, rotation: bankrupt ? Math.PI / 2 : 0,
      size: item.size * scale, width: item.width * scale, ascent: item.ascent * scale, descent: item.descent * scale };
  });
}

export function measureSectorGlyph(context) {
  return (character, size, family, weight) => {
    context.font = `${weight} ${size}px ${family}`;
    const metrics = context.measureText(character);
    return { width: metrics.width, ascent: metrics.actualBoundingBoxAscent, descent: metrics.actualBoundingBoxDescent };
  };
}

export function drawSectorGlyph(context, glyph) {
  context.save(); context.translate(glyph.x, glyph.y); context.rotate(glyph.rotation);
  context.font = `${glyph.weight} ${glyph.size}px ${glyph.family}`;
  context.textAlign = "center"; context.textBaseline = "alphabetic";
  context.fillText(glyph.character, 0, (glyph.ascent - glyph.descent) / 2);
  context.restore();
}
