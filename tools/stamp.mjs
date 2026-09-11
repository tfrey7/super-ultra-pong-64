#!/usr/bin/env node
/*
 * Rewrite the version stamp (item 1276): src/version.js, the one checked-in
 * file the title screen's "NOW WITH: ... · <sha>" line reads.
 *
 *   node tools/stamp.mjs --item 1276 --title "Title screen: a Now with line" --sha 032d429
 *
 * The date is filled in here (UTC, YYYY-MM-DD); a long sha is cut to seven
 * characters. --out <path> writes somewhere else (the test does, so it never
 * touches the checked-in stamp). The fleet console's landing step runs this
 * through fleet.json's "stamp" entry and commits the result; the page never
 * computes a version at play time and never fetches one.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const val = argv[i + 1];
    if (val === undefined || val.startsWith('--')) throw new Error('stamp: --' + key + ' needs a value');
    out[key] = val;
    i++;
  }
  return out;
}

function fail(msg) {
  process.stderr.write('stamp: ' + msg + '\n');
  process.exit(2);
}

let opt;
try { opt = args(process.argv.slice(2)); } catch (e) { fail(e.message.replace(/^stamp: /, '')); }

const item = String(opt.item || '').trim();
const title = String(opt.title || '').replace(/\s+/g, ' ').trim();
const sha = String(opt.sha || '').trim().toLowerCase().slice(0, 7);
if (!item) fail('--item <id> is required');
if (!title) fail('--title "<title>" is required');
if (!/^[0-9a-f]{4,7}$/.test(sha)) fail('--sha must be a git sha (hex), got "' + (opt.sha || '') + '"');

const stamp = { feature: title, item: item, sha: sha, date: new Date().toISOString().slice(0, 10) };
const out = opt.out ? path.resolve(opt.out) : path.join(here, '..', 'src', 'version.js');

const body = [
  '/*',
  ' * The version stamp (item 1276): what the title screen\'s "NOW WITH" line shows,',
  ' * so a glance at the site says which build it is serving. Written by',
  ' * tools/stamp.mjs at each landing -- edit it with that, not by hand.',
  ' */',
  '(function (root) {',
  '  \'use strict\';',
  '  root.PongVersion = ' + JSON.stringify(stamp, null, 2).replace(/\n/g, '\n  ') + ';',
  '  if (typeof module === \'object\' && module.exports) module.exports = root.PongVersion;',
  '})(typeof globalThis !== \'undefined\' ? globalThis : this);',
  ''
].join('\n');

writeFileSync(out, body);
process.stdout.write('stamp: ' + path.relative(process.cwd(), out) + ' -> ' + JSON.stringify(stamp) + '\n');
