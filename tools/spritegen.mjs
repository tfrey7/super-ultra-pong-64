#!/usr/bin/env node
/*
 * tools/spritegen.mjs -- the sprite generator, ported from the EarthBound hack's
 * character pipeline (item 1272). Node 22+, no dependencies.
 *
 * The EarthBound way is not a model that paints pixels. It is a model (a Claude
 * run) DRAWING each frame as a text grid -- one character per pixel, one letter
 * per palette entry -- in two passes (silhouette and colour masses first, then
 * face and detail), with a renderer that turns the grid into the real sprite, a
 * checker that names the known faults, and ONE contact picture looked at before
 * anything ships. The grid file is the artifact; it is revised by row, never
 * regenerated. See docs/lessons/sprites.md for what carried over and why.
 *
 *   node tools/spritegen.mjs new   <out.json> --era 3 --frame 20x25 --prompt "..."
 *        a blank sheet: the era's rules, the rig's beats, one row per line
 *   node tools/spritegen.mjs trace <ref.png> <out.json> --era 3 --frame 20x25
 *        a reference picture in, a starting grid out (every pixel snapped to the
 *        era's colours, lettered) -- the EarthBound "likeness mode" entry
 *   node tools/spritegen.mjs lint  <grid.json>
 *        the era's hard rules (exit 1 on a fault) and the advisory numbers
 *   node tools/spritegen.mjs look  <grid.json> [--ref old.png] [--out look.png] [--scale 4]
 *        ONE picture: every frame at 4x in sheet layout, the reference beside it,
 *        and ONE stdout line with the checker's numbers
 *   node tools/spritegen.mjs build <grid.json> [--out sheet.png]
 *        the sheet at the era's native resolution, in the rig's layout
 *        (src/characters.js: one row per beat, one column per frame)
 *   node tools/spritegen.mjs contact <grid.json> --ref old.png --out page.html [--minutes N]
 *        an HTML contact sheet, old beside new at game scale and at 4x, for a
 *        headless-Chrome screenshot
 *
 * The grid format (pgrid-v1):
 *   { format, id, era, prompt, reference, frame: {w,h}, hand: {x,y},
 *     beats: { idle: 2, up: 2, down: 2, swing: 3, miss: 1, win: 2 },
 *     palette: { "k": "#000000", "a": "#dab6b6", ... },     '.' is always clear
 *     frames: { "idle0": [ "....kk....", ... ],             rows, one per line
 *               "idle1": { "from": "idle0", "dy": 1 },      relations
 *               "swing1": { "from": "idle0", "patch": { "9": "__kkaa____" } } } }
 * A relation takes another frame, shifts it (dx, dy), mirrors it ("mirror":
 * true), then overwrites rows from "patch" ('_' keeps the pixel beneath). HAL
 * built most of EarthBound's 8-slot sheets out of mirrors and one-row shifts;
 * a walk or an idle breath here is the same.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode, encode, levels } from './palette-snap.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');
export const BEATS = ['idle', 'up', 'down', 'swing', 'miss', 'win'];
const LETTERS = 'kabcdefghijmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

const rgbOf = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const hexOf = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

function nearestLevel(v, lv) {
  let best = lv[0];
  for (const l of lv) if (Math.abs(l - v) < Math.abs(best - v)) best = l;
  return best;
}

/** The NES table, read out of era 2's own file so it cannot drift. */
function nesTable() {
  const src = fs.readFileSync(path.join(ROOT, 'src/eras/era2-nes.js'), 'utf8');
  const m = /var NES = \[([\s\S]*?)\];/.exec(src);
  return m ? m[1].match(/#[0-9a-f]{6}/g) : [];
}

/**
 * What each 2D machine allowed one moving figure. `snap` moves a colour onto
 * the machine's grid; `colours` is how many solid colours one sprite palette
 * held; `perRow` is the 2600's one-colour-a-line rule; `tile` the NES's three
 * colours in any 8 x 8.
 */
/** Era 1's twelve paddle inks, read out of its own file (item 1278). */
function atariInks() {
  const src = fs.readFileSync(path.join(ROOT, 'src/eras/era1-atari2600.js'), 'utf8');
  const m = /var PADDLE_INKS = \[([\s\S]*?)\];/.exec(src);
  return m ? m[1].match(/#[0-9a-f]{6}/g) : [];
}

export const ERAS = {
  // The 2600 (item 1278): a player object is one 8-bit graphics register -- 8
  // pixels a line, never wider -- in one colour register a line (a kernel can
  // rewrite COLUP0 between lines, never within one), and its colours are era
  // 1's own inks, the twelve the game gives the machine.
  1: { name: 'Atari 2600', colours: 8, perRow: 1, register: 8, table: null,
       snap(c) { this.table = this.table || atariInks(); const t = rgbOf(c); let b = this.table[0];
         for (const e of this.table) if (dist2(rgbOf(e), t) < dist2(rgbOf(b), t)) b = e; return b; } },
  2: { name: 'NES', colours: 12, tile: 3, table: null,
       snap(c) { this.table = this.table || nesTable(); const t = rgbOf(c); let b = this.table[0];
         for (const e of this.table) if (dist2(rgbOf(e), t) < dist2(rgbOf(b), t)) b = e; return b; } },
  3: { name: 'Sega Genesis', colours: 15, bits: 3, snap: (c) => hexOf(...rgbOf(c).map((v) => nearestLevel(v, levels(3)))) },
  4: { name: 'Super Nintendo', colours: 15, bits: 5, snap: (c) => hexOf(...rgbOf(c).map((v) => nearestLevel(v, levels(5)))) }
};

// ---- the grid file ------------------------------------------------------------

/** Write a sheet with one grid row per line, so a plain edit on one row works. */
export function stringify(doc) {
  const head = Object.fromEntries(Object.entries(doc).filter(([k]) => k !== 'frames'));
  let s = JSON.stringify(head, null, 2).replace(/\n}$/, ',\n  "frames": {\n');
  const names = Object.keys(doc.frames);
  names.forEach((n, i) => {
    const v = doc.frames[n];
    const last = i === names.length - 1 ? '' : ',';
    if (Array.isArray(v)) s += `    ${JSON.stringify(n)}: [\n${v.map((r) => `      ${JSON.stringify(r)}`).join(',\n')}\n    ]${last}\n`;
    else s += `    ${JSON.stringify(n)}: ${JSON.stringify(v)}${last}\n`;
  });
  return s + '  }\n}\n';
}

export const load = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

/** Every frame as a h x w array of palette letters ('.' clear), relations resolved. */
export function resolve(doc) {
  const { w, h } = doc.frame;
  const out = {};
  const busy = new Set();
  const get = (name) => {
    if (out[name]) return out[name];
    const v = doc.frames[name];
    if (v === undefined) throw new Error(`frame ${name} is named but has no rows`);
    if (busy.has(name)) throw new Error(`frame ${name} is built from itself`);
    busy.add(name);
    let g;
    if (Array.isArray(v)) {
      g = v.map((r, y) => {
        if (r.length !== w) throw new Error(`frame ${name} row ${y} is ${r.length} wide, not ${w}`);
        return r.split('');
      });
      if (g.length !== h) throw new Error(`frame ${name} is ${g.length} rows, not ${h}`);
    } else {
      const src = get(v.from);
      const dx = v.dx || 0, dy = v.dy || 0;
      g = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => {
        const sx = x - dx, sy = y - dy;
        return sx >= 0 && sx < w && sy >= 0 && sy < h ? src[sy][sx] : '.';
      }));
      if (v.mirror) g = g.map((r) => r.slice().reverse());
      for (const [row, text] of Object.entries(v.patch || {})) {
        if (text.length !== w) throw new Error(`frame ${name} patch row ${row} is ${text.length} wide, not ${w}`);
        text.split('').forEach((c, x) => { if (c !== '_') g[+row][x] = c; });
      }
    }
    busy.delete(name);
    out[name] = g;
    return g;
  };
  for (const n of Object.keys(doc.frames)) get(n);
  return out;
}

