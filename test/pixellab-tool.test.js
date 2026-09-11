'use strict';
/*
 * tools/pixellab.mjs, offline: everything but the two HTTP calls. Nothing here
 * reaches pixellab.ai or spends a generation.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const tool = () => import(pathToFileURL(path.join(ROOT, 'tools', 'pixellab.mjs')).href);

test('importing the tool runs nothing; the key comes from the environment and is trimmed', async () => {
  const t = await tool();
  assert.strictEqual(typeof t.main, 'function');
  assert.strictEqual(t.apiKey({ PIXELLAB_API_KEY: '  abc  ' }, 'linux'), 'abc');
  assert.strictEqual(t.apiKey({}, 'linux'), '', 'no key and no Windows hive to fall back on');
});

test('sizes hold the limits the server really enforces, not the ones its schema says', async () => {
  const t = await tool();
  assert.deepStrictEqual(t.parseSize('32x48'), { width: 32, height: 48 });
  assert.throws(() => t.parseSize('24x36'), /area under 1024/);
  assert.throws(() => t.parseSize('8x400'), /16\.\.400/);
  assert.throws(() => t.parseSize('big'), /WIDTHxHEIGHT/);
});

test('the request carries the prompt, the size, the style and the seed', async () => {
  const t = await tool();
  const a = t.parseArgs(['gen', 'paddle', 'a paddle', '--size', '32x64', '--shading', 'flat shading',
    '--no-background', '--guidance', '6']);
  assert.strictEqual(a.command, 'gen');
  const body = t.buildRequest(a, 42);
  assert.deepStrictEqual(body, {
    description: 'a paddle', image_size: { width: 32, height: 64 }, seed: 42,
    text_guidance_scale: 6, shading: 'flat shading', no_background: true
  });
  assert.throws(() => t.buildRequest(t.parseArgs(['gen', 'x', 'y', '--outline', 'thick']), 1), /--outline must be one of/);
  assert.throws(() => t.parseArgs(['gen', '--wat']), /unknown flag/);
});

test('balance and cost read as words, the cost of one image off the newest manifest entry', async () => {
  const t = await tool();
  const v2 = { credits: { type: 'usd', usd: 0 },
    subscription: { type: 'generations', status: 'active', plan: 'Tier 3', generations: 9953, total: 10000 } };
  assert.strictEqual(t.describeBalance(v2), 'credits $0.00; Tier 3 (active): 9953 of 10000 generations left');
  assert.strictEqual(t.describeCost({ type: 'generations', generations: 1 }), '1 generation');
  assert.strictEqual(t.describeCost({ type: 'usd', usd: 0.0125 }), '$0.0125');
  assert.match(t.describeCostOfOne({ images: [] }), /not measured yet/);
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'pixellab', 'manifest.json'), 'utf8'));
  // Whichever real generation is newest (item 1178 added era art after the
  // first test ball, and every era card after it adds more): its own bill.
  const m = /^1 generation \(measured on "([a-z0-9_-]+)"/.exec(t.describeCostOfOne(manifest));
  assert.ok(m, t.describeCostOfOne(manifest));
  const named = manifest.images.find((e) => e.name === m[1]);
  assert.ok(named && named.cost.generations === 1, `${m[1]} is an entry that was billed one generation`);
});

test('a manifest entry records prompt, size, style, date, cost and the exact request', async () => {
  const t = await tool();
  const png = fs.readFileSync(path.join(ROOT, 'assets', 'pixellab', 'test-ball.png'));
  const body = t.buildRequest(t.parseArgs(['gen', 'b', 'a ball', '--detail', 'low detail']), 7);
  const before = { subscription: { generations: 10 } };
  const after = { subscription: { generations: 9 } };
  const e = t.manifestEntry({ name: 'b', body, png, cost: { type: 'generations', generations: 1 },
    seconds: 3.2, date: '2026-09-10T00:00:00.000Z', before, after });
  assert.strictEqual(e.prompt, 'a ball');
  assert.deepStrictEqual(e.size, { width: 32, height: 32 });
  assert.deepStrictEqual(e.style, { detail: 'low detail' });
  assert.strictEqual(e.seed, 7);
  assert.strictEqual(e.generationsUsed, 1);
  assert.deepStrictEqual(e.pixels, { width: 32, height: 32 });
  assert.deepStrictEqual(e.request, body);
  assert.throws(() => t.pngSize(Buffer.from('not a png at all, not even close')), /not a PNG/);
});

test('the API base moves only onto this machine, so a stray variable cannot carry the key away', async () => {
  const t = await tool();
  assert.strictEqual(t.apiBase({}), 'https://api.pixellab.ai');
  assert.strictEqual(t.apiBase({ PIXELLAB_API_BASE: 'http://127.0.0.1:5123/' }), 'http://127.0.0.1:5123');
  assert.strictEqual(t.apiBase({ PIXELLAB_API_BASE: 'http://localhost:80' }), 'http://localhost:80');
  assert.strictEqual(t.apiBase({ PIXELLAB_API_BASE: 'https://evil.example.com' }), 'https://api.pixellab.ai');
  assert.strictEqual(t.apiBase({ PIXELLAB_API_BASE: 'http://127.0.0.1.evil.example.com' }), 'https://api.pixellab.ai');
});

// Item 1250: three era 8 generations run at once each read the manifest at
// start and wrote it at the end, and only the last entry survived. Here three
// real `gen` processes run against a stand-in API that answers all three
// generations at the same instant, into one folder that already holds an entry.
test('three gens at once into one folder keep all three manifest entries, and the one already there', async () => {
  const http = require('node:http');
  const os = require('node:os');
  const { spawn } = require('node:child_process');
  const png = fs.readFileSync(path.join(ROOT, 'assets', 'pixellab', 'test-ball.png'));
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pixellab-1250-'));
  const names = ['era8-suit-left', 'era8-suit-right', 'era8-arena'];
  const waiting = [];
  let left = 9000;
  let release = null;
  const released = new Promise((resolve) => { release = resolve; });
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      assert.strictEqual(req.headers.authorization, 'Bearer stub-key');
      const send = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (req.method === 'GET' && req.url === '/v2/balance') {
        send({ subscription: { status: 'active', plan: 'stub', generations: left, total: 10000 } });
      } else if (req.method === 'POST' && req.url === '/v1/generate-image-pixflux') {
        waiting.push(JSON.parse(body).description);
        if (waiting.length === names.length) release();
        // A safety net if a gen never arrives; unref'd, so it never holds the suite open.
        await Promise.race([released, new Promise((r) => setTimeout(r, 15000).unref())]);
        left -= 1;
        send({ image: { base64: png.toString('base64') }, usage: { type: 'generations', generations: 1 } });
      } else {
        res.writeHead(404); res.end('{}');
      }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const before = { about: 'seeded', images: [{ name: 'already-here', file: 'already-here.png', date: '2026-09-10T00:00:00.000Z' }] };
  fs.writeFileSync(path.join(out, 'manifest.json'), `${JSON.stringify(before, null, 2)}\n`);
  const gen = (name, i) => new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'tools', 'pixellab.mjs'), 'gen', name,
      `prompt for ${name}`, '--seed', String(100 + i), '--out', out],
    { env: { ...process.env, PIXELLAB_API_KEY: 'stub-key', PIXELLAB_API_BASE: base }, stdio: ['ignore', 'pipe', 'pipe'] });
    let text = '';
    child.stdout.on('data', (c) => { text += c; });
    child.stderr.on('data', (c) => { text += c; });
    child.on('close', (code) => resolve({ name, code, text }));
  });
  try {
    const runs = await Promise.all(names.map(gen));
    for (const r of runs) assert.strictEqual(r.code, 0, `${r.name} exited ${r.code}:\n${r.text}`);
    assert.strictEqual(waiting.length, 3, 'all three generations were in flight together');
    const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8'));
    assert.deepStrictEqual(manifest.images.map((e) => e.name).sort(), ['already-here', ...names].sort());
    for (const [i, name] of names.entries()) {
      const e = manifest.images.find((x) => x.name === name);
      assert.strictEqual(e.seed, 100 + i);
      assert.strictEqual(e.prompt, `prompt for ${name}`);
      assert.ok(fs.existsSync(path.join(out, `${name}.png`)), `${name}.png saved`);
    }
    assert.strictEqual(manifest.about, 'seeded', 'the rest of the manifest is kept too');
    assert.deepStrictEqual(fs.readdirSync(out).filter((f) => /\.(lock|tmp)$/.test(f)), [], 'no lock or temp file left behind');
  } finally {
    server.close();
    fs.rmSync(out, { recursive: true, force: true });
  }
});
