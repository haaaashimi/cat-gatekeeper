const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { DEFAULT_SETTINGS, createSettingsStore } = require('../settings-store');

function tempSettingsPath(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cat-settings-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return path.join(directory, 'settings.json');
}

test('new installs receive media control defaults', (t) => {
  const store = createSettingsStore(tempSettingsPath(t), {});
  const settings = store.load();
  assert.equal(settings.pauseMediaOnBreak, true);
  assert.equal(settings.autoResumeMediaAfterBreak, false);
  assert.equal(settings.maxSnoozeCount, 2);
  assert.equal(settings.workInterval, 30);
  assert.equal(settings.version, 8);
  assert.equal(settings.startOnStartup, false);
});

test('v4 settings migrate and persist media control defaults', (t) => {
  const settingsPath = tempSettingsPath(t);
  fs.writeFileSync(settingsPath, JSON.stringify({
    version: 4,
    workInterval: 25,
    pauseMediaOnBreak: false
  }));
  const logs = [];
  const store = createSettingsStore(settingsPath, {}, { log: message => logs.push(message) });

  const settings = store.load();
  assert.equal(settings.version, 8);
  assert.equal(settings.startOnStartup, false);
  assert.equal(settings.workInterval, 25);
  assert.equal(settings.pauseMediaOnBreak, true);
  assert.equal(settings.autoResumeMediaAfterBreak, false);
  assert.equal(settings.maxSnoozeCount, 2);
  assert.deepEqual(JSON.parse(fs.readFileSync(settingsPath, 'utf8')), settings);
  assert.ok(logs.some(message => message.includes('v4 → v5')));
  assert.ok(logs.some(message => message.includes('v5 → v6')));
  assert.ok(logs.some(message => message.includes('v6 → v7')));
});

test('v7 settings snap half-minute durations to whole minutes', (t) => {
  const settingsPath = tempSettingsPath(t);
  fs.writeFileSync(settingsPath, JSON.stringify({
    version: 7,
    breakDuration: 270,
    snoozeDuration: 90
  }));
  const logs = [];
  const store = createSettingsStore(settingsPath, {}, { log: message => logs.push(message) });

  const settings = store.load();
  assert.equal(settings.version, 8);
  assert.equal(settings.breakDuration, 300);
  assert.equal(settings.snoozeDuration, 120);
  assert.ok(logs.some(message => message.includes('v7 → v8')));

  const persisted = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  assert.equal(persisted.breakDuration, 300);
  assert.equal(persisted.snoozeDuration, 120);
});

test('v7 settings with whole-minute durations are preserved', (t) => {
  const settingsPath = tempSettingsPath(t);
  fs.writeFileSync(settingsPath, JSON.stringify({
    version: 7,
    breakDuration: 420,
    snoozeDuration: 180
  }));
  const store = createSettingsStore(settingsPath, {});

  const settings = store.load();
  assert.equal(settings.breakDuration, 420);
  assert.equal(settings.snoozeDuration, 180);
});

test('v7 settings with invalid or sub-minute durations fall back safely', (t) => {
  const settingsPath = tempSettingsPath(t);
  fs.writeFileSync(settingsPath, JSON.stringify({
    version: 7,
    breakDuration: 30,
    snoozeDuration: 'abc'
  }));
  const store = createSettingsStore(settingsPath, {});

  const settings = store.load();
  assert.equal(settings.breakDuration, 60);
  assert.equal(settings.snoozeDuration, DEFAULT_SETTINGS.snoozeDuration);
});

test('saving media settings preserves unrelated settings', (t) => {
  const settingsPath = tempSettingsPath(t);
  const store = createSettingsStore(settingsPath, {});
  store.save({ workInterval: 20, videoPath: '/tmp/cat.webm' });

  const saved = store.save({
    pauseMediaOnBreak: false,
    autoResumeMediaAfterBreak: true
  });
  assert.equal(saved.workInterval, 20);
  assert.equal(saved.videoPath, '/tmp/cat.webm');
  assert.equal(saved.pauseMediaOnBreak, false);
  assert.equal(saved.autoResumeMediaAfterBreak, true);
});

test('corrupt settings safely fall back to defaults', (t) => {
  const settingsPath = tempSettingsPath(t);
  fs.writeFileSync(settingsPath, '{broken json');
  const settings = createSettingsStore(settingsPath, {}).load();
  assert.deepEqual(settings, DEFAULT_SETTINGS);
});

test('environment overrides take precedence when settings are saved', (t) => {
  const settingsPath = tempSettingsPath(t);
  const store = createSettingsStore(settingsPath, {
    WORK_INTERVAL: '2',
    BREAK_DURATION: '15'
  });
  const settings = store.save({ pauseMediaOnBreak: false });

  assert.equal(settings.workInterval, 2);
  assert.equal(settings.breakDuration, 15);
  const persisted = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  assert.equal(persisted.workInterval, 2);
  assert.equal(persisted.breakDuration, 15);
});
