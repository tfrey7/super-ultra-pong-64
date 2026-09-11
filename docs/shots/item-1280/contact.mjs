#!/usr/bin/env node
// Item 1280's before-and-after: era 3's two pixellab players (item 1226's
// sheets) beside the two drawn with tools/spritegen.mjs, cropped to the
// sheets, at game scale (3.2, the rig's scale on the 800 x 600 field) and at
// 4x, with the checker's numbers for all four. Written after item 1279's
// contact.mjs. Writes contact.html beside itself; shoot it with
//   py -3.10 "G:/Claude Stuff/fleet-console/scripts/shot.py" "file:///<here>/contact.html" contact.png --selector #sheet
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load, lint, trace, ROOT } from '../../../tools/spritegen.mjs';
import { decode } from '../../../tools/palette-snap.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const pairs = [['era3-p1', 'era3-barbarian', 'left, the player: the barbarian'],
               ['era3-p2', 'era3-knight', 'right, the computer: the knight (the rig mirrors him)']];
const rel = (p) => path.relative(HERE, path.join(ROOT, p)).replace(/\\/g, '/');
const img = (src, w, h, k) => `<img src="${src}" width="${Math.round(w * k)}" height="${Math.round(h * k)}">`;
const numbers = (r) => `faults ${r.faults.length}, ${r.nums.colours} colours, ${r.nums.unique} of ${r.nums.frames} frames different`;

let body = '';
const lines = [];
for (const [old, now, who] of pairs) {
  const doc = load(path.join(ROOT, 'assets/spritegen', `${now}.json`));
  const oldPng = decode(fs.readFileSync(path.join(ROOT, 'assets/pixellab', `${old}.png`)));
  const was = lint(trace(oldPng, { id: old, era: 3, frame: doc.frame, hand: doc.hand, beats: doc.beats }));
  const res = lint(doc);
  const o = rel(`assets/pixellab/${old}.png`), n = rel(`assets/pixellab/${now}.png`);
  const W = 60, H = 150;
  body += `<div class="pair"><div class="who">${who}</div>
<div class="row"><div class="col"><span>OLD pixellab, game scale</span>${img(o, oldPng.width, oldPng.height, 3.2)}</div>
<div class="col"><span>NEW spritegen, game scale</span>${img(n, W, H, 3.2)}</div>
<div class="col"><span>OLD, 4x</span>${img(o, oldPng.width, oldPng.height, 4)}</div>
<div class="col"><span>NEW, 4x</span>${img(n, W, H, 4)}</div></div></div>`;
  lines.push(`${who}: old ${old} -- ${numbers(was)}`);
  lines.push(`${who}: new ${now} -- ${numbers(res)}`);
}
const html = `<!doctype html><meta charset="utf-8"><title>item 1280: era 3 players, old and new</title>
<style>body{background:#16161c;color:#e8e8e0;font:13px Consolas,monospace;margin:0}
#sheet{display:inline-block;padding:14px}h1{font-size:16px;margin:0 0 6px}
.pair{margin:8px 0}.who{color:#f0d070;margin-bottom:4px}.row{display:flex;gap:28px;align-items:flex-end}
.col{display:flex;flex-direction:column;gap:4px}img{image-rendering:pixelated;background:#2a2c34}
.num{white-space:pre;color:#c8e8c8;margin-top:8px}</style>
<div id="sheet"><h1>Era 3 (Genesis) players: pixellab (old) against tools/spritegen.mjs (new). Rows: idle, up, down, swing, miss, win</h1>
${body}<div class="num">${lines.join('\n')}</div></div>`;
fs.writeFileSync(path.join(HERE, 'contact.html'), html);
console.log(lines.join('\n'));
