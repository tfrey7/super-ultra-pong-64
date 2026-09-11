#!/usr/bin/env node
// Item 1280: era 3's two spritegen sheets live in assets/pixellab/ because that
// is where the sprite loader looks, so each gets a manifest entry there the way
// the other derived sheets do (cost 0, derivedFrom, derivedBy) -- item 1279's
// era2-players-manifest.mjs, for the Genesis. "Asking for it again" is
// rebuilding it from its grid. Re-run after a rebuild: it rewrites the two
// entries' bytes and hashes and leaves every other entry alone.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILE = path.join(ROOT, 'assets/pixellab/manifest.json');
const text = fs.readFileSync(FILE, 'utf8');
const m = JSON.parse(text);
const indent = /\n( +)"/.exec(text)[1].length;
const SIDES = { 'era3-barbarian': ['era3-p1', 'player', 'left'], 'era3-knight': ['era3-p2', 'computer', 'right'] };
for (const [id, [old, who, side]] of Object.entries(SIDES)) {
  const grid = JSON.parse(fs.readFileSync(path.join(ROOT, `assets/spritegen/${id}.json`), 'utf8'));
  const buf = fs.readFileSync(path.join(ROOT, `assets/pixellab/${id}.png`));
  const size = { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  const entry = {
    name: id, file: `${id}.png`, prompt: grid.prompt, size,
    style: { tool: 'tools/spritegen.mjs', era: 3, machine: 'Sega Genesis', frame: grid.frame, hand: grid.hand },
    // the date of the sheet it replaces, as the other derived entries carry their source's:
    // tools/pixellab.mjs reads the cost of one image off the newest-dated entry, which must
    // stay a real generation
    seed: null, date: m.images.find((e) => e.name === old).date,
    cost: { type: 'derived', generations: 0 },
    derivedFrom: `assets/spritegen/${id}.json`,
    derivedBy: `node assets/spritegen/era3-players-compose.mjs && node tools/spritegen.mjs build assets/spritegen/${id}.json --out assets/pixellab/${id}.png`,
    how: 'drawn as a text grid, one letter a pixel, from head, torso, shield, arm and leg parts posed per frame (the EarthBound way, not a model); lint PASS on the 3-bit grid, 15 colours at most; six rows (idle, up, down, swing, miss, win) of 3 frames of 20 x 25',
    card: 'item 1280',
    verdict: `worn by the ${who} on era 3 (src/characters.js, the Genesis block's sheets.${side}), in place of item 1226's ${old}`,
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
