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
  assert.ok(packageJson.build.files.includes('scripts/windows-media-control.ps1'));
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
