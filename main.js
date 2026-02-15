/* Mini Arcade (mobile-first): Tetris only */
(() => {
  // iOS Safari viewport height fix (avoids toolbar "jump" / overlap)
  const setVh = () => {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  };
  setVh();
  window.addEventListener('resize', setVh, { passive: true });

  // iOS Safari quirks: prevent pinch-zoom / double-tap zoom during gameplay
  const shouldBlockGesture = (e) => {
    const t = e.target;
    if (!t) return false;
    // Block on the game canvas + touch controls + overlay buttons
    return !!(t.closest?.('.controls') || t.closest?.('.screen') || t.closest?.('.overlay') || t === document.getElementById('board'));
  };

  // gesture events exist on iOS Safari
  for (const evt of ['gesturestart', 'gesturechange', 'gestureend']) {
    window.addEventListener(evt, (e) => {
      if (shouldBlockGesture(e)) e.preventDefault();
    }, { passive: false });
  }

  // extra guard: stop rubber-band scroll when swiping on the game area
  document.addEventListener('touchmove', (e) => {
    if (shouldBlockGesture(e)) e.preventDefault();
  }, { passive: false });

  document.addEventListener('dblclick', (e) => {
    if (shouldBlockGesture(e)) e.preventDefault();
  }, { passive: false });

  // Android/iOS: prevent long-press context menu on the game area
  document.addEventListener('contextmenu', (e) => {
    if (shouldBlockGesture(e)) e.preventDefault();
  }, { passive: false });

  const $ = (id) => document.getElementById(id);

  const canvas = $("board");
  const ctx = canvas.getContext("2d");
  const nextCanvas = $("next");
  const nextCtx = nextCanvas.getContext("2d");

  const scoreEl = $("score");
  const stat2El = $("stat2");
  const bestEl = $("best");
  const stat2LabelEl = $("stat2Label");
  const titleEl = $("gameTitle");
  const footerEl = $("gameFooter");

  const overlay = $("overlay");
  const overlayTitle = $("overlayTitle");
  const overlayText = $("overlayText");
  const btnPause = $("btnPause");
  const btnSound = $("btnSound");
  const btnMenu = null;
  const btnResume = $("btnResume");
  const btnRestart = $("btnRestart");
  const btnSpeedLock = $("btnSpeedLock");
  // menu removed (Tetris-only)
  const menuScreen = null;
  const gameScreen = $("gameScreen");
  const btnMenuTetris = null;
  const btnMenuInvaders = null;
  const tetrisSide = $("tetrisSide");

  // touch buttons
  const btnLeft = $("btnLeft");
  const btnRight = $("btnRight");
  const btnRot = $("btnRot");
  const btnDown = $("btnDown");
  const btnDrop = $("btnDrop");

  // Touch controls are fixed for Tetris-only mode.

  // --- Audio (WebAudio; no external files) ---
  let audioCtx = null;
  let master = null;
  let bgGain = null;
  let sfxGain = null;
  let bgTimer = null;
  let soundOn = false;

  // Persist small settings (safe for GitHub Pages)
  const SOUND_KEY = 'miniArcade.sound';
  const BEST_TETRIS_KEY = 'miniArcade.best.tetris';
  const TETRIS_SPEEDLOCK_KEY = 'miniArcade.tetris.speedLock';

  // One-time in-game hint (first run per game)
  const HINT_TETRIS_KEY = 'miniArcade.hint.tetris';

  const readSoundPref = () => {
    try { return localStorage.getItem(SOUND_KEY) === '1'; } catch { return false; }
  };

  function readBest(key) {
    try {
      const v = Number(localStorage.getItem(key) || 0);
      return Number.isFinite(v) ? v : 0;
    } catch {
      return 0;
    }
  }

  function writeBest(key, value) {
    try { localStorage.setItem(key, String(value)); } catch {}
  }

  function setBestUI(value) {
    if (!bestEl) return;
    bestEl.textContent = String(value || 0);
  }

  function readSpeedLockPref() {
    try {
      const raw = localStorage.getItem(TETRIS_SPEEDLOCK_KEY);
      if (!raw) return null;
      const v = Number(raw);
      return Number.isFinite(v) && v > 0 ? v : null;
    } catch {
      return null;
    }
  }

  function writeSpeedLockPref(v) {
    try {
      if (!v) localStorage.removeItem(TETRIS_SPEEDLOCK_KEY);
      else localStorage.setItem(TETRIS_SPEEDLOCK_KEY, String(v));
    } catch {}
  }

  function speedLockLabel(v) {
    return v ? `Speed: Lv${v}` : 'Speed: AUTO';
  }

  function ensureAudio() {
    if (audioCtx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = new AC();
    master = audioCtx.createGain();
    master.gain.value = 0.7;
    master.connect(audioCtx.destination);

    bgGain = audioCtx.createGain();
    bgGain.gain.value = 0.18;
    bgGain.connect(master);

    sfxGain = audioCtx.createGain();
    sfxGain.gain.value = 0.35;
    sfxGain.connect(master);
  }

  function setSound(on, { persist = true } = {}) {
    ensureAudio();
    soundOn = !!on;

    if (!audioCtx) {
      btnSound.textContent = "Sound: N/A";
      btnSound.disabled = true;
      btnSound.setAttribute('aria-pressed', 'false');
      return;
    }

    if (persist) {
      try { localStorage.setItem(SOUND_KEY, soundOn ? '1' : '0'); } catch {}
    }

    btnSound.textContent = soundOn ? "Sound: ON" : "Sound: OFF";
    btnSound.setAttribute('aria-pressed', soundOn ? 'true' : 'false');

    if (soundOn) {
      audioCtx.resume?.();
      startBGM();
    } else {
      stopBGM();
    }
  }

  function beep({ f = 440, t = 0.06, type = 'square', gain = 0.25, to = 'sfx' } = {}) {
    if (!soundOn) return;
    ensureAudio();
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, now);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + t);
    osc.connect(g);
    g.connect(to === 'bg' ? bgGain : sfxGain);
    osc.start(now);
    osc.stop(now + t + 0.02);
  }

  function startBGM() {
    if (!soundOn || !audioCtx) return;
    if (bgTimer) return;

    // simple chiptune-ish loop
    const bpm = 140;
    const step = 60 / bpm / 2; // 8th notes
    const seq = [
      659, 587, 523, 587,
      659, 587, 494, 523,
      587, 523, 440, 494,
      523, 494, 440, 392,
    ];
    let i = 0;
    const tick = () => {
      if (!soundOn || paused || gameOver) return;
      const f = seq[i++ % seq.length];
      beep({ f, t: step * 0.9, type: 'square', gain: 0.09, to: 'bg' });
      beep({ f: f / 2, t: step * 0.9, type: 'triangle', gain: 0.05, to: 'bg' });
    };
    bgTimer = setInterval(tick, step * 1000);
  }

  function stopBGM() {
    if (bgTimer) clearInterval(bgTimer);
    bgTimer = null;
  }

  function primeAudioFromGesture() {
    ensureAudio();
    if (audioCtx) audioCtx.resume?.();
  }
  window.addEventListener('touchstart', primeAudioFromGesture, { passive: true, once: true });
  window.addEventListener('mousedown', primeAudioFromGesture, { passive: true, once: true });
  window.addEventListener('keydown', primeAudioFromGesture, { passive: true, once: true });

  // --- UI overlay ---
  let mode = 'tetris';
  let paused = false;
  let gameOver = false;

  // Mobile UX: keep the screen awake during active gameplay when supported.
  // (Prevents the display from dimming/locking mid-run on mobile browsers.)
  let wakeLock = null;
  async function requestWakeLock() {
    try {
      if (!('wakeLock' in navigator)) return;
      if (wakeLock) return;
      // Only request while we're visible; browsers reject otherwise.
      if (document.hidden) return;
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch {
      // Best-effort only.
      wakeLock = null;
    }
  }
  async function releaseWakeLock() {
    try { await wakeLock?.release?.(); } catch {}
    wakeLock = null;
  }
  function updateWakeLock() {
    const activePlay = !paused && !gameOver && !document.hidden;
    if (activePlay) requestWakeLock();
    else releaseWakeLock();
  }

  // Accessibility: keep focus inside the modal overlay and restore it on close.
  let lastFocusEl = null;

  function showOverlay(title, text) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;

    // While the modal is up, hard-disable the gameplay touch buttons.
    // (Prevents accidental inputs + avoids misleading haptic pulses.)
    setTouchControlsEnabled(false);

    lastFocusEl = document.activeElement;
    overlay.classList.remove("hidden");

    // Move focus to the primary action for keyboard / assistive tech users.
    // (No-op on most mobile browsers, but harmless.)
    try { btnResume?.focus?.({ preventScroll: true }); } catch { btnResume?.focus?.(); }
  }
  function hideOverlay() {
    overlay.classList.add("hidden");

    // Re-enable touch controls when leaving the modal (unless game-over keeps us paused).
    setTouchControlsEnabled(!paused && !gameOver);

    try { lastFocusEl?.focus?.({ preventScroll: true }); } catch { lastFocusEl?.focus?.(); }
    lastFocusEl = null;
  }

  // A11y: basic focus trap inside the overlay dialog (Tab cycles within).
  // Keeps keyboard users from tabbing to controls behind the modal.
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    if (overlay.classList.contains('hidden')) return;

    const focusables = Array.from(
      overlay.querySelectorAll('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ).filter((el) => (el.offsetParent !== null) || el === document.activeElement);

    if (!focusables.length) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;

    // If focus escaped somehow, snap it back in.
    if (!overlay.contains(active)) {
      e.preventDefault();
      first.focus?.();
      return;
    }

    if (e.shiftKey) {
      if (active === first) {
        e.preventDefault();
        last.focus?.();
      }
    } else {
      if (active === last) {
        e.preventDefault();
        first.focus?.();
      }
    }
  }, { passive: false });

  function showHintOnce(storageKey, { title, text } = {}) {
    let seen = false;
    try { seen = localStorage.getItem(storageKey) === '1'; } catch {}
    if (seen) return;

    // Show as a paused modal so it's readable and doesn't cause unfair deaths.
    paused = true;
    btnPause.textContent = "Resume";
    btnPause.setAttribute('aria-pressed', 'true');
    stopBGM();
    showOverlay(title || 'Hint', text || '');

    try { localStorage.setItem(storageKey, '1'); } catch {}
  }

  function pauseToggle(force) {
    if (gameOver) return;
    paused = (force === undefined) ? !paused : !!force;
    btnPause.textContent = paused ? "Resume" : "Pause";
    btnPause.setAttribute('aria-pressed', paused ? 'true' : 'false');

    if (paused) {
      stopBGM();
      showOverlay("Paused", "Tap Resume to continue.");
    } else {
      startBGM();
      hideOverlay();
    }

    updateWakeLock();
  }

  // Stability: auto-pause when the tab/app goes to background.
  // (Prevents unfair deaths + keeps audio sane on mobile browsers.)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !paused && !gameOver) pauseToggle(true);
    // WakeLock is invalid in background on most browsers.
    updateWakeLock();
  }, { passive: true });

  window.addEventListener('blur', () => {
    if (!paused && !gameOver) pauseToggle(true);
  }, { passive: true });

  // UX: orientation changes often imply a re-grip on mobile; auto-pause to prevent unfair deaths.
  // (We intentionally do NOT pause on every resize because iOS address bar show/hide triggers resize.)
  window.addEventListener('orientationchange', () => {
    if (!paused && !gameOver) {
      pauseToggle(true);
      overlayText.textContent = '画面の向きが変わったので一時停止したよ。Tap Resume で再開。';
    }
  }, { passive: true });

  // --- Input wiring (buttons re-bound per game) ---
  // NOTE: On desktop, `mousedown` + `click` can both fire for the same interaction.
  // We suppress the follow-up click for a short window to avoid double actions.
  const nowMs = () => (globalThis.performance?.now ? globalThis.performance.now() : Date.now());
  const CLICK_SUPPRESS_MS = 450;

  // Micro-haptics: adds a subtle confirmation pulse on tap.
  // (Helps reduce over-tapping / uncertainty on mobile. Ignored on unsupported devices.)
  function hapticTap(ms = 8) {
    try {
      if (document.hidden) return;
      navigator.vibrate?.(ms);
    } catch {}
  }

  function makeClickSuppressor(windowMs) {
    let until = 0;
    return {
      mark() { until = nowMs() + windowMs; },
      shouldSuppress(now) { return now < until; },
    };
  }

  function bindHold(btn, onTap, onHold) {
    let t = null;
    let r = null;
    const suppressor = makeClickSuppressor(CLICK_SUPPRESS_MS);

    const start = (e) => {
      if (btn.disabled) return;
      e?.preventDefault?.();

      // Prevent a subsequent synthetic click from triggering a second tap.
      suppressor.mark();

      onTap();
      hapticTap(8);
      t = setTimeout(() => { r = setInterval(() => onHold(), 60); }, 180);
    };
    const stop = (e) => {
      e?.preventDefault?.();
      if (t) clearTimeout(t);
      if (r) clearInterval(r);
      t = null; r = null;
    };

    // Touch UX: if the finger slides off the button, cancel the hold repeat.
    // (Reduces accidental DAS/soft-drop when aiming for adjacent controls.)
    const stopIfFingerLeaves = (e) => {
      if (!t && !r) return; // not active
      const touch = e?.touches?.[0];
      if (!touch) return;
      const rect = btn.getBoundingClientRect();
      const x = touch.clientX;
      const y = touch.clientY;
      const inside = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
      if (!inside) stop(e);
    };

    btn.addEventListener("touchstart", start, { passive: false });
    btn.addEventListener("touchmove", stopIfFingerLeaves, { passive: false });
    btn.addEventListener("touchend", stop, { passive: false });
    btn.addEventListener("touchcancel", stop, { passive: false });

    btn.addEventListener("mousedown", start, { passive: false });
    btn.addEventListener("mouseup", stop, { passive: false });
    btn.addEventListener("mouseleave", stop, { passive: false });

    btn.addEventListener("click", (e) => {
      if (btn.disabled) return;
      const now = nowMs();
      if (suppressor.shouldSuppress(now)) { e.preventDefault(); return; }
      e.preventDefault();
      onTap();
    }, { passive: false });
  }

  function bindTap(btn, fn) {
    const suppressor = makeClickSuppressor(CLICK_SUPPRESS_MS);

    // For critical single-tap buttons (rotate / hard drop):
    // - keep it fast (fire near touchstart)
    // - but allow cancel if the finger slides off (reduces accidental mis-taps)
    let pendingTimer = null;
    let fired = false;
    let armed = false; // becomes false if finger leaves the button

    const clearPending = () => {
      if (pendingTimer) clearTimeout(pendingTimer);
      pendingTimer = null;
    };

    const fire = () => {
      if (fired) return;
      fired = true;
      clearPending();
      fn();
      hapticTap(8);
    };

    const startTouch = (e) => {
      if (btn.disabled) return;
      e?.preventDefault?.();
      suppressor.mark();
      fired = false;
      armed = true;
      clearPending();

      // Tiny delay so a swipe-across can cancel before we commit the action.
      pendingTimer = setTimeout(() => { if (armed) fire(); }, 28);
    };

    const stopTouch = (e) => {
      e?.preventDefault?.();

      // If the user tapped quickly and we haven't fired yet, commit on touchend
      // (only if the finger didn't slide off the button).
      if (!fired && armed) fire();

      clearPending();
      armed = false;
    };

    const cancelIfFingerLeaves = (e) => {
      if (!pendingTimer || fired) return;
      const touch = e?.touches?.[0];
      if (!touch) return;
      const rect = btn.getBoundingClientRect();
      const x = touch.clientX;
      const y = touch.clientY;
      const inside = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
      if (!inside) {
        armed = false;
        clearPending();
      }
    };

    btn.addEventListener("touchstart", startTouch, { passive: false });
    btn.addEventListener("touchmove", cancelIfFingerLeaves, { passive: false });
    btn.addEventListener("touchend", stopTouch, { passive: false });
    btn.addEventListener("touchcancel", () => { clearPending(); fired = false; armed = false; }, { passive: false });

    // Mouse/desktop: keep instant on press.
    const startMouse = (e) => {
      if (btn.disabled) return;
      e?.preventDefault?.();
      suppressor.mark();
      fn();
      hapticTap(8);
    };

    btn.addEventListener("mousedown", startMouse, { passive: false });

    btn.addEventListener("click", (e) => {
      if (btn.disabled) return;
      const now = nowMs();
      if (suppressor.shouldSuppress(now)) { e.preventDefault(); return; }
      e.preventDefault();
      fn();
    }, { passive: false });
  }

  // We bind once, route to current handlers.
  const touchActions = {
    leftTap: () => {}, leftHold: () => {},
    rightTap: () => {}, rightHold: () => {},
    rotTap: () => {},
    downTap: () => {}, downHold: () => {},
    dropTap: () => {},
  };

  // UI safety: when paused / game-over, disable touch controls so taps don't
  // produce haptics or "did it register?" confusion.
  function setTouchControlsEnabled(enabled) {
    const on = !!enabled;
    for (const el of [btnLeft, btnRight, btnRot, btnDown, btnDrop]) {
      if (!el) continue;
      el.disabled = !on;
      el.setAttribute('aria-disabled', on ? 'false' : 'true');
      el.tabIndex = on ? 0 : -1;
    }
  }

  bindHold(btnLeft,  () => touchActions.leftTap(),  () => touchActions.leftHold());
  bindHold(btnRight, () => touchActions.rightTap(), () => touchActions.rightHold());
  bindHold(btnDown,  () => touchActions.downTap(),  () => touchActions.downHold());
  bindTap(btnRot, () => touchActions.rotTap());
  bindTap(btnDrop, () => touchActions.dropTap());

  // --- Shared HUD ---
  function setHUD({ title, stat2Label, footer }) {
    if (titleEl) titleEl.textContent = title;
    if (footerEl && footer) footerEl.textContent = footer;
    if (stat2LabelEl) stat2LabelEl.textContent = stat2Label;

    // Keep browser/tab title in sync (helps iOS Safari tab switcher + accessibility)
    try { document.title = title ? `${title} | Mini Arcade` : 'Mini Arcade (Mobile)'; } catch {}
  }

  // --- Game mode: Tetris only ---

  // =========================
  // TETRIS
  // =========================

  const tetris = (() => {
    // board config
    const COLS = 10;
    const ROWS = 20;
    const BLOCK = 30; // canvas is 300x600

    canvas.width = COLS * BLOCK;
    canvas.height = ROWS * BLOCK;

    const COLORS = {
      I: "#6ff3ff",
      O: "#ffe46a",
      T: "#c48bff",
      S: "#6dffb0",
      Z: "#ff6b9b",
      J: "#7aa6ff",
      L: "#ffb35c",
      G: "rgba(255, 79, 184, .20)" // ghost
    };

    const PIECES = {
      I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
      O: [[1,1],[1,1]],
      T: [[0,1,0],[1,1,1],[0,0,0]],
      S: [[0,1,1],[1,1,0],[0,0,0]],
      Z: [[1,1,0],[0,1,1],[0,0,0]],
      J: [[1,0,0],[1,1,1],[0,0,0]],
      L: [[0,0,1],[1,1,1],[0,0,0]],
    };

    // Tunables/constants (kept near piece defs so future tweaks don't get scattered).
    const LINE_CLEAR_BASE = Object.freeze([0, 100, 300, 500, 800]);
    const LINE_CLEAR_SFX = Object.freeze({ 1: 660, 2: 740, 3: 880, 4: 990 });
    const ROTATION_KICKS = Object.freeze([0, -1, 1, -2, 2]);

    // Helper: iterate only the filled cells of a piece matrix.
    // Centralizing this reduces off-by-one / loop-copy bugs when tuning collisions
    // or adding new render/physics features later.
    function forEachFilledCell(mat, fn) {
      for (let y = 0; y < mat.length; y++) {
        const row = mat[y];
        for (let x = 0; x < row.length; x++) {
          if (!row[x]) continue;
          fn(x, y);
        }
      }
    }

    function cloneMatrix(m) { return m.map(r => r.slice()); }

    function rotateCW(mat) {
      const h = mat.length;
      const w = mat[0].length;
      const res = Array.from({ length: w }, () => Array(h).fill(0));
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) res[x][h - 1 - y] = mat[y][x];
      return res;
    }

    function makeEmptyBoard() { return Array.from({ length: ROWS }, () => Array(COLS).fill("")); }

    let board;
    let bag = [];
    let current;
    let next;
    let dropCounter = 0;

    let score = 0;
    let lines = 0;
    let level = 1;

    // Practice helper: keep fall speed fixed to a chosen level.
    // Useful for drilling a specific tempo without the game speeding up.
    let speedLockLevel = readSpeedLockPref();

    function updateSpeedLockUI() {
      if (!btnSpeedLock) return;
      btnSpeedLock.textContent = speedLockLabel(speedLockLevel);
      btnSpeedLock.setAttribute('aria-pressed', speedLockLevel ? 'true' : 'false');
    }

    function cycleSpeedLock() {
      // Cycle: AUTO -> Lv1 -> Lv5 -> Lv10 -> AUTO
      const seq = [null, 1, 5, 10];
      const idx = seq.findIndex(v => v === speedLockLevel);
      speedLockLevel = seq[(idx + 1) % seq.length];
      writeSpeedLockPref(speedLockLevel);
      updateSpeedLockUI();

      // Tiny confirmation chirp (different pitch for AUTO vs locked)
      if (speedLockLevel) beep({ f: 740, t: 0.05, type: 'square', gain: 0.12 });
      else beep({ f: 520, t: 0.05, type: 'triangle', gain: 0.10 });
    }

    function updateHUD() {
      if (scoreEl) scoreEl.textContent = String(score);
      if (stat2El) stat2El.textContent = String(lines);
    }

    function refillBag() {
      const keys = Object.keys(PIECES);
      for (let i = keys.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [keys[i], keys[j]] = [keys[j], keys[i]];
      }
      bag.push(...keys);
    }

    function takeFromBag() {
      if (bag.length === 0) refillBag();
      const type = bag.shift();
      return { type, mat: cloneMatrix(PIECES[type]), x: (COLS / 2 | 0) - 2, y: -2 };
    }

    function collide(mat, ox, oy) {
      // Hot-path: avoid closures/flags and keep the collision rules explicit.
      // Rules (unchanged):
      // - Left/right/out-the-bottom => collision
      // - Above the top (by < 0) is allowed
      // - Overlapping an occupied cell (by >= 0) => collision
      for (let y = 0; y < mat.length; y++) {
        const row = mat[y];
        for (let x = 0; x < row.length; x++) {
          if (!row[x]) continue;
          const bx = x + ox;
          const by = y + oy;
          if (bx < 0 || bx >= COLS || by >= ROWS) return true;
          if (by >= 0 && board[by][bx]) return true;
        }
      }
      return false;
    }

    function mergePiece(p) {
      const { mat, x: ox, y: oy, type } = p;
      forEachFilledCell(mat, (x, y) => {
        const bx = x + ox;
        const by = y + oy;
        if (by >= 0 && by < ROWS && bx >= 0 && bx < COLS) board[by][bx] = type;
      });
    }

    function clearLines() {
      let cleared = 0;
      outer: for (let y = ROWS - 1; y >= 0; y--) {
        for (let x = 0; x < COLS; x++) if (!board[y][x]) continue outer;
        board.splice(y, 1);
        board.unshift(Array(COLS).fill(""));
        cleared++;
        y++;
      }

      if (cleared) {
        lines += cleared;

        const base = LINE_CLEAR_BASE[cleared] || (cleared * 250);
        score += base * level;

        const newLevel = Math.max(1, (lines / 10 | 0) + 1);
        if (newLevel !== level) level = newLevel;

        beep({ f: LINE_CLEAR_SFX[cleared] || 880, t: 0.10, type: 'square', gain: 0.22 });

        canvas.classList.remove('flash');
        void canvas.offsetWidth;
        canvas.classList.add('flash');

        updateHUD();
      }
    }

    function spawn() {
      current = next || takeFromBag();
      next = takeFromBag();
      current.x = (COLS / 2 | 0) - ((current.mat[0].length / 2) | 0);
      current.y = 0;
      if (collide(current.mat, current.x, current.y)) endGame();
    }

    function endGame() {
      gameOver = true;
      paused = true;
      stopBGM();
      beep({ f: 196, t: 0.18, type: 'sawtooth', gain: 0.22 });
      setTimeout(() => beep({ f: 110, t: 0.22, type: 'sawtooth', gain: 0.18 }), 120);

      const prevBest = readBest(BEST_TETRIS_KEY);
      const nextBest = Math.max(prevBest, score);
      if (nextBest !== prevBest) writeBest(BEST_TETRIS_KEY, nextBest);
      setBestUI(nextBest);

      btnPause.textContent = "Pause";
      showOverlay("Game Over", `Score ${score} / Lines ${lines}\nBest ${nextBest}`);
    }

    function lockPiece() {
      mergePiece(current);
      clearLines();
      if (board[0].some(Boolean)) { endGame(); return; }
      spawn();
    }

    // Tunables: fall-speed curve (keep in one place for future tuning)
    const FALL_SPEED = {
      minMs: 80,
      baseMs: 650,
      perLevelMs: 45,
    };

    function getDropInterval() {
      const effectiveLevel = speedLockLevel || level;
      return Math.max(FALL_SPEED.minMs, FALL_SPEED.baseMs - (effectiveLevel - 1) * FALL_SPEED.perLevelMs);
    }

    function ghostY() {
      let y = current.y;
      while (!collide(current.mat, current.x, y + 1)) y++;
      return y;
    }

    function drawBlock(x, y, color, alpha = 1) {
      const px = x * BLOCK;
      const py = y * BLOCK;
      ctx.globalAlpha = alpha;
      const g = ctx.createLinearGradient(px, py, px + BLOCK, py + BLOCK);
      g.addColorStop(0, "rgba(255,255,255,.35)");
      g.addColorStop(0.35, "rgba(255,255,255,.10)");
      g.addColorStop(1, "rgba(0,0,0,.18)");
      ctx.fillStyle = color;
      ctx.fillRect(px + 1, py + 1, BLOCK - 2, BLOCK - 2);
      ctx.fillStyle = g;
      ctx.fillRect(px + 1, py + 1, BLOCK - 2, BLOCK - 2);
      // Edge contrast: helps read block boundaries at a glance (esp. on bright pieces).
      // Dark outer stroke separates adjacent blocks; light inner stroke keeps the "gloss".
      ctx.setLineDash([]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(0,0,0,.28)";
      ctx.strokeRect(px + 1.5, py + 1.5, BLOCK - 3, BLOCK - 3);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255,255,255,.22)";
      ctx.strokeRect(px + 2.5, py + 2.5, BLOCK - 5, BLOCK - 5);
      ctx.globalAlpha = 1;
    }

    // Ghost piece: outline-only, high-contrast, dashed.
    // Goal: you can read landing position instantly without confusing it with a placed piece.
    function drawGhostBlock(x, y) {
      const px = x * BLOCK;
      const py = y * BLOCK;
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.setLineDash([5, 3]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255, 244, 251, .65)";
      ctx.strokeRect(px + 3, py + 3, BLOCK - 6, BLOCK - 6);
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255, 79, 184, .35)";
      ctx.strokeRect(px + 2.5, py + 2.5, BLOCK - 5, BLOCK - 5);
      ctx.restore();
    }

    function drawBoard() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Subtle alternating row shading: improves height/stack readability at a glance
      // without adding decorative noise.
      for (let y = 0; y < ROWS; y++) {
        if (y % 2 !== 0) continue;
        ctx.fillStyle = "rgba(255,255,255,.015)";
        ctx.fillRect(0, y * BLOCK, COLS * BLOCK, BLOCK);
      }

      ctx.strokeStyle = "rgba(255,255,255,.04)";
      for (let x = 0; x <= COLS; x++) {
        ctx.beginPath();
        ctx.moveTo(x * BLOCK, 0);
        ctx.lineTo(x * BLOCK, ROWS * BLOCK);
        ctx.stroke();
      }
      for (let y = 0; y <= ROWS; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * BLOCK);
        ctx.lineTo(COLS * BLOCK, y * BLOCK);
        ctx.stroke();
      }

      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        const t = board[y][x];
        if (!t) continue;
        drawBlock(x, y, COLORS[t] || "#fff", 0.98);
      }

      const gy = ghostY();
      forEachFilledCell(current.mat, (x, y) => {
        const bx = current.x + x;
        const by = gy + y;
        if (by < 0) return;
        drawGhostBlock(bx, by);
      });

      forEachFilledCell(current.mat, (x, y) => {
        const bx = current.x + x;
        const by = current.y + y;
        if (by < 0) return;
        drawBlock(bx, by, COLORS[current.type] || "#fff", 1);
      });
    }

    function drawNext() {
      if (!next) return;
      nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
      const size = 24;
      const mat = next.mat;
      const w = mat[0].length;
      const h = mat.length;
      const ox = ((nextCanvas.width / size - w) / 2) | 0;
      const oy = ((nextCanvas.height / size - h) / 2) | 0;
      nextCtx.fillStyle = "rgba(255,255,255,.06)";
      nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);

      forEachFilledCell(mat, (x, y) => {
        const px = (ox + x) * size;
        const py = (oy + y) * size;

        // Match the main board block treatment (gloss + edge contrast)
        // so NEXT is instantly readable (esp. on light pieces like O/I).
        const color = COLORS[next.type];
        const g = nextCtx.createLinearGradient(px, py, px + size, py + size);
        g.addColorStop(0, "rgba(255,255,255,.32)");
        g.addColorStop(0.35, "rgba(255,255,255,.10)");
        g.addColorStop(1, "rgba(0,0,0,.18)");

        nextCtx.fillStyle = color;
        nextCtx.fillRect(px + 1, py + 1, size - 2, size - 2);
        nextCtx.fillStyle = g;
        nextCtx.fillRect(px + 1, py + 1, size - 2, size - 2);

        nextCtx.setLineDash([]);
        nextCtx.lineWidth = 2;
        nextCtx.strokeStyle = "rgba(0,0,0,.28)";
        nextCtx.strokeRect(px + 1.5, py + 1.5, size - 3, size - 3);
        nextCtx.lineWidth = 1;
        nextCtx.strokeStyle = "rgba(255,255,255,.20)";
        nextCtx.strokeRect(px + 2.5, py + 2.5, size - 5, size - 5);
      });
    }

    function hardDrop() {
      if (paused || gameOver) return;
      let y = current.y;
      while (!collide(current.mat, current.x, y + 1)) y++;
      current.y = y;
      beep({ f: 220, t: 0.07, type: 'square', gain: 0.28 });
      lockPiece();
    }

    function softDrop() {
      if (paused || gameOver) return;
      if (!collide(current.mat, current.x, current.y + 1)) {
        current.y++;
        score += 1;
        beep({ f: 330, t: 0.03, type: 'triangle', gain: 0.08 });
        updateHUD();
      } else lockPiece();
      dropCounter = 0;
    }

    function move(dx) {
      if (paused || gameOver) return;
      const nx = current.x + dx;
      if (!collide(current.mat, nx, current.y)) {
        current.x = nx;
        beep({ f: 520, t: 0.02, type: 'square', gain: 0.06 });
      }
    }

    function rotate() {
      if (paused || gameOver) return;
      const rotated = rotateCW(current.mat);
      for (const k of ROTATION_KICKS) {
        if (!collide(rotated, current.x + k, current.y)) {
          current.mat = rotated;
          current.x += k;
          beep({ f: 880, t: 0.04, type: 'square', gain: 0.12 });
          return;
        }
      }
    }

    function restart() {
      board = makeEmptyBoard();
      bag = [];
      score = 0;
      lines = 0;
      level = 1;
      gameOver = false;
      paused = false;
      next = null;
      dropCounter = 0;
      updateSpeedLockUI();
      updateHUD();
      spawn();
      hideOverlay();
      btnPause.textContent = "Pause";
      if (soundOn) startBGM();
    }

    function step(dtMs) {
      if (!paused && !gameOver) {
        dropCounter += dtMs;
        if (dropCounter > getDropInterval()) {
          if (!collide(current.mat, current.x, current.y + 1)) current.y++;
          else lockPiece();
          dropCounter = 0;
        }
      }
    }

    function render() {
      if (!current || !next) return;
      drawBoard();
      drawNext();
    }

    function bindControls() {
      // Keep enabled-state logic centralized (also sets aria-disabled + tabIndex).
      setTouchControlsEnabled(true);

      btnRot.textContent = "⟳";
      btnDown.textContent = "▼";
      btnDrop.textContent = "DROP";

      touchActions.leftTap = () => move(-1);
      touchActions.leftHold = () => move(-1);
      touchActions.rightTap = () => move(1);
      touchActions.rightHold = () => move(1);
      touchActions.rotTap = () => rotate();
      touchActions.downTap = () => softDrop();
      touchActions.downHold = () => softDrop();
      touchActions.dropTap = () => hardDrop();
    }

    function onKeyDown(e) {
      if (e.key === "p" || e.key === "P") { pauseToggle(); return true; }
      if (e.key === "l" || e.key === "L") { cycleSpeedLock(); return true; }
      if (paused && (e.key === "Escape")) { pauseToggle(false); return true; }
      if (gameOver && (e.key === "Enter")) { restart(); return true; }
      if (paused || gameOver) return false;
      switch (e.key) {
        case "ArrowLeft": move(-1); return true;
        case "ArrowRight": move(1); return true;
        case "ArrowDown": softDrop(); return true;
        case " ": hardDrop(); return true;
        case "ArrowUp": rotate(); return true;
        case "z": case "Z": rotate(); return true;
        case "x": case "X": rotate(); return true;
      }
      return false;
    }

    return {
      restart,
      step,
      render,
      bindControls,
      onKeyDown,
      cycleSpeedLock,
      hud: () => setHUD({ title: 'Mini Tetris', footer: 'MINI TETRIS', stat2Label: 'Lines' }),
      showSide: () => { if (tetrisSide) tetrisSide.classList.remove('hidden'); if (nextCanvas) nextCanvas.closest('.panel')?.classList.remove('hidden'); }
    };
  })();

  function startTetris() {
    mode = 'tetris';
    updateWakeLock();
    tetris.hud();
    setBestUI(readBest(BEST_TETRIS_KEY));
    if (tetrisSide) tetrisSide.classList.remove('hidden');
    tetris.bindControls();
    tetris.restart();

    showHintOnce(HINT_TETRIS_KEY, {
      title: 'Tetris: はじめに',
      text: [
        '操作:',
        '  ◀ ▶  移動',
        '  ⟳    回転',
        '  ▼    ソフトドロップ',
        '  DROP ハードドロップ',
        '  L     速度固定（練習）',
        '',
        '右上の Ⅱ で一時停止できます。',
      ].join('\n')
    });
  }

  // Use the same tap handler as the gameplay buttons:
  // - faster response on mobile (touchstart)
  // - suppress synthetic follow-up click (prevents double toggle)
  // - tiny haptic confirmation
  bindTap(btnSound, () => setSound(!soundOn));

  bindTap(btnPause, () => {
    if (paused) pauseToggle(false);
    else pauseToggle(true);
  });

  bindTap(btnResume, () => pauseToggle(false));

  // Mobile UX: allow tapping the dimmed backdrop to resume (when it's a normal pause).
  // (Avoids accidental resumes by requiring the click target to be the overlay itself, not the card.)
  overlay.addEventListener('click', (e) => {
    if (e.target !== overlay) return;
    if (!paused || gameOver) return;
    if ((overlayTitle?.textContent || '') !== 'Paused') return;
    pauseToggle(false);
  }, { passive: true });
  bindTap(btnRestart, () => {
    tetris.restart();
  });

  if (btnSpeedLock) {
    bindTap(btnSpeedLock, () => {
      tetris.cycleSpeedLock();
    });
  }

  // keyboard
  window.addEventListener("keydown", (e) => {
    tetris.onKeyDown(e);
  }, { passive: true });

  // render loop (time in ms from requestAnimationFrame)
  let lastTime = 0;
  function loop(time = 0) {
    const dtMs = Math.min(50, Math.max(0, time - lastTime));
    lastTime = time;
    tetris.step(dtMs);
    tetris.render();

    requestAnimationFrame(loop);
  }
  // start
  setSound(readSoundPref(), { persist: false });
  paused = false;
  gameOver = false;
  startTetris();
  updateWakeLock();

  requestAnimationFrame(loop);
})();
