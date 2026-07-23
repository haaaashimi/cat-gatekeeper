const fs = require('fs');

const DEFAULT_SETTINGS = {
  version: 7,
  workInterval: 30,
  breakDuration: 300,
  snoozeDuration: 300,
  maxSnoozeCount: 2,
  autoPauseOnIdle: true,
  idlePauseThreshold: 180,
  pauseMediaOnBreak: true,
  autoResumeMediaAfterBreak: false,
  soundEnabled: false,
  multiMonitor: true,
  videoPath: '',
  chromaKeyEnabled: false,
  chromaKeyColor: '#00FF00',
  startOnStartup: false
};

function createSettingsStore(settingsPath, environment = process.env, logger = console) {
  function write(settings) {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  }

  function migrateSettings(oldData, currentSettings) {
    const version = oldData.version || 1;

    if (version < 2) {
      logger.log('Applying HSE guideline defaults (v1 → v2)');
      currentSettings.workInterval = DEFAULT_SETTINGS.workInterval;
      currentSettings.breakDuration = DEFAULT_SETTINGS.breakDuration;
    }
    if (version < 3) {
      logger.log('Adding snooze duration default (v2 → v3)');
      currentSettings.snoozeDuration = DEFAULT_SETTINGS.snoozeDuration;
    }
    if (version < 4) {
      logger.log('Adding automatic idle pause defaults (v3 → v4)');
      currentSettings.autoPauseOnIdle = DEFAULT_SETTINGS.autoPauseOnIdle;
      currentSettings.idlePauseThreshold = DEFAULT_SETTINGS.idlePauseThreshold;
    }
    if (version < 5) {
      logger.log('Adding break media control defaults (v4 → v5)');
      currentSettings.pauseMediaOnBreak = DEFAULT_SETTINGS.pauseMediaOnBreak;
      currentSettings.autoResumeMediaAfterBreak = DEFAULT_SETTINGS.autoResumeMediaAfterBreak;
    }
    if (version < 6) {
      logger.log('Adding snooze limit and 30-min default (v5 → v6)');
      currentSettings.maxSnoozeCount = DEFAULT_SETTINGS.maxSnoozeCount;
      // Existing users keep their workInterval; only new installs get 30 min
      if (!oldData.workInterval || oldData.workInterval === 50) {
        currentSettings.workInterval = DEFAULT_SETTINGS.workInterval;
      }
    }

    if (version < 7) {
      logger.log('Adding start on startup default (v6 → v7)');
      currentSettings.startOnStartup = DEFAULT_SETTINGS.startOnStartup;
    }

    currentSettings.version = DEFAULT_SETTINGS.version;
    write(currentSettings);
    return currentSettings;
  }

  function load() {
    let settings;
    try {
      if (fs.existsSync(settingsPath)) {
        const data = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        settings = { ...DEFAULT_SETTINGS, ...data };
        if (!data.version || data.version < DEFAULT_SETTINGS.version) {
          logger.log(`Migrating settings from v${data.version || 1} to v${DEFAULT_SETTINGS.version}`);
          settings = migrateSettings(data, settings);
        }
      } else {
        settings = { ...DEFAULT_SETTINGS };
      }
    } catch (_) {
      settings = { ...DEFAULT_SETTINGS };
    }

    if (environment.WORK_INTERVAL) {
      settings.workInterval = parseInt(environment.WORK_INTERVAL, 10);
    }
    if (environment.BREAK_DURATION) {
      settings.breakDuration = parseInt(environment.BREAK_DURATION, 10);
    }
    return settings;
  }

  function save(settings) {
    const merged = { ...load(), ...settings };
    write(merged);
    return merged;
  }

  return { load, save };
}

module.exports = {
  DEFAULT_SETTINGS,
  createSettingsStore
};
