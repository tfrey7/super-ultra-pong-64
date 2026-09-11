#!/usr/bin/env node
// Item 1279: era 2's two spritegen sheets live in assets/pixellab/ because that
// is where the sprite loader looks, so each gets a manifest entry there the way
// the other derived sheets do (cost 0, derivedFrom, derivedBy). "Asking for it
// again" is rebuilding it from its grid. Re-run after a rebuild: it rewrites
// the two entries' bytes and hashes and leaves every other entry alone.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILE = path.join(ROOT, 'assets/pixellab/manifest.json');
const text = fs.readFileSync(FILE, 'utf8');
const m = JSON.parse(text);
const indent = /\n( +)"/.exec(text)[1].length;
for (const id of ['era2-boy', 'era2-rival']) {
  const grid = JSON.parse(fs.readFileSync(path.join(ROOT, `assets/spritegen/${id}.json`), 'utf8'));
  const buf = fs.readFileSync(path.join(ROOT, `assets/pixellab/${id}.png`));
  const size = { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  const entry = {
    name: id, file: `${id}.png`, prompt: grid.prompt, size,
    style: { tool: 'tools/spritegen.mjs', era: 2, machine: 'NES', frame: grid.frame, hand: grid.hand },
    // the date of the sheet it replaces, as the other derived entries carry their source's:
    // tools/pixellab.mjs reads the cost of one image off the newest-dated entry, which must
    // stay a real generation
    seed: null, date: m.images.find((e) => e.name === `era2-sheet-${id === 'era2-boy' ? 'left' : 'right'}`).date,
    cost: { type: 'derived', generations: 0 },
    derivedFrom: `assets/spritegen/${id}.json`,
    derivedBy: `node assets/spritegen/era2-players-compose.mjs && node tools/spritegen.mjs build assets/spritegen/${id}.json --out assets/pixellab/${id}.png`,
    how: 'drawn as a text grid, one letter a pixel, from head, torso, hips and legs parts (the EarthBound way, not a model); lint PASS inside the NES line budget; six rows (idle, up, down, swing, miss, win) of 3 frames of 10 x 44',
    card: 'item 1279',
    verdict: `worn by the ${id === 'era2-boy' ? 'player' : 'computer'} on era 2 (src/characters.js, the NES block's sheets.${id === 'era2-boy' ? 'left' : 'right'}), in place of item 1225's era2-sheet-${id === 'era2-boy' ? 'left' : 'right'}`,
    pixels: size, bytes: buf.length,
    sha256: crypto.createHash('sha256').update(buf).digest('hex'),
    endpoint: null,
    request: { description: grid.prompt, seed: null }
  };
  const at = m.images.findIndex((e) => e.name === id);
  if (at >= 0) m.images[at] = entry; else m.images.push(entry);
}
fs.writeFileSync(FILE, JSON.stringify(m, null, indent) + (text.endsWith('\n') ? '\n' : ''));
console.log(`manifest: ${m.images.length} entries`);
