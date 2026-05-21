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
  const chromaKeyColorRow = document.getElementById('chromaKeyColorRow');

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

      soundEnabledInput.checked = settings.soundEnabled;
      multiMonitorInput.checked = settings.multiMonitor;

      chromaKeyEnabledInput.checked = settings.chromaKeyEnabled !== false;
      const keyColor = settings.chromaKeyColor || '#00FF00';
      chromaKeyColorInput.value = keyColor.toLowerCase();
      chromaKeyColorValue.textContent = keyColor.toUpperCase();
      chromaKeyColorRow.style.opacity = settings.chromaKeyEnabled !== false ? '1' : '0.35';

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
  // Check if settings have changed
  // -----------------------------------------------------------------------
  function checkForChanges() {
    const currentWorkInterval = parseInt(workIntervalInput.value, 10);
    const currentBreakDuration = parseInt(breakDurationInput.value, 10);
    const currentSnoozeDuration = parseInt(snoozeDurationInput.value, 10);
    const currentAutoPauseOnIdle = autoPauseOnIdleInput.checked;
    const currentIdlePauseThreshold = parseInt(idlePauseThresholdInput.value, 10);
    const currentSoundEnabled = soundEnabledInput.checked;
    const currentMultiMonitor = multiMonitorInput.checked;
    const currentVideoPath = selectedVideoPath || '';
    const currentChromaKeyEnabled = chromaKeyEnabledInput.checked;
    const currentChromaKeyColor = chromaKeyColorInput.value.toUpperCase();

    hasChanges = (
      currentWorkInterval !== currentSettings.workInterval ||
      currentBreakDuration !== currentSettings.breakDuration ||
      currentSnoozeDuration !== (currentSettings.snoozeDuration || 300) ||
      currentAutoPauseOnIdle !== (currentSettings.autoPauseOnIdle !== false) ||
      currentIdlePauseThreshold !== (currentSettings.idlePauseThreshold || 300) ||
      currentSoundEnabled !== currentSettings.soundEnabled ||
      currentMultiMonitor !== currentSettings.multiMonitor ||
      currentVideoPath !== (currentSettings.videoPath || '') ||
      currentChromaKeyEnabled !== (currentSettings.chromaKeyEnabled !== false) ||
      currentChromaKeyColor !== (currentSettings.chromaKeyColor || '#00FF00').toUpperCase()
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
      autoPauseOnIdle: autoPauseOnIdleInput.checked,
      idlePauseThreshold: parseInt(idlePauseThresholdInput.value, 10),
      soundEnabled: soundEnabledInput.checked,
      multiMonitor: multiMonitorInput.checked,
      videoPath: selectedVideoPath || '',
      chromaKeyEnabled: chromaKeyEnabledInput.checked,
      chromaKeyColor: chromaKeyColorInput.value.toUpperCase()
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
      checkForChanges();
    });

    breakDurationInput.addEventListener('input', () => {
      breakDurationValue.textContent = `${Math.round(breakDurationInput.value / 60)} min`;
      checkForChanges();
    });

    snoozeDurationInput.addEventListener('input', () => {
      snoozeDurationValue.textContent = `${Math.round(snoozeDurationInput.value / 60)} min`;
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
      window.catAPI.resetTimer();
    });

    // Toggle inputs (sound, multi-monitor, chroma key)
    soundEnabledInput.addEventListener('change', checkForChanges);
    multiMonitorInput.addEventListener('change', checkForChanges);
    chromaKeyEnabledInput.addEventListener('change', () => {
      const enabled = chromaKeyEnabledInput.checked;
      chromaKeyColorRow.style.opacity = enabled ? '1' : '0.35';
      checkForChanges();
    });

    // Chroma key color picker live update
    chromaKeyColorInput.addEventListener('input', () => {
      chromaKeyColorValue.textContent = chromaKeyColorInput.value.toUpperCase();
      checkForChanges();
    });

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

  // -----------------------------------------------------------------------
  // Init
  // -----------------------------------------------------------------------
  function init() {
    loadSettings().then(() => {
      setupListeners();
      setupEvents();
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
