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
  assert.match(t.describeCostOfOne(manifest), /^1 generation \(measured on "test-ball"/);
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
