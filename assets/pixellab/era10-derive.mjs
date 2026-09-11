#!/usr/bin/env node
/*
 * assets/pixellab/era10-derive.mjs -- the Xbox 360's generated art, made ready
 * offline (item 1234, docs/ART.md era 10).
 *
 *   node assets/pixellab/era10-derive.mjs
 *
 * 1. The two soldier sheets. pixflux was asked for a 3 x 6 grid of 32 x 66
 *    frames (docs/ART.md section 5 said that was untried); it answered with
 *    front-facing soldiers two to a row, 48 pixels apart, in six bands of 66
 *    rows. So this script finds each figure in each band (runs of opaque
 *    columns), and builds the rig's sheet out of them: one row per beat, the
 *    beat's pose made by tilting and lifting the figure about its feet (the
 *    roadie run's lean, the mantle-and-shove, the flinch, the fist), then
 *    graded brown and grey toward #c9b89a, given a 1-pixel HDR-sun rim on the
 *    side facing the ball, a soft glow off that rim, and a seeded grain at
 *    0.12 -- the treatment the rig's draw cannot give a figure, baked in.
 *    Everything is drawn at twice the size with bilinear filtering, because
 *    the rig draws a sheet with smoothing off and the bible wants this era
 *    smooth: a pre-smoothed 2x sheet drawn nearest-neighbour reads smooth.
 *
 *      era10-armour-left.png  -> era10-soldier-left.png   (288 x 792)
 *      era10-armour-right.png -> era10-soldier-right.png  (288 x 792)
 *
 * 2. The ruin plate, the banner and the gamerpics are embedded as data: URIs
 *    between the BEGIN/END markers in src/eras/era10-xbox360.js, the way era
 *    2 does, so they never taint the canvas.
 *
 * Node 18+, no dependencies. The PNG codec is era 2's.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodePng, encodePng } from './era2-nes-quantize.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ERA_FILE = path.join(HERE, '..', '..', 'src', 'eras', 'era10-xbox360.js');
const BEGIN = '// BEGIN pixellab embeds';
const END = '// END pixellab embeds';

export const CELL = { w: 48, h: 66 };   // one figure's cell in the source bands
export const UP = 2;                     // the derived sheet is drawn at twice the size
export const BEATS = ['idle', 'up', 'down', 'swing', 'miss', 'win'];
export const COUNTS = { idle: 2, up: 2, down: 2, swing: 3, miss: 1, win: 2 };
const TINT = [0xc9, 0xb8, 0x9a];
const SUN = [0xff, 0xd9, 0xa0];

/**
 * Every figure in the sheet: [{ band, x0, x1, y0, y1 }]. Bands are runs of
 * rows with anything opaque in them (pixflux does not keep to a 66-row grid),
 * and a band's figures are its runs of opaque columns.
 */
export function findFigures(img) {
  const opaque = (x, y) => img.rgba[(y * img.width + x) * 4 + 3] > 24;
  const rowHas = (y) => { for (let x = 0; x < img.width; x++) if (opaque(x, y)) return true; return false; };
  const bands = [];
  let top = -1;
  for (let y = 0; y <= img.height; y++) {
    const has = y < img.height && rowHas(y);
    if (has && top < 0) top = y;
    if (!has && top >= 0) { if (y - top >= 12) bands.push([top, y]); top = -1; }
  }
  const out = [];
  bands.forEach(([y0, y1], b) => {
    let run = -1;
    for (let x = 0; x <= img.width; x++) {
      let has = false;
      for (let y = y0; x < img.width && y < y1 && !has; y++) has = opaque(x, y);
      if (has && run < 0) run = x;
      if (!has && run >= 0) { if (x - run >= 6) out.push({ band: b, x0: run, x1: x, y0, y1 }); run = -1; }
    }
  });
  return out;
}

