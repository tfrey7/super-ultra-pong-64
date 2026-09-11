// Item 1264: every pace-*.json beside this file in one line per pass, from the repo root:
//   node docs/measure/item1264/summary.cjs
// climb  era:maxFrameMs/r<ringMaxFrameMs>  -- the ring figure is the arrival itself
//        (ring and name card), taken on every run except pace-before-1
// fresh  era:maxFrameMs
const fs = require('fs');
const p = 'docs/measure/item1264/';
const files = fs.readdirSync(p).filter((f) => /^pace-(before|after|merged)-\d\.json$/.test(f)).sort();
for (const f of files) {
  const d = JSON.parse(fs.readFileSync(p + f));
  const c = d.climb.map((x) => `${x.era}:${x.maxFrameMs}${x.ringMaxFrameMs !== undefined ? '/r' + x.ringMaxFrameMs : ''}`).join(' ');
  const fr = d.fresh.map((x) => `${x.era}:${x.maxFrameMs}`).join(' ');
  const over = [...d.climb.flatMap((x) => [x.maxFrameMs, x.ringMaxFrameMs || 0]), ...d.fresh.map((x) => x.maxFrameMs)].filter((v) => v > 100);
  console.log(f, 'climb', c);
  console.log(f, 'fresh', fr);
  console.log(f, 'frames over 100 ms:', JSON.stringify(over));
}
