'use strict';
/*
 * Item 1242: how big each of eras 0 to 4 is, at each stage of the build.
 *
 * For each era it arranges the loop the way the player does (the engine's own
 * lift layers included, the chip's voice limit applied) and counts, at the
 * intensity of each stage (docs/MUSIC.md, "The section plan every era
 * follows"), how many notes and hits one pass of the eight-bar loop plays and
 * how many parts are playing. It also names the chip's voice count, the most
 * the loop ever sounds at once, and how many notes the chip had to drop.
 *
 *   node docs/measure/item1242/layers.js [--out <file.json>]
 *
 * Run once on master (tonight's loops) and once on the branch; the two JSON
 * files beside this script are those two runs.
 */
const path = require('path');
const fs = require('fs');
const M = require(path.join(__dirname, '..', '..', '..', 'src', 'music.js'));

const STAGES = { intro: 0, build: 0.5, climax: 0.8, matchPoint: 1 };

function measure(era) {
  const arr = M.ARRANGEMENTS[era];
  const score = M.arrange(arr, M.THEME, { lift: true });
  const plain = M.arrange(arr);
  const row = { era, name: arr.name, year: arr.year, voices: arr.voices,
                bars: plain.length / M.THEME.steps, peak: M.peakVoices(plain, arr),
                droppedPlain: plain.dropped || 0, droppedWithLift: score.dropped || 0, stages: {} };
  for (const [stage, i] of Object.entries(STAGES)) {
    let notes = 0;
    const parts = new Set();
    score.forEach((list) => list.forEach((e) => {
      if (e.from > i) return;
      notes += 1;
      parts.add(e.part);
    }));
    row.stages[stage] = { intensity: i, notes, parts: parts.size };
  }
  return row;
}

const rows = [0, 1, 2, 3, 4].map(measure);
const outAt = process.argv.indexOf('--out');
if (outAt !== -1) fs.writeFileSync(process.argv[outAt + 1], JSON.stringify(rows, null, 2) + '\n');
for (const r of rows) {
  const s = r.stages;
  console.log(`era ${r.era} ${r.name} (${r.year}): ${r.bars} bars, ${r.voices} voices, peak ${r.peak}, dropped ${r.droppedPlain}/${r.droppedWithLift} (plain/with lift) | ` +
    Object.keys(s).map((k) => `${k} ${s[k].notes} notes ${s[k].parts} parts`).join(' | '));
}
