import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareChalkboardExportFonts, CHALKBOARD_EXPORT_FONT_FALLBACK } from '../../server/chalkboard/chalkboardExportFonts.js';
import { drawChalkElement } from '../../src/features/chalkboard/chalkboardPaint.js';
import { CHALKBOARD_WORLD } from '../../src/features/chalkboard/chalkboardModel.js';

const require = createRequire(new URL('../../server/package.json', import.meta.url));
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const directory = path.dirname(fileURLToPath(import.meta.url));
await mkdir(directory, { recursive: true });
const snapshotPath = path.join(directory, 'instantane-live-moderation.json');
let snapshot;
if (process.argv.includes('--reuse')) snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
else {
  // Both databases are opened read-only. Only the current entries and the
  // display names of their owners leave the VM; no account/secret export.
  const remote = String.raw`
import sqlite3,json,datetime
board=sqlite3.connect('file:/home/freebox/gobble_runtime/chalkboard.sqlite?mode=ro',uri=True)
board.execute('BEGIN')
meta=json.loads(board.execute('SELECT json FROM chalkboard_meta WHERE id=1').fetchone()[0])
entries=sorted([json.loads(row[0]) for row in board.execute('SELECT json FROM chalkboard_entries')],key=lambda e:e['z'])
board.close()
auth=sqlite3.connect('file:/home/freebox/gobble_runtime/gobble.db?mode=ro',uri=True)
owners={}
for owner in {entry.get('ownerId') for entry in entries}:
    row=auth.execute('SELECT username_display FROM users WHERE id=?',(owner,)).fetchone() if owner else None
    owners[owner]=row[0] if row else 'Auteur non identifie'
auth.close()
for entry in entries:
    entry['author']=owners[entry.pop('ownerId',None)]
    entry.pop('authorSeal',None)
print(json.dumps({'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'weekId':meta['weekId'],'revision':meta['revision'],'interventions':entries},ensure_ascii=False))
`;
  const result = spawnSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', 'freebox@192.168.1.84', 'python3', '-'],
    { input: remote, encoding: 'utf8', maxBuffer: 12 * 1024 * 1024, windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr || 'Read-only snapshot failed');
  snapshot = JSON.parse(result.stdout);
  await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2));
}
prepareChalkboardExportFonts();
GlobalFonts.registerFromPath('C:/Windows/Fonts/arial.ttf', 'ModerationSans');
GlobalFonts.registerFromPath('C:/Windows/Fonts/arialbd.ttf', 'ModerationSansBold');
const font = (size, bold = false) => `${size}px "${bold ? 'ModerationSansBold' : 'ModerationSans'}", sans-serif`;
const publicPath = fileURLToPath(new URL('../../public/', import.meta.url));
const surface = await loadImage(path.join(publicPath, 'chalkboard/surface/patinee-v2.webp'));
const captured = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(snapshot.capturedAt));
const label = entry => `#${String(entry.z).padStart(2, '0')} · ${entry.author}`;
function texture(context, x, y, width, height) {
  context.save(); context.beginPath(); context.rect(x, y, width, height); context.clip();
  context.fillStyle = '#263c2c'; context.fillRect(x, y, width, height);
  const panel = surface.width * height / surface.height;
  for (let left = x; left < x + width; left += panel) context.drawImage(surface, left, y, panel, height);
  context.restore();
}
function renderEntry(entry) {
  const b = entry.bounds;
  const x = Math.max(0, Math.floor(b.minX)), y = Math.max(0, Math.floor(b.minY));
  const right = Math.min(CHALKBOARD_WORLD.width, Math.ceil(b.maxX)), bottom = Math.min(CHALKBOARD_WORLD.height, Math.ceil(b.maxY));
  const canvas = createCanvas(Math.max(1, right - x), Math.max(1, bottom - y));
  const context = canvas.getContext('2d');
  for (const element of entry.elements) drawChalkElement(context, element, x, y, null, 1, CHALKBOARD_EXPORT_FONT_FALLBACK);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
  for (let yy = 0; yy < canvas.height; yy++) for (let xx = 0; xx < canvas.width; xx++) {
    if (pixels[(yy * canvas.width + xx) * 4 + 3] < 12) continue;
    minX = Math.min(minX, xx); maxX = Math.max(maxX, xx); minY = Math.min(minY, yy); maxY = Math.max(maxY, yy);
  }
  return { canvas, x, y, visible: maxX >= 0,
    bounds: maxX >= 0 ? { minX: x + minX, minY: y + minY, maxX: x + maxX + 1, maxY: y + maxY + 1 } : b };
}
const entries = snapshot.interventions.map(entry => ({ ...entry, drawing: renderEntry(entry) }));
const measure = createCanvas(1, 1).getContext('2d'); measure.font = font(25, true);
const labels = [];
const intersects = (a,b) => a.x < b.x + b.width + 6 && a.x + a.width + 6 > b.x && a.y < b.y + b.height + 6 && a.y + a.height + 6 > b.y;
for (const entry of entries) {
  if (!entry.drawing.visible) continue;
  const b = entry.drawing.bounds;
  const width = Math.ceil(measure.measureText(label(entry)).width) + 26, height = 38;
  const x = Math.max(4, Math.min(CHALKBOARD_WORLD.width - width - 4, (b.minX + b.maxX - width) / 2));
  const box = { x, y: b.maxY + 8, width, height, entry };
  const obstacles = entries.filter(other => other !== entry && other.drawing.visible).map(other => {
    const c = other.drawing.bounds; return { x: c.minX, y: c.minY, width: c.maxX-c.minX, height: c.maxY-c.minY };
  });
  for (;;) {
    const hits = [...obstacles, ...labels].filter(other => intersects(box, other));
    if (!hits.length) break;
    box.y = Math.max(...hits.map(other => other.y + other.height)) + 10;
  }
  labels.push(box);
}
const header = 96;
const boardHeight = Math.ceil(Math.max(CHALKBOARD_WORLD.height, ...labels.map(box => box.y + box.height))) + 20;
const board = createCanvas(CHALKBOARD_WORLD.width, header + boardHeight);
const boardContext = board.getContext('2d');
boardContext.fillStyle = '#12251b'; boardContext.fillRect(0, 0, board.width, board.height);
boardContext.fillStyle = '#fff'; boardContext.font = font(30, true);
boardContext.fillText(`Grand tableau · export de modération · ${captured} (Paris) · révision ${snapshot.revision}`, 24, 39);
boardContext.font = font(21); boardContext.fillStyle = '#c7ddca';
boardContext.fillText('Pseudonymes des comptes auteurs. Les numéros renvoient aux interventions détaillées. Les gommages sont conservés.', 24, 72);
boardContext.save(); boardContext.translate(0, header);
texture(boardContext, 0, 0, board.width, CHALKBOARD_WORLD.height);
for (const entry of entries) boardContext.drawImage(entry.drawing.canvas, entry.drawing.x, entry.drawing.y);
for (const box of labels) {
  const b = box.entry.drawing.bounds;
  boardContext.strokeStyle = '#facc1599'; boardContext.lineWidth = 1.5;
  boardContext.strokeRect(b.minX-2, b.minY-2, b.maxX-b.minX+4, b.maxY-b.minY+4);
  boardContext.beginPath(); boardContext.moveTo((b.minX+b.maxX)/2, b.maxY);
  boardContext.lineTo(box.x+box.width/2, box.y); boardContext.stroke();
  boardContext.fillStyle = '#fff3c4'; boardContext.fillRect(box.x,box.y,box.width,box.height);
  boardContext.fillStyle = '#17241d'; boardContext.font = font(25,true);
  boardContext.textAlign = 'center'; boardContext.textBaseline = 'middle';
  boardContext.fillText(label(box.entry), box.x+box.width/2, box.y+box.height/2);
}
boardContext.restore();
const annotatedPath = path.join(directory, 'grand-tableau-live-avec-auteurs.png');
await writeFile(annotatedPath, await board.encode('png'));