/** The frame names in the rig's order: idle0, idle1, up0, ... */
export function order(doc) {
  const names = [];
  for (const b of BEATS) for (let i = 0; i < (doc.beats[b] || 0); i++) names.push(`${b}${i}`);
  return names;
}

// ---- the checker --------------------------------------------------------------

/**
 * The hard rules (faults) and the advisory numbers, EarthBound's gate and
 * budget in one. A fault fails the sheet; a number is a prompt to go and look
 * at the picture again, never a threshold to satisfy.
 */
export function lint(doc) {
  const faults = [];
  const notes = [];
  const era = ERAS[doc.era];
  if (!era) faults.push(`era ${doc.era} is not a sprite era here (1 to 4)`);
  let frames = {};
  try { frames = resolve(doc); } catch (e) { faults.push(e.message); return { faults, notes, nums: {} }; }
  const pal = doc.palette || {};
  for (const [k, c] of Object.entries(pal)) {
    if (k.length !== 1 || k === '.' || k === '_') faults.push(`palette key ${JSON.stringify(k)} must be one letter`);
    if (!/^#[0-9a-f]{6}$/i.test(c)) { faults.push(`palette ${k} is ${c}, not #rrggbb`); continue; }
    if (era && era.snap(c.toLowerCase()) !== c.toLowerCase()) faults.push(`palette ${k} ${c} is off the ${era.name}'s colours; nearest is ${era.snap(c.toLowerCase())}`);
  }
  const names = order(doc);
  for (const n of names) if (!frames[n]) faults.push(`beat frame ${n} is missing`);
  const used = new Set();
  let opaque = 0, outline = 0, detail = 0, solid = 0;
  const bases = {};
  for (const n of names) {
    const g = frames[n];
    if (!g) continue;
    let base = -1;
    g.forEach((row, y) => {
      const rowCols = new Set();
      row.forEach((c, x) => {
        if (c === '.') return;
        if (!(c in pal)) { faults.push(`frame ${n} (${x},${y}) uses ${c}, which the palette has not got`); return; }
        used.add(c); rowCols.add(c); base = y; solid++;
        if (c === 'k') outline++;
        const nb = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].map(([a, b]) => (g[b] || [])[a]);
        if (c !== 'k' && nb.every((v) => v !== undefined && v !== '.' && v !== c)) detail++;
      });
      if (era && era.perRow && rowCols.size > era.perRow) faults.push(`frame ${n} row ${y} has ${rowCols.size} colours; the ${era.name} draws one a line`);
      if (era && era.register) {
        const lit = row.map((c, x) => (c === '.' ? -1 : x)).filter((x) => x >= 0);
        if (lit.length && lit[lit.length - 1] - lit[0] + 1 > era.register) faults.push(`frame ${n} row ${y} spans ${lit[lit.length - 1] - lit[0] + 1} pixels; one ${era.name} player register is ${era.register} wide`);
      }
    });
    if (era && era.tile) {
      for (let ty = 0; ty < g.length; ty += 8) for (let tx = 0; tx < g[0].length; tx += 8) {
        const s = new Set();
        for (let y = ty; y < Math.min(ty + 8, g.length); y++) for (let x = tx; x < Math.min(tx + 8, g[0].length); x++) if (g[y][x] !== '.') s.add(g[y][x]);
        if (s.size > era.tile) notes.push(`frame ${n} tile (${tx},${ty}) has ${s.size} colours; an NES sprite tile holds ${era.tile}`);
      }
    }
    bases[n] = base;
    opaque += g.flat().filter((c) => c !== '.').length;
  }
  if (era && used.size > era.colours) faults.push(`${used.size} colours used; one ${era.name} sprite palette holds ${era.colours}`);
  // feet on the floor: every beat but the win's hop stands on one row (EarthBound's 1-row rule)
  const floorRows = Object.entries(bases).filter(([n]) => !n.startsWith('win')).map(([, b]) => b);
  if (floorRows.length && Math.max(...floorRows) - Math.min(...floorRows) > 1) {
    faults.push(`the feet are on rows ${[...new Set(floorRows)].sort((a, b) => a - b).join(', ')}; every standing frame's lowest row must agree within 1`);
  }
  // the hand: the paddle is drawn at hand, so something solid must reach it
  if (doc.hand) {
    const hx = Math.min(doc.hand.x, doc.frame.w - 1);
    for (const n of names.filter((n) => frames[n] && !n.startsWith('win') && !n.startsWith('miss'))) {
      const g = frames[n];
      let near = false;
      for (let y = doc.hand.y - 3; y <= doc.hand.y + 3; y++) for (let x = hx - 2; x <= hx; x++) if ((g[y] || [])[x] && g[y][x] !== '.') near = true;
      if (!near) notes.push(`frame ${n} has nothing within 3 pixels of the hand (${doc.hand.x},${doc.hand.y}); the paddle will float`);
    }
  }
  const nums = {
    frames: names.length,
    colours: used.size,
    opaquePerFrame: Math.round(opaque / Math.max(1, names.length)),
    outlinePct: +(100 * outline / Math.max(1, solid)).toFixed(1),
    detailPct: +(100 * detail / Math.max(1, solid)).toFixed(1),
    unique: new Set(names.filter((n) => frames[n]).map((n) => frames[n].map((r) => r.join('')).join('/'))).size
  };
  return { faults, notes, nums };
}