/** Bilinear read of a source pixel (premultiplied), or transparent outside. */
function sample(img, x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const acc = [0, 0, 0, 0];
  const taps = [[x0, y0, (1 - fx) * (1 - fy)], [x0 + 1, y0, fx * (1 - fy)], [x0, y0 + 1, (1 - fx) * fy], [x0 + 1, y0 + 1, fx * fy]];
  for (const [tx, ty, w] of taps) {
    if (tx < 0 || ty < 0 || tx >= img.width || ty >= img.height || w === 0) continue;
    const i = (ty * img.width + tx) * 4, a = img.rgba[i + 3] / 255;
    acc[0] += img.rgba[i] * a * w; acc[1] += img.rgba[i + 1] * a * w; acc[2] += img.rgba[i + 2] * a * w; acc[3] += a * w;
  }
  return acc;
}

/**
 * How each beat's frames are posed, per side: [band, figure in the band, tilt
 * degrees toward the ball, lift in source pixels (negative is up)]. The bands
 * are picked by eye from what pixflux drew (item 1234): the left sheet's
 * second band has a fireball on its first figure and the right sheet's last
 * band a magenta visor, so neither is used.
 */
export const POSES = {
  left: {
    idle:  [[0, 0, 0, 0], [0, 1, 0, -1]],               // the heavy breath: the pads rise
    up:    [[2, 0, 9, -2], [2, 1, 11, -1]],             // the roadie run, leaning into the travel
    down:  [[3, 0, 9, 1], [3, 1, 11, 2]],
    swing: [[1, 1, 5, 0], [3, 1, 14, -9], [2, 0, 8, -4]],  // mantle up over the edge, and back
    miss:  [[4, 1, -9, 4]],                             // the flinch: head down, the arm up
    win:   [[5, 0, 0, 0], [4, 1, -2, -5]]               // the fist to the chest, then up
  },
  right: {
    idle:  [[0, 0, 0, 0], [0, 1, 0, -1]],
    up:    [[1, 0, 9, -2], [1, 1, 11, -1]],
    down:  [[1, 0, 9, 1], [2, 0, 11, 2]],
    swing: [[0, 0, 5, 0], [1, 1, 14, -9], [2, 0, 8, -4]],
    miss:  [[2, 1, -9, 4]],
    win:   [[2, 1, 0, 0], [2, 1, -2, -5]]
  }
};

