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
let idlePauseStartedAt = null;
let audioWindow = null;  // persistent hidden window for sound playback
let previousFocusedWindow = null;  // window to restore focus to after break
let snoozeCount = 0;  // tracks snoozes in current break cycle
let suspendStartedAt = null;  // timestamp when system suspended
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
  idlePauseStartedAt = null;
  broadcastTimerStatus();

  timerInterval = setInterval(() => {
    updateIdlePauseState();
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
  snoozeCount = 0;
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

function endBreak() {
  const settings = loadSettings();
  isBreakActive = false;
  closeOverlayWindows();
  breakMediaManager.finish(settings);

  if (settingsWindow && !settingsWindow.isDestroyed()) {
    try { settingsWindow.webContents.send('break-end'); } catch (_) { }
  }

  workSecondsRemaining = settings.workInterval * 60;
  broadcastTimerStatus();

  // Restore focus to the window that was focused before the break
  if (previousFocusedWindow && !previousFocusedWindow.isDestroyed()) {
    previousFocusedWindow.focus();
  }
  previousFocusedWindow = null;

  // Update tray/dock menu after break ends
  updateTrayMenu();
}

function snoozeBreak() {
  const settings = loadSettings();
  if (snoozeCount >= (settings.maxSnoozeCount || 2)) return;
  snoozeCount++;
  endBreak();
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
  idlePauseStartedAt = null;
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
    maxSnoozeCount: settings.maxSnoozeCount || 2
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

  // macOS: also set the dock menu (right-click on taskbar/dock icon)
  if (process.platform === 'darwin') {
    app.dock.setMenu(contextMenu);
  }
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
  idlePauseStartedAt = null;
  updateTrayMenu();
  broadcastTimerStatus();
}

function updateIdlePauseState() {
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
      const idlePauseSeconds = idlePauseStartedAt
        ? Math.floor((Date.now() - idlePauseStartedAt) / 1000)
        : 0;

      if (idlePauseSeconds >= settings.breakDuration) {
        workSecondsRemaining = settings.workInterval * 60;
      }
      resumeTimer();
    }
    return;
  }

  if (!isPaused && idleSeconds >= settings.idlePauseThreshold) {
    isPaused = true;
    pauseReason = 'idle';
    idlePauseStartedAt = Date.now();
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

  ipcMain.handle('get-timer-status', () => ({
    workSecondsRemaining: Math.max(0, workSecondsRemaining),
    breakSecondsRemaining: Math.max(0, breakSecondsRemaining),
    breakSecondsTotal,
    isBreakActive,
    isPaused,
    pauseReason,
    snoozeCount,
    maxSnoozeCount: loadSettings().maxSnoozeCount || 2
  }));

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
    } else {
      createSettingsWindow();
    }
  });
}

app.whenReady().then(() => {
  setupIPC();
  startTimer();
  createTray();

  // Show settings on first launch
  createSettingsWindow();

  // Handle system sleep/suspend (lid close, sleep mode)
  powerMonitor.on('suspend', () => {
    suspendStartedAt = Date.now();
  });

  powerMonitor.on('resume', () => {
    if (suspendStartedAt === null) return;
    const sleepDurationMs = Date.now() - suspendStartedAt;
    const sleepDurationSec = Math.floor(sleepDurationMs / 1000);
    suspendStartedAt = null;
    const settings = loadSettings();

    if (isBreakActive) {
      // If a break was active during sleep, end it
      endBreak();
    }

    // If the system was asleep for longer than the break/away duration, reset the work timer
    if (sleepDurationSec >= settings.breakDuration) {
      workSecondsRemaining = settings.workInterval * 60;
      broadcastTimerStatus();
    }
  });
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
