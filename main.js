/* Mini Arcade (mobile-first): Tetris + Invaders */
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

  const $ = (id) => document.getElementById(id);

  const canvas = $("board");
  const ctx = canvas.getContext("2d");
  const nextCanvas = $("next");
  const nextCtx = nextCanvas.getContext("2d");

  const scoreEl = $("score");
  const stat2El = $("stat2");
  const stat2LabelEl = $("stat2Label");
  const titleEl = $("gameTitle");
  const footerEl = $("gameFooter");

  const overlay = $("overlay");
  const overlayTitle = $("overlayTitle");
  const overlayText = $("overlayText");
  const btnPause = $("btnPause");
  const btnSound = $("btnSound");
  const btnMenu = $("btnMenu");
  const btnResume = $("btnResume");
  const btnRestart = $("btnRestart");

  // menu
  const menuScreen = $("menuScreen");
  const gameScreen = $("gameScreen");
  const btnMenuTetris = $("btnMenuTetris");
  const btnMenuInvaders = $("btnMenuInvaders");
  const tetrisSide = $("tetrisSide");

  // touch buttons
  const btnLeft = $("btnLeft");
  const btnRight = $("btnRight");
  const btnRot = $("btnRot");
  const btnDown = $("btnDown");
  const btnDrop = $("btnDrop");

  // --- Audio (WebAudio; no external files) ---
  let audioCtx = null;
  let master = null;
  let bgGain = null;
  let sfxGain = null;
  let bgTimer = null;
  let soundOn = false;

  // Persist small settings (safe for GitHub Pages)
  const SOUND_KEY = 'miniArcade.sound';
  const readSoundPref = () => {
    try { return localStorage.getItem(SOUND_KEY) === '1'; } catch { return false; }
  };

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
      return;
    }

    if (persist) {
      try { localStorage.setItem(SOUND_KEY, soundOn ? '1' : '0'); } catch {}
    }

    btnSound.textContent = soundOn ? "Sound: ON" : "Sound: OFF";
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
  let paused = false;
  let gameOver = false;

  function showOverlay(title, text) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    overlay.classList.remove("hidden");
  }
  function hideOverlay() {
    overlay.classList.add("hidden");
  }

  function pauseToggle(force) {
    if (gameOver) return;
    paused = (force === undefined) ? !paused : !!force;
    btnPause.textContent = paused ? "Resume" : "Pause";
    if (paused) {
      stopBGM();
      showOverlay("Paused", "Tap Resume to continue.");
    } else {
      startBGM();
      hideOverlay();
    }
  }

  // --- Input wiring (buttons re-bound per game) ---
  function bindHold(btn, onTap, onHold) {
    let t = null;
    let r = null;

    const start = (e) => {
      if (btn.disabled) return;
      e?.preventDefault?.();
      onTap();
      t = setTimeout(() => { r = setInterval(() => onHold(), 60); }, 180);
    };
    const stop = (e) => {
      e?.preventDefault?.();
      if (t) clearTimeout(t);
      if (r) clearInterval(r);
      t = null; r = null;
    };

    btn.addEventListener("touchstart", start, { passive: false });
    btn.addEventListener("touchend", stop, { passive: false });
    btn.addEventListener("touchcancel", stop, { passive: false });

    btn.addEventListener("mousedown", start, { passive: false });
    btn.addEventListener("mouseup", stop, { passive: false });
    btn.addEventListener("mouseleave", stop, { passive: false });

    btn.addEventListener("click", (e) => { if (btn.disabled) return; e.preventDefault(); onTap(); }, { passive: false });
  }
  function bindTap(btn, fn) {
    btn.addEventListener("touchstart", (e) => { if (btn.disabled) return; e.preventDefault(); fn(); }, { passive: false });
    btn.addEventListener("mousedown", (e) => { if (btn.disabled) return; e.preventDefault(); fn(); }, { passive: false });
    btn.addEventListener("click", (e) => { if (btn.disabled) return; e.preventDefault(); fn(); }, { passive: false });
  }

  // We bind once, route to current handlers.
  const touchActions = {
    leftTap: () => {}, leftHold: () => {},
    rightTap: () => {}, rightHold: () => {},
    rotTap: () => {},
    downTap: () => {}, downHold: () => {},
    dropTap: () => {},
  };

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
  }

  // --- Game mode switching ---
  let mode = 'menu';

  function showMenu() {
    mode = 'menu';
    paused = true;
    gameOver = false;
    stopBGM();
    hideOverlay();
    menuScreen.classList.remove('hidden');
    gameScreen.classList.add('hidden');
  }

  function showGame() {
    menuScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
  }

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
      for (let y = 0; y < mat.length; y++) for (let x = 0; x < mat[y].length; x++) {
        if (!mat[y][x]) continue;
        const bx = x + ox;
        const by = y + oy;
        if (bx < 0 || bx >= COLS || by >= ROWS) return true;
        if (by >= 0 && board[by][bx]) return true;
      }
      return false;
    }

    function mergePiece(p) {
      const { mat, x: ox, y: oy, type } = p;
      for (let y = 0; y < mat.length; y++) for (let x = 0; x < mat[y].length; x++) {
        if (!mat[y][x]) continue;
        const bx = x + ox;
        const by = y + oy;
        if (by >= 0 && by < ROWS && bx >= 0 && bx < COLS) board[by][bx] = type;
      }
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
        const base = [0, 100, 300, 500, 800][cleared] || (cleared * 250);
        score += base * level;
        const newLevel = Math.max(1, (lines / 10 | 0) + 1);
        if (newLevel !== level) level = newLevel;

        const sfxMap = {1: 660, 2: 740, 3: 880, 4: 990};
        beep({ f: sfxMap[cleared] || 880, t: 0.10, type: 'square', gain: 0.22 });

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
      btnPause.textContent = "Pause";
      showOverlay("Game Over", `Score ${score} / Lines ${lines}`);
    }

    function lockPiece() {
      mergePiece(current);
      clearLines();
      if (board[0].some(Boolean)) { endGame(); return; }
      spawn();
    }

    function getDropInterval() {
      return Math.max(80, 650 - (level - 1) * 45);
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
      ctx.strokeStyle = "rgba(255,255,255,.18)";
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 1.5, py + 1.5, BLOCK - 3, BLOCK - 3);
      ctx.globalAlpha = 1;
    }

    function drawBoard() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

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
      for (let y = 0; y < current.mat.length; y++) for (let x = 0; x < current.mat[y].length; x++) {
        if (!current.mat[y][x]) continue;
        const bx = current.x + x;
        const by = gy + y;
        if (by < 0) continue;
        drawBlock(bx, by, COLORS.G, 0.35);
      }

      for (let y = 0; y < current.mat.length; y++) for (let x = 0; x < current.mat[y].length; x++) {
        if (!current.mat[y][x]) continue;
        const bx = current.x + x;
        const by = current.y + y;
        if (by < 0) continue;
        drawBlock(bx, by, COLORS[current.type] || "#fff", 1);
      }
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

      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (!mat[y][x]) continue;
        nextCtx.fillStyle = COLORS[next.type];
        nextCtx.fillRect((ox + x) * size + 1, (oy + y) * size + 1, size - 2, size - 2);
      }
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
      const kicks = [0, -1, 1, -2, 2];
      for (const k of kicks) {
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
      updateHUD();
      spawn();
      hideOverlay();
      btnPause.textContent = "Pause";
      if (soundOn) startBGM();
    }

    function step(dt) {
      if (!paused && !gameOver) {
        dropCounter += dt;
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
      btnLeft.disabled = false;
      btnRight.disabled = false;
      btnRot.disabled = false;
      btnDown.disabled = false;
      btnDrop.disabled = false;

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
      hud: () => setHUD({ title: 'Mini Tetris', footer: 'MINI TETRIS', stat2Label: 'Lines' }),
      showSide: () => { if (tetrisSide) tetrisSide.classList.remove('hidden'); if (nextCanvas) nextCanvas.closest('.panel')?.classList.remove('hidden'); }
    };
  })();

  // =========================
  // INVADERS
  // =========================

  const invaders = (() => {
    // logical units based on canvas px
    const W = canvas.width;
    const H = canvas.height;

    let score = 0;
    let lives = 3;

    const player = { x: W / 2, y: H - 44, w: 34, h: 14, speed: 260 };
    let bullets = []; // {x,y,v}
    let ebullets = [];

    let aliens = [];  // {x,y,w,h,alive}
    let axDir = 1;
    let axSpeed = 18; // px/sec (constant speed)
    let descend = 10;
    let fireCooldown = 0;
    let invaderShotTimer = 0;

    function updateHUD() {
      if (scoreEl) scoreEl.textContent = String(score);
      if (stat2El) stat2El.textContent = String(lives);
    }

    function resetAliens() {
      aliens = [];
      const rows = 5;
      const cols = 9;
      const aw = 20;
      const ah = 14;
      const gapX = 10;
      const gapY = 12;
      const startX = (W - (cols * aw + (cols - 1) * gapX)) / 2;
      const startY = 74;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          aliens.push({
            x: startX + c * (aw + gapX),
            y: startY + r * (ah + gapY),
            w: aw,
            h: ah,
            alive: true,
            row: r,
          });
        }
      }
      axDir = 1;
      axSpeed = 24;
    }

    function restart() {
      score = 0;
      lives = 3;
      gameOver = false;
      paused = false;
      bullets = [];
      ebullets = [];
      player.x = W / 2;
      fireCooldown = 0;
      invaderShotTimer = 0;
      resetAliens();
      updateHUD();
      hideOverlay();
      btnPause.textContent = "Pause";
      if (soundOn) startBGM();
    }

    function endGame(msg = 'Game Over') {
      gameOver = true;
      paused = true;
      stopBGM();
      beep({ f: 180, t: 0.16, type: 'sawtooth', gain: 0.22 });
      setTimeout(() => beep({ f: 90, t: 0.22, type: 'sawtooth', gain: 0.18 }), 120);
      showOverlay(msg, `Score ${score}`);
    }

    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

    function fire() {
      if (paused || gameOver) return;
      if (fireCooldown > 0) return;
      bullets.push({ x: player.x, y: player.y - 8, v: -520 });
      fireCooldown = 0.18;
      beep({ f: 980, t: 0.04, type: 'square', gain: 0.18 });
    }

    function move(dx, dt) {
      if (paused || gameOver) return;
      player.x = clamp(player.x + dx * player.speed * dt, 18, W - 18);
    }

    function anyAlive() { return aliens.some(a => a.alive); }

    function step(dt) {
      if (paused || gameOver) return;

      fireCooldown = Math.max(0, fireCooldown - dt);

      // constant (slower) approach speed
      const speedNow = 18; // px/sec

      // alien movement bounds
      let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const a of aliens) {
        if (!a.alive) continue;
        minX = Math.min(minX, a.x);
        maxX = Math.max(maxX, a.x + a.w);
        maxY = Math.max(maxY, a.y + a.h);
      }

      const hitWall = (minX <= 14 && axDir < 0) || (maxX >= W - 14 && axDir > 0);
      if (hitWall) {
        axDir *= -1;
        for (const a of aliens) if (a.alive) a.y += descend;
        // no big speed jumps on wall hit; the ramp is time-based
        beep({ f: 220, t: 0.03, type: 'triangle', gain: 0.06 });
      }

      for (const a of aliens) if (a.alive) a.x += axDir * speedNow * dt;

      // bullets
      for (const b of bullets) b.y += b.v * dt;
      bullets = bullets.filter(b => b.y > -20);

      // invader shooting
      invaderShotTimer -= dt;
      if (invaderShotTimer <= 0) {
        invaderShotTimer = 0.55 + Math.random() * 0.45;
        // pick a random alive alien to shoot
        const alive = aliens.filter(a => a.alive);
        if (alive.length) {
          const shooter = alive[(Math.random() * alive.length) | 0];
          ebullets.push({ x: shooter.x + shooter.w / 2, y: shooter.y + shooter.h + 2, v: 320 });
          beep({ f: 330, t: 0.02, type: 'square', gain: 0.06 });
        }
      }

      for (const b of ebullets) b.y += b.v * dt;
      ebullets = ebullets.filter(b => b.y < H + 40);

      // collisions: player bullets vs aliens
      for (const b of bullets) {
        for (const a of aliens) {
          if (!a.alive) continue;
          if (b.x >= a.x && b.x <= a.x + a.w && b.y >= a.y && b.y <= a.y + a.h) {
            a.alive = false;
            b.y = -999;
            score += 10 + (4 - a.row) * 2;
            beep({ f: 720, t: 0.05, type: 'square', gain: 0.16 });
            updateHUD();
            break;
          }
        }
      }
      bullets = bullets.filter(b => b.y > -50);

      // collisions: invader bullets vs player
      for (const b of ebullets) {
        const px = player.x - player.w / 2;
        const py = player.y - player.h / 2;
        if (b.x >= px && b.x <= px + player.w && b.y >= py && b.y <= py + player.h) {
          b.y = 9999;
          lives -= 1;
          beep({ f: 140, t: 0.10, type: 'sawtooth', gain: 0.20 });
          updateHUD();
          if (lives <= 0) { endGame(); return; }
        }
      }
      ebullets = ebullets.filter(b => b.y < H + 60);

      // lose if invaders reach near player
      if (maxY >= player.y - 20) {
        endGame('Invaded');
        return;
      }

      // wave clear
      if (!anyAlive()) {
        beep({ f: 990, t: 0.12, type: 'square', gain: 0.18 });
        resetAliens();
        // next wave: brief "breathing" moment
        invaderShotTimer = 0.40;
      }
    }

    function drawCRTFrame() {
      // invaders wants a different vibe: scanlines + vignette
      ctx.fillStyle = 'rgba(0,0,0,.28)';
      ctx.fillRect(0, 0, W, H);

      // scanlines
      ctx.strokeStyle = 'rgba(255,255,255,.03)';
      for (let y = 0; y < H; y += 6) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(W, y + 0.5);
        ctx.stroke();
      }

      const g = ctx.createRadialGradient(W * 0.5, H * 0.35, 20, W * 0.5, H * 0.5, H * 0.8);
      g.addColorStop(0, 'rgba(255,79,184,.06)');
      g.addColorStop(1, 'rgba(0,0,0,.35)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    function render() {
      ctx.clearRect(0, 0, W, H);
      drawCRTFrame();

      // player
      const px = player.x;
      const py = player.y;
      ctx.save();
      ctx.translate(px, py);
      ctx.fillStyle = 'rgba(255, 244, 251, .92)';
      ctx.strokeStyle = 'rgba(255,79,184,.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-player.w/2, player.h/2);
      ctx.lineTo(0, -player.h/2);
      ctx.lineTo(player.w/2, player.h/2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // aliens
      for (const a of aliens) {
        if (!a.alive) continue;
        const hue = 300 - a.row * 24;
        ctx.fillStyle = `hsla(${hue}, 100%, 72%, .92)`;
        ctx.strokeStyle = 'rgba(0,0,0,.18)';
        ctx.lineWidth = 1;
        roundRect(ctx, a.x, a.y, a.w, a.h, 4);
        ctx.fill();
        ctx.stroke();
        // eyes
        ctx.fillStyle = 'rgba(0,0,0,.25)';
        ctx.fillRect(a.x + 5, a.y + 4, 3, 3);
        ctx.fillRect(a.x + a.w - 8, a.y + 4, 3, 3);
      }

      // bullets
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      for (const b of bullets) ctx.fillRect(b.x - 1.5, b.y - 6, 3, 10);

      ctx.fillStyle = 'rgba(255,79,184,.85)';
      for (const b of ebullets) ctx.fillRect(b.x - 2, b.y - 2, 4, 10);

      // top hint line
      ctx.fillStyle = 'rgba(255,194,223,.80)';
      ctx.font = '12px "Yusei Magic", system-ui, sans-serif';
      ctx.fillText('MOVE ◀▶  /  FIRE', 14, 22);
    }

    function roundRect(c, x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2);
      c.beginPath();
      c.moveTo(x + rr, y);
      c.arcTo(x + w, y, x + w, y + h, rr);
      c.arcTo(x + w, y + h, x, y + h, rr);
      c.arcTo(x, y + h, x, y, rr);
      c.arcTo(x, y, x + w, y, rr);
      c.closePath();
    }

    function bindControls() {
      btnLeft.disabled = false;
      btnRight.disabled = false;
      btnRot.disabled = false;
      btnDown.disabled = true;
      btnDrop.disabled = false;

      btnRot.textContent = 'FIRE';
      btnDown.textContent = '—';
      btnDrop.textContent = 'FIRE';

      // tap = a small step; hold repeats by bindHold
      touchActions.leftTap = () => move(-1, 1/60);
      touchActions.leftHold = () => move(-1, 1/60);
      touchActions.rightTap = () => move(1, 1/60);
      touchActions.rightHold = () => move(1, 1/60);
      touchActions.rotTap = () => fire();
      touchActions.downTap = () => {};
      touchActions.downHold = () => {};
      touchActions.dropTap = () => fire();
    }

    function onKeyDown(e, dtLike = 1/60) {
      if (e.key === "p" || e.key === "P") { pauseToggle(); return true; }
      if (paused && (e.key === "Escape")) { pauseToggle(false); return true; }
      if (gameOver && (e.key === "Enter")) { restart(); return true; }
      if (paused || gameOver) return false;
      switch (e.key) {
        case "ArrowLeft": move(-1, dtLike); return true;
        case "ArrowRight": move(1, dtLike); return true;
        case " ":
        case "ArrowUp":
        case "z": case "Z":
        case "x": case "X":
          fire();
          return true;
      }
      return false;
    }

    return {
      restart,
      step,
      render,
      bindControls,
      onKeyDown,
      hud: () => setHUD({ title: 'Mini Invaders', footer: 'MINI INVADERS', stat2Label: 'Lives' }),
      showSide: () => { if (tetrisSide) tetrisSide.classList.add('hidden'); }
    };
  })();

  function currentGame() {
    return mode === 'invaders' ? invaders : tetris;
  }

  function startTetris() {
    mode = 'tetris';
    showGame();
    tetris.hud();
    if (tetrisSide) tetrisSide.classList.remove('hidden');
    tetris.bindControls();
    tetris.restart();
  }

  function startInvaders() {
    mode = 'invaders';
    showGame();
    invaders.hud();
    if (tetrisSide) tetrisSide.classList.add('hidden');
    invaders.bindControls();
    invaders.restart();
  }

  btnMenuTetris.addEventListener('click', () => startTetris());
  btnMenuInvaders.addEventListener('click', () => startInvaders());
  btnMenu.addEventListener('click', () => showMenu());

  btnSound.addEventListener('click', () => setSound(!soundOn));

  btnPause.addEventListener("click", () => {
    if (paused) pauseToggle(false);
    else pauseToggle(true);
  });
  btnResume.addEventListener("click", () => pauseToggle(false));

  btnRestart.addEventListener("click", () => {
    if (mode === 'tetris') tetris.restart();
    else if (mode === 'invaders') invaders.restart();
  });

  // keyboard routes to current game
  window.addEventListener("keydown", (e) => {
    if (mode === 'menu') return;
    currentGame().onKeyDown(e);
  }, { passive: true });

  // render loop
  let lastTime = 0;
  function loop(time = 0) {
    const dt = Math.min(0.05, (time - lastTime) / 1000);
    lastTime = time;

    if (mode === 'tetris') {
      tetris.step(dt * 1000);
      tetris.render();
    } else if (mode === 'invaders') {
      invaders.step(dt);
      invaders.render();
    } else {
      // menu: draw a quiet idle frame (keeps canvas from looking stale)
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    requestAnimationFrame(loop);
  }

  // start
  setSound(readSoundPref(), { persist: false });
  paused = true;
  showMenu();
  requestAnimationFrame(loop);
})();