const columns = 3, cardWidth = 900, cardHeight = 580, gap = 24, top = 170;
const gallery = createCanvas(columns * (cardWidth+gap)+gap, top + Math.ceil(entries.length/columns)*(cardHeight+gap)+gap);
const ctx = gallery.getContext('2d'); ctx.fillStyle = '#11231a'; ctx.fillRect(0,0,gallery.width,gallery.height);
ctx.fillStyle = '#fff'; ctx.font = font(42,true); ctx.fillText('Grand tableau · interventions et auteurs',gap,60);
ctx.font = font(25); ctx.fillStyle = '#c7ddca'; ctx.fillText(`Live · ${captured} (Paris) · révision ${snapshot.revision} · ${entries.length} interventions`,gap,104);
ctx.fillText('Chaque publication est isolée ; les gommages sont respectés. L’auteur indiqué est le pseudonyme actuel du compte.',gap,142);
for (const [index,entry] of entries.entries()) {
  const x = gap + (index%columns)*(cardWidth+gap), y=top+Math.floor(index/columns)*(cardHeight+gap);
  ctx.fillStyle='#f8faf7'; ctx.fillRect(x,y,cardWidth,cardHeight);
  texture(ctx,x+12,y+12,cardWidth-24,450);
  const d=entry.drawing,b=d.bounds;
  if (d.visible) {
    const width=b.maxX-b.minX,height=b.maxY-b.minY,scale=Math.min((cardWidth-70)/width,410/height,1.4);
    ctx.drawImage(d.canvas,b.minX-d.x,b.minY-d.y,width,height,x+(cardWidth-width*scale)/2,y+237-height*scale/2,width*scale,height*scale);
  } else {
    ctx.fillStyle='#d6dfd8'; ctx.font=font(27); ctx.fillText('Intervention entièrement gommée',x+40,y+230);
  }
  ctx.fillStyle='#14251b'; ctx.font=font(34,true); ctx.fillText(label(entry),x+24,y+510);
  ctx.fillStyle='#526258'; ctx.font=font(22);
  const published=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',dateStyle:'short',timeStyle:'medium'}).format(new Date(entry.createdAt));
  ctx.fillText(`Publié le ${published} · position x=${Math.round(d.x)}, y=${Math.round(d.y)}`,x+24,y+550);
}
const galleryPath=path.join(directory,'grand-tableau-live-interventions-detaillees.png');
await writeFile(galleryPath,await gallery.encode('png'));
// Small QA views, separate from the full-resolution deliverables.
const first=createCanvas(1800,Math.round(board.height*1800/8000));
first.getContext('2d').drawImage(board,0,0,8000,board.height,0,0,first.width,first.height);
await writeFile(path.join(directory,'apercu-tableau.png'),await first.encode('png'));
const firstCards=createCanvas(1400,Math.round((top+3*(cardHeight+gap))*1400/gallery.width));
firstCards.getContext('2d').drawImage(gallery,0,0,gallery.width,top+3*(cardHeight+gap),0,0,firstCards.width,firstCards.height);
await writeFile(path.join(directory,'apercu-interventions.png'),await firstCards.encode('png'));
console.log(JSON.stringify({capturedAt:snapshot.capturedAt,revision:snapshot.revision,interventions:entries.length,
  unidentified:entries.filter(entry=>entry.author==='Auteur non identifie').length,fullyErased:entries.filter(entry=>!entry.drawing.visible).length,
  board:{file:annotatedPath,width:board.width,height:board.height},details:{file:galleryPath,width:gallery.width,height:gallery.height}},null,2));
