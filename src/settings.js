/* ---------------------------------------------------------------------------
   Cat Gatekeeper — Settings Script
   --------------------------------------------------------------------------- */
(function () {
  'use strict';

  // DOM refs
  const workIntervalInput = document.getElementById('workInterval');
  const workIntervalValue = document.getElementById('workIntervalValue');
  const breakDurationInput = document.getElementById('breakDuration');
  const breakDurationValue = document.getElementById('breakDurationValue');
  const snoozeDurationInput = document.getElementById('snoozeDuration');
  const snoozeDurationValue = document.getElementById('snoozeDurationValue');
  const autoPauseOnIdleInput = document.getElementById('autoPauseOnIdle');
  const idlePauseThresholdInput = document.getElementById('idlePauseThreshold');
  const idlePauseThresholdValue = document.getElementById('idlePauseThresholdValue');
  const idlePauseThresholdRow = document.getElementById('idlePauseThresholdRow');
  const pauseMediaOnBreakInput = document.getElementById('pauseMediaOnBreak');
  const autoResumeMediaAfterBreakInput = document.getElementById('autoResumeMediaAfterBreak');
  const autoResumeMediaAfterBreakRow = document.getElementById('autoResumeMediaAfterBreakRow');
  const soundEnabledInput = document.getElementById('soundEnabled');
  const multiMonitorInput = document.getElementById('multiMonitor');
  const selectVideoBtn = document.getElementById('selectVideoBtn');
  const videoFileName = document.getElementById('videoFileName');
  const saveBtn = document.getElementById('saveBtn');
  const saveFeedback = document.getElementById('saveFeedback');
  const statusValue = document.getElementById('statusValue');
  const pauseBtn = document.getElementById('pauseBtn');
  const resetTimerBtn = document.getElementById('resetTimerBtn');
  const chromaKeyEnabledInput = document.getElementById('chromaKeyEnabled');
  const chromaKeyColorInput = document.getElementById('chromaKeyColor');
  const chromaKeyColorValue = document.getElementById('chromaKeyColorValue');
  const maxSnoozeCountInput = document.getElementById('maxSnoozeCount');
  const maxSnoozeCountValue = document.getElementById('maxSnoozeCountValue');
  const maxSnoozeWarning = document.getElementById('maxSnoozeWarning');
  const startOnStartupInput = document.getElementById('startOnStartup');
  const updateIconBtn = document.getElementById('updateIconBtn');
  const updateStatusLine = document.getElementById('updateStatusLine');

  let currentSettings = {};
  let selectedVideoPath = null;
  let isPaused = false;
  let cleanup = [];
  let hasChanges = false;

  // -----------------------------------------------------------------------
  // Load settings into UI
  // -----------------------------------------------------------------------
  async function loadSettings() {
    try {
      const settings = await window.catAPI.getSettings();
      currentSettings = { ...settings };
      selectedVideoPath = settings.videoPath || null;

      workIntervalInput.value = settings.workInterval;
      workIntervalValue.textContent = `${settings.workInterval} min`;

      breakDurationInput.value = settings.breakDuration;
      breakDurationValue.textContent = `${Math.round(settings.breakDuration / 60)} min`;

      snoozeDurationInput.value = settings.snoozeDuration || 300;
      snoozeDurationValue.textContent = `${Math.round((settings.snoozeDuration || 300) / 60)} min`;

      autoPauseOnIdleInput.checked = settings.autoPauseOnIdle !== false;
      idlePauseThresholdInput.value = settings.idlePauseThreshold || 300;
      idlePauseThresholdValue.textContent = `${Math.round((settings.idlePauseThreshold || 300) / 60)} min`;
      idlePauseThresholdRow.style.opacity = settings.autoPauseOnIdle !== false ? '1' : '0.35';

      pauseMediaOnBreakInput.checked = settings.pauseMediaOnBreak !== false;
      autoResumeMediaAfterBreakInput.checked = settings.autoResumeMediaAfterBreak === true;
      updateMediaSettingsState();

      soundEnabledInput.checked = settings.soundEnabled;
      multiMonitorInput.checked = settings.multiMonitor;
      startOnStartupInput.checked = settings.startOnStartup;

      maxSnoozeCountInput.value = settings.maxSnoozeCount || 2;
      maxSnoozeCountValue.textContent = settings.maxSnoozeCount || 2;
      updateSnoozeWarning();

      // WIP controls (disabled in UI) — load values so they pass through on save
      chromaKeyEnabledInput.checked = settings.chromaKeyEnabled !== false;
      const keyColor = settings.chromaKeyColor || '#00FF00';
      chromaKeyColorInput.value = keyColor.toLowerCase();
      chromaKeyColorValue.textContent = keyColor.toUpperCase();

      if (settings.videoPath) {
        videoFileName.textContent = settings.videoPath.split(/[/\\]/).pop();
      } else {
        videoFileName.textContent = 'Default';
      }
    } catch (_) {
      // Settings might not be ready yet
    }
  }

  // -----------------------------------------------------------------------
  // Snooze warning logic
  // -----------------------------------------------------------------------
  function updateSnoozeWarning() {
    const workInterval = parseInt(workIntervalInput.value, 10);
    const maxCount = parseInt(maxSnoozeCountInput.value, 10);
    const snoozeMinutes = parseInt(snoozeDurationInput.value, 10) / 60;
    const recommendedMax = Math.min(Math.floor(workInterval / 15), 6);
    // Warn when the snooze count exceeds the recommended max, or when the
    // combined snooze time could defer a break past a full work interval
    const exceedsCount = maxCount > recommendedMax;
    const exceedsTime = maxCount * snoozeMinutes > workInterval;
    maxSnoozeWarning.style.display = (exceedsCount || exceedsTime) ? 'block' : 'none';
  }

  // -----------------------------------------------------------------------
  // Check if settings have changed
  // -----------------------------------------------------------------------
  function checkForChanges() {
    const currentWorkInterval = parseInt(workIntervalInput.value, 10);
    const currentBreakDuration = parseInt(breakDurationInput.value, 10);
    const currentSnoozeDuration = parseInt(snoozeDurationInput.value, 10);
    const currentAutoPauseOnIdle = autoPauseOnIdleInput.checked;
    const currentIdlePauseThreshold = parseInt(idlePauseThresholdInput.value, 10);
    const currentPauseMediaOnBreak = pauseMediaOnBreakInput.checked;
    const currentAutoResumeMediaAfterBreak = autoResumeMediaAfterBreakInput.checked;
    const currentSoundEnabled = soundEnabledInput.checked;
    const currentMultiMonitor = multiMonitorInput.checked;
    const currentVideoPath = selectedVideoPath || '';
    const currentChromaKeyEnabled = chromaKeyEnabledInput.checked;
    const currentChromaKeyColor = chromaKeyColorInput.value.toUpperCase();
    const currentMaxSnoozeCount = parseInt(maxSnoozeCountInput.value, 10);
    const currentStartOnStartup = startOnStartupInput.checked;

    hasChanges = (
      currentWorkInterval !== currentSettings.workInterval ||
      currentBreakDuration !== currentSettings.breakDuration ||
      currentSnoozeDuration !== (currentSettings.snoozeDuration || 300) ||
      currentMaxSnoozeCount !== (currentSettings.maxSnoozeCount || 2) ||
      currentAutoPauseOnIdle !== (currentSettings.autoPauseOnIdle !== false) ||
      currentIdlePauseThreshold !== (currentSettings.idlePauseThreshold || 300) ||
      currentPauseMediaOnBreak !== (currentSettings.pauseMediaOnBreak !== false) ||
      currentAutoResumeMediaAfterBreak !== (currentSettings.autoResumeMediaAfterBreak === true) ||
      currentSoundEnabled !== currentSettings.soundEnabled ||
      currentMultiMonitor !== currentSettings.multiMonitor ||
      currentVideoPath !== (currentSettings.videoPath || '') ||
      currentChromaKeyEnabled !== (currentSettings.chromaKeyEnabled !== false) ||
      currentChromaKeyColor !== (currentSettings.chromaKeyColor || '#00FF00').toUpperCase() ||
      currentStartOnStartup !== (currentSettings.startOnStartup === true)
    );

    saveBtn.disabled = !hasChanges;
  }

  // -----------------------------------------------------------------------
  // Save settings
  // -----------------------------------------------------------------------
  async function saveSettings() {
    if (!hasChanges) return;

    const newSettings = {
      workInterval: parseInt(workIntervalInput.value, 10),
      breakDuration: parseInt(breakDurationInput.value, 10),
      snoozeDuration: parseInt(snoozeDurationInput.value, 10),
      maxSnoozeCount: parseInt(maxSnoozeCountInput.value, 10),
      autoPauseOnIdle: autoPauseOnIdleInput.checked,
      idlePauseThreshold: parseInt(idlePauseThresholdInput.value, 10),
      pauseMediaOnBreak: pauseMediaOnBreakInput.checked,
      autoResumeMediaAfterBreak: autoResumeMediaAfterBreakInput.checked,
      soundEnabled: soundEnabledInput.checked,
      multiMonitor: multiMonitorInput.checked,
      videoPath: selectedVideoPath || '',
      chromaKeyEnabled: chromaKeyEnabledInput.checked,
      chromaKeyColor: chromaKeyColorInput.value.toUpperCase(),
      startOnStartup: startOnStartupInput.checked
    };

    try {
      const saved = await window.catAPI.saveSettings(newSettings);
      currentSettings = saved;
      hasChanges = false;
      saveBtn.disabled = true;

      // Show feedback
      saveFeedback.textContent = 'Saved!';
      saveFeedback.className = 'save-feedback visible';
      setTimeout(() => {
        saveFeedback.className = 'save-feedback';
      }, 2000);
    } catch (_) {
      saveFeedback.textContent = 'Failed to save';
      saveFeedback.className = 'save-feedback error visible';
    }
  }

  // -----------------------------------------------------------------------
  // Timer status display
  // -----------------------------------------------------------------------
  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function updateStatusDisplay(data) {
    isPaused = data.isPaused;

    if (data.isBreakActive) {
      statusValue.textContent = `Break ends in ${formatTime(data.breakSecondsRemaining)}`;
      statusValue.style.color = '#d4a373';
    } else if (data.pauseReason === 'idle') {
      statusValue.textContent = `Paused while away, ${formatTime(data.workSecondsRemaining)} left`;
      statusValue.style.color = '#f39c12';
    } else if (data.isPaused) {
      statusValue.textContent = 'Paused';
      statusValue.style.color = '#e74c3c';
    } else {
      statusValue.textContent = `Next break in ${formatTime(data.workSecondsRemaining)}`;
      statusValue.style.color = '#2ecc71';
    }

    pauseBtn.textContent = data.isPaused ? 'Resume' : 'Pause';
  }

  // -----------------------------------------------------------------------
  // IPC listeners
  // -----------------------------------------------------------------------
  function setupListeners() {
    cleanup.push(window.catAPI.onTimerTick(updateStatusDisplay));

    window.catAPI.getTimerStatus().then(updateStatusDisplay).catch(() => { });
  }

  // -----------------------------------------------------------------------
  // Event handlers
  // -----------------------------------------------------------------------
  function setupEvents() {
    // Range live updates
    workIntervalInput.addEventListener('input', () => {
      workIntervalValue.textContent = `${workIntervalInput.value} min`;
      updateSnoozeWarning();
      checkForChanges();
    });

    breakDurationInput.addEventListener('input', () => {
      breakDurationValue.textContent = `${Math.round(breakDurationInput.value / 60)} min`;
      checkForChanges();
    });

    snoozeDurationInput.addEventListener('input', () => {
      snoozeDurationValue.textContent = `${Math.round(snoozeDurationInput.value / 60)} min`;
      updateSnoozeWarning();
      checkForChanges();
    });

    maxSnoozeCountInput.addEventListener('input', () => {
      maxSnoozeCountValue.textContent = maxSnoozeCountInput.value;
      updateSnoozeWarning();
      checkForChanges();
    });

    autoPauseOnIdleInput.addEventListener('change', () => {
      const enabled = autoPauseOnIdleInput.checked;
      idlePauseThresholdRow.style.opacity = enabled ? '1' : '0.35';
      checkForChanges();
    });

    idlePauseThresholdInput.addEventListener('input', () => {
      idlePauseThresholdValue.textContent = `${Math.round(idlePauseThresholdInput.value / 60)} min`;
      checkForChanges();
    });

    pauseMediaOnBreakInput.addEventListener('change', () => {
      updateMediaSettingsState();
      checkForChanges();
    });

    autoResumeMediaAfterBreakInput.addEventListener('change', checkForChanges);

    // Save
    saveBtn.addEventListener('click', saveSettings);

    // Video selection
    selectVideoBtn.addEventListener('click', async () => {
      const path = await window.catAPI.selectVideo();
      if (path) {
        selectedVideoPath = path;
        videoFileName.textContent = path.split(/[/\\]/).pop();
        checkForChanges();
      }
    });

    // Pause / Resume
    pauseBtn.addEventListener('click', () => {
      if (isPaused) {
        window.catAPI.resumeTimer();
      } else {
        window.catAPI.pauseTimer();
      }
    });

    // Reset Timer
    resetTimerBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to reset the timer?')) {
        window.catAPI.resetTimer();
      }
    });

    // Toggle inputs (multi-monitor, startup)
    // Sound and chroma key inputs are WIP and disabled, so no listeners needed
    multiMonitorInput.addEventListener('change', checkForChanges);
    startOnStartupInput.addEventListener('change', checkForChanges);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveSettings();
      }
      if (e.key === 'Escape') {
        window.close();
      }
    });
  }

  function updateMediaSettingsState() {
    const enabled = pauseMediaOnBreakInput.checked;
    autoResumeMediaAfterBreakInput.disabled = !enabled;
    autoResumeMediaAfterBreakRow.style.opacity = enabled ? '1' : '0.35';
  }

  // -----------------------------------------------------------------------
  // App updates: header icon only, visible while an update is active.
  // Native tooltip (title) carries the status; checks run automatically
  // and via the tray menu, so no check button here.
  // -----------------------------------------------------------------------
  let pendingUpdateVersion = null;
  let updateReady = false;

  function showUpdateIcon({ busy, tooltip, statusText, ready }) {
    if (updateIconBtn) {
      updateIconBtn.hidden = false;
      updateIconBtn.classList.toggle('busy', !!busy);
      updateIconBtn.title = tooltip;
    }
    if (updateStatusLine) {
      updateStatusLine.hidden = false;
      updateStatusLine.classList.toggle('ready', !!ready);
      updateStatusLine.textContent = statusText || tooltip;
    }
  }

  function hideUpdateIcon() {
    if (updateIconBtn) updateIconBtn.hidden = true;
    if (updateStatusLine) updateStatusLine.hidden = true;
    pendingUpdateVersion = null;
    updateReady = false;
  }

  function handleUpdaterEvent(evt) {
    if (!evt || !evt.type) return;
    switch (evt.type) {
      case 'available':
        pendingUpdateVersion = evt.version;
        updateReady = false;
        showUpdateIcon({ busy: true, tooltip: `Downloading update to v${evt.version}…`, statusText: `Downloading update to v${evt.version}…` });
        break;
      case 'progress':
        showUpdateIcon({ busy: true, tooltip: `Downloading update to v${pendingUpdateVersion || evt.version || '?'}… ${evt.percent || 0}%`, statusText: `Downloading update… ${evt.percent || 0}%` });
        break;
      case 'downloaded':
        pendingUpdateVersion = evt.version;
        updateReady = true;
        showUpdateIcon({ busy: false, ready: true, tooltip: `Update to v${evt.version} ready — click to restart and install`, statusText: `Update to v${evt.version} ready — click the icon to restart` });
        break;
      case 'checking':
      case 'not-available':
      case 'error':
        hideUpdateIcon();
        break;
    }
  }

  function initUpdaterUI() {
    if (!window.catAPI || !window.catAPI.onUpdaterEvent) return;
    cleanup.push(window.catAPI.onUpdaterEvent(handleUpdaterEvent));
    if (updateIconBtn) {
      updateIconBtn.addEventListener('click', () => {
        if (updateReady) window.catAPI.quitAndInstall();
      });
    }
    // If settings opened mid-download, reflect already-downloaded state.
    if (window.catAPI.getUpdaterState) {
      window.catAPI.getUpdaterState().then(state => {
        if (state && state.downloadedVersion) {
          handleUpdaterEvent({ type: 'downloaded', version: state.downloadedVersion });
        }
      }).catch(() => { });
    }
  }

  // -----------------------------------------------------------------------
  // Init
  // -----------------------------------------------------------------------
  function init() {
    loadSettings().then(() => {
      setupListeners();
      setupEvents();
      initUpdaterUI();
      // Initialize button state
      checkForChanges();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
