#!/usr/bin/env node
/*
 * tools/pixellab.mjs -- pixel art from pixellab.ai, one image a run, every
 * image reproducible.
 *
 *   node tools/pixellab.mjs balance
 *   node tools/pixellab.mjs gen <name> "<prompt>" [--size 32x32] [--outline ...]
 *        [--shading ...] [--detail ...] [--view ...] [--direction ...]
 *        [--negative "..."] [--guidance 8] [--seed 1234] [--no-background]
 *        [--isometric] [--out assets/pixellab] [--force]
 *
 * The FIRST thing every run does is check the key: it asks pixellab for the
 * account balance and prints it, with the cost of one image as last measured
 * (the newest manifest entry's own bill). A refused key stops the run there,
 * exit code 2, before anything is generated.
 *
 * `gen` then makes one image through POST /v1/generate-image-pixflux (text to
 * image), saves it as <out>/<name>.png, and writes an entry for it into
 * <out>/manifest.json: the prompt, the size, the style, the seed, the exact
 * request body, the date, what it cost and how long it took. A seed is always
 * sent -- a random one if you gave none -- so the manifest holds everything a
 * second run needs to ask for the same picture. An existing name is refused
 * unless --force, which replaces the file and its entry.
 *
 * Node 18+ (the built-in fetch), no dependencies, and nothing in it knows
 * about Pong: another game repo can copy this file as it is.
 *
 * The key is PIXELLAB_API_KEY from the environment; on Windows a process
 * started before the variable was set falls back to reading it from the user
 * hive (HKCU\Environment), the way the Earthbound hack's client did. It only
 * ever leaves this file inside the Authorization header -- never printed,
 * logged or written anywhere.
 *
 * What the API enforces that its schema does not say (measured on the
 * Earthbound hack, docs/artgen/pixellab/README.md there): pixflux wants each
 * side 16..400 AND an area of at least 1024 px (32x32), and an account on a
 * subscription is billed in generations, so a balance of $0.00 credit is not
 * "out of credit" -- the subscription line is the one that counts.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const API = 'https://api.pixellab.ai';
export const GENERATE = '/v1/generate-image-pixflux';
export const BALANCE = '/v2/balance';
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_OUT = path.join(HERE, '..', 'assets', 'pixellab');
export const NAME = /^[a-z0-9][a-z0-9_-]*$/;

export const CHOICES = {
  outline: ['single color black outline', 'single color outline', 'selective outline', 'lineless'],
  shading: ['flat shading', 'basic shading', 'medium shading', 'detailed shading', 'highly detailed shading'],
  detail: ['low detail', 'medium detail', 'highly detailed'],
  direction: ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']
};

const USAGE = `usage:
  node tools/pixellab.mjs balance
  node tools/pixellab.mjs gen <name> "<prompt>" [--size 32x32] [--outline ...] [--shading ...]
       [--detail ...] [--view ...] [--direction ...] [--negative "..."] [--guidance 8]
       [--seed n] [--no-background] [--isometric] [--out <dir>] [--force]`;

/** The key, or '' when there is none. Never printed. */
export function apiKey(env = process.env, platform = process.platform) {
  const k = (env.PIXELLAB_API_KEY || '').trim();
  if (k || platform !== 'win32') return k;
  try {
    const out = execFileSync('reg', ['query', 'HKCU\\Environment', '/v', 'PIXELLAB_API_KEY'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const m = out.match(/PIXELLAB_API_KEY\s+REG_\w+\s+(\S+)/);
    return m ? m[1].trim() : '';
  } catch {
    return '';
  }
}

export function parseArgs(argv) {
  const a = { positional: [], size: '32x32', out: DEFAULT_OUT };
  const valued = new Set(['size', 'outline', 'shading', 'detail', 'view', 'direction',
    'negative', 'guidance', 'seed', 'out']);
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith('--')) { a.positional.push(t); continue; }
    const flag = t.slice(2);
    if (flag === 'help') a.help = true;
    else if (flag === 'force') a.force = true;
    else if (flag === 'no-background') a.noBackground = true;
    else if (flag === 'isometric') a.isometric = true;
    else if (valued.has(flag)) {
      if (i + 1 >= argv.length) throw new Error(`--${flag} needs a value`);
      a[flag] = argv[++i];
    } else throw new Error(`unknown flag --${flag}`);
  }
  [a.command, a.name, a.prompt] = a.positional;
  return a;
}