// ---- pictures -----------------------------------------------------------------

/** The sheet at native resolution: rows are beats, columns are frames. */
export function buildSheet(doc) {
  const frames = resolve(doc);
  const { w, h } = doc.frame;
  const cols = Math.max(...BEATS.map((b) => doc.beats[b] || 0));
  const width = w * cols, height = h * BEATS.length;
  const rgba = Buffer.alloc(width * height * 4);
  const pal = Object.fromEntries(Object.entries(doc.palette).map(([k, c]) => [k, rgbOf(c)]));
  BEATS.forEach((b, row) => {
    for (let i = 0; i < (doc.beats[b] || 0); i++) {
      const g = frames[`${b}${i}`];
      if (!g) continue;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const c = g[y][x];
        if (c === '.' || !pal[c]) continue;
        const at = ((row * h + y) * width + i * w + x) * 4;
        rgba[at] = pal[c][0]; rgba[at + 1] = pal[c][1]; rgba[at + 2] = pal[c][2]; rgba[at + 3] = 255;
      }
    }
  });
  return { width, height, rgba };
}

/** An image scaled up by a whole number, nearest neighbour, on a backdrop. */
function upscale(img, k, bg = [40, 42, 50]) {
  const width = img.width * k, height = img.height * k;
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const s = ((Math.floor(y / k) * img.width) + Math.floor(x / k)) * 4;
    const d = (y * width + x) * 4;
    const a = img.rgba[s + 3] >= 128;
    rgba[d] = a ? img.rgba[s] : bg[0]; rgba[d + 1] = a ? img.rgba[s + 1] : bg[1]; rgba[d + 2] = a ? img.rgba[s + 2] : bg[2]; rgba[d + 3] = 255;
  }
  return { width, height, rgba };
}

