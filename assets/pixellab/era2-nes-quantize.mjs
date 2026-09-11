#!/usr/bin/env node
/*
 * assets/pixellab/era2-nes-quantize.mjs -- boil the NES era's generated art
 * down to the NES palette, offline, and embed it in the era file.
 *
 *   node assets/pixellab/era2-nes-quantize.mjs
 *
 * Reads two raw pixellab images beside this file (their prompts, seeds and
 * requests are in manifest.json) and writes the two pictures era 2 draws:
 *
 *   era2-court-raw.png  (200x148)  -> era2-court.png  (200x148, one NES colour
 *       per pixel; every entry as bright as the ball's core is held back, so
 *       the court can never out-shine the ball -- ERAS.md R1; then paintOut
 *       keeps only the floor and its tile grid: the generation was a football
 *       pitch, and every pitch marking goes, item 1259)
 *   era2-ball-raw2.png  (32x32)    -> era2-ball.png   (12x12, the ball's own box
 *       at the canvas's real pixels, inked only in NES $30/$10/$00/$0F, each
 *       pixel either opaque or clear)
 *
 * Then it rewrites the block between the BEGIN/END pixellab markers in
 * src/eras/era2-nes.js with the two PNGs as data: URIs. Embedded rather than
 * loaded off disk because a page opened from file:// counts a file image as
 * another origin and it taints the canvas (getImageData then throws); a data:
 * image does not (measured in headless Chrome on item 1178).
 *
 * The palette is read out of the era file itself, so there is one NES table.
 * All pixel work happens here, once; the game only ever calls drawImage.
 * Node 18+, no dependencies: node:zlib inflates and deflates the PNGs.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ERA_FILE = path.join(HERE, '..', '..', 'src', 'eras', 'era2-nes.js');
export const BALL_SIZE = 12;
export const COURT_LUMA_MAX = 0.8;
const BEGIN = '// BEGIN pixellab embeds';
const END = '// END pixellab embeds';

/** The NES table, straight out of the era file. */
export function nesPalette(src = fs.readFileSync(ERA_FILE, 'utf8')) {
  const m = /var NES = \[([\s\S]*?)\];/.exec(src);
  if (!m) throw new Error('no NES table in the era file');
  const pal = m[1].match(/#[0-9a-f]{6}/g);
  if (pal.length !== 64) throw new Error(`the NES table has ${pal.length} entries, not 64`);
  return pal;
}

const rgbOf = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const hexOf = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
/** Relative luminance, 0..1 (Rec. 709 weights on the sRGB values). */
export function luma(c) {
  const [r, g, b] = rgbOf(c).map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** An 8-bit, non-interlaced PNG as { width, height, rgba }. */
export function decodePng(buf) {
  if (buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('not a PNG');
  let pos = 8, width = 0, height = 0, depth = 0, type = 0, interlace = 0;
  let plte = null, trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const kind = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      depth = data[8]; type = data[9]; interlace = data[12];
    } else if (kind === 'PLTE') plte = data;
    else if (kind === 'tRNS') trns = data;
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    pos += 12 + len;
  }
  if (depth !== 8 || interlace) throw new Error(`only 8-bit non-interlaced PNGs (depth ${depth}, interlace ${interlace})`);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!channels) throw new Error(`PNG colour type ${type} not handled`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? px[y * stride + x - channels] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? px[(y - 1) * stride + x - channels] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (f !== 0) throw new Error(`bad PNG filter ${f}`);
      px[y * stride + x] = v & 255;
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * channels, d = i * 4;
    if (type === 6) px.copy(rgba, d, s, s + 4);
    else if (type === 2) { px.copy(rgba, d, s, s + 3); rgba[d + 3] = 255; }
    else if (type === 0) { rgba.fill(px[s], d, d + 3); rgba[d + 3] = 255; }
    else if (type === 4) { rgba.fill(px[s], d, d + 3); rgba[d + 3] = px[s + 1]; }
    else {
      const k = px[s];
      plte.copy(rgba, d, k * 3, k * 3 + 3);
      rgba[d + 3] = trns && k < trns.length ? trns[k] : 255;
    }
  }
  return { width, height, rgba };
}

