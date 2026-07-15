document.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("snake-canvas");
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const stateEl = document.querySelector("[data-state]");
  const scoreEl = document.querySelector("[data-score]");
  const highScoreEl = document.querySelector("[data-high-score]");
  const messageEl = document.querySelector("[data-message]");
  const actionButtons = document.querySelectorAll("[data-action]");
  const dirButtons = document.querySelectorAll("[data-dir]");
  const boardWrap = canvas.parentElement;

  const GRID = 20;
  const STEP_MS = 120;
  const ENEMY_STEP_MS = 340;
  const ENEMY_BURST_MS = 5000;
  const ENEMY_RESPAWN_MS = 420;
  const STORAGE_KEY = "woo-choi-snake-high-score";

  const directions = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  const opposite = {
    up: "down",
    down: "up",
    left: "right",
    right: "left",
  };

  const state = {
    running: false,
    paused: false,
    gameOver: false,
    loopId: null,
    lastTick: 0,
    lastEnemyMove: 0,
    enemyBurstAt: 0,
    snake: [],
    food: null,
    enemy: null,
    direction: "right",
    queuedDirection: "right",
    score: 0,
    highScore: 0,
    boardSizePx: 0,
    cellSize: 0,
  };

  const loadHighScore = () => {
    try {
      const value = Number(window.localStorage.getItem(STORAGE_KEY));
      return Number.isFinite(value) ? value : 0;
    } catch {
      return 0;
    }
  };

  const saveHighScore = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(state.highScore));
    } catch {
      // Ignore storage failures.
    }
  };

  const setMessage = (text) => {
    if (messageEl) {
      messageEl.textContent = text;
    }
  };

  const setStateLabel = (text) => {
    if (stateEl) {
      stateEl.textContent = text;
    }
  };

  const setScoreLabel = () => {
    if (scoreEl) {
      scoreEl.textContent = String(state.score);
    }
    if (highScoreEl) {
      highScoreEl.textContent = String(state.highScore);
    }
  };

  const withinBounds = (point) => point.x >= 0 && point.x < GRID && point.y >= 0 && point.y < GRID;

  const samePoint = (a, b) => Boolean(a && b && a.x === b.x && a.y === b.y);

  const occupied = (point) =>
    state.snake.some((segment) => samePoint(segment, point)) ||
    samePoint(state.food, point) ||
    (state.enemy && !state.enemy.exploding && samePoint(state.enemy, point));

  const randomPoint = () => ({
    x: Math.floor(Math.random() * GRID),
    y: Math.floor(Math.random() * GRID),
  });

  const spawnFreePoint = () => {
    for (let attempts = 0; attempts < GRID * GRID * 4; attempts += 1) {
      const point = randomPoint();
      if (!occupied(point)) {
        return point;
      }
    }
    return { x: 1, y: 1 };
  };

  const randomEnemyDirection = (point) => {
    const options = Object.entries(directions).filter(([, dir]) => withinBounds({
      x: point.x + dir.x,
      y: point.y + dir.y,
    }));

    const fallback = options.length ? options : Object.entries(directions);
    return fallback[Math.floor(Math.random() * fallback.length)];
  };

  const spawnEnemy = () => {
    const point = spawnFreePoint();
    const [directionName] = randomEnemyDirection(point);
    state.enemy = {
      x: point.x,
      y: point.y,
      direction: directionName,
      exploding: false,
      respawnAt: 0,
    };
    state.enemyBurstAt = performance.now();
    state.lastEnemyMove = performance.now();
  };

  const spawnFood = () => {
    state.food = spawnFreePoint();
  };

  const resizeCanvas = () => {
    const width = Math.floor(boardWrap?.getBoundingClientRect().width ?? 320);
    const size = Math.max(260, Math.min(width, 560));
    const dpr = window.devicePixelRatio || 1;
    state.boardSizePx = size;
    state.cellSize = size / GRID;
    canvas.width = Math.floor(size * dpr);
    canvas.height = Math.floor(size * dpr);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  };

  const drawCell = (x, y, fillStyle, inset = 0.14) => {
    const size = state.cellSize;
    const pad = size * inset;
    ctx.fillStyle = fillStyle;
    ctx.fillRect(x * size + pad, y * size + pad, size - pad * 2, size - pad * 2);
  };

  const drawGrid = () => {
    ctx.save();
    ctx.strokeStyle = "rgba(99, 255, 158, 0.08)";
    ctx.lineWidth = 1;
    for (let i = 1; i < GRID; i += 1) {
      const pos = i * state.cellSize;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, state.boardSizePx);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(state.boardSizePx, pos);
      ctx.stroke();
    }
    ctx.restore();
  };

  const drawOverlay = (text, color = "rgba(12, 28, 18, 0.84)") => {
    ctx.save();
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, state.boardSizePx, state.boardSizePx);
    ctx.fillStyle = "#ecfff0";
    ctx.font = "bold 22px Segoe UI, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, state.boardSizePx / 2, state.boardSizePx / 2);
    ctx.restore();
  };

  const draw = () => {
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, state.boardSizePx, state.boardSizePx);
    drawGrid();

    if (state.food) {
      drawCell(state.food.x, state.food.y, "#b4ffd0", 0.28);
    }

    if (state.enemy) {
      const color = state.enemy.exploding ? "#ff8f8f" : "#ff6d6d";
      drawCell(state.enemy.x, state.enemy.y, color, state.enemy.exploding ? 0.08 : 0.18);
    }

    state.snake.forEach((segment, index) => {
      drawCell(segment.x, segment.y, index === 0 ? "#63ff9e" : "#39c96d", index === 0 ? 0.08 : 0.14);
    });

    if (!state.running && !state.gameOver) {
      drawOverlay("Press Start");
    } else if (state.paused) {
      drawOverlay("Paused");
    } else if (state.gameOver) {
      drawOverlay("Game Over");
    }
  };

  const updateStatus = () => {
    if (state.gameOver) {
      setStateLabel("Game Over");
      setMessage("Hit Restart to play again.");
      return;
    }

    if (!state.running) {
      setStateLabel("Ready");
      setMessage("Press Start or move with arrow keys / WASD.");
      return;
    }

    if (state.paused) {
      setStateLabel("Paused");
      setMessage("Resume with Start or Pause.");
      return;
    }

    setStateLabel("Running");
    setMessage("Collect food, avoid walls, self-collisions, and the exploding enemy.");
  };

  const scheduleLoop = () => {
    if (state.loopId === null && state.running && !state.paused && !state.gameOver) {
      state.loopId = window.requestAnimationFrame(tick);
    }
  };

  const endGame = (reason) => {
    state.running = false;
    state.paused = false;
    state.gameOver = true;
    if (reason) {
      setMessage(reason);
    }
    if (state.score > state.highScore) {
      state.highScore = state.score;
      saveHighScore();
    }
    setScoreLabel();
    updateStatus();
    draw();
  };

  const advanceSnake = () => {
    state.direction = state.queuedDirection;
    const head = state.snake[0];
    const move = directions[state.direction];
    const nextHead = {
      x: head.x + move.x,
      y: head.y + move.y,
    };

    if (!withinBounds(nextHead)) {
      endGame("Snake hit the wall.");
      return;
    }

    if (state.snake.some((segment) => samePoint(segment, nextHead))) {
      endGame("Snake ran into itself.");
      return;
    }

    if (state.enemy && !state.enemy.exploding && samePoint(state.enemy, nextHead)) {
      endGame("Snake collided with the enemy.");
      return;
    }

    state.snake.unshift(nextHead);

    if (samePoint(nextHead, state.food)) {
      state.score += 1;
      if (state.score > state.highScore) {
        state.highScore = state.score;
        saveHighScore();
      }
      setScoreLabel();
      setMessage("Food collected. Keep going.");
      spawnFood();
    } else {
      state.snake.pop();
    }
  };

  const moveEnemy = (now) => {
    if (!state.enemy || state.enemy.exploding) {
      return;
    }

    if (now - state.enemyBurstAt >= ENEMY_BURST_MS) {
      state.enemy.exploding = true;
      state.enemy.respawnAt = now + ENEMY_RESPAWN_MS;
      setMessage("Enemy exploded. A new one will spawn shortly.");
      return;
    }

    if (now - state.lastEnemyMove < ENEMY_STEP_MS) {
      return;
    }

    const options = Object.entries(directions)
      .map(([name, dir]) => ({
        name,
        x: state.enemy.x + dir.x,
        y: state.enemy.y + dir.y,
      }))
      .filter((candidate) => withinBounds(candidate));

    if (!options.length) {
      return;
    }

    const move = options[Math.floor(Math.random() * options.length)];
    state.enemy.x = move.x;
    state.enemy.y = move.y;
    state.enemy.direction = move.name;
    state.lastEnemyMove = now;

    if (state.snake.some((segment) => samePoint(segment, state.enemy))) {
      endGame("Enemy touched the snake.");
    }
  };

  const respawnEnemy = (now) => {
    const point = spawnFreePoint();
    const [directionName] = randomEnemyDirection(point);
    state.enemy = {
      x: point.x,
      y: point.y,
      direction: directionName,
      exploding: false,
      respawnAt: 0,
    };
    state.enemyBurstAt = now;
    state.lastEnemyMove = now;
    setMessage("Enemy respawned and resumed random movement.");
  };

  const tick = (now) => {
    state.loopId = null;

    if (!state.running || state.paused || state.gameOver) {
      draw();
      return;
    }

    if (state.enemy && state.enemy.exploding && now >= state.enemy.respawnAt) {
      respawnEnemy(now);
    } else {
      moveEnemy(now);
    }

    if (!state.running || state.gameOver) {
      draw();
      return;
    }

    if (now - state.lastTick >= STEP_MS) {
      state.lastTick = now;
      advanceSnake();
    }

    draw();
    updateStatus();
    scheduleLoop();
  };

  const startGame = () => {
    state.running = true;
    state.paused = false;
    state.gameOver = false;
    state.score = 0;
    state.direction = "right";
    state.queuedDirection = "right";
    state.snake = [
      { x: 6, y: 10 },
      { x: 5, y: 10 },
      { x: 4, y: 10 },
    ];
    state.highScore = loadHighScore();
    spawnFood();
    spawnEnemy();
    state.lastTick = performance.now();
    state.lastEnemyMove = state.lastTick;
    setScoreLabel();
    updateStatus();
    draw();
    scheduleLoop();
  };

  const pauseGame = () => {
    if (!state.running || state.gameOver) {
      return;
    }
    state.paused = !state.paused;
    if (!state.paused) {
      state.lastTick = performance.now();
      state.lastEnemyMove = state.lastTick;
      updateStatus();
      draw();
      scheduleLoop();
      return;
    }
    updateStatus();
    draw();
  };

  const restartGame = () => {
    startGame();
  };

  const queueDirection = (name) => {
    if (!directions[name]) {
      return;
    }

    if (state.gameOver) {
      startGame();
    }

    if (!state.running) {
      startGame();
    }

    const next = name;
    if (state.direction === opposite[next] || state.queuedDirection === opposite[next]) {
      return;
    }

    state.queuedDirection = next;
    state.lastTick = performance.now();
    updateStatus();
    scheduleLoop();
  };

  const handleKey = (event) => {
    const keyMap = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
      w: "up",
      W: "up",
      a: "left",
      A: "left",
      s: "down",
      S: "down",
      d: "right",
      D: "right",
    };

    if (keyMap[event.key]) {
      event.preventDefault();
      queueDirection(keyMap[event.key]);
      return;
    }

    if (event.key === " ") {
      event.preventDefault();
      pauseGame();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (!state.running || state.gameOver) {
        startGame();
      }
    }
  };

  actionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.getAttribute("data-action");
      if (action === "start") {
        if (!state.running || state.gameOver) {
          startGame();
        } else if (state.paused) {
          pauseGame();
        } else {
          state.lastTick = performance.now();
          state.lastEnemyMove = state.lastTick;
          updateStatus();
          scheduleLoop();
        }
        return;
      }

      if (action === "pause") {
        pauseGame();
        return;
      }

      if (action === "restart") {
        restartGame();
      }
    });
  });

  dirButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const dir = button.getAttribute("data-dir");
      if (dir) {
        queueDirection(dir);
      } else {
        pauseGame();
      }
    });
  });

  window.addEventListener("keydown", handleKey, { passive: false });
  window.addEventListener("resize", resizeCanvas);

  if (window.ResizeObserver && boardWrap) {
    const observer = new ResizeObserver(() => resizeCanvas());
    observer.observe(boardWrap);
  }

  state.highScore = loadHighScore();
  state.snake = [
    { x: 6, y: 10 },
    { x: 5, y: 10 },
    { x: 4, y: 10 },
  ];
  state.food = spawnFreePoint();
  spawnEnemy();
  setScoreLabel();
  updateStatus();
  resizeCanvas();
  draw();
});
