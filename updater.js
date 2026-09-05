/* ---------------------------------------------------------------------------
   Cat Gatekeeper — In-app auto-updater (electron-updater, GitHub provider)
   - Auto-download in background, prompt restart once downloaded.
   - No-ops in dev (app.isPackaged === false, no app-update.yml present).
   - Feed comes from electron-builder generated app-update.yml; do NOT call
     setFeedURL manually.
   --------------------------------------------------------------------------- */
const { app, BrowserWindow, dialog, ipcMain } = require('electron');

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

function getFocusedOrFirstWindow() {
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && !focused.isDestroyed()) return focused;
  const all = BrowserWindow.getAllWindows().filter(w => !w.isDestroyed());
  return all[0] || null;
}

function promptRestartOnDownloaded(info, isBreakActive) {
  // During an active break the fullscreen overlay sits at screen-saver level;
  // a modal would be hidden behind it. In that case just notify the renderer
  // (Settings shows a "Restart to update" button) and skip the dialog.
  if (typeof isBreakActive === 'function' && isBreakActive()) return;
  const parent = getFocusedOrFirstWindow();
  dialog
    .showMessageBox(parent || undefined, {
      type: 'info',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: `Cat Gatekeeper ${info.version} is downloaded. Restart to install it?`
    })
    .then(({ response }) => {
      if (response === 0) {
        try {
          const { autoUpdater } = require('electron-updater');
          autoUpdater.quitAndInstall(false, true);
        } catch (err) {
          log.error('quitAndInstall failed:', err);
        }
      }
    })
    .catch(err => log.error('update prompt failed:', err));
}

function initUpdater({ isBreakActive, startupDelayMs = 5000 } = {}) {
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
    promptRestartOnDownloaded(info, isBreakActive);
  });

  autoUpdater.on('error', err => {
    lastError = String((err && err.stack) || err);
    log.error('Updater error:', err);
    broadcast('updater-event', { type: 'error', message: String((err && err.message) || err) });
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
      autoUpdater.quitAndInstall(false, true);
    } catch (err) {
      log.error('quitAndInstall failed:', err);
    }
  });

  // Automatic startup check (packaged builds only)
  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch(err => {
        log.error('Startup update check failed:', err);
      });
    }, startupDelayMs);
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

module.exports = { initUpdater, isUpdateDownloaded, getDownloadedVersion };
