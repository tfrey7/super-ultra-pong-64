/*
 * Item 1264: what fills the longest task on the page's main thread in a trace
 * written by pace.mjs --trace-rung N (a *.trace.json.gz beside this file).
 *
 *   node docs/measure/item1264/analyse-trace.mjs <file.trace.json.gz> [--top 40]
 *
 * Prints the longest few main-thread tasks, and for the longest one every event
 * inside it on that thread, longest first, with the script location a
 * FunctionCall names -- plus what the GPU process's main thread was doing
 * during it (shader compiles and the like).
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const file = process.argv[2];
const TOP = Number(process.argv.includes('--top') ? process.argv[process.argv.indexOf('--top') + 1] : 40);
const { traceEvents: ev } = JSON.parse(gunzipSync(readFileSync(file)).toString());

const names = new Map();   // "pid:tid" -> thread name
for (const e of ev) if (e.ph === 'M' && e.name === 'thread_name') names.set(`${e.pid}:${e.tid}`, e.args.name);
const procs = new Map();
for (const e of ev) if (e.ph === 'M' && e.name === 'process_name') procs.set(e.pid, e.args.name);

const mains = [...names.entries()].filter(([, n]) => n === 'CrRendererMain').map(([k]) => k);
const tasks = ev.filter((e) => e.ph === 'X' && mains.includes(`${e.pid}:${e.tid}`) &&
  (e.name === 'ThreadControllerImpl::RunTask' || e.name === 'RunTask') && e.dur);
tasks.sort((a, b) => b.dur - a.dur);
console.log('longest main-thread tasks (ms): ' + tasks.slice(0, 8).map((t) => (t.dur / 1000).toFixed(1)).join(', '));
const worst = tasks[0];
if (!worst) { console.log('no main-thread task found'); process.exit(1); }
const key = `${worst.pid}:${worst.tid}`;
const t0 = worst.ts, t1 = worst.ts + worst.dur;
const inside = ev.filter((e) => e.ph === 'X' && `${e.pid}:${e.tid}` === key && e.ts >= t0 && e.ts + (e.dur || 0) <= t1 && e !== worst);
inside.sort((a, b) => (b.dur || 0) - (a.dur || 0));
console.log(`\nthe longest task: ${(worst.dur / 1000).toFixed(1)} ms; inside it, longest first:`);
const label = (e) => {
  const d = e.args && e.args.data;
  let where = '';
  if (d && (d.functionName || d.url)) where = ` ${d.functionName || '(anonymous)'} ${String(d.url || '').split('/').pop()}:${(d.lineNumber || 0) + 1}`;
  return `${e.name}${where}`;
};
const seen = new Map();
for (const e of inside) {
  const l = label(e);
  const r = seen.get(l) || { ms: 0, n: 0, max: 0 };
  r.ms += (e.dur || 0) / 1000; r.n++; r.max = Math.max(r.max, (e.dur || 0) / 1000);
  seen.set(l, r);
}
const rows = [...seen.entries()].sort((a, b) => b[1].max - a[1].max).slice(0, TOP);
for (const [l, r] of rows) console.log(`  max ${r.max.toFixed(1).padStart(7)} ms  total ${r.ms.toFixed(1).padStart(7)} ms  x${String(r.n).padEnd(4)} ${l}`);

// --cut <out.trace.json.gz>: the trace cut to 150 ms either side of that task
// (metadata kept), small enough to commit; it opens as-is in DevTools.
if (process.argv.includes('--cut')) {
  const out = process.argv[process.argv.indexOf('--cut') + 1];
  const lo = t0 - 150000, hi = t1 + 150000;
  const kept = ev.filter((e) => e.ph === 'M' || (e.ts >= lo && e.ts <= hi) || (e.ph === 'X' && e.ts < hi && e.ts + (e.dur || 0) > lo));
  const { writeFileSync } = await import('node:fs');
  const { gzipSync } = await import('node:zlib');
  writeFileSync(out, gzipSync(JSON.stringify({ traceEvents: kept })));
  console.log(`\ncut ${kept.length} of ${ev.length} events to ${out}`);
}

// The GPU process during the same window.
const gpuMain = [...names.entries()].filter(([k, n]) => n === 'CrGpuMain' || (procs.get(Number(k.split(':')[0])) === 'GPU Process' && /Main|Viz/.test(n)));
console.log('\nGPU process threads during that task:');
for (const [k, n] of gpuMain) {
  const g = ev.filter((e) => e.ph === 'X' && `${e.pid}:${e.tid}` === k && e.ts < t1 && e.ts + (e.dur || 0) > t0);
  const agg = new Map();
  for (const e of g) { const r = agg.get(e.name) || { ms: 0, n: 0 }; r.ms += (e.dur || 0) / 1000; r.n++; agg.set(e.name, r); }
  const top = [...agg.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 12);
  console.log(`  ${n}: ` + top.map(([nm, r]) => `${nm} ${r.ms.toFixed(1)} ms x${r.n}`).join('; '));
}
