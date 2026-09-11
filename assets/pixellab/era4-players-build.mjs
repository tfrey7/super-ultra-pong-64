#!/usr/bin/env node
/*
 * assets/pixellab/era4-players-build.mjs -- the Super Nintendo's two hover
 * pilots as the player rig's six-row sheets (item 1227), built offline from two
 * single-pose pixellab pictures.
 *
 *   node assets/pixellab/era4-players-build.mjs
 *
 *   era4-pilot-left.png  (32x128, red)  -> era4-players-left.png   (96 x 6 rows)
 *   era4-pilot-right.png (32x128, blue) -> era4-players-right.png
 *
 * Why derived and not generated: the art bible asked pixflux for each whole
 * sheet in one image, and the one try (era4-players-left-sheet.png, kept in the
 * manifest) came back as a single column of tiny identical figures. The two
 * victory-pose tries (era4-pilot-*-win.png) came back with their arms down. So
 * one good pose per pilot is generated, and every beat is made from it here:
 *
 *   idle   2 frames  the pad bobs 1 pixel, the jet flame flickers
 *   up     2         lifted 2 pixels, the flame stretched long behind the climb
 *   down   2         dropped 1 pixel, the flame squashed short
 *   swing  3         F-Zero's spin attack: squeezed thin, turned away, squeezed back
 *   miss   2         dipped 3 pixels and dimmed, the flame guttering; the pad is
 *                    gone in the second frame, so the rig's frame cycle blinks it
 *   win    2         both arms up (drawn here), flame at full, the second frame a hop
 *
 * Both pilots' gloves are put on the same sheet row (HAND_Y) and the right-hand
 * edge of the frame, so one `hand` serves both sheets, and the figure stands
 * wholly outside its paddle. Every colour is snapped to 15-bit SNES colour and
 * nothing is brighter than the helmet highlight #f8f8d0 (the ball stays the
 * brightest thing, R1). Node 18+, no dependencies; the PNG codec is era 2's.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodePng, encodePng } from './era2-nes-quantize.mjs';
import { toSnes, cropToOpaque } from './era4-snes-embed.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FW = 32;                // one frame's width, sheet pixels
export const BEATS = ['idle', 'up', 'down', 'swing', 'miss', 'win'];
export const FRAMES = { idle: 2, up: 2, down: 2, swing: 3, miss: 2, win: 2 };
const HOP = 4;                       // headroom for the win hop
const FLAME_ROOM = 20;               // rows under the pad for the flame
const CAP = [248, 248, 208];         // #f8f8d0, the brightest a figure may be
export const SIDES = [
  { from: 'era4-pilot-left.png', to: 'era4-players-left.png' },
  { from: 'era4-pilot-right.png', to: 'era4-players-right.png' }
];
const FLAME = ['#3070f0', '#70b8f8', '#c8f0f8'];   // outer, mid, core

function hex(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function lin(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
export function luminance(r, g, b) { return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); }
const CAP_L = luminance(CAP[0], CAP[1], CAP[2]);

function blank(w, h) { return { width: w, height: h, rgba: Buffer.alloc(w * h * 4) }; }
function px(img, x, y) { const i = (y * img.width + x) * 4; return img.rgba.subarray(i, i + 4); }
function put(img, x, y, c) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = (y * img.width + x) * 4;
  img.rgba[i] = c[0]; img.rgba[i + 1] = c[1]; img.rgba[i + 2] = c[2]; img.rgba[i + 3] = 255;
}

/** Where the glove is: the mean row and column of the near-white pixels in the body band. */
export function gloveOf(img) {
  let n = 0, sx = 0, sy = 0;
  for (let y = Math.floor(img.height * 0.3); y < Math.floor(img.height * 0.8); y++) {
    for (let x = 0; x < img.width; x++) {
      const p = px(img, x, y);
      if (p[3] && p[0] > 200 && p[1] > 200 && p[2] > 200) { n++; sx += x; sy += y; }
    }
  }
  return n ? { x: Math.round(sx / n), y: Math.round(sy / n) } : { x: img.width - 1, y: Math.floor(img.height / 2) };
}

