const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  dialog,
  screen,
  powerMonitor,
  nativeImage
} = require('electron');
const path = require('path');
const fs = require('fs');
const { createBreakMediaManager } = require('./break-media-manager');
const { createMediaController } = require('./media-controller');
const { createSettingsStore } = require('./settings-store');
const { evaluateReturn } = require('./timer-policy');

// ---------------------------------------------------------------------------
// Settings persistence (manual JSON store to avoid ESM import issues with electron-store in CJS)
// ---------------------------------------------------------------------------
const settingsPath = path.join(app.getPath('userData'), 'settings.json');
const settingsStore = createSettingsStore(settingsPath);
const loadSettings = () => settingsStore.load();
const saveSettings = settings => settingsStore.save(settings);

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------
function getVideoPath() {
  const settings = loadSettings();
  if (settings.videoPath && fs.existsSync(settings.videoPath)) {
    return settings.videoPath;
  }
  // Bundled default – prefer neko1.webm, fallback to legacy cat.mp4
  const devPath1 = path.join(__dirname, 'src', 'assets', 'neko1.webm');
  if (fs.existsSync(devPath1)) return devPath1;
  const devPath2 = path.join(__dirname, 'src', 'assets', 'cat.mp4');
  if (fs.existsSync(devPath2)) return devPath2;
  const prodPath = path.join(process.resourcesPath, 'assets', 'neko1.webm');
  return fs.existsSync(prodPath) ? prodPath : devPath1;
}

function getSleepVideoPath() {
  // Sleeping cat is always bundled neko2.webm
  const devPath = path.join(__dirname, 'src', 'assets', 'neko2.webm');
  if (fs.existsSync(devPath)) return devPath;
  const prodPath = path.join(process.resourcesPath, 'assets', 'neko2.webm');
  return fs.existsSync(prodPath) ? prodPath : devPath;
}

function getIconPath() {
  const devPath = path.join(__dirname, 'src', 'assets', 'icon1.png');
  if (fs.existsSync(devPath)) return devPath;
  const prodPath = path.join(process.resourcesPath, 'assets', 'icon1.png');
  return fs.existsSync(prodPath) ? prodPath : devPath;
}

function getFallbackImagePath() {
  const devPath = path.join(__dirname, 'src', 'assets', 'cat.png');
  if (fs.existsSync(devPath)) return devPath;
  const prodPath = path.join(process.resourcesPath, 'assets', 'cat.png');
  return fs.existsSync(prodPath) ? prodPath : devPath;
}

function getMeowSoundPath() { // Not exists
  const devPath = path.join(__dirname, 'src', 'assets', 'meow.mp3');
  if (fs.existsSync(devPath)) return devPath;
  const prodPath = path.join(process.resourcesPath, 'assets', 'meow.mp3');
  return fs.existsSync(prodPath) ? prodPath : devPath;
}

// ---------------------------------------------------------------------------
// Global state
// ---------------------------------------------------------------------------
let overlayWindows = [];
let settingsWindow = null;
let tray = null;
let timerInterval = null;
let workSecondsRemaining = 0;
let breakSecondsRemaining = 0;
let breakSecondsTotal = 0;
let isBreakActive = false;
let isPaused = false;
let pauseReason = null; // null | 'manual' | 'idle'
let audioWindow = null;  // persistent hidden window for sound playback
let previousFocusedWindow = null;  // window to restore focus to after break
let snoozeCount = 0;  // tracks snoozes in current break cycle
let lastTickAt = Date.now();  // wall-clock time of the last interval tick
let lastActivityAt = Date.now();  // wall-clock time of the last real user input
const SLEEP_GAP_THRESHOLD_SECONDS = 30;  // tick gap that implies the system slept
const mediaController = createMediaController();
const breakMediaManager = createBreakMediaManager(mediaController);

