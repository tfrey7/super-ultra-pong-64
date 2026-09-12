/*
 * Item 1285: what fills each long GPU flush in a trace written by pace.mjs
 * --trace-rung N --skia (a *.trace.json.gz beside this file).
 *
 *   node docs/measure/item1285/flushes.mjs <file.trace.json.gz> [--over 20] [--min 0.3]
 *
 * For every task on the GPU process's main thread longer than --over ms, prints
 * each op Skia executed inside it, in order, with its time and the shader
 * compiles under it -- and any event args Skia attached (the program's key or
 * name, when --skia recorded one). item1264/analyse-trace.mjs names only the
 * longest chain; this names everything, so a flush of five different programs
 * is not read as one.
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const file = process.argv[2];
const arg = (n, d) => { const i = process.argv.indexOf(n); return i !== -1 ? Number(process.argv[i + 1]) : d; };
const OVER = arg('--over', 20), MIN = arg('--min', 0.3);
const { traceEvents: ev } = JSON.parse(gunzipSync(readFileSync(file)).toString());

const names = new Map();
for (const e of ev) if (e.ph === 'M' && e.name === 'thread_name') names.set(`${e.pid}:${e.tid}`, e.args.name);
const gpuMain = [...names.entries()].filter(([, n]) => n === 'CrGpuMain').map(([k]) => k);
const onGpu = ev.filter((e) => e.ph === 'X' && gpuMain.includes(`${e.pid}:${e.tid}`) && e.dur !== undefined);
const tasks = onGpu.filter((e) => (e.name === 'ThreadControllerImpl::RunTask' || e.name === 'RunTask') && e.dur > OVER * 1000)
  .sort((a, b) => a.ts - b.ts);
const t0 = tasks.length ? tasks[0].ts : 0;
const isOp = (n) => /Op$|Op::|OpsTask|RenderTask|shader_compile|Program|Pipeline|compile|link/i.test(n);
for (const t of tasks) {
  console.log(`\nGPU task ${(t.dur / 1000).toFixed(1)} ms at +${((t.ts - t0) / 1000).toFixed(0)} ms`);
  const inside = onGpu.filter((e) => e !== t && e.pid === t.pid && e.tid === t.tid && e.ts >= t.ts && e.ts + e.dur <= t.ts + t.dur)
    .sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  // Ops and their compiles: an op's line counts the compiles that fall inside it.
  const ops = inside.filter((e) => /Op$/.test(e.name) && e.dur >= MIN * 1000);
  const compiles = inside.filter((e) => /shader_compile|CompileShader|LinkProgram|compile/i.test(e.name));
  const opTotals = new Map();
  for (const o of ops) {
    const cs = compiles.filter((c) => c.ts >= o.ts && c.ts + c.dur <= o.ts + o.dur);
    const cms = cs.reduce((s, c) => s + c.dur, 0) / 1000;
    const a = o.args && Object.keys(o.args).length ? ' ' + JSON.stringify(o.args).slice(0, 160) : '';
    console.log(`  ${(o.dur / 1000).toFixed(1).padStart(6)} ms  ${o.name}  compiles ${cs.length} (${cms.toFixed(1)} ms)${a}`);
    const k = opTotals.get(o.name) || { n: 0, ms: 0, cms: 0, compiles: 0 };
    k.n++; k.ms += o.dur / 1000; k.cms += cms; k.compiles += cs.length; opTotals.set(o.name, k);
  }
  console.log('  by op: ' + [...opTotals.entries()].sort((a, b) => b[1].ms - a[1].ms)
    .map(([n, k]) => `${n} x${k.n} ${k.ms.toFixed(1)} ms (${k.compiles} compiles ${k.cms.toFixed(1)} ms)`).join('; '));
  const top = new Map();
  for (const e of inside) { const k = top.get(e.name) || 0; top.set(e.name, k + e.dur / 1000); }
  console.log('  heaviest names: ' + [...top.entries()].filter(([n]) => !/RunTask|Flush|flush|Scheduler|GPUTask|RendererMain|PutChanged|ExecuteDeferred/.test(n))
    .sort((a, b) => b[1] - a[1]).slice(0, 12).map(([n, ms]) => `${n} ${ms.toFixed(1)}`).join('; '));
}
if (!tasks.length) console.log(`no GPU main-thread task over ${OVER} ms`);
