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

// ---------------------------------------------------------------------------
// Settings persistence (manual JSON store to avoid ESM import issues with electron-store in CJS)
// ---------------------------------------------------------------------------
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

const DEFAULT_SETTINGS = {
  version: 4,  // Increment when defaults change to trigger migration
  workInterval: 50,  // minutes (HSE: 5-10 min break per hour)
  breakDuration: 300, // seconds (5 minutes - HSE guideline)
  snoozeDuration: 300, // seconds (5 minutes default)
  autoPauseOnIdle: true,
  idlePauseThreshold: 180, // seconds (3 minutes)
  soundEnabled: false,
  multiMonitor: true,
  videoPath: '',           // empty = use bundled default
  chromaKeyEnabled: false,
  chromaKeyColor: '#00FF00'  // green screen default
};

function loadSettings() {
  let settings;
  try {
    if (fs.existsSync(settingsPath)) {
      const data = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      settings = { ...DEFAULT_SETTINGS, ...data };

      // Migrate old settings to new defaults if version is outdated
      if (!data.version || data.version < DEFAULT_SETTINGS.version) {
        console.log(`Migrating settings from v${data.version || 1} to v${DEFAULT_SETTINGS.version}`);
        settings = migrateSettings(data, settings);
      }
    } else {
      settings = { ...DEFAULT_SETTINGS };
    }
  } catch (_) { /* ignore corrupt file */
    settings = { ...DEFAULT_SETTINGS };
  }

  // Environment variables always take precedence (for dev/testing)
  if (process.env.WORK_INTERVAL) {
    settings.workInterval = parseInt(process.env.WORK_INTERVAL, 10);
  }
  if (process.env.BREAK_DURATION) {
    settings.breakDuration = parseInt(process.env.BREAK_DURATION, 10);
  }

  return settings;
}

function migrateSettings(oldData, currentSettings) {
  const version = oldData.version || 1;

  // Migration from v1 to v2: Update to HSE guidelines
  if (version < 2) {
    console.log('Applying HSE guideline defaults (v1 → v2)');
    currentSettings.workInterval = DEFAULT_SETTINGS.workInterval;
    currentSettings.breakDuration = DEFAULT_SETTINGS.breakDuration;
  }

  // Migration from v2 to v3: Add snooze duration
  if (version < 3) {
    console.log('Adding snooze duration default (v2 → v3)');
    currentSettings.snoozeDuration = DEFAULT_SETTINGS.snoozeDuration;
  }

  // Migration from v3 to v4: Add automatic idle pause
  if (version < 4) {
    console.log('Adding automatic idle pause defaults (v3 → v4)');
    currentSettings.autoPauseOnIdle = DEFAULT_SETTINGS.autoPauseOnIdle;
    currentSettings.idlePauseThreshold = DEFAULT_SETTINGS.idlePauseThreshold;
  }

  // Update version to latest
  currentSettings.version = DEFAULT_SETTINGS.version;

  // Save migrated settings
  saveSettings(currentSettings);

  return currentSettings;
}

function saveSettings(settings) {
  const merged = { ...loadSettings(), ...settings };
  fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}

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
    height: 720,
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
  breakSecondsRemaining = settings.breakDuration;
  breakSecondsTotal = settings.breakDuration;

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
  isBreakActive = false;
  closeOverlayWindows();

  if (settingsWindow && !settingsWindow.isDestroyed()) {
    try { settingsWindow.webContents.send('break-end'); } catch (_) { }
  }

  const settings = loadSettings();
  workSecondsRemaining = settings.workInterval * 60;
  broadcastTimerStatus();

  // Update tray/dock menu after break ends
  updateTrayMenu();
}

function snoozeBreak() {
  const settings = loadSettings();
  endBreak();
  workSecondsRemaining = settings.snoozeDuration;
}

function resetTimer() {
  stopTimer();
  const settings = loadSettings();
  workSecondsRemaining = settings.workInterval * 60;
  isBreakActive = false;
  isPaused = false;
  pauseReason = null;
  idlePauseStartedAt = null;
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
  const data = {
    workSecondsRemaining: Math.max(0, workSecondsRemaining),
    breakSecondsRemaining: Math.max(0, breakSecondsRemaining),
    breakSecondsTotal: breakSecondsTotal,
    isBreakActive,
    isPaused,
    pauseReason
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
        resetTimer();
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
    pauseReason
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
});

app.on('window-all-closed', () => {
  // Keep running in tray — don't quit
});

app.on('before-quit', () => {
  app.isQuitting = true;
  stopTimer();
  if (audioWindow && !audioWindow.isDestroyed()) audioWindow.destroy();
});

// Handle close button on settings window -> just hide
app.on('activate', () => {
  if (!settingsWindow || settingsWindow.isDestroyed()) {
    createSettingsWindow();
  }
});
