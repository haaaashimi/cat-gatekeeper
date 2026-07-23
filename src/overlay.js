/* ---------------------------------------------------------------------------
   Cat Gatekeeper — Overlay Script (two-video lifecycle + slide-in)
   --------------------------------------------------------------------------- */
(function () {
  'use strict';

  const videoActive = document.getElementById('catVideoActive');
  const videoSleep = document.getElementById('catVideoSleep');
  const countdownEl = document.getElementById('catCountdown');
  const timerDisplay = document.getElementById('timerDisplay');
  const dismissBtn = document.getElementById('dismissBtn');
  const snoozeBtn = document.getElementById('snoozeBtn');
  const chromaCanvas = document.getElementById('chromaCanvas');
  const chromaCtx = chromaCanvas.getContext('2d');

  let cleanupTimer = null;
  let chromaAnimId = null;
  let chromaSettings = { enabled: false, keyR: 0, keyG: 255, keyB: 0 };
  const CHROMA_TOLERANCE = 100;

  // Prevent scroll while overlay is active (reference pattern)
  const preventScroll = (e) => e.preventDefault();

  // -----------------------------------------------------------------------
  // Formatting
  // -----------------------------------------------------------------------
  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // -----------------------------------------------------------------------
  // Display updates
  // -----------------------------------------------------------------------
  function updateDisplay(data) {
    const remaining = Math.max(0, data.breakSecondsRemaining);
    timerDisplay.textContent = formatTime(remaining);
    countdownEl.textContent = formatTime(remaining);
  }

  // -----------------------------------------------------------------------
  // Chroma key (green screen) rendering — only for user-uploaded green screen videos
  // -----------------------------------------------------------------------
  function startChromaRender(videoEl, animate) {
    if (!chromaSettings.enabled) return;
    if (chromaAnimId) stopChromaRender();

    // Hide the video element, show canvas
    videoEl.style.opacity = '0';
    chromaCanvas.classList.add('active');

    // Re-trigger CSS animation on canvas (only for the active slide-in video)
    if (animate) {
      chromaCanvas.style.animation = 'none';
      chromaCanvas.offsetHeight; // force reflow
      chromaCanvas.style.animation = 'slide-in 3s ease-out forwards';
    }

    const ctx = chromaCtx;
    const { keyR, keyG, keyB } = chromaSettings;
    const tolSq = CHROMA_TOLERANCE * CHROMA_TOLERANCE;

    function render() {
      if (videoEl.readyState < 2) {
        chromaAnimId = requestAnimationFrame(render);
        return;
      }

      const cw = chromaCanvas.clientWidth;
      const ch = chromaCanvas.clientHeight;
      if (chromaCanvas.width !== cw) chromaCanvas.width = cw;
      if (chromaCanvas.height !== ch) chromaCanvas.height = ch;

      // Draw video frame covering the canvas (like object-fit: cover)
      const vw = videoEl.videoWidth;
      const vh = videoEl.videoHeight;
      if (vw && vh) {
        const scale = Math.max(cw / vw, ch / vh);
        ctx.drawImage(videoEl, (cw - vw * scale) / 2, (ch - vh * scale) / 2, vw * scale, vh * scale);
      } else {
        ctx.drawImage(videoEl, 0, 0, cw, ch);
      }

      // Chroma key pixel processing
      const imageData = ctx.getImageData(0, 0, cw, ch);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const dr = data[i] - keyR;
        const dg = data[i + 1] - keyG;
        const db = data[i + 2] - keyB;
        if (dr * dr + dg * dg + db * db < tolSq) {
          data[i + 3] = 0;
        }
      }
      ctx.putImageData(imageData, 0, 0);

      chromaAnimId = requestAnimationFrame(render);
    }

    render();
  }

  function stopChromaRender() {
    if (chromaAnimId) {
      cancelAnimationFrame(chromaAnimId);
      chromaAnimId = null;
    }
    chromaCanvas.classList.remove('active');
  }

  // -----------------------------------------------------------------------
  // Two-video lifecycle (reference pattern)
  // -----------------------------------------------------------------------
  async function loadVideos() {
    try {
      const activePath = await window.catAPI.getResourcePath('catVideoActive');
      const sleepPath = await window.catAPI.getResourcePath('catVideoSleep');

      if (activePath) {
        videoActive.src = `file://${activePath}`;
      }

      if (sleepPath) {
        videoSleep.src = `file://${sleepPath}`;
      }

      // Check if a custom user-uploaded video is being used
      const settings = await window.catAPI.getSettings();
      const isCustomVideo = !!settings.videoPath;

      // Only use chroma key canvas rendering for custom green screen videos.
      // Bundled videos (neko1.webm / neko2.webm) have native alpha channels
      // and should be displayed directly as video elements.
      const useChroma = isCustomVideo && settings.chromaKeyEnabled !== false;

      if (useChroma) {
        chromaSettings.enabled = true;
        const color = settings.chromaKeyColor || '#00FF00';
        chromaSettings.keyR = parseInt(color.slice(1, 3), 16);
        chromaSettings.keyG = parseInt(color.slice(3, 5), 16);
        chromaSettings.keyB = parseInt(color.slice(5, 7), 16);
      } else {
        chromaSettings.enabled = false;
      }

      // When active video ends → switch to sleeping cat
      videoActive.addEventListener('ended', () => {
        if (useChroma) {
          startChromaRender(videoSleep, false);
        } else {
          videoActive.style.display = 'none';
        }
        videoSleep.classList.add('sleeping');
        videoSleep.play().catch(() => showFallback());
      });

      // Start playing active cat
      if (useChroma) {
        startChromaRender(videoActive, true);
      }
      videoActive.play().catch(() => showFallback());
    } catch (_) {
      showFallback();
    }
  }

  function showFallback() {
    window.catAPI.getResourcePath('fallback')
      .then((p) => {
        if (!p) return;
        const img = new Image();
        img.src = `file://${p}`;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:1;';
          canvas.width = window.innerWidth;
          canvas.height = window.innerHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          document.body.prepend(canvas);
        };
        img.onerror = () => {
          console.warn('Cat Gatekeeper: fallback image failed to load');
        };
      })
      .catch(() => {
        console.warn('Cat Gatekeeper: failed to get fallback resource path');
      });
  }

  // -----------------------------------------------------------------------
  // IPC listeners
  // -----------------------------------------------------------------------
  function setupListeners() {
    cleanupTimer = window.catAPI.onTimerTick((data) => {
      if (data.isBreakActive) {
        updateDisplay(data);

        // Disable snooze button if snooze limit reached
        if (data.snoozeCount >= data.maxSnoozeCount) {
          snoozeBtn.disabled = true;
          snoozeBtn.textContent = 'No snoozes left';
        }
      }
    });
  }

  // -----------------------------------------------------------------------
  // Button handlers
  // -----------------------------------------------------------------------
  function setupButtons() {
    // The overlay only exists during a break — enable dismiss immediately
    dismissBtn.disabled = false;

    dismissBtn.addEventListener('click', () => {
      window.catAPI.dismissBreak();
    });

    snoozeBtn.addEventListener('click', () => {
      window.catAPI.snoozeBreak();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        window.catAPI.dismissBreak();
      }
    });
  }

  // -----------------------------------------------------------------------
  // Init
  // -----------------------------------------------------------------------
  function init() {
    loadVideos();
    setupListeners();
    setupButtons();

    // Prevent scrolling during break (reference pattern)
    document.addEventListener('wheel', preventScroll, { passive: false });
    document.addEventListener('touchmove', preventScroll, { passive: false });

    // Clean up IPC listeners when the overlay closes
    window.addEventListener('beforeunload', () => {
      if (cleanupTimer) cleanupTimer();
    });

    window.catAPI.getTimerStatus().then((data) => {
      if (data.isBreakActive) {
        updateDisplay(data);
        // Disable snooze button immediately if limit already reached
        if (data.snoozeCount >= data.maxSnoozeCount) {
          snoozeBtn.disabled = true;
          snoozeBtn.textContent = 'No snoozes left';
        }
      }
    }).catch(() => { });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
