#!/usr/bin/env node
/*
 * assets/pixellab/tex3d-embed.mjs -- the 3D eras' texture tiles, embedded.
 *
 *   node assets/pixellab/tex3d-embed.mjs
 *
 * Reads every tex3d-*.png beside this file (made by tools/pixellab.mjs on item
 * 1187; prompts, seeds and requests in manifest.json) and writes
 * src/textures3d.js, which hands them to the page as data: URIs under
 * window.PongTextures3D.TILES, keyed by the name without its tex3d- prefix
 * ('court-grain', 'court-metal', 'paddle', 'ball', 'trim').
 *
 * Embedded rather than loaded off disk for the reason era 2's art is: a page
 * opened from file:// counts a file image as another origin and it taints the
 * canvas, so the playtest's getImageData read of the frame would throw; a
 * data: image does not (docs/WORKER-BOOTSTRAP.md, the pixellab trap).
 *
 * No pixel work here or in the game: src/table3d.js mirrors each tile 2 x 2
 * with four drawImage calls to make it seamless, and draws it from then on as
 * a pattern or strip by strip. Node 18+, no dependencies.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const OUT = path.join(HERE, '..', '..', 'src', 'textures3d.js');

export function tiles(dir = HERE) {
  return fs.readdirSync(dir).filter((f) => /^tex3d-[a-z0-9-]+\.png$/.test(f)).sort()
    .map((f) => ({ key: f.slice(6, -4), file: f, uri: 'data:image/png;base64,' + fs.readFileSync(path.join(dir, f)).toString('base64') }));
}

export function source(list) {
  const rows = list.map((t) => `    '${t.key}': '${t.uri}'`).join(',\n');
  return `/*
 * Super Ultra Pong 64: Remastered -- the 3D eras' texture tiles (item 1187).
 *
 * WRITTEN BY assets/pixellab/tex3d-embed.mjs from the tex3d-*.png tiles
 * pixellab.ai made (prompts and seeds in assets/pixellab/manifest.json); do
 * not edit by hand, re-run that script. Data: URIs so a page opened off disk
 * keeps its canvas readable. src/table3d.js is the only reader.
 */
(function (root) {
  'use strict';
  var TILES = {
${rows}
  };
  var api = { TILES: TILES };
  root.PongTextures3D = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;
}

const list = tiles();
fs.writeFileSync(OUT, source(list));
console.log(`wrote ${OUT}: ${list.map((t) => `${t.key} (${t.uri.length} chars)`).join(', ')}`);
