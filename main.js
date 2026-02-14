/* Mini Tetris (mobile-first) */
(() => {
  const $ = (id) => document.getElementById(id);

  const canvas = $("board");
  const ctx = canvas.getContext("2d");
  const nextCanvas = $("next");
  const nextCtx = nextCanvas.getContext("2d");

  const scoreEl = $("score");
  const linesEl = $("lines");
  const levelEl = $("level");

  const overlay = $("overlay");
  const overlayTitle = $("overlayTitle");
  const overlayText = $("overlayText");
  const btnPause = $("btnPause");
  const btnResume = $("btnResume");
  const btnRestart = $("btnRestart");

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
    I: "#00e5ff",
    O: "#ffd400",
    T: "#b35cff",
    S: "#35e07a",
    Z: "#ff4d6d",
    J: "#4f7cff",
    L: "#ff9f1a",
    G: "#20283a" // ghost
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
      updateHUD();
    }
  }

  function spawn() {
    current = next || takeFromBag();
    next = takeFromBag();
    current.x = (COLS / 2 | 0) - ((current.mat[0].length / 2) | 0);
    current.y = -2;

    if (collide(current.mat, current.x, current.y + 1) && collide(current.mat, current.x, current.y)) {
      endGame();
    }
  }

  function hardDrop() {
    if (paused || gameOver) return;
    let y = current.y;
    while (!collide(current.mat, current.x, y + 1)) y++;
    current.y = y;
    lockPiece();
  }

  function softDrop() {
    if (paused || gameOver) return;
    if (!collide(current.mat, current.x, current.y + 1)) {
      current.y++;
      score += 1;
      updateHUD();
    } else {
      lockPiece();
    }
    dropCounter = 0;
  }

  function move(dx) {
    if (paused || gameOver) return;
    const nx = current.x + dx;
    if (!collide(current.mat, nx, current.y)) current.x = nx;
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
        return;
      }
    }
  }

  function lockPiece() {
    mergePiece(current);
    clearLines();
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
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(x * BLOCK + 1, y * BLOCK + 1, BLOCK - 2, BLOCK - 2);
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
    scoreEl.textContent = String(score);
    linesEl.textContent = String(lines);
    levelEl.textContent = String(level);
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
    if (paused) showOverlay("Paused", "Tap Resume to continue.");
    else hideOverlay();
  }

  function endGame() {
    gameOver = true;
    paused = true;
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

    drawBoard();
    drawNext();
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

  btnPause.addEventListener("click", () => {
    // if it shows Resume, it means paused
    if (paused) pauseToggle(false);
    else pauseToggle(true);
  });
  btnResume.addEventListener("click", () => pauseToggle(false));
  btnRestart.addEventListener("click", () => restart());

  // start
  restart();
  requestAnimationFrame(update);
})();