/** RGBA -> a PNG (colour type 6, filter 0 on every row). Deterministic. */
export function encodePng(width, height, rgba) {
  const rows = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) rgba.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  const chunk = (kind, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(kind, 4, 'latin1');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function nearest(r, g, b, inks) {
  let best = inks[0], bestD = Infinity;
  for (const c of inks) {
    const [cr, cg, cb] = rgbOf(c);
    const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

/** Every pixel to its nearest ink; the court is opaque, so alpha goes to 255. */
export function quantize(img, inks) {
  const out = Buffer.alloc(img.rgba.length);
  for (let i = 0; i < img.rgba.length; i += 4) {
    const [r, g, b] = rgbOf(nearest(img.rgba[i], img.rgba[i + 1], img.rgba[i + 2], inks));
    out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = 255;
  }
  return { width: img.width, height: img.height, rgba: out };
}

/**
 * Shrink a sprite to size x size by averaging the source pixels under each
 * cell: a cell at least half covered is opaque, in its covered pixels' mean
 * colour snapped to the nearest ink; the rest is clear.
 */
export function shrink(img, size, inks) {
  const out = Buffer.alloc(size * size * 4);
  const sx = img.width / size, sy = img.height / size;
  for (let oy = 0; oy < size; oy++) {
    for (let ox = 0; ox < size; ox++) {
      let n = 0, alpha = 0, r = 0, g = 0, b = 0;
      for (let y = Math.floor(oy * sy); y < Math.ceil((oy + 1) * sy); y++) {
        for (let x = Math.floor(ox * sx); x < Math.ceil((ox + 1) * sx); x++) {
          const i = (y * img.width + x) * 4, a = img.rgba[i + 3];
          n++; alpha += a;
          r += img.rgba[i] * a; g += img.rgba[i + 1] * a; b += img.rgba[i + 2] * a;
        }
      }
      const d = (oy * size + ox) * 4;
      if (alpha / n < 128) continue;
      const [qr, qg, qb] = rgbOf(nearest(r / alpha, g / alpha, b / alpha, inks));
      out[d] = qr; out[d + 1] = qg; out[d + 2] = qb; out[d + 3] = 255;
    }
  }
  return { width: size, height: size, rgba: out };
}

/** How many opaque pixels wear each colour. */
export function inkCounts(img) {
  const counts = {};
  for (let i = 0; i < img.rgba.length; i += 4) {
    if (img.rgba[i + 3] === 0) continue;
    const c = hexOf(img.rgba[i], img.rgba[i + 1], img.rgba[i + 2]);
    counts[c] = (counts[c] || 0) + 1;
  }
  return counts;
}

/*
 * What the generator drew is a football pitch laid over a tiled floor (item
 * 1259): a double outer border, two penalty boxes with their arcs, goal boxes,
 * a centre circle and grey dashes along the lines -- and era 2 is Nintendo's
 * Tennis. So only two things are kept from the generation: the floor's ink and
 * the tile grid it drew under the pitch, a dark line about every 22 court
 * pixels each way. The grid is read off the margins the pitch never covered
 * (a column dark down all of TOP_MARGIN rows, a row dark across all of
 * SIDE_MARGIN columns), and each grid line is then drawn whole, because the
 * pitch had painted over most of it. The grid column under the net is left
 * out: a dark line beside the game's dotted centre line read as a halfway
 * line (item 1191). Every other pixel goes to the floor, so no pitch mark,
 * no grey dash and no scrap of a glyph is left. The tennis lines themselves
 * are drawn by the era in code (drawLines in src/eras/era2-nes.js).
 *
 * Until item 1259 this step painted out only the marks that read as a 3 and
 * the pitch's halfway line (item 1191) and kept the rest of the pitch.
 */
export const TOP_MARGIN = 12;     // rows 0-11: above the pitch's outer border
export const SIDE_MARGIN = 7;     // columns 0-6: left of it
export const NET_CLEAR = 3;       // no grid column within this of the court's centre column

/** The generator's tile grid, as the court columns and rows it runs down. */
export function tileGrid(img) {
  const at = (x, y) => (y * img.width + x) * 4;
  const dark = (x, y) => { const i = at(x, y); return luma(hexOf(img.rgba[i], img.rgba[i + 1], img.rgba[i + 2])) < 0.3; };
  const cols = [], rows = [];
  for (let x = 0; x < img.width; x++) {
    let all = true;
    for (let y = 0; y < TOP_MARGIN && all; y++) all = dark(x, y);
    if (all && Math.abs(x - (img.width - 1) / 2) > NET_CLEAR) cols.push(x);
  }
  for (let y = 0; y < img.height; y++) {
    let all = true;
    for (let x = 0; x < SIDE_MARGIN && all; x++) all = dark(x, y);
    if (all) rows.push(y);
  }
  return { cols, rows };
}

/** The court as floor and tile grid only: every pitch marking painted out. */
export function paintOut(img) {
  const out = { width: img.width, height: img.height, rgba: Buffer.alloc(img.rgba.length) };
  const counts = inkCounts(img);
  const floor = rgbOf(Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0]);
  const { cols, rows } = tileGrid(img);
  const i0 = cols.length ? cols[0] * 4 : 0;
  const tile = [img.rgba[i0], img.rgba[i0 + 1], img.rgba[i0 + 2]];   // the grid's own ink, top row
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const i = (y * out.width + x) * 4;
      const ink = cols.includes(x) || rows.includes(y) ? tile : floor;
      out.rgba[i] = ink[0]; out.rgba[i + 1] = ink[1]; out.rgba[i + 2] = ink[2]; out.rgba[i + 3] = 255;
    }
  }
  return out;
}

