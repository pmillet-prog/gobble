"""Register the supplied 20 hair PNGs without changing their pixels or review status."""
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / ".Tmp/avatar/avatar"
SOURCE = ROOT / "assets/candidates/hair/coiffures_gobble_20_png/coiffures_gobble"
DEST = ROOT / "assets/candidates/hair/lot_005/2026-09-20-coiffures-gobble"
ASSEMBLY = ROOT / "assets/candidates/hair/lot_005/assembly.json"


def save(relative, data):
    target = DEST / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        if target.read_bytes() != data:
            raise RuntimeError(f"Existing file differs: {target}")
    else:
        target.write_bytes(data)
    return {"file": target.relative_to(ROOT).as_posix(), "sha256": hashlib.sha256(data).hexdigest()}


def png(relative, image):
    import io
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return save(relative, buffer.getvalue())


def main():
    original = ASSEMBLY.read_bytes()
    assembly = json.loads(original)
    pack = json.loads((SOURCE / "manifest.json").read_text(encoding="utf-8"))
    existing = {part["id"] for part in assembly["parts"]}
    added = []
    # The supplied bases must match the game's coordinate system exactly.
    for base in ("homme", "femme"):
        with Image.open(SOURCE / f"head_{base}.png") as supplied, Image.open(ROOT / f"assets/master/femme_homme_v02/head_{base}.png") as master:
            if supplied.convert("RGBA").tobytes() != master.convert("RGBA").tobytes():
                raise RuntimeError(f"Different base: {base}; placement needs review before import")
    for spec in pack["coiffures"]:
        identifier = "gobble_" + spec["id"]
        if identifier in existing:
            continue
        source = SOURCE / spec["image"]
        with Image.open(source) as image:
            if image.size != (1024, 1024) or image.mode != "RGBA" or image.getchannel("A").getextrema() != (0, 255):
                raise RuntimeError(f"Invalid canvas/alpha: {source}")
            result = save(identifier + ".png", source.read_bytes())
            mask = Image.new("RGBA", image.size, "white")
            color = png(f"masks/{identifier}_color.png", mask)
            if spec["calques"]:
                layers = {}
                for kind, french in (("front", "avant"), ("back", "arriere")):
                    layer = SOURCE / spec["calques"][french]
                    with Image.open(layer) as layer_image:
                        if layer_image.size != image.size or layer_image.mode != "RGBA":
                            raise RuntimeError(f"Invalid layer: {layer}")
                    layers[kind] = save(f"layers/{identifier}_{kind}.png", layer.read_bytes())
            else:
                layers = {"front": result, "back": png(f"layers/{identifier}_back.png", Image.new("RGBA", image.size))}
        added.append({
            "id": identifier, "label": f"{spec['nom']} · {spec['id'].upper()}", "version": "01",
            "group": "conventional", "status": "candidate", "preferred_base": "homme" if spec["genre"] == "hommes" else "femme",
            "result": {**result, "width": 1024, "height": 1024}, "source": result, "layers": layers,
            "coloration": {"method": "multiply", "mask": color, "channel": "red", "preserve_alpha": True},
            "anchor": {"x": 512, "y": 120}, "attachment": {"x": 512, "y": 120},
            "layer_partition": {"method": "supplied_layers" if spec["calques"] else "front_only", "status": "user_review_required"},
        })
    if added:
        if ASSEMBLY.read_bytes() != original:
            raise RuntimeError("Workshop changed during import; rerun before editing")
        assembly["parts"].extend(added)
        temporary = ASSEMBLY.with_suffix(".import.tmp")
        temporary.write_text(json.dumps(assembly, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(ASSEMBLY)
    print(f"Hair pack: {len(added)} added; {len(assembly['parts'])} workshop hairstyles. Review decisions unchanged.")


if __name__ == "__main__":
    main()
