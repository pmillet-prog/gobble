"""Keep original font sources; remove empty, non-space glyph mappings in a web copy.

Urban Class advertises accented letters whose outlines are empty. Removing only
those mappings lets browser/PNG font fallback work without changing its drawings.
Requires fontTools for this preparation step, not on the game server.
"""
import unicodedata
from pathlib import Path
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parents[1]
source = root / 'public/chalkfont/Urban Class.ttf'
destination = root / 'public/chalkfont/compatible/Urban Class.ttf'
font = TTFont(source, recalcTimestamp=False)
removed = set()
for table in font['cmap'].tables:
    if not table.isUnicode():
        continue
    for codepoint, glyph_name in list(table.cmap.items()):
        if unicodedata.category(chr(codepoint))[0] in {'C', 'Z'}:
            continue
        if font['glyf'][glyph_name].numberOfContours == 0:
            del table.cmap[codepoint]
            removed.add(codepoint)
destination.parent.mkdir(parents=True, exist_ok=True)
font.save(destination)
print(f'Prepared {destination.relative_to(root)}; removed {len(removed)} empty glyph mappings; original retained.')
