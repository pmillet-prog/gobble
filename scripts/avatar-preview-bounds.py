"""Read PNG alpha bounds for CSS thumbnails. Requires Pillow; writes no images."""
import json
import sys
from PIL import Image

previews = []
for file in json.load(sys.stdin):
    with Image.open(file) as image:
        bounds = image.getchannel("A").getbbox()
        if not bounds:
            raise ValueError(f"Empty avatar asset: {file}")
        left, top, right, bottom = bounds
        # Match the 6:5 thumbnail window, with space around every visible pixel.
        width = max(right - left, (bottom - top) * 1.2) * 1.12
        height = width / 1.2
        previews.append({
            "width": image.width, "height": image.height,
            "viewBox": [(left + right - width) / 2, (top + bottom - height) / 2, width, height],
        })
json.dump(previews, sys.stdout)