/** The era file with its embed block rewritten, keeping the file's own line endings. */
export function embed(src, art) {
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  const a = src.indexOf(BEGIN), b = src.indexOf(END);
  if (a < 0 || b < a) throw new Error('no pixellab embed markers in the era file');
  const from = src.indexOf(eol, a) + eol.length;
  const to = src.lastIndexOf(eol, b) + eol.length;
  const block = ['  var ART = {',
    `    court: 'data:image/png;base64,${art.court.toString('base64')}',`,
    `    ball: 'data:image/png;base64,${art.ball.toString('base64')}'`,
    '  };', ''].join(eol);
  return src.slice(0, from) + block + src.slice(to);
}

export function main(log = console.log) {
  const src = fs.readFileSync(ERA_FILE, 'utf8');
  const pal = nesPalette(src);
  const courtInks = [...new Set(pal)].filter((c) => luma(c) < COURT_LUMA_MAX);
  const ballInks = [pal[0x30], pal[0x10], pal[0x00], pal[0x0F]];

  const court = paintOut(quantize(decodePng(fs.readFileSync(path.join(HERE, 'era2-court-raw.png'))), courtInks));
  const ball = shrink(decodePng(fs.readFileSync(path.join(HERE, 'era2-ball-raw2.png'))), BALL_SIZE, ballInks);
  if (!inkCounts(ball)[pal[0x30]]) throw new Error('the shrunk ball has no $30 core; R1 wants one');

  const art = { court: encodePng(court.width, court.height, court.rgba), ball: encodePng(ball.width, ball.height, ball.rgba) };
  fs.writeFileSync(path.join(HERE, 'era2-court.png'), art.court);
  fs.writeFileSync(path.join(HERE, 'era2-ball.png'), art.ball);
  fs.writeFileSync(ERA_FILE, embed(src, art));

  log(`era2-court.png ${court.width}x${court.height}, ${art.court.length} bytes, inks ${JSON.stringify(inkCounts(court))}`);
  log(`era2-ball.png ${ball.width}x${ball.height}, ${art.ball.length} bytes, inks ${JSON.stringify(inkCounts(ball))}`);
  log(`embedded both in ${path.relative(process.cwd(), ERA_FILE)}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = main();
}