/** Two images side by side with a gap. */
function beside(a, b, gap = 16, bg = [24, 24, 30]) {
  const width = a.width + gap + b.width, height = Math.max(a.height, b.height);
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) { rgba[i * 4] = bg[0]; rgba[i * 4 + 1] = bg[1]; rgba[i * 4 + 2] = bg[2]; rgba[i * 4 + 3] = 255; }
  const put = (img, ox) => { for (let y = 0; y < img.height; y++) img.rgba.copy(rgba, (y * width + ox) * 4, y * img.width * 4, (y + 1) * img.width * 4); };
  put(a, 0); put(b, a.width + gap);
  return { width, height, rgba };
}

// ---- starting points: a prompt, or a reference ---------------------------------

/** A blank sheet for a prompt: the era's rules and the rig's beats, all clear. */
export function blank({ id, era, frame, hand, prompt, beats }) {
  const row = '.'.repeat(frame.w);
  const doc = { format: 'pgrid-v1', id, era, prompt, reference: null, frame, hand: hand || { x: frame.w, y: Math.round(frame.h / 2) },
    beats: beats || { idle: 2, up: 2, down: 2, swing: 3, miss: 1, win: 2 }, palette: { k: '#000000' }, frames: {} };
  doc.frames.idle0 = Array.from({ length: frame.h }, () => row);
  for (const n of order(doc)) if (n !== 'idle0') doc.frames[n] = { from: 'idle0' };
  return doc;
}

