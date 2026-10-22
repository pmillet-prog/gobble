"""Extract complete silhouettes before packing equal, padded CSS frames."""

from array import array
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parent
FRAME_COUNT = 7
FRAME_WIDTH = 310
FRAME_HEIGHT = 530
PADDING = 10
ALPHA_THRESHOLD = 8


def connected_figures(source):
    """Label silhouettes, just like the Bafouille importer; ignore loose specks."""
    width, height = source.size
    alpha = source.getchannel("A").tobytes()
    labels = array("I", [0]) * (width * height)
    figures = []
    label = 0
    for start, opacity in enumerate(alpha):
        if opacity <= ALPHA_THRESHOLD or labels[start]:
            continue
        label += 1
        labels[start] = label
        queue = array("I", [start])
        head = 0
        left, top, right, bottom = width, height, 0, 0
        while head < len(queue):
            pixel = queue[head]
            head += 1
            x, y = pixel % width, pixel // width
            left, top = min(left, x), min(top, y)
            right, bottom = max(right, x + 1), max(bottom, y + 1)
            for adjacent_y in range(max(0, y - 1), min(height, y + 2)):
                for adjacent_x in range(max(0, x - 1), min(width, x + 2)):
                    adjacent = adjacent_y * width + adjacent_x
                    if not labels[adjacent] and alpha[adjacent] > ALPHA_THRESHOLD:
                        labels[adjacent] = label
                        queue.append(adjacent)
        if len(queue) > 50000:
            figures.append({"id": label, "pixels": len(queue), "bounds": [left, top, right, bottom]})
    figures.sort(key=lambda figure: figure["bounds"][0])
    if len(figures) != FRAME_COUNT:
        raise ValueError(f"Expected seven separate silhouettes, found {len(figures)}; inspect source before exporting.")
    return labels, figures


def isolate_figure(source, labels, figure):
    # Rectangular bounds overlap the neighbour's shoulders. Select only pixels
    # belonging to this connected silhouette, with its faint antialiased fringe.
    left, top, right, bottom = figure["bounds"]
    left, top = max(0, left - 1), max(0, top - 1)
    right, bottom = min(source.width, right + 1), min(source.height, bottom + 1)
    isolated = source.crop((left, top, right, bottom))
    core = Image.frombytes("L", isolated.size, bytes(
        255 if labels[y * source.width + x] == figure["id"] else 0
        for y in range(top, bottom) for x in range(left, right)
    ))
    alpha = isolated.getchannel("A")
    faint = alpha.point(lambda value: 255 if 0 < value <= ALPHA_THRESHOLD else 0)
    fringe = ImageChops.multiply(core.filter(ImageFilter.MaxFilter(3)), faint)
    isolated.putalpha(ImageChops.multiply(alpha, ImageChops.lighter(core, fringe)))
    return isolated, (left, top)

with Image.open(ROOT / "thierry-baccardo-cleaned.png") as generated:
    source = generated.convert("RGBA")
    labels, figures = connected_figures(source)
    common_top = min(figure["bounds"][1] for figure in figures)
    common_bottom = max(figure["bounds"][3] for figure in figures)
    largest_width = max(figure["bounds"][2] - figure["bounds"][0] for figure in figures)
    scale = min(
        (FRAME_WIDTH - 2 * PADDING - 2) / largest_width,
        (FRAME_HEIGHT - 2 * PADDING - 2) / (common_bottom - common_top),
    )
    vertical_offset = (FRAME_HEIGHT - (common_bottom - common_top) * scale) / 2
    sheet = Image.new("RGBA", (FRAME_COUNT * FRAME_WIDTH, FRAME_HEIGHT))
    frames = []
    for index, figure in enumerate(figures):
        isolated, (left, top) = isolate_figure(source, labels, figure)
        resized = isolated.resize(
            (round(isolated.width * scale), round(isolated.height * scale)), Image.Resampling.LANCZOS
        )
        center = (figure["bounds"][0] + figure["bounds"][2]) / 2
        frame = Image.new("RGBA", (FRAME_WIDTH, FRAME_HEIGHT))
        frame.alpha_composite(resized, (
            round(FRAME_WIDTH / 2 + (left - center) * scale),
            round(vertical_offset + (top - common_top) * scale),
        ))
        bounds = frame.getchannel("A").getbbox()
        if not bounds or min(bounds[0], bounds[1], FRAME_WIDTH - bounds[2], FRAME_HEIGHT - bounds[3]) < 8:
            raise ValueError(f"Frame {index} has insufficient transparent padding: {bounds}")
        frames.append(frame)
        sheet.alpha_composite(frame, (index * FRAME_WIDTH, 0))
        frame.save(ROOT / f"thierry-baccardo-{index}.webp", quality=90, method=6)
    sheet.save(ROOT / "thierry-baccardo.webp", quality=90, method=6)