/** The suit's colour: the commonest strongly coloured pixel in the body band. */
function suitOf(img) {
  const count = new Map();
  for (let y = Math.floor(img.height * 0.4); y < Math.floor(img.height * 0.8); y++) {
    for (let x = 0; x < img.width; x++) {
      const p = px(img, x, y);
      if (!p[3]) continue;
      const hi = Math.max(p[0], p[1], p[2]), lo = Math.min(p[0], p[1], p[2]);
      if (hi - lo < 60 || hi < 90) continue;
      const k = (p[0] << 16) | (p[1] << 8) | p[2];
      count.set(k, (count.get(k) || 0) + 1);
    }
  }
  let best = 0x808080, most = 0;
  for (const [k, c] of count) if (c > most) { most = c; best = k; }
  return [(best >> 16) & 255, (best >> 8) & 255, best & 255];
}

/** Copy src into dst with its top-left at (ox, oy); fx squeezes it about its right edge, flip mirrors it. */
function stamp(dst, src, ox, oy, opts = {}) {
  const squeeze = opts.squeeze || 1, dim = opts.dim || 0, flip = !!opts.flip;
  const w = Math.max(1, Math.round(src.width * squeeze));
  const rows = opts.rows == null ? src.height : opts.rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < w; x++) {
      let sx = Math.min(src.width - 1, Math.floor(x / squeeze));
      if (flip) sx = src.width - 1 - sx;
      const p = px(src, sx, y);
      if (!p[3]) continue;
      put(dst, ox + (src.width - w) + x, oy + y, [p[0] * (1 - dim), p[1] * (1 - dim), p[2] * (1 - dim)].map(Math.round));
    }
  }
}

/** The jet flame under the pad: a column tapering from 5 pixels to 1, `len` rows long. */
function flame(dst, cx, top, len) {
  for (let r = 0; r < len; r++) {
    const t = r / Math.max(1, len);
    const half = t < 0.35 ? 2 : (t < 0.75 ? 1 : 0);
    for (let dx = -half; dx <= half; dx++) {
      const edge = Math.abs(dx) === half && half > 0;
      put(dst, cx + dx, top + r, hex(edge ? FLAME[0] : (t < 0.5 && dx === 0 ? FLAME[2] : FLAME[1])));
    }
  }
}

/** Both arms raised over the helmet, in the suit's colour, gloves at the top. */
function arms(dst, ox, oy, src, glove, suit, lift) {
  const top = oy - 5 - lift;
  const shoulder = oy + Math.round(src.height * 0.36);
  // Drawn BEFORE the figure is stamped over them, at the helmet's two sides, so
  // only the raised part shows: above the helmet and beside it.
  const cols = [ox + 3, ox + src.width - 7];
  for (const x0 of cols) {
    for (let y = top + 3; y <= shoulder; y++) for (let dx = 0; dx < 3; dx++) put(dst, x0 + dx, y, suit);
    for (let y = top; y < top + 3; y++) for (let dx = -1; dx < 4; dx++) put(dst, x0 + dx, y, [232, 232, 224]);
  }
}

/** The glove the pose was holding out, painted over in the suit, so there are two hands and not three. */
function hideGlove(dst, ox, oy, glove, suit) {
  for (let y = oy + glove.y - 4; y <= oy + glove.y + 4; y++) {
    for (let x = ox + glove.x - 4; x <= ox + glove.x + 4; x++) {
      if (x < 0 || y < 0 || x >= dst.width || y >= dst.height) continue;
      const p = px(dst, x, y);
      if (p[3] && p[0] > 180 && p[1] > 180 && p[2] > 140) put(dst, x, y, suit.map((v) => Math.round(v * 0.8)));
    }
  }
}

/** Nothing on a figure brighter than the helmet highlight. */
function capBright(img) {
  for (let i = 0; i < img.rgba.length; i += 4) {
    if (!img.rgba[i + 3]) continue;
    if (luminance(img.rgba[i], img.rgba[i + 1], img.rgba[i + 2]) > CAP_L) {
      img.rgba[i] = CAP[0]; img.rgba[i + 1] = CAP[1]; img.rgba[i + 2] = CAP[2];
    }
  }
  return img;
}

/** The layout both sheets share: frame height and the hand's row. */
export function layout(crops) {
  const gloves = crops.map(gloveOf);
  const handY = HOP + Math.max(...gloves.map((g) => g.y));
  const fh = Math.max(...crops.map((c, i) => handY - gloves[i].y + c.height + FLAME_ROOM));
  return { handY, fh, gloves };
}