/** "32x48" -> {width, height}, holding the limits the server really enforces. */
export function parseSize(text) {
  const m = /^(\d+)x(\d+)$/.exec(String(text));
  if (!m) throw new Error(`--size wants WIDTHxHEIGHT, not ${text}`);
  const width = Number(m[1]);
  const height = Number(m[2]);
  if (width < 16 || height < 16 || width > 400 || height > 400) {
    throw new Error(`each side must be 16..400, not ${width}x${height}`);
  }
  if (width * height < 1024) {
    throw new Error(`pixflux refuses an area under 1024 px (32x32); ${width}x${height} is ${width * height}`);
  }
  return { width, height };
}

/** The exact body POSTed to pixflux. Every field it holds is in the manifest. */
export function buildRequest(a, seed) {
  for (const k of Object.keys(CHOICES)) {
    if (a[k] && !CHOICES[k].includes(a[k])) {
      throw new Error(`--${k} must be one of: ${CHOICES[k].join(' | ')}`);
    }
  }
  const body = { description: a.prompt, image_size: parseSize(a.size), seed };
  if (a.negative) body.negative_description = a.negative;
  if (a.guidance !== undefined) body.text_guidance_scale = Number(a.guidance);
  for (const k of ['outline', 'shading', 'detail', 'view', 'direction']) if (a[k]) body[k] = a[k];
  if (a.noBackground) body.no_background = true;
  if (a.isometric) body.isometric = true;
  return body;
}

/** One line for a /v2/balance answer: the credit and the subscription. */
export function describeBalance(b) {
  if (!b) return 'unknown';
  const parts = [];
  if (b.credits) parts.push(`credits $${Number(b.credits.usd || 0).toFixed(2)}`);
  const s = b.subscription;
  if (s) parts.push(`${s.plan || 'subscription'} (${s.status}): ${s.generations} of ${s.total} generations left`);
  if (!parts.length && b.usd !== undefined) parts.push(`$${Number(b.usd).toFixed(2)}`);
  return parts.join('; ') || JSON.stringify(b);
}

/** A usage block ({type, usd, generations}) as words. */
export function describeCost(c) {
  if (!c) return 'unknown';
  const bits = [];
  if (c.generations) bits.push(`${c.generations} generation${c.generations === 1 ? '' : 's'}`);
  if (c.usd) bits.push(`$${Number(c.usd).toFixed(4)}`);
  return bits.join(' + ') || `nothing billed (${c.type || 'no usage block'})`;
}

/** The cost of one image, as the newest manifest entry measured it. */
export function describeCostOfOne(manifest) {
  const last = [...(manifest.images || [])].sort((p, q) => String(p.date).localeCompare(String(q.date))).pop();
  if (!last) return 'not measured yet -- the first generation records it';
  return `${describeCost(last.cost)} (measured on "${last.name}", ${last.date})`;
}

function subscriptionLeft(b) {
  return b && b.subscription && typeof b.subscription.generations === 'number' ? b.subscription.generations : null;
}

/** The manifest entry for one saved image. */
export function manifestEntry({ name, body, png, cost, seconds, date, before, after }) {
  const pixels = pngSize(png);
  const left0 = subscriptionLeft(before);
  const left1 = subscriptionLeft(after);
  return {
    name,
    file: `${name}.png`,
    prompt: body.description,
    size: body.image_size,
    style: Object.fromEntries(['outline', 'shading', 'detail', 'view', 'direction', 'no_background',
      'isometric', 'negative_description', 'text_guidance_scale'].filter((k) => body[k] !== undefined).map((k) => [k, body[k]])),
    seed: body.seed,
    date,
    cost,
    generationsUsed: left0 !== null && left1 !== null ? left0 - left1 : null,
    seconds,
    pixels,
    bytes: png.length,
    sha256: crypto.createHash('sha256').update(png).digest('hex'),
    endpoint: `POST ${GENERATE}`,
    request: body
  };
}