/** A reference sheet traced into a starting grid: every pixel snapped and lettered. */
export function trace(img, { id, era, frame, hand, beats }) {
  const rules = ERAS[era];
  const doc = blank({ id, era, frame, hand, prompt: null, beats });
  const colourOf = new Map();
  const counts = new Map();
  const cols = Math.floor(img.width / frame.w);
  const frames = {};
  BEATS.forEach((b, row) => {
    for (let i = 0; i < (doc.beats[b] || 0) && i < cols; i++) {
      const g = [];
      for (let y = 0; y < frame.h; y++) {
        const r = [];
        for (let x = 0; x < frame.w; x++) {
          const at = (((row * frame.h + y) * img.width) + i * frame.w + x) * 4;
          if ((img.rgba[at + 3] ?? 0) < 128) { r.push(null); continue; }
          const c = rules.snap(hexOf(img.rgba[at], img.rgba[at + 1], img.rgba[at + 2]));
          counts.set(c, (counts.get(c) || 0) + 1);
          r.push(c);
        }
        g.push(r);
      }
      frames[`${b}${i}`] = g;
    }
  });
  // the darkest colour is the outline, 'k'; the rest lettered by how much they are used
  const byUse = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a));
  const dark = [...counts.keys()].sort((a, b) => rgbOf(a).reduce((s, v) => s + v, 0) - rgbOf(b).reduce((s, v) => s + v, 0))[0];
  const letters = LETTERS.split('').filter((l) => l !== 'k');
  if (dark) colourOf.set(dark, 'k');
  for (const c of byUse) if (!colourOf.has(c)) colourOf.set(c, letters.shift());
  doc.palette = Object.fromEntries([...colourOf].map(([c, l]) => [l, c]));
  doc.frames = {};
  for (const n of order(doc)) {
    doc.frames[n] = frames[n] ? frames[n].map((r) => r.map((c) => (c ? colourOf.get(c) : '.')).join('')) : { from: 'idle0' };
  }
  return doc;
}

// ---- the contact sheet ----------------------------------------------------------

/** An HTML page: the old sheet and the new, at game scale and at 4x, and the numbers. */
export function contactHtml({ title, oldSrc, newSrc, oldSize, newSize, gameScale, lines }) {
  const pic = (src, size, k) => `<img src="${src}" width="${size.width * k}" height="${size.height * k}">`;
  return `<!doctype html><meta charset="utf-8"><title>${title}</title>
<style>body{background:#16161c;color:#e8e8e0;font:14px Consolas,monospace;margin:16px}
h1{font-size:18px;margin:0 0 8px}.row{display:flex;gap:40px;align-items:flex-start;margin:10px 0}
.col{display:flex;flex-direction:column;gap:6px}img{image-rendering:pixelated;background:#2a2c34}
.lab{color:#9a9ca8}.num{white-space:pre;color:#c8e8c8;margin-top:12px}</style>
<h1>${title}</h1>
<div class="lab">game scale: one sheet pixel at the rig's ${gameScale}x on the 800 x 600 page (what stands behind the paddle)</div>
<div class="row"><div class="col"><span>OLD (pixellab, on screen today)</span>${pic(oldSrc, oldSize, gameScale)}</div>
<div class="col"><span>NEW (tools/spritegen.mjs)</span>${pic(newSrc, newSize, gameScale)}</div></div>
<div class="lab">4x</div>
<div class="row"><div class="col"><span>OLD</span>${pic(oldSrc, oldSize, 4)}</div>
<div class="col"><span>NEW</span>${pic(newSrc, newSize, 4)}</div></div>
<div class="num">${lines.join('\n')}</div>`;
}

// ---- the command line -------------------------------------------------------------

function arg(argv, name, dflt) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : dflt;
}
const sizeOf = (s) => { const [w, h] = String(s).split('x').map(Number); return { w, h }; };
const pngOut = (file, img) => { fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true }); fs.writeFileSync(file, encode(img)); };

