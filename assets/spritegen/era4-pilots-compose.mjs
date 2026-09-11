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

for (const doc of [red, blue]) {
  const res = lint(doc);
  if (res.faults.length) { console.log(res.faults.join('\n')); process.exit(1); }
  const png = encode(buildSheet(doc));
  fs.writeFileSync(path.join(HERE, doc.id + '.png'), png);
  fs.writeFileSync(path.join(ROOT, 'assets', 'pixellab', doc.id + '.png'), png);
  console.log(`${doc.id}: ${res.nums.frames} frames (${res.nums.unique} unique), ${res.nums.colours} colours, ${png.length} bytes`);
}
