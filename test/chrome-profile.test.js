// tools/chrome.mjs: every Chrome a script starts gets a profile folder that is
// deleted when it ends -- on its own, on close(), on an uncaught error and on
// Ctrl+C (item 1169). Node itself stands in for Chrome here: `node -e <code> --`
// ignores the --user-data-dir flag the helper appends, so no browser is needed.
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const HELPER = pathToFileURL(path.join(__dirname, '..', 'tools', 'chrome.mjs')).href;
const load = () => import(HELPER);
const fakeChrome = (code) => ['-e', code, '--'];

test('the profile is a fresh folder, and goes when the browser ends on its own', async () => {
  const { launchChrome } = await load();
  const a = launchChrome(process.execPath, fakeChrome('setTimeout(() => {}, 50)'), { name: 'test' });
  const b = launchChrome(process.execPath, fakeChrome('setTimeout(() => {}, 50)'), { name: 'test' });
  assert.notStrictEqual(a.profile, b.profile, 'two launches share a profile');
  assert.ok(fs.existsSync(a.profile), 'the profile folder was not made');
  assert.match(path.basename(a.profile), /^pong-chrome-test-/);
  assert.strictEqual(await a.exited, true);
  assert.strictEqual(await b.exited, true);
  assert.ok(!fs.existsSync(a.profile) && !fs.existsSync(b.profile), 'a profile folder was left behind');
});

test('close() stops a browser that would run on, and deletes its folder', async () => {
  const { launchChrome } = await load();
  const c = launchChrome(process.execPath, fakeChrome('setInterval(() => {}, 1000)'), { name: 'test' });
  fs.writeFileSync(path.join(c.profile, 'Local State'), 'held'); // something inside, as Chrome leaves
  assert.strictEqual(await c.close(), true);
  assert.ok(!fs.existsSync(c.profile));
});

test('a flag that brings its own --user-data-dir is refused', async () => {
  const { launchChrome } = await load();
  assert.throws(() => launchChrome(process.execPath, ['--user-data-dir=G:/claude-tmp/x']), /user-data-dir/);
});

// A script that starts a browser that would run for a minute, prints its folder, then ends as `how` says.
function runScript(how) {
  const code = `import { launchChrome } from ${JSON.stringify(HELPER)};
    const c = launchChrome(process.execPath, ['-e', 'setInterval(() => {}, 1000)', '--'], { name: 'test' });
    console.log(c.profile);
    setTimeout(() => { ${how} }, 200);`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout: 20000 });
  return { status: r.status, profile: r.stdout.trim().split(/\r?\n/)[0], stderr: r.stderr };
}

test('Ctrl+C: the SIGINT handler stops the browser, deletes the folder and exits 130', () => {
  const r = runScript("process.emit('SIGINT')");
  assert.strictEqual(r.status, 130, r.stderr);
  assert.ok(r.profile && !fs.existsSync(r.profile), `profile left: ${r.profile}`);
});

test('an uncaught error still deletes the folder', () => {
  const r = runScript("throw new Error('boom')");
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /boom/);
  assert.ok(r.profile && !fs.existsSync(r.profile), `profile left: ${r.profile}`);
});

test('process.exit() from inside a script still deletes the folder', () => {
  const r = runScript('process.exit(0)');
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(r.profile && !fs.existsSync(r.profile), `profile left: ${r.profile}`);
});