export function main(argv, log = console.log) {
  const [cmd, a, b] = argv;
  const t0 = performance.now();
  if (cmd === 'new') {
    const doc = blank({ id: path.basename(a, '.json'), era: +arg(argv, '--era', 3), frame: sizeOf(arg(argv, '--frame', '20x25')), prompt: arg(argv, '--prompt', '') });
    fs.writeFileSync(a, stringify(doc));
    log(`NEW ${a}: ${doc.frame.w} x ${doc.frame.h}, ${order(doc).length} frames, era ${doc.era} (${ERAS[doc.era].name}). Draw pass 1 (silhouette, colour masses), look, then pass 2 (face, detail), look.`);
    return 0;
  }
  if (cmd === 'trace') {
    const doc = trace(decode(fs.readFileSync(a)), { id: path.basename(b, '.json'), era: +arg(argv, '--era', 3), frame: sizeOf(arg(argv, '--frame', '20x25')) });
    doc.reference = path.relative(ROOT, path.resolve(a)).replace(/\\/g, '/');
    fs.writeFileSync(b, stringify(doc));
    log(`TRACE ${a} -> ${b}: ${Object.keys(doc.palette).length} colours after the ${ERAS[doc.era].name} snap`);
    return 0;
  }
  const doc = load(a);
  const res = lint(doc);
  const line = () => `faults ${res.faults.length}  colours ${res.nums.colours}  frames ${res.nums.frames} (${res.nums.unique} unique)  opaque/frame ${res.nums.opaquePerFrame}  outline ${res.nums.outlinePct}%  detail ${res.nums.detailPct}%`;
  if (cmd === 'lint') {
    for (const f of res.faults) log(`FAULT ${f}`);
    for (const n of res.notes) log(`note  ${n}`);
    log(`LINT ${doc.id} ${res.faults.length ? 'FAIL' : 'PASS'} | ${line()}`);
    return res.faults.length ? 1 : 0;
  }
  if (cmd === 'build') {
    if (res.faults.length) { for (const f of res.faults) log(`FAULT ${f}`); return 1; }
    const out = arg(argv, '--out', a.replace(/\.json$/, '.png'));
    const img = buildSheet(doc);
    pngOut(out, img);
    log(`BUILD ${out}: ${img.width} x ${img.height}, ${res.nums.colours} colours, ${(performance.now() - t0).toFixed(1)} ms`);
    return 0;
  }
  if (cmd === 'look') {
    const k = +arg(argv, '--scale', 4);
    const out = arg(argv, '--out', a.replace(/\.json$/, '-look.png'));
    let img = upscale(buildSheet(doc), k);
    const ref = arg(argv, '--ref', doc.reference ? path.join(ROOT, doc.reference) : null);
    if (ref && fs.existsSync(ref)) img = beside(img, upscale(decode(fs.readFileSync(ref)), k));
    pngOut(out, img);
    for (const f of res.faults) log(`FAULT ${f}`);
    log(`LOOK ${doc.id} ${res.faults.length ? 'FAIL' : 'PASS'} | ${line()} | png ${out}${ref ? '  (new left, reference right)' : ''}`);
    return res.faults.length ? 1 : 0;
  }
  if (cmd === 'contact') {
    const out = arg(argv, '--out', a.replace(/\.json$/, '-contact.html'));
    const ref = arg(argv, '--ref', doc.reference ? path.join(ROOT, doc.reference) : null);
    const sheet = a.replace(/\.json$/, '.png');
    const img = buildSheet(doc);
    pngOut(sheet, img);
    const old = decode(fs.readFileSync(ref));
    const rel = (p) => path.relative(path.dirname(path.resolve(out)), path.resolve(p)).replace(/\\/g, '/');
    const minutes = arg(argv, '--minutes', null);
    // the old sheet, traced and put through the same checker, so both carry the same numbers
    const was = lint(trace(old, { id: 'old', era: doc.era, frame: doc.frame, hand: doc.hand, beats: doc.beats }));
    const lines = [
      `${doc.id}: era ${doc.era} (${ERAS[doc.era].name}), ${img.width} x ${img.height} sheet, ${res.nums.frames} frames of ${doc.frame.w} x ${doc.frame.h}`,
      `old: faults ${was.faults.length}  colours ${was.nums.colours}  frames ${was.nums.frames} (${was.nums.unique} unique)  ${was.faults.join('; ')}`,
      `new: ${line()}`,
      `prompt: ${doc.prompt || '-'}`,
      minutes ? `one sheet took ${minutes} minutes of drawing (a Claude run authoring the grid); the tool builds it in ${(performance.now() - t0).toFixed(0)} ms` : ''
    ].filter(Boolean);
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, contactHtml({ title: `${doc.id}: old and new`, oldSrc: rel(ref), newSrc: rel(sheet), oldSize: old, newSize: img, gameScale: +arg(argv, '--game-scale', 3), lines }));
    log(`CONTACT ${out} (sheet ${sheet})`);
    return 0;
  }
  log('usage: node tools/spritegen.mjs new|trace|lint|look|build|contact ... (see the header)');
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
