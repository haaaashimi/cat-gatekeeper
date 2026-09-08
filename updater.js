/* ---------------------------------------------------------------------------
   Cat Gatekeeper — In-app auto-updater (electron-updater, GitHub provider)
   - Auto-download in background; header icon + tray reflect state.
   - No native notifications or modal dialogs: silent checkForUpdates() only
     (never the Notify variant), installs are always silent.
   - No-ops in dev (app.isPackaged === false, no app-update.yml present).
   - Feed comes from electron-builder generated app-update.yml; do NOT call
     setFeedURL manually.
   --------------------------------------------------------------------------- */
const { app, BrowserWindow, ipcMain } = require('electron');

// Silent install everywhere: no prompts, relaunch the updated app.
function quitAndInstallSilent() {
  const { autoUpdater } = require('electron-updater');
  autoUpdater.quitAndInstall(true, true);
}

let initialized = false;
let updateDownloadedInfo = null;
let lastError = null;
let log = console;

function broadcast(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      try {
        win.webContents.send(channel, payload);
      } catch (_) {
        // ignore closed/destroyed windows
      }
    }
  }
}

function initUpdater({ startupDelayMs = 5000, checkIntervalMs = 4 * 60 * 60 * 1000, retryDelayMs = 10 * 60 * 1000 } = {}) {
  if (initialized) return { alreadyInitialized: true };
  initialized = true;

  try {
    log = require('electron-log');
    log.transports.file.level = 'info';
  } catch (_) {
    log = console;
  }

  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (err) {
    log.error('electron-updater not available:', err);
    return { disabled: true };
  }

  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on('checking-for-update', () => {
    broadcast('updater-event', { type: 'checking' });
  });

  autoUpdater.on('update-available', info => {
    updateDownloadedInfo = null;
    log.info(`Update available: ${info.version}`);
    broadcast('updater-event', { type: 'available', version: info.version });
  });

  autoUpdater.on('update-not-available', info => {
    log.info(`Up to date: ${info.version}`);
    broadcast('updater-event', { type: 'not-available', version: info.version });
  });

  autoUpdater.on('download-progress', progress => {
    broadcast('updater-event', {
      type: 'progress',
      percent: Math.round(progress.percent || 0),
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond
    });
  });

  autoUpdater.on('update-downloaded', info => {
    updateDownloadedInfo = { version: info.version };
    log.info(`Update downloaded: ${info.version}`);
    broadcast('updater-event', { type: 'downloaded', version: info.version });
  });

  let retryTimer = null;
  const doCheck = () => {
    if (!app.isPackaged) return;
    autoUpdater.checkForUpdates().catch(err => {
      log.error('Update check failed:', err);
    });
  };

  autoUpdater.on('error', err => {
    lastError = String((err && err.stack) || err);
    log.error('Updater error:', err);
    broadcast('updater-event', { type: 'error', message: String((err && err.message) || err) });
    // A failed check (e.g. no network on cold boot) must not stay failed
    // until the next relaunch: retry once after a delay; the interval below
    // covers everything after that.
    if (app.isPackaged && retryTimer === null) {
      retryTimer = setTimeout(() => {
        retryTimer = null;
        doCheck();
      }, retryDelayMs);
    }
  });

  // Renderer IPC (registered once; setupIPC in main.js owns the rest)
  ipcMain.handle('get-app-version', () => app.getVersion());

  ipcMain.handle('get-updater-state', () => ({
    downloadedVersion: updateDownloadedInfo ? updateDownloadedInfo.version : null,
    lastError,
    packaged: app.isPackaged
  }));

  ipcMain.handle('check-for-updates', async () => {
    if (!app.isPackaged) return { status: 'skipped-dev' };
    try {
      const result = await autoUpdater.checkForUpdates();
      return { status: 'checked', version: result ? result.updateInfo.version : app.getVersion() };
    } catch (err) {
      log.error('Manual update check failed:', err);
      return { status: 'error', message: String((err && err.message) || err) };
    }
  });

  ipcMain.on('quit-and-install', () => {
    try {
      quitAndInstallSilent();
    } catch (err) {
      log.error('quitAndInstall failed:', err);
    }
  });

  // Automatic checks (packaged builds only): once shortly after startup,
  // then on an interval so a failed first check recovers by itself.
  // Deliberately the silent checkForUpdates() here — the OS-level
  // "update available" notification is suppressed in favour
  // of our own header icon + tray state.
  if (app.isPackaged) {
    setTimeout(doCheck, startupDelayMs);
    setInterval(doCheck, checkIntervalMs);
  } else {
    log.info('Updater idle in dev (app not packaged).');
  }

  return { initialized: true };
}

function isUpdateDownloaded() {
  return updateDownloadedInfo !== null;
}

function getDownloadedVersion() {
  return updateDownloadedInfo ? updateDownloadedInfo.version : null;
}

module.exports = { initUpdater, isUpdateDownloaded, getDownloadedVersion, quitAndInstallSilent };