/** Seeded grain, so a re-run writes the same bytes. */
function lcg(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

/** The rig's sheet out of one generated sheet. */
export function derive(img, seed = 360, side = 'left') {
  const figs = findFigures(img);
  if (figs.length < 2) throw new Error(`found ${figs.length} figures in the sheet`);
  const byBand = [];
  for (const f of figs) (byBand[f.band] = byBand[f.band] || []).push(f);
  const pick = (b, i) => {
    const band = byBand[Math.min(b, byBand.length - 1)] || byBand[0];
    return band[Math.min(i, band.length - 1)];
  };
  const fw = CELL.w * UP, fh = CELL.h * UP;
  const W = fw * 3, H = fh * BEATS.length;
  const out = new Uint8Array(W * H * 4);
  const rnd = lcg(seed);
  BEATS.forEach((beat, row) => {
    POSES[side][beat].forEach(([band, idx, tilt, lift], col) => {
      const f = pick(band, idx);
      const cx = (f.x0 + f.x1) / 2, footY = f.y1 - 1;
      const k0 = (f.y1 - f.y0) / (CELL.h - 4);   // every figure stands CELL.h - 4 tall
      // a positive tilt leans the top toward +x, the ball; the feet step back
      // by half the lean so the figure stays inside its cell
      const t = -tilt * Math.PI / 180, cos = Math.cos(t), sin = Math.sin(t);
      const shift = Math.sin(tilt * Math.PI / 180) * (CELL.h / 2);
      const alpha = new Float32Array(fw * fh);
      const rgb = new Float32Array(fw * fh * 3);
      for (let y = 0; y < fh; y++) {
        for (let x = 0; x < fw; x++) {
          // destination, in source pixels about the feet: centre of the cell, bottom row
          const dx = ((x + 0.5) / UP - CELL.w / 2 + shift) * k0, dy = ((y + 0.5) / UP - (CELL.h - 1) - lift) * k0;
          // inverse rotation (the figure leans toward +x, the ball, for a positive tilt)
          const sx = cos * dx - sin * dy + cx, sy = sin * dx + cos * dy + footY;
          if (sy > footY + 0.5 || sy < f.y0 - 0.5 || sx < f.x0 - 0.5 || sx > f.x1 + 0.5) continue;
          const s = sample(img, sx - 0.5, sy - 0.5);
          if (s[3] <= 0.02) continue;
          const k = y * fw + x;
          alpha[k] = Math.min(1, s[3]);
          for (let c = 0; c < 3; c++) rgb[k * 3 + c] = s[c] / s[3];
        }
      }
      // grade, rim, glow and grain, straight into the sheet
      for (let y = 0; y < fh; y++) {
        for (let x = 0; x < fw; x++) {
          const k = y * fw + x, a = alpha[k];
          if (a <= 0) continue;
          let [r, g, b] = [rgb[k * 3], rgb[k * 3 + 1], rgb[k * 3 + 2]];
          const grey = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          // drain 45% of the colour, then multiply toward the tint at 0.35
          r = grey + (r - grey) * 0.55; g = grey + (g - grey) * 0.55; b = grey + (b - grey) * 0.55;
          r *= 1 - 0.35 + 0.35 * TINT[0] / 255; g *= 1 - 0.35 + 0.35 * TINT[1] / 255; b *= 1 - 0.35 + 0.35 * TINT[2] / 255;
          // the rim: the silhouette's edge on the side facing the ball and its top
          const edge = (xx, yy) => xx >= fw || yy < 0 || alpha[yy * fw + xx] < 0.3;
          const rim = edge(x + UP, y) || edge(x + 1, y) || edge(x, y - UP);
          if (rim) { r = r * 0.4 + SUN[0] * 0.6; g = g * 0.4 + SUN[1] * 0.6; b = b * 0.4 + SUN[2] * 0.6; }
          else if (edge(x + 2 * UP, y)) { r += SUN[0] * 0.25 * 0.4; g += SUN[1] * 0.25 * 0.4; b += SUN[2] * 0.25 * 0.4; }
          const n = (rnd() - 0.5) * 2 * 0.12 * 96;
          const i = ((row * fh + y) * W + col * fw + x) * 4;
          out[i] = Math.max(0, Math.min(255, Math.round(r + n)));
          out[i + 1] = Math.max(0, Math.min(255, Math.round(g + n)));
          out[i + 2] = Math.max(0, Math.min(255, Math.round(b + n)));
          out[i + 3] = Math.round(a * 255);
        }
      }
    });
  });
  return { width: W, height: H, rgba: out, figures: figs.length };
}

export function embed(src, art) {
  const a = src.indexOf(BEGIN), b = src.indexOf(END);
  if (a < 0 || b < a) throw new Error('no pixellab markers in the era file');
  const rows = Object.entries(art).map(([k, uri]) => `  var ${k} = '${uri}';`).join('\n');
  return src.slice(0, a) + BEGIN + ' (written by assets/pixellab/era10-derive.mjs; do not edit by hand)\n' + rows + '\n  ' + src.slice(b);
}

/** A derived sheet's manifest entry (0 generations), from its source's; replaced on a re-run. */
function recordDerived(srcFile, outFile, png, sheet, how) {
  const mf = path.join(HERE, 'manifest.json');
  const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
  const src = m.images.find((e) => e.file === srcFile);
  if (!src) throw new Error(`no manifest entry for ${srcFile}`);
  const entry = Object.assign({}, src, {
    name: outFile.slice(0, -4),
    file: outFile,
    cost: { type: 'derived', generations: 0 },
    derivedFrom: srcFile,
    derivedBy: 'node assets/pixellab/era10-derive.mjs',
    how: how || `${sheet.figures} figures found in the generated sheet, reposed per beat (POSES), graded toward #c9b89a, ` +
         'a 1-pixel HDR-sun rim and its glow, seeded grain at 0.12, at twice the size with bilinear filtering',
    card: 'item 1234',
    verdict: 'drawn by the character rig (src/characters.js, era 10 block) behind its paddle',
    pixels: { width: sheet.width, height: sheet.height },
    bytes: png.length,
    sha256: crypto.createHash('sha256').update(png).digest('hex')
  });
  const i = m.images.findIndex((e) => e.file === outFile);
  if (i >= 0) m.images[i] = entry; else m.images.push(entry);
  fs.writeFileSync(mf, JSON.stringify(m, null, 2) + '\n');
}

/**
 * The gamerpics, cut from the players' own heads: a square around the top of
 * each sheet's first idle figure, 32 x 32 on the toast's near-black. Two
 * pixflux gamerpic rolls came back looking like one famous franchise helmet
 * (ERAS.md rule 1.9 draws no trademark shape), so the picture is each
 * soldier's own helmet instead -- which is also what a gamerpic of him is.
 */
export function heads(sheets) {
  const W = 64, H = 32, out = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) { out[i * 4] = 0x1b; out[i * 4 + 1] = 0x1b; out[i * 4 + 2] = 0x1b; out[i * 4 + 3] = 255; }
  sheets.forEach((img, cell) => {
    const f = findFigures(img)[0];
    const side = Math.min(f.x1 - f.x0, (f.y1 - f.y0) * 0.42);
    const x0 = (f.x0 + f.x1) / 2 - side / 2, y0 = f.y0 - side * 0.04;
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const s = sample(img, x0 + (x + 0.5) * side / 32 - 0.5, y0 + (y + 0.5) * side / 32 - 0.5);
        const a = Math.min(1, s[3]), i = (y * W + cell * 32 + x) * 4;
        for (let c = 0; c < 3; c++) out[i + c] = Math.round(out[i + c] * (1 - a) + (a > 0 ? s[c] / s[3] : 0) * a);
      }
    }
  });
  return { width: W, height: H, rgba: out, figures: 2 };
}

