const fs = require("fs");
const path = require("path");

const projectRoot = path.join(__dirname, "..");
const musicDir = path.join(projectRoot, "public", "sound", "music");
const outFile = path.join(musicDir, "index.json");
const exts = new Set([".mp3", ".wav", ".ogg", ".m4a"]);

function getTracks() {
  if (!fs.existsSync(musicDir)) return [];
  return fs
    .readdirSync(musicDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith(".") && exts.has(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, "fr"));
}

const tracks = getTracks();
const payload = JSON.stringify(tracks, null, 2);
fs.writeFileSync(outFile, payload);
console.log(`[music-manifest] ${tracks.length} track(s) -> public/sound/music/index.json`);