/** One pilot's whole sheet. */
export function buildSheet(crop, glove, handY, fh) {
  const sheet = blank(FW * 3, fh * BEATS.length);
  const suit = suitOf(crop);
  const baseX = FW - crop.width, baseY = handY - glove.y;
  const padRow = crop.height;                         // the pad's bottom, from the crop's top
  let padX = 0, n = 0;
  for (let x = 0; x < crop.width; x++) if (px(crop, x, crop.height - 1)[3]) { padX += x; n++; }
  const padCx = baseX + (n ? Math.round(padX / n) : Math.floor(crop.width / 2));
  const poses = {
    idle: [{ dy: 0, len: 8 }, { dy: 1, len: 6 }],
    up: [{ dy: -2, len: 15 }, { dy: -2, len: 12 }],
    down: [{ dy: 1, len: 4 }, { dy: 1, len: 3 }],
    swing: [{ dy: 0, len: 8, squeeze: 0.55 }, { dy: 0, len: 9, flip: true }, { dy: 0, len: 8, squeeze: 0.55, flip: true }],
    miss: [{ dy: 3, len: 2, dim: 0.35 }, { dy: 3, len: 0, dim: 0.35, noPad: true }],
    win: [{ dy: 0, len: 16, arms: 0 }, { dy: -HOP, len: 19, arms: 2 }]
  };
  BEATS.forEach((beat, row) => {
    poses[beat].forEach((p, i) => {
      const cell = blank(FW, fh);
      const oy = baseY + p.dy;
      const rows = p.noPad ? padRow - 5 : undefined;
      if (p.arms != null) arms(cell, baseX, oy, crop, glove, suit, p.arms);
      stamp(cell, crop, baseX, oy, { squeeze: p.squeeze, flip: p.flip, dim: p.dim, rows });
      if (p.arms != null) hideGlove(cell, baseX, oy, glove, suit);
      if (p.len) flame(cell, padCx, oy + padRow, p.len);
      for (let y = 0; y < fh; y++) cell.rgba.copy(sheet.rgba, ((row * fh + y) * sheet.width + i * FW) * 4, y * FW * 4, (y + 1) * FW * 4);
    });
  });
  return toSnes(capBright(sheet));
}

export function main(log = console.log) {
  const crops = SIDES.map((s) => cropToOpaque(toSnes(decodePng(fs.readFileSync(path.join(HERE, s.from))))));
  for (const c of crops) if (c.width > FW) throw new Error(`a pilot is ${c.width} wide, more than the ${FW}-pixel frame`);
  const { handY, fh, gloves } = layout(crops);
  const mpath = path.join(HERE, 'manifest.json');
  const raw = fs.readFileSync(mpath, 'utf8');
  const manifest = JSON.parse(raw);
  SIDES.forEach((s, i) => {
    const img = buildSheet(crops[i], gloves[i], handY, fh);
    const png = encodePng(img.width, img.height, img.rgba);
    fs.writeFileSync(path.join(HERE, s.to), png);
    const src = manifest.images.find((e) => e.file === s.from);
    const entry = Object.assign({}, src, {
      name: s.to.replace(/\.png$/, ''), file: s.to,
      cost: { type: 'derived', generations: 0 },
      derivedFrom: s.from,
      derivedBy: 'node assets/pixellab/era4-players-build.mjs',
      how: `the one pose cut into the rig's six beats (idle, up, down, swing, miss, win; ${BEATS.map((b) => FRAMES[b]).join('/')} frames), jet flame and raised arms drawn in code, 15-bit SNES colour, capped at #f8f8d0; frame ${FW}x${fh}, hand (${FW}, ${handY})`,
      card: 'item 1227',
      verdict: 'worn by era 4\'s players (src/characters.js, ERAS[4].sheets)',
      pixels: { width: img.width, height: img.height },
      bytes: png.length,
      sha256: crypto.createHash('sha256').update(png).digest('hex')
    });
    delete entry.generationsUsed;
    delete entry.seconds;
    const at = manifest.images.findIndex((e) => e.name === entry.name);
    if (at >= 0) manifest.images[at] = entry; else manifest.images.push(entry);
    log(`${s.to} ${img.width}x${img.height}, ${png.length} bytes`);
  });
  fs.writeFileSync(mpath, JSON.stringify(manifest, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
  log(`frame ${FW}x${fh}, hand (${FW}, ${handY})`);
  return { frame: { w: FW, h: fh }, hand: { x: FW, y: handY } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
