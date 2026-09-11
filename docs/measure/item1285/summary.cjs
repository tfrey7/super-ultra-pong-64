// Item 1285: every climb beside this file in one line per pass, from the repo root:
//   node docs/measure/item1285/summary.cjs
// ring  era:ringMaxFrameMs -- the arrival itself (ring and name card), era 1 is the first ring
// long  ring frames over 50 ms, with the second into the ring they fell at
// before = master fc17b35; after = this branch at edaa527-63206b8 (every flourish warmed at nine\n// moments of its ring); final = the finishing commit (two earlier moments added, and the warm\n// state's eraChangedAt -1); early-raws = one climb to era 6 on the final code;
// ab-* = before, with one thing switched off by --pre (see each file's "pre")
const fs = require('fs');
const p = 'docs/measure/item1285/';
const files = fs.readdirSync(p).filter((f) => /^pace-(before|after|final|merged|master95ae|early-raws|ab-.*)(-\d)?\.json$/.test(f)).sort();
for (const f of files) {
  const d = JSON.parse(fs.readFileSync(p + f));
  const rows = d.climb.filter((x) => x.ringMaxFrameMs !== undefined);
  console.log(f.padEnd(28), 'ring', rows.map((x) => `${x.era}:${x.ringMaxFrameMs}`).join(' '));
  const long = rows.filter((x) => x.ringLongFrames && x.ringLongFrames.length)
    .map((x) => `${x.era}@` + x.ringLongFrames.map((l) => `${l.ms}ms/${l.at}s`).join(','));
  if (long.length) console.log(''.padEnd(28), 'long', long.join('  '));
}