# Inspect every exported frame at runtime scale on both bright and dark grounds.
review_dir = ROOT.parents[2] / ".tmp" / "motus" / "sprite-review"
review_dir.mkdir(parents=True, exist_ok=True)
review = Image.new("RGB", (FRAME_COUNT * 192, 692), "#e7eff3")
draw = ImageDraw.Draw(review)
draw.rectangle((0, 346, review.width, review.height), fill="#073e69")
exported_bounds = []
with Image.open(ROOT / "thierry-baccardo.webp") as exported:
    for index in range(FRAME_COUNT):
        frame = exported.crop((index * FRAME_WIDTH, 0, (index + 1) * FRAME_WIDTH, FRAME_HEIGHT)).convert("RGBA")
        bounds = frame.getchannel("A").getbbox()
        if not bounds or min(bounds[0], bounds[1], FRAME_WIDTH - bounds[2], FRAME_HEIGHT - bounds[3]) < 8:
            raise ValueError(f"Exported frame {index} touches its neighbour: {bounds}")
        exported_bounds.append(bounds)
        runtime = frame.resize((179, 306), Image.Resampling.LANCZOS)
        for top, color in [(0, "#15354e"), (346, "#ffffff")]:
            draw.text((index * 192 + 10, top + 10), f"{index}", fill=color)
            review.paste(runtime, (index * 192 + 6, top + 32), runtime)
review.save(review_dir / "contact.png")

with Image.open(ROOT / "studio-generated.png") as studio:
    studio.save(ROOT / "studio.webp", quality=88, method=6)
    studio_size = list(studio.size)

metadata = {
    "generator": "built-in image_gen",
    "presenter": {
        "file": "thierry-baccardo.webp",
        "source": "thierry-baccardo-cleaned.png",
        "size": [FRAME_COUNT * FRAME_WIDTH, FRAME_HEIGHT],
        "frameSize": [FRAME_WIDTH, FRAME_HEIGHT],
        "frameCount": FRAME_COUNT,
        "hasAlpha": True,
        "neutralFrame": 6,
        "blinkFrame": 5,
        "mouthSequence": [0, 1, 2, 1, 4, 3, 1, 0, 2, 4, 1, 3, 0],
        "frames": ["o", "speaking-small", "a", "pursed", "speaking-wide", "wink", "neutral-smile"],
        "processing": "Seven alpha-connected silhouettes isolated before packing; neighbouring fragments and loose specks excluded. Native contour alpha retained. Shared scale and vertical alignment; centered 310x530 cells with at least 8px of transparent padding after export.",
        "sourceFigures": figures,
        "exportedAlphaBounds": exported_bounds,
    },
    "studio": {
        "file": "studio.webp",
        "source": "studio-generated.png",
        "size": studio_size,
        "boardBoundsPercent": {"left": 20.9, "top": 49.4, "right": 78.1, "bottom": 100},
        "processing": "WebP conversion only.",
    },
}
(ROOT / "manifest.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
print(json.dumps(metadata, indent=2))