export function main(log = console.log) {
  for (const side of ['left', 'right']) {
    const file = path.join(HERE, `era10-armour-${side}.png`);
    if (!fs.existsSync(file)) { log(`skipped ${side}: ${path.basename(file)} is not there`); continue; }
    const sheet = derive(decodePng(fs.readFileSync(file)), side === 'left' ? 360 : 361, side);
    const outFile = path.join(HERE, `era10-soldier-${side}.png`);
    const png = encodePng(sheet.width, sheet.height, Buffer.from(sheet.rgba));
    fs.writeFileSync(outFile, png);
    recordDerived(path.basename(file), path.basename(outFile), png, sheet);
    log(`wrote ${path.basename(outFile)}: ${sheet.width}x${sheet.height} from ${sheet.figures} figures`);
  }
  const srcs = ['left', 'right'].map((s) => decodePng(fs.readFileSync(path.join(HERE, `era10-armour-${s}.png`))));
  const pics = heads(srcs);
  const picPng = encodePng(pics.width, pics.height, Buffer.from(pics.rgba));
  fs.writeFileSync(path.join(HERE, 'era10-gamerpics-heads.png'), picPng);
  recordDerived('era10-armour-left.png', 'era10-gamerpics-heads.png', picPng, pics,
    'the left and right sheets\' first idle figures, each head cropped square and scaled to 32 x 32 on #1b1b1b ' +
    '(era10-gamerpics.png, two rolls, read as a famous franchise helmet and is not drawn)');
  log('wrote era10-gamerpics-heads.png: 64x32 from both sheets');
  const uri = (n) => 'data:image/png;base64,' + fs.readFileSync(path.join(HERE, n)).toString('base64');
  const art = { RUIN_URI: uri('era10-ruin.png'), BANNER_URI: uri('era10-banner.png'), GAMERPICS_URI: uri('era10-gamerpics-heads.png') };
  fs.writeFileSync(ERA_FILE, embed(fs.readFileSync(ERA_FILE, 'utf8'), art));
  log(`embedded ${Object.keys(art).join(', ')} in ${path.relative(process.cwd(), ERA_FILE)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