// ---------------------------------------------------------------------------
// Window factories
// ---------------------------------------------------------------------------
function createOverlayWindows() {
  closeOverlayWindows();
  overlayWindows = [];

  const settings = loadSettings();
  const displays = settings.multiMonitor ? screen.getAllDisplays() : [screen.getPrimaryDisplay()];

  for (const display of displays) {
    const win = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      hasShadow: false,
      transparent: true,
      roundedCorners: false,
      enableLargerThanScreen: true,
      title: 'Cat Gatekeeper',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        focusOnNavigation: false
      }
    });

    // Set highest possible window level
    win.setAlwaysOnTop(true, 'screen-saver');
    // Maximize rather than fullscreen to avoid macOS space switch
    win.maximize();
    win.loadFile(path.join(__dirname, 'src', 'overlay.html'));

    win.on('closed', () => {
      overlayWindows = overlayWindows.filter(w => w !== win);
    });

    overlayWindows.push(win);
  }
}

function closeOverlayWindows() {
  for (const win of overlayWindows) {
    if (!win.isDestroyed()) {
      win.close();
    }
  }
  overlayWindows = [];
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    // Accessory apps need an explicit activation to come frontmost
    if (process.platform === 'darwin') app.focus({ steal: true });
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 520,
    height: 800,
    resizable: false,
    title: 'Cat Gatekeeper Settings',
    autoHideMenuBar: true,
    backgroundColor: '#2c1810',
    show: true,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  settingsWindow.loadFile(path.join(__dirname, 'src', 'settings.html'));

  // Prevent white flash by hiding on close instead of destroying
  settingsWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      settingsWindow.hide();
    }
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// ---------------------------------------------------------------------------
// Timer management
// ---------------------------------------------------------------------------
function startTimer() {
  stopTimer();
  const settings = loadSettings();
  workSecondsRemaining = settings.workInterval * 60;
  isBreakActive = false;
  isPaused = false;
  pauseReason = null;
  broadcastTimerStatus();

  lastTickAt = Date.now();
  lastActivityAt = sampleLastActivity();
  timerInterval = setInterval(() => {
    const now = Date.now();
    const gapSeconds = Math.floor((now - lastTickAt) / 1000);
    lastTickAt = now;

    // Snapshot before refreshing: at a return tick the fresh sample already
    // reflects the new input, but reset decisions need the pre-return value
    const previousActivityAt = lastActivityAt;
    lastActivityAt = sampleLastActivity();

    // Wake detection: setInterval cannot fire while the system sleeps, so a
    // large gap between ticks means we just woke up. Works even when macOS
    // skips powerMonitor's suspend/resume events on lid close.
    if (gapSeconds >= SLEEP_GAP_THRESHOLD_SECONDS) {
      const awaySeconds = Math.floor((now - previousActivityAt) / 1000);
      applyReturnAction(gapSeconds, awaySeconds);
      broadcastTimerStatus();
      return;
    }

    updateIdlePauseState(previousActivityAt);
    if (isPaused) return;

    if (!isBreakActive) {
      workSecondsRemaining--;
      if (workSecondsRemaining <= 0) {
        startBreak();
      }
    } else {
      breakSecondsRemaining--;
      if (breakSecondsRemaining <= 0) {
        endBreak();
      }
    }
    broadcastTimerStatus();
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function startBreak() {
  const settings = loadSettings();
  isBreakActive = true;
  breakSecondsRemaining = settings.breakDuration;
  breakSecondsTotal = settings.breakDuration;
  breakMediaManager.start(settings);

  // Capture the currently focused window so we can restore focus after the break
  previousFocusedWindow = BrowserWindow.getFocusedWindow();

  // Send break-start to settings window
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    try { settingsWindow.webContents.send('break-start', breakSecondsRemaining); } catch (_) { }
  }

  // Show overlay
  createOverlayWindows();

  // Update tray/dock menu for break state
  updateTrayMenu();

  // Play meow sound
  if (settings.soundEnabled) {
    const soundPath = getMeowSoundPath();
    if (fs.existsSync(soundPath)) {
      // Play via a hidden window with an audio element
      playSound(soundPath);
    }
  }
}

function endBreak(wasSnoozed = false) {
  const settings = loadSettings();
  isBreakActive = false;
  // A snoozed break isn't over — keep the count so the limit accumulates
  // across snoozes. Only a completed/dismissed break resets it.
  if (!wasSnoozed) {
    snoozeCount = 0;
  }
  closeOverlayWindows();
  breakMediaManager.finish(settings);

  if (settingsWindow && !settingsWindow.isDestroyed()) {
    try { settingsWindow.webContents.send('break-end'); } catch (_) { }
  }

  workSecondsRemaining = settings.workInterval * 60;
  broadcastTimerStatus();

  // Restore focus to whatever was focused before the break
  if (previousFocusedWindow && !previousFocusedWindow.isDestroyed()) {
    // One of our own windows (e.g. Settings) had focus — restore it directly
    previousFocusedWindow.focus();
  } else if (process.platform === 'darwin') {
    // An external app had focus. Yield activation back to it by hiding the
    // app — macOS re-activates the previously frontmost application.
    const settingsWasVisible = settingsWindow && !settingsWindow.isDestroyed() && settingsWindow.isVisible();
    app.hide();
    // Keep the Settings window on screen without stealing focus back
    if (settingsWasVisible) {
      settingsWindow.showInactive();
    }
  }
  previousFocusedWindow = null;

  // Update tray/dock menu after break ends
  updateTrayMenu();
}

function snoozeBreak() {
  const settings = loadSettings();
  if (snoozeCount >= (settings.maxSnoozeCount || 2)) return;
  snoozeCount++;
  endBreak(true);
  workSecondsRemaining = settings.snoozeDuration;
}

function resetTimer() {
  if (isBreakActive) {
    endBreak();
  }
  stopTimer();
  const settings = loadSettings();
  workSecondsRemaining = settings.workInterval * 60;
  isBreakActive = false;
  isPaused = false;
  pauseReason = null;
  snoozeCount = 0;
  closeOverlayWindows();
  startTimer();
  updateTrayMenu();
  broadcastTimerStatus();
}

function ensureAudioWindow() {
  if (!audioWindow || audioWindow.isDestroyed()) {
    audioWindow = new BrowserWindow({
      width: 0,
      height: 0,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    audioWindow.loadURL(`file://${__dirname}/src/silent.html`);
    audioWindow.on('closed', () => { audioWindow = null; });
  }
  return audioWindow;
}

function playSound(filePath) {
  const win = ensureAudioWindow();
  win.webContents.executeJavaScript(`
    new Audio('file://${filePath.replace(/'/g, "\\'")}').play().catch(() => {});
  `);
}

function broadcastTimerStatus() {
  const settings = loadSettings();
  const data = {
    workSecondsRemaining: Math.max(0, workSecondsRemaining),
    breakSecondsRemaining: Math.max(0, breakSecondsRemaining),
    breakSecondsTotal: breakSecondsTotal,
    isBreakActive,
    isPaused,
    pauseReason,
    snoozeCount,
    maxSnoozeCount: settings.maxSnoozeCount || 2,
    snoozeDuration: settings.snoozeDuration || 300
  };

  for (const win of overlayWindows) {
    if (!win.isDestroyed()) {
      try { win.webContents.send('timer-tick', data); } catch (_) { /* ignore */ }
    }
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    try { settingsWindow.webContents.send('timer-tick', data); } catch (_) { /* ignore */ }
  }

  // Update tray/dock menu to keep menubar timer current
  updateTrayMenu();
}

// ---------------------------------------------------------------------------
// System tray
// ---------------------------------------------------------------------------
function createTray() {
  const iconPath = getIconPath();
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty();

  // On macOS, use a stable guid so the tray icon maintains its position across
  // launches. The guid must be a valid UUID string (Electron 38+).
  // On other platforms, omit the second argument.
  if (process.platform === 'darwin') {
    tray = new Tray(icon, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');
  } else {
    tray = new Tray(icon);
  }
  tray.setToolTip('Cat Gatekeeper');

  updateTrayMenu();
}

function updateTrayMenu() {
  // Guard: tray may not exist yet if called via startTimer -> broadcastTimerStatus before createTray
  if (!tray) return;
  const contextMenu = Menu.buildFromTemplate([
    {
      label: isBreakActive ? 'Break in progress...' : getTimeDisplay(),
      enabled: false
    },
    { type: 'separator' },
    {
      label: isPaused ? 'Resume Timer' : 'Pause Timer',
      click: () => {
        if (isPaused) resumeTimer();
        else pauseTimer();
        updateTrayMenu();
      }
    },
    {
      label: 'Reset Timer',
      click: () => {
        const result = dialog.showMessageBoxSync({
          type: 'question',
          buttons: ['Cancel', 'Reset'],
          defaultId: 0,
          title: 'Reset Timer',
          message: 'Are you sure you want to reset the timer?'
        });
        if (result === 1) {
          resetTimer();
        }
      }
    },
    {
      label: 'Settings',
      click: () => createSettingsWindow()
    },
    {
      label: 'Start on Startup',
      type: 'checkbox',
      checked: loadSettings().startOnStartup,
      click: (menuItem) => {
        const settings = loadSettings();
        settings.startOnStartup = menuItem.checked;
        saveSettings(settings);
        app.setLoginItemSettings({ openAtLogin: menuItem.checked });
        updateTrayMenu();
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        stopTimer();
        app.quit();
      }
    }
  ]);

  // Refresh timer labels right before the menu is shown (so the time is current at click-time)
  contextMenu.on('menu-will-show', () => {
    contextMenu.items[0].label = isBreakActive ? 'Break in progress...' : getTimeDisplay();
    contextMenu.items[2].label = isPaused ? 'Resume Timer' : 'Pause Timer';
    contextMenu.items[3].label = 'Reset Timer';
  });

  tray.setContextMenu(contextMenu);
}

function getTimeDisplay() {
  if (isBreakActive) {
    const m = Math.floor(breakSecondsRemaining / 60);
    const s = breakSecondsRemaining % 60;
    return `Break ends in ${m}:${s.toString().padStart(2, '0')}`;
  }
  if (pauseReason === 'idle') {
    return 'Paused while away';
  }
  if (pauseReason === 'manual') {
    return 'Paused';
  }
  const m = Math.floor(workSecondsRemaining / 60);
  const s = workSecondsRemaining % 60;
  return `Next break in ${m}:${s.toString().padStart(2, '0')}`;
}

function pauseTimer() {
  isPaused = true;
  pauseReason = 'manual';
  updateTrayMenu();
  broadcastTimerStatus();
}

function resumeTimer() {
  isPaused = false;
  pauseReason = null;
  updateTrayMenu();
  broadcastTimerStatus();
}

// Timestamp of the user's last real input. Falls back to "active now" when
// idle detection is unavailable, degrading the wake path to gap-only checks.
function sampleLastActivity() {
  try {
    return Date.now() - powerMonitor.getSystemIdleTime() * 1000;
  } catch (_) {
    return Date.now();
  }
}

// Applies the pure timer-policy decision when the user returns after time
// away (system wake detected by tick gap, or first input after an idle pause)
function applyReturnAction(gapSeconds, awaySeconds) {
  const settings = loadSettings();
  const decision = evaluateReturn({
    gapSeconds,
    awaySeconds,
    isBreakActive,
    breakSecondsRemaining,
    breakDuration: settings.breakDuration
  });

  switch (decision.action) {
    case 'endBreak':
      // Break fully elapsed while away (endBreak resets the work interval)
      endBreak();
      break;
    case 'creditBreak':
      breakSecondsRemaining -= decision.creditSeconds;
      broadcastTimerStatus();
      break;
    case 'resetWork':
      workSecondsRemaining = settings.workInterval * 60;
      broadcastTimerStatus();
      break;
  }
}

function updateIdlePauseState(previousActivityAt) {
  const settings = loadSettings();

  if (!settings.autoPauseOnIdle || isBreakActive) {
    if (pauseReason === 'idle') {
      resumeTimer();
    }
    return;
  }

  let idleSeconds = 0;
  try {
    idleSeconds = powerMonitor.getSystemIdleTime();
  } catch (_) {
    return;
  }

  if (pauseReason === 'idle') {
    if (idleSeconds <= 1) {
      // User returned — the away span runs from their last input before the
      // pause, so idle and sleep time naturally combine into one measure
      const awaySeconds = Math.floor((Date.now() - previousActivityAt) / 1000);
      applyReturnAction(0, awaySeconds);
      resumeTimer();
    }
    return;
  }

  if (!isPaused && idleSeconds >= settings.idlePauseThreshold) {
    isPaused = true;
    pauseReason = 'idle';
    updateTrayMenu();
    broadcastTimerStatus();
  }
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------
function setupIPC() {
  ipcMain.handle('get-settings', () => loadSettings());

  ipcMain.handle('save-settings', (_event, newSettings) => {
    const saved = saveSettings(newSettings);
    // Apply login item settings
    app.setLoginItemSettings({ openAtLogin: saved.startOnStartup });
    // Restart timer with new interval
    if (!isBreakActive) {
      startTimer();
    }
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('settings-changed', saved);
    }
    updateTrayMenu();
    return saved;
  });

  ipcMain.handle('get-timer-status', () => {
    const settings = loadSettings();
    return {
      workSecondsRemaining: Math.max(0, workSecondsRemaining),
      breakSecondsRemaining: Math.max(0, breakSecondsRemaining),
      breakSecondsTotal,
      isBreakActive,
      isPaused,
      pauseReason,
      snoozeCount,
      maxSnoozeCount: settings.maxSnoozeCount || 2,
      snoozeDuration: settings.snoozeDuration || 300
    };
  });

  ipcMain.on('dismiss-break', () => {
    if (isBreakActive) {
      endBreak();
      updateTrayMenu();
    }
  });

  ipcMain.on('snooze-break', () => {
    if (isBreakActive) {
      snoozeBreak();
      updateTrayMenu();
    }
  });

  ipcMain.on('reset-timer', () => {
    resetTimer();
  });

  ipcMain.handle('select-video', async () => { // TODO: WIP
    const result = await dialog.showOpenDialog({
      title: 'Select Cat Video',
      filters: [
        { name: 'Video Files', extensions: ['mp4', 'webm', 'avi', 'mov', 'gif'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('get-resource-path', (_event, resource) => {
    if (resource === 'video' || resource === 'catVideoActive') return getVideoPath();
    if (resource === 'catVideoSleep') return getSleepVideoPath();
    if (resource === 'fallback') return getFallbackImagePath();
    if (resource === 'sound') return getMeowSoundPath();
    return null;
  });

  ipcMain.on('pause-timer', () => {
    pauseTimer();
  });

  ipcMain.on('resume-timer', () => {
    resumeTimer();
  });
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.show();
      settingsWindow.focus();
      // Accessory apps need an explicit activation to come frontmost
      if (process.platform === 'darwin') app.focus({ steal: true });
    } else {
      createSettingsWindow();
    }
  });
}

app.whenReady().then(() => {
  // Run as an accessory app on macOS: no Dock icon, hidden from Cmd+Tab
  if (process.platform === 'darwin') app.dock.hide();

  setupIPC();

  // Apply launch-on-startup setting from persisted settings
  const settings = loadSettings();
  app.setLoginItemSettings({ openAtLogin: settings.startOnStartup });

  startTimer();
  createTray();

  // Show settings on first launch
  createSettingsWindow();
});

app.on('window-all-closed', () => {
  // Keep running in tray — don't quit
});

let isCompletingQuit = false;
app.on('before-quit', (event) => {
  app.isQuitting = true;

  if (isBreakActive && !isCompletingQuit) {
    event.preventDefault();
    const settings = loadSettings();
    isBreakActive = false;
    closeOverlayWindows();
    breakMediaManager.finish(settings).finally(() => {
      isCompletingQuit = true;
      app.quit();
    });
    return;
  }

  stopTimer();
  if (audioWindow && !audioWindow.isDestroyed()) audioWindow.destroy();
});

// Handle close button on settings window -> just hide
app.on('activate', () => {
  if (!settingsWindow || settingsWindow.isDestroyed()) {
    createSettingsWindow();
  }
});