/** Width and height straight out of a PNG's IHDR chunk. */
export function pngSize(buf) {
  const sig = '89504e470d0a1a0a';
  if (buf.length < 24 || buf.subarray(0, 8).toString('hex') !== sig) throw new Error('not a PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

export function readManifest(file) {
  if (!fs.existsSync(file)) {
    return { about: 'Every image tools/pixellab.mjs made, with the request that made it.', images: [] };
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

class KeyRefused extends Error {}

async function call(method, route, key, body) {
  const headers = { Authorization: `Bearer ${key}` };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(API + route, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (res.status === 401 || res.status === 403) throw new KeyRefused(`HTTP ${res.status} from ${route}: ${text.slice(0, 300)}`);
  if (!res.ok) throw new Error(`${method} ${route} -> HTTP ${res.status}: ${text.slice(0, 1000)}`);
  return JSON.parse(text);
}

export async function main(argv, log = console.log, warn = console.error) {
  let a;
  try {
    a = parseArgs(argv);
  } catch (e) {
    warn(`${e.message}\n${USAGE}`);
    return 1;
  }
  if (a.help || !a.command) { log(USAGE); return a.help ? 0 : 1; }
  if (!['balance', 'gen'].includes(a.command)) { warn(`unknown command ${a.command}\n${USAGE}`); return 1; }

  const manifestPath = path.join(a.out, 'manifest.json');
  const manifest = readManifest(manifestPath);
  const key = apiKey();
  if (!key) { warn('KEY REFUSED: PIXELLAB_API_KEY is not set'); return 2; }

  let before;
  try {
    before = await call('GET', BALANCE, key);
  } catch (e) {
    warn(e instanceof KeyRefused ? `KEY REFUSED: ${e.message}` : `balance check failed: ${e.message}`);
    return e instanceof KeyRefused ? 2 : 1;
  }
  log('key: accepted');
  log(`balance: ${describeBalance(before)}`);
  log(`cost of one image: ${describeCostOfOne(manifest)}`);
  if (a.command === 'balance') return 0;

  let body;
  try {
    if (!a.name || !NAME.test(a.name)) throw new Error(`a name is lower-case letters, digits, - and _ (got ${a.name})`);
    if (!a.prompt) throw new Error('gen needs a prompt');
    const seed = a.seed !== undefined ? Number(a.seed) : crypto.randomInt(1, 2 ** 31 - 1);
    if (!Number.isInteger(seed)) throw new Error(`--seed must be a whole number, not ${a.seed}`);
    body = buildRequest(a, seed);
  } catch (e) {
    warn(`${e.message}\n${USAGE}`);
    return 1;
  }
  const pngPath = path.join(a.out, `${a.name}.png`);
  if (fs.existsSync(pngPath) && !a.force) {
    warn(`${pngPath} already exists; pick another name or pass --force to replace it and its entry`);
    return 1;
  }

  const t0 = Date.now();
  let out;
  try {
    out = await call('POST', GENERATE, key, body);
  } catch (e) {
    warn(e instanceof KeyRefused ? `KEY REFUSED: ${e.message}` : `generation failed: ${e.message}`);
    return e instanceof KeyRefused ? 2 : 1;
  }
  const seconds = Math.round((Date.now() - t0) / 100) / 10;
  const png = Buffer.from(out.image.base64, 'base64');
  fs.mkdirSync(a.out, { recursive: true });
  fs.writeFileSync(pngPath, png);

  let after = null;
  try { after = await call('GET', BALANCE, key); } catch { /* the image is saved; the cross-check is optional */ }
  const entry = manifestEntry({
    name: a.name, body, png, cost: out.usage || null, seconds,
    date: new Date().toISOString(), before, after
  });
  manifest.images = (manifest.images || []).filter((e) => e.name !== a.name).concat([entry]);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  log(`saved: ${pngPath} (${entry.pixels.width}x${entry.pixels.height}, ${entry.bytes} bytes, seed ${body.seed}, ${seconds} s)`);
  log(`this image cost: ${describeCost(entry.cost)}` +
    (entry.generationsUsed !== null ? `; the subscription moved by ${entry.generationsUsed}` : ''));
  if (after) log(`balance now: ${describeBalance(after)}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
