/* Mini Tetris (mobile-first) */
(() => {
  // iOS Safari viewport height fix (avoids toolbar "jump" / overlap)
  const setVh = () => {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  };
  setVh();
  window.addEventListener('resize', setVh, { passive: true });

  const $ = (id) => document.getElementById(id);

  const canvas = $("board");
  const ctx = canvas.getContext("2d");
  const nextCanvas = $("next");
  const nextCtx = nextCanvas.getContext("2d");

  const scoreEl = $("score");
  const linesEl = $("lines");
  const levelEl = $("level"); // may be null if HUD hides level

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

  // touch buttons
  const btnLeft = $("btnLeft");
  const btnRight = $("btnRight");
  const btnRot = $("btnRot");
  const btnDown = $("btnDown");
  const btnDrop = $("btnDrop");

  // NOTE: We avoid blanket `touchstart preventDefault` on buttons because it can
  // swallow pointer/click events on some mobile browsers.

  // board config
  const COLS = 10;
  const ROWS = 20;
  const BLOCK = 30; // canvas is 300x600

  canvas.width = COLS * BLOCK;
  canvas.height = ROWS * BLOCK;

  const COLORS = {
    // brighter / cute palette
    I: "#6ff3ff",
    O: "#ffe46a",
    T: "#c48bff",
    S: "#6dffb0",
    Z: "#ff6b9b",
    J: "#7aa6ff",
    L: "#ffb35c",
    G: "rgba(255, 79, 184, .20)" // ghost
  };

  // 7-bag randomizer
  const PIECES = {
    I: [
      [0,0,0,0],
      [1,1,1,1],
      [0,0,0,0],
      [0,0,0,0],
    ],
    O: [
      [1,1],
      [1,1],
    ],
    T: [
      [0,1,0],
      [1,1,1],
      [0,0,0],
    ],
    S: [
      [0,1,1],
      [1,1,0],
      [0,0,0],
    ],
    Z: [
      [1,1,0],
      [0,1,1],
      [0,0,0],
    ],
    J: [
      [1,0,0],
      [1,1,1],
      [0,0,0],
    ],
    L: [
      [0,0,1],
      [1,1,1],
      [0,0,0],
    ],
  };

  function cloneMatrix(m) { return m.map(r => r.slice()); }

  function rotateCW(mat) {
    const h = mat.length;
    const w = mat[0].length;
    const res = Array.from({ length: w }, () => Array(h).fill(0));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      res[x][h - 1 - y] = mat[y][x];
    }
    return res;
  }

  function makeEmptyBoard() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(""));
  }

  let board;
  let bag = [];
  let current;
  let next;
  let dropCounter = 0;
  let lastTime = 0;
  let paused = false;
  let gameOver = false;

  // --- Audio (WebAudio; no external files) ---
  let audioCtx = null;
  let master = null;
  let bgGain = null;
  let sfxGain = null;
  let bgTimer = null;
  let soundOn = false;

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

  function setSound(on) {
    ensureAudio();
    soundOn = !!on;
    if (!audioCtx) {
      btnSound.textContent = "Sound: N/A";
      btnSound.disabled = true;
      return;
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

    // simple chiptune-ish loop (I–V–vi–IV feel)
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
      // melody + a quiet bass blip
      beep({ f, t: step * 0.9, type: 'square', gain: 0.09, to: 'bg' });
      beep({ f: f / 2, t: step * 0.9, type: 'triangle', gain: 0.05, to: 'bg' });
    };
    bgTimer = setInterval(tick, step * 1000);
  }

  function stopBGM() {
    if (bgTimer) clearInterval(bgTimer);
    bgTimer = null;
  }

  let score = 0;
  let lines = 0;
  let level = 1;

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
    return {
      type,
      mat: cloneMatrix(PIECES[type]),
      x: (COLS / 2 | 0) - 2,
      y: -2,
    };
  }

  function collide(mat, ox, oy) {
    for (let y = 0; y < mat.length; y++) {
      for (let x = 0; x < mat[y].length; x++) {
        if (!mat[y][x]) continue;
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
      for (let x = 0; x < COLS; x++) {
        if (!board[y][x]) continue outer;
      }
      board.splice(y, 1);
      board.unshift(Array(COLS).fill(""));
      cleared++;
      y++;
    }

    if (cleared) {
      lines += cleared;
      // classic-ish scoring
      const base = [0, 100, 300, 500, 800][cleared] || (cleared * 250);
      score += base * level;
      // level up every 10 lines
      const newLevel = Math.max(1, (lines / 10 | 0) + 1);
      if (newLevel !== level) level = newLevel;

      // SFX
      const sfxMap = {1: 660, 2: 740, 3: 880, 4: 990};
      beep({ f: sfxMap[cleared] || 880, t: 0.10, type: 'square', gain: 0.22 });

      // cute flash
      canvas.classList.remove('flash');
      // reflow
      void canvas.offsetWidth;
      canvas.classList.add('flash');

      updateHUD();
    }
  }

  function spawn() {
    current = next || takeFromBag();
    next = takeFromBag();
    current.x = (COLS / 2 | 0) - ((current.mat[0].length / 2) | 0);

    // Start visible immediately on mobile (avoid "nothing is happening" feeling)
    current.y = 0;

    if (collide(current.mat, current.x, current.y)) {
      endGame();
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
      // subtle tick
      beep({ f: 330, t: 0.03, type: 'triangle', gain: 0.08 });
      updateHUD();
    } else {
      lockPiece();
    }
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
    // simple wall-kick
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

  function lockPiece() {
    mergePiece(current);
    clearLines();

    // If blocks reach the top visible row, game over.
    if (board[0].some(Boolean)) {
      endGame();
      return;
    }

    spawn();
  }

  function getDropInterval() {
    // faster with level (cap)
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

    // candy highlight
    const g = ctx.createLinearGradient(px, py, px + BLOCK, py + BLOCK);
    g.addColorStop(0, "rgba(255,255,255,.35)");
    g.addColorStop(0.35, "rgba(255,255,255,.10)");
    g.addColorStop(1, "rgba(0,0,0,.18)");

    ctx.fillStyle = color;
    ctx.fillRect(px + 1, py + 1, BLOCK - 2, BLOCK - 2);

    ctx.fillStyle = g;
    ctx.fillRect(px + 1, py + 1, BLOCK - 2, BLOCK - 2);

    // outline
    ctx.strokeStyle = "rgba(255,255,255,.18)";
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 1.5, py + 1.5, BLOCK - 3, BLOCK - 3);

    ctx.globalAlpha = 1;
  }

  function drawBoard() {
    // background
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // grid subtle
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

    // fixed blocks
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const t = board[y][x];
        if (!t) continue;
        drawBlock(x, y, COLORS[t] || "#fff", 0.98);
      }
    }

    // ghost
    const gy = ghostY();
    for (let y = 0; y < current.mat.length; y++) {
      for (let x = 0; x < current.mat[y].length; x++) {
        if (!current.mat[y][x]) continue;
        const bx = current.x + x;
        const by = gy + y;
        if (by < 0) continue;
        drawBlock(bx, by, COLORS.G, 0.35);
      }
    }

    // current piece
    for (let y = 0; y < current.mat.length; y++) {
      for (let x = 0; x < current.mat[y].length; x++) {
        if (!current.mat[y][x]) continue;
        const bx = current.x + x;
        const by = current.y + y;
        if (by < 0) continue;
        drawBlock(bx, by, COLORS[current.type] || "#fff", 1);
      }
    }
  }

  function drawNext() {
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    const size = 24;
    const mat = next.mat;
    const w = mat[0].length;
    const h = mat.length;
    const ox = ((nextCanvas.width / size - w) / 2) | 0;
    const oy = ((nextCanvas.height / size - h) / 2) | 0;
    nextCtx.fillStyle = "rgba(255,255,255,.06)";
    nextCtx.fillRect(0,0,nextCanvas.width,nextCanvas.height);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!mat[y][x]) continue;
        nextCtx.fillStyle = COLORS[next.type];
        nextCtx.fillRect((ox + x) * size + 1, (oy + y) * size + 1, size - 2, size - 2);
      }
    }
  }

  function updateHUD() {
    if (scoreEl) scoreEl.textContent = String(score);
    if (linesEl) linesEl.textContent = String(lines);
    if (levelEl) levelEl.textContent = String(level);
  }

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

  function endGame() {
    gameOver = true;
    paused = true;
    stopBGM();
    // game over sfx
    beep({ f: 196, t: 0.18, type: 'sawtooth', gain: 0.22 });
    setTimeout(() => beep({ f: 110, t: 0.22, type: 'sawtooth', gain: 0.18 }), 120);
    btnPause.textContent = "Pause";
    showOverlay("Game Over", `Score ${score} / Lines ${lines}`);
  }

  function restart() {
    board = makeEmptyBoard();
    bag = [];
    score = 0;
    lines = 0;
    level = 1;
    paused = false;
    gameOver = false;
    next = null;
    updateHUD();
    spawn();
    hideOverlay();
    btnPause.textContent = "Pause";
    if (soundOn) startBGM();
  }

  function update(time = 0) {
    const delta = time - lastTime;
    lastTime = time;

    if (!paused && !gameOver) {
      dropCounter += delta;
      if (dropCounter > getDropInterval()) {
        if (!collide(current.mat, current.x, current.y + 1)) {
          current.y++;
        } else {
          lockPiece();
        }
        dropCounter = 0;
      }
    }

    // If not initialized yet, skip drawing
    if (current && next) {
      drawBoard();
      drawNext();
    }
    requestAnimationFrame(update);
  }

  // input: keyboard
  window.addEventListener("keydown", (e) => {
    if (e.key === "p" || e.key === "P") { pauseToggle(); return; }
    if (paused && (e.key === "Escape")) { pauseToggle(false); return; }
    if (gameOver && (e.key === "Enter")) { restart(); return; }

    if (paused || gameOver) return;
    switch (e.key) {
      case "ArrowLeft": move(-1); break;
      case "ArrowRight": move(1); break;
      case "ArrowDown": softDrop(); break;
      case " ": hardDrop(); break;
      case "ArrowUp": rotate(); break;
      case "z": case "Z": rotate(); break;
      case "x": case "X": rotate(); break;
    }
  }, { passive: true });

  // input: touch buttons (hold repeat for left/right/down)
  // iOS/Safari は PointerEvent 周りが怪しいことがあるので、touch/mouse の両対応で堅くする。
  function bindHold(btn, onTap, onHold) {
    let t = null;
    let r = null;

    const start = (e) => {
      e?.preventDefault?.();
      onTap();
      // start repeating after a short delay
      t = setTimeout(() => {
        r = setInterval(() => onHold(), 60);
      }, 180);
    };
    const stop = (e) => {
      e?.preventDefault?.();
      if (t) clearTimeout(t);
      if (r) clearInterval(r);
      t = null; r = null;
    };

    // touch
    btn.addEventListener("touchstart", start, { passive: false });
    btn.addEventListener("touchend", stop, { passive: false });
    btn.addEventListener("touchcancel", stop, { passive: false });

    // mouse
    btn.addEventListener("mousedown", start, { passive: false });
    btn.addEventListener("mouseup", stop, { passive: false });
    btn.addEventListener("mouseleave", stop, { passive: false });

    // fallback click
    btn.addEventListener("click", (e) => { e.preventDefault(); onTap(); }, { passive: false });
  }

  function bindTap(btn, fn) {
    btn.addEventListener("touchstart", (e) => { e.preventDefault(); fn(); }, { passive: false });
    btn.addEventListener("mousedown", (e) => { e.preventDefault(); fn(); }, { passive: false });
    btn.addEventListener("click", (e) => { e.preventDefault(); fn(); }, { passive: false });
  }

  bindHold(btnLeft,  () => move(-1), () => move(-1));
  bindHold(btnRight, () => move(1),  () => move(1));
  bindHold(btnDown,  () => softDrop(), () => softDrop());
  bindTap(btnRot, rotate);
  bindTap(btnDrop, hardDrop);

  function primeAudioFromGesture() {
    // iOS requires a user gesture to start audio
    ensureAudio();
    if (audioCtx) audioCtx.resume?.();
  }

  // any first interaction can prime audio
  window.addEventListener('touchstart', primeAudioFromGesture, { passive: true, once: true });
  window.addEventListener('mousedown', primeAudioFromGesture, { passive: true, once: true });
  window.addEventListener('keydown', primeAudioFromGesture, { passive: true, once: true });

  btnSound.addEventListener('click', () => setSound(!soundOn));

  btnPause.addEventListener("click", () => {
    // if it shows Resume, it means paused
    if (paused) pauseToggle(false);
    else pauseToggle(true);
  });
  btnResume.addEventListener("click", () => pauseToggle(false));
  btnRestart.addEventListener("click", () => restart());

  function showMenu() {
    // stop gameplay and show menu
    paused = true;
    stopBGM();
    hideOverlay();
    menuScreen.classList.remove('hidden');
    gameScreen.classList.add('hidden');
  }

  function startTetris() {
    menuScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    paused = false;
    gameOver = false;
    restart();
    // keep sound setting; BGM starts only if soundOn
    if (soundOn) startBGM();
  }

  btnMenuTetris.addEventListener('click', () => startTetris());
  btnMenu.addEventListener('click', () => showMenu());

  // start
  setSound(false);
  // init game state once so render loop doesn't crash even while menu is shown
  restart();
  paused = true;
  showMenu();
  requestAnimationFrame(update);
})();
