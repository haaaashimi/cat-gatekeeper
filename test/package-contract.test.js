const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('production modules are included in packaged app files', () => {
  assert.ok(packageJson.build.files.includes('break-media-manager.js'));
  assert.ok(packageJson.build.files.includes('media-controller.js'));
  assert.ok(packageJson.build.files.includes('settings-store.js'));
  assert.ok(packageJson.build.files.includes('timer-policy.js'));
  assert.ok(packageJson.build.files.includes('updater.js'));
  assert.ok(packageJson.build.files.includes('scripts/windows-media-control.ps1'));
});

test('OTA update pipeline is configured for mac, windows and linux', () => {
  // Runtime deps for in-app updates
  assert.ok(packageJson.dependencies['electron-updater'], 'electron-updater is a runtime dependency');
  assert.ok(packageJson.dependencies['electron-log'], 'electron-log is a runtime dependency');

  // GitHub publish provider feeds electron-updater via app-update.yml
  const publish = Array.isArray(packageJson.build.publish)
    ? packageJson.build.publish[0]
    : packageJson.build.publish;
  assert.equal(publish.provider, 'github');
  assert.equal(publish.owner, 'haaaashimi');
  assert.equal(publish.repo, 'cat-gatekeeper');

  // macOS zip target is required for Squirrel.Mac updates (dmg alone is not enough)
  const macTargets = Array.isArray(packageJson.build.mac.target)
    ? packageJson.build.mac.target
    : [packageJson.build.mac.target];
  assert.ok(macTargets.includes('dmg'));
  assert.ok(macTargets.includes('zip'));

  // Only AppImage supports electron-updater on Linux
  const linuxTargets = Array.isArray(packageJson.build.linux.target)
    ? packageJson.build.linux.target
    : [packageJson.build.linux.target];
  assert.ok(linuxTargets.includes('AppImage'));

  // CI covers all three platforms
  assert.match(packageJson.scripts['dist:linux:ci'], /run-with-retries\.js 3 npm run dist:linux/);

  // Artifact names must be space-free: latest*.yml URLs have to match the
  // uploaded asset names exactly, and spaces get mangled differently by the
  // yml writer (hyphens) and the release uploader (dots) -> 404 on update.
  assert.ok(packageJson.build.artifactName, 'artifactName is set');
  assert.doesNotMatch(packageJson.build.artifactName, / /);
});

test('updater bridge is exposed to the settings UI', () => {
  const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
  for (const api of ['getAppVersion', 'checkForUpdates', 'quitAndInstall', 'onUpdaterEvent']) {
    assert.match(preload, new RegExp(api), `${api} missing from preload bridge`);
  }
  const html = fs.readFileSync(path.join(root, 'src', 'settings.html'), 'utf8');
  assert.match(html, /id="updateIconBtn"/, 'updateIconBtn missing from settings header');
  assert.match(html, /id="updateStatusLine"/, 'updateStatusLine missing from settings header');
  assert.doesNotMatch(html, /id="updateCard"/, 'separate update card should not exist');
  const js = fs.readFileSync(path.join(root, 'src', 'settings.js'), 'utf8');
  assert.match(js, /updateIconBtn/);
  assert.match(js, /quitAndInstall/);
  const updater = fs.readFileSync(path.join(root, 'updater.js'), 'utf8');
  assert.match(updater, /electron-updater/);
  assert.match(updater, /checkForUpdatesAndNotify/);
  assert.match(updater, /quitAndInstall/);
});
test('Windows helper is unpacked for PowerShell execution', () => {
  assert.ok(packageJson.build.asarUnpack.includes('scripts/windows-media-control.ps1'));
});

test('macOS helper, licenses, and corresponding source are packaged', () => {
  const resources = packageJson.build.mac.extraResources;
  assert.ok(resources.some(item => item.to === 'bin/nowplaying-cli'));
  assert.ok(resources.some(item => item.to === 'licenses/nowplaying-cli/LICENSE'));
  assert.ok(resources.some(item => item.to === 'licenses/nowplaying-cli/NOTICE.md'));
  assert.ok(resources.some(item => item.to === 'licenses/nowplaying-cli/source'));
  assert.equal(packageJson.build.mac.binaries.length, 2);
  assert.equal(packageJson.scripts['verify:mac-app'], 'bash scripts/verify-macos-app.sh');
  assert.match(packageJson.scripts['dist:mac:ci'], /run-with-retries\.js 3 npm run dist:mac/);
  assert.match(packageJson.scripts['dist:win:ci'], /run-with-retries\.js 3 npm run dist:win/);
});

test('settings UI exposes both media controls and settings script binds them', () => {
  const html = fs.readFileSync(path.join(root, 'src', 'settings.html'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'src', 'settings.js'), 'utf8');
  for (const id of ['pauseMediaOnBreak', 'autoResumeMediaAfterBreak']) {
    assert.match(html, new RegExp(`id="${id}"`));
    assert.match(js, new RegExp(`getElementById\\('${id}'\\)`));
  }
});

test('bundled macOS helper notice pins revision and source archive exists', () => {
  const notice = fs.readFileSync(path.join(root, 'vendor', 'nowplaying-cli', 'NOTICE.md'), 'utf8');
  assert.match(notice, /8c8c1fa4820681fd4bbd6a17ce0a5655e1f4ebe7/);
  assert.ok(fs.statSync(path.join(
    root,
    'vendor',
    'nowplaying-cli',
    'source',
    'nowplaying-cli-8c8c1fa.tar.gz'
  )).size > 0);
});
