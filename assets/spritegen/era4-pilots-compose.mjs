#!/usr/bin/env node
/*
 * assets/spritegen/era4-pilots-compose.mjs -- era 4's blue pilot from the red
 * one (item 1281). The red pilot's grid (era4-pilot-red.json) is drawn by hand;
 * the blue pilot is the same grid in its own OBJ palette, the way a Super
 * Nintendo game made player two (F-Zero's machines, Street Fighter II's
 * mirror matches): one sprite, a second 15-colour palette. Blue and yellow,
 * as docs/ART.md's era 4 page dresses the right-hand pilot, with an amber
 * visor so the two read apart at a glance. Then both sheets are built into
 * assets/spritegen/ (the grid's own PNG, which test/spritegen.test.js pins)
 * and into assets/pixellab/, where src/sprites.js looks them up by name.
 *
 *   node assets/spritegen/era4-pilots-compose.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ERAS, load, stringify, buildSheet, lint } from '../../tools/spritegen.mjs';
import { encode } from '../../tools/palette-snap.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const snap = (c) => ERAS[4].snap(c);

const red = load(path.join(HERE, 'era4-pilot-red.json'));
const blue = JSON.parse(JSON.stringify(red));
blue.id = 'era4-pilot-blue';
blue.reference = 'assets/pixellab/era4-players-right.png';
blue.prompt = red.prompt.replace('The Super Nintendo left player', 'The Super Nintendo right player (the red pilot in the second OBJ palette)')
  .replace('round red helmet', 'round blue helmet').replace('red racing suit with a white centre stripe and white knee pads', 'blue racing suit with a yellow centre stripe and yellow knee pads')
  .replace('dark visor band', 'dark amber visor band');
const swap = { r: '#3868f8', R: '#1830a0', w: '#f8d830', g: '#b89010', v: '#402010', h: '#f8a040' };
for (const [k, c] of Object.entries(swap)) blue.palette[k] = snap(c);
fs.writeFileSync(path.join(HERE, 'era4-pilot-blue.json'), stringify(blue));

// The sheets live in assets/pixellab/, so each has a manifest entry there the
// way item 1279's era 2 sheets do: cost 0, derived, and "asking for it again"
// is this script. The date is the pixellab sheet it replaces, because
// tools/pixellab.mjs reads one image's cost off the newest-dated entry.
const MANIFEST = path.join(ROOT, 'assets', 'pixellab', 'manifest.json');
const text = fs.readFileSync(MANIFEST, 'utf8');
const m = JSON.parse(text);
const indent = /\n( +)"/.exec(text)[1].length;
for (const doc of [red, blue]) {
  const res = lint(doc);
  if (res.faults.length) { console.log(res.faults.join('\n')); process.exit(1); }
  const png = encode(buildSheet(doc));
  fs.writeFileSync(path.join(HERE, doc.id + '.png'), png);
  fs.writeFileSync(path.join(ROOT, 'assets', 'pixellab', doc.id + '.png'), png);
  const side = doc.id === red.id ? 'left' : 'right';
  const size = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
  const entry = {
    name: doc.id, file: `${doc.id}.png`, prompt: doc.prompt, size,
    style: { tool: 'tools/spritegen.mjs', era: 4, machine: 'Super Nintendo', frame: doc.frame, hand: doc.hand },
    seed: null, date: m.images.find((e) => e.name === `era4-players-${side}`).date,
    cost: { type: 'derived', generations: 0 },
    derivedFrom: `assets/spritegen/${doc.id}.json`,
    derivedBy: 'node assets/spritegen/era4-pilots-compose.mjs',
    how: 'drawn as a text grid, one letter a SNES pixel (the EarthBound way, not a model); ' +
      (side === 'right' ? 'the red pilot\'s grid in a second OBJ palette; ' : '') +
      'lint PASS on the Super Nintendo rules; six rows (idle, up, down, swing, miss, win) of up to 3 frames of 12 x 42',
    card: 'item 1281',
    verdict: `worn by the ${side === 'left' ? 'player' : 'computer'} on era 4 (src/characters.js, the Super Nintendo block's sheets.${side}), in place of item 1227's era4-players-${side}`,
    pixels: size, bytes: png.length,
    sha256: crypto.createHash('sha256').update(png).digest('hex'),
    endpoint: null,
    request: { description: doc.prompt, seed: null }
  };
  const at = m.images.findIndex((e) => e.name === doc.id);
  if (at >= 0) m.images[at] = entry; else m.images.push(entry);
  console.log(`${doc.id}: ${res.nums.frames} frames (${res.nums.unique} unique), ${res.nums.colours} colours, ${png.length} bytes`);
}
fs.writeFileSync(MANIFEST, JSON.stringify(m, null, indent) + (text.endsWith('\n') ? '\n' : ''));
console.log(`manifest: ${m.images.length} entries`);
