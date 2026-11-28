'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - azul pálido
  '#ffb74d', // L - orange
  '#b0bec5', // N - tuerca (gris metálico)
  '#ff1744', // B - bomba (rojo)
  '#7c4dff', // G - gravedad (violeta)
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N - tuerca
  [[9]],                                       // B - bomba (power-up)
  [[10]],                                      // G - gravedad (power-up)
];

const NUT = 8; // índice de la tuerca en PIECES / COLORS
const BOMB = 9; // índice de la bomba en PIECES / COLORS
const GRAVITY = 10; // índice de la gravedad en PIECES / COLORS

const BOMB_CHANCE = 0.1;    // probabilidad de bomba una vez pasado el enfriamiento
const BOMB_CELL_SCORE = 10; // puntos por celda destruida (× nivel)
const GRAVITY_CHANCE = 0.06;    // probabilidad de gravedad una vez pasado el enfriamiento
const GRAVITY_CELL_SCORE = 5;   // puntos por hueco rellenado (× nivel)
const POWERUP_COOLDOWN = 5;     // mínimo de piezas normales entre power-ups

const LINE_SCORES = [0, 100, 300, 500, 800];
const MAX_START_LEVEL = 10; // máximo del selector de nivel inicial

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeBtn = document.getElementById('theme-toggle');
const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const pauseControls = document.getElementById('pause-controls');
const startLevelSelect = document.getElementById('start-level');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, piecesSincePowerUp;
let startLevel; // nivel con el que empezó la partida actual
let nextStartLevel = loadStartLevel(); // elegido en el menú para la próxima partida
// Teclas pulsadas desde que se (re)anudó la partida; filtra las que venían retenidas
const pressedKeys = new Set();

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  let type;
  const roll = piecesSincePowerUp >= POWERUP_COOLDOWN ? Math.random() : 1;
  if (roll < BOMB_CHANCE) type = BOMB;
  else if (roll < BOMB_CHANCE + GRAVITY_CHANCE) type = GRAVITY;
  else type = Math.floor(Math.random() * NUT) + 1; // 1..NUT, excluye los power-ups
  piecesSincePowerUp = type > NUT ? 0 : piecesSincePowerUp + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function dropIntervalFor(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.max(startLevel, Math.floor(lines / 10) + 1);
    dropInterval = dropIntervalFor(level);
    updateHUD();
  }
}

// Destruye el área 3×3 centrada en (cx, cy) y hace caer lo que quedaba encima
function explode(cx, cy) {
  const top = Math.max(0, cy - 1), bottom = Math.min(ROWS - 1, cy + 1);
  const left = Math.max(0, cx - 1), right = Math.min(COLS - 1, cx + 1);
  const height = bottom - top + 1;
  let destroyed = 0;
  for (let c = left; c <= right; c++) {
    for (let r = top; r <= bottom; r++)
      if (board[r][c]) destroyed++;
    // gravedad por columna: lo de arriba baja la altura de la explosión
    for (let r = bottom; r >= 0; r--)
      board[r][c] = r >= height ? board[r - height][c] : 0;
  }
  score += destroyed * BOMB_CELL_SCORE * level;
  updateHUD();
}

// Compacta cada columna: los bloques caen hasta rellenar los huecos
function compact() {
  let filled = 0;
  for (let c = 0; c < COLS; c++) {
    let write = ROWS - 1;
    let gaps = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (!board[r][c]) continue;
      gaps = Math.max(gaps, write - r); // vacías por debajo de este bloque
      const v = board[r][c];
      board[r][c] = 0;
      board[write--][c] = v;
    }
    filled += gaps;
  }
  score += filled * GRAVITY_CELL_SCORE * level;
  updateHUD();
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  if (current.type === BOMB) explode(current.x, current.y); // no se fusiona al tablero
  else if (current.type === GRAVITY) compact(); // tampoco se fusiona
  else merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  if (colorIndex === BOMB) {
    drawBomb(context, x, y, size);
    context.globalAlpha = 1;
    return;
  }
  if (colorIndex === GRAVITY) {
    drawGravity(context, x, y, size);
    context.globalAlpha = 1;
    return;
  }
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawBomb(context, x, y, size) {
  const cx = (x + 0.45) * size, cy = (y + 0.58) * size;
  context.fillStyle = COLORS[BOMB];
  context.beginPath();
  context.arc(cx, cy, size * 0.34, 0, Math.PI * 2);
  context.fill();
  // mecha
  context.strokeStyle = '#ffb300';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(cx + size * 0.2, cy - size * 0.25);
  context.quadraticCurveTo((x + 0.75) * size, (y + 0.08) * size, (x + 0.92) * size, (y + 0.16) * size);
  context.stroke();
}

function drawGravity(context, x, y, size) {
  const px = x * size, py = y * size;
  context.fillStyle = COLORS[GRAVITY];
  context.beginPath();
  context.roundRect(px + 1, py + 1, size - 2, size - 2, size * 0.25);
  context.fill();
  // flecha hacia abajo
  context.fillStyle = '#fff';
  context.fillRect(px + size * 0.42, py + size * 0.15, size * 0.16, size * 0.3);
  context.beginPath();
  context.moveTo(px + size * 0.25, py + size * 0.43);
  context.lineTo(px + size * 0.75, py + size * 0.43);
  context.lineTo(px + size * 0.5, py + size * 0.68);
  context.fill();
  // suelo
  context.fillRect(px + size * 0.2, py + size * 0.74, size * 0.6, size * 0.1);
}

// Arandela en el centro hueco de la tuerca; x, y = celda central
function drawNutHole(context, x, y, size, alpha) {
  context.globalAlpha = alpha ?? 1;
  context.strokeStyle = COLORS[NUT];
  context.lineWidth = 3;
  context.beginPath();
  context.arc((x + 0.5) * size, (y + 0.5) * size, size / 2 - 3, 0, Math.PI * 2);
  context.stroke();
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);
  if (current.type === NUT) drawNutHole(ctx, current.x + 1, gy + 1, BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
  if (current.type === NUT) drawNutHole(ctx, current.x + 1, current.y + 1, BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
  if (next.type === NUT) drawNutHole(nextCtx, offX + 1, offY + 1, NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (paused) {
    cancelAnimationFrame(animId);
    openPauseMenu();
  } else {
    closePauseMenu();
    pressedKeys.clear();
    dropAccum = 0;
    lastTime = performance.now();
    loop(lastTime);
  }
}

function openPauseMenu() {
  pauseMenu.classList.remove('hidden');
  resumeBtn.focus();
}

function closePauseMenu() {
  // sin foco, Espacio/Enter no pueden reactivar un control del menú
  if (pauseMenu.contains(document.activeElement)) document.activeElement.blur();
  pauseMenu.classList.add('hidden');
  showControls(false);
}

function showControls(show) {
  pauseControls.classList.toggle('hidden', !show);
  controlsBtn.setAttribute('aria-expanded', String(show));
  controlsBtn.textContent = show ? 'Ocultar controles' : 'Ver controles';
}

function loadStartLevel() {
  try {
    const saved = Number(localStorage.getItem('startLevel'));
    if (Number.isInteger(saved) && saved >= 1 && saved <= MAX_START_LEVEL) return saved;
  } catch (e) { /* sin almacenamiento */ }
  return 1;
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (gameOver) return; // endGame() no puede cancelar el frame en curso
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  startLevel = nextStartLevel;
  level = startLevel;
  paused = false;
  gameOver = false;
  dropInterval = dropIntervalFor(level);
  dropAccum = 0;
  lastTime = performance.now();
  piecesSincePowerUp = 0;
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  closePauseMenu();
  pressedKeys.clear();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP' || e.code === 'Escape') {
    // Ctrl/Cmd/Alt + tecla son atajos del navegador (p. ej. imprimir)
    if (!e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) togglePause();
    return;
  }
  // con el menú abierto las teclas solo actúan sobre el control enfocado
  if (paused || gameOver) return;
  // autorrepetición de una tecla retenida desde antes de reanudar / reiniciar
  if (e.repeat && !pressedKeys.has(e.code)) {
    e.preventDefault();
    return;
  }
  pressedKeys.add(e.code);
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);
resumeBtn.addEventListener('click', togglePause);
pauseRestartBtn.addEventListener('click', init);
controlsBtn.addEventListener('click', () => showControls(pauseControls.classList.contains('hidden')));

startLevelSelect.value = String(nextStartLevel);
startLevelSelect.addEventListener('change', () => {
  nextStartLevel = Number(startLevelSelect.value);
  try { localStorage.setItem('startLevel', String(nextStartLevel)); } catch (e) { /* sin almacenamiento */ }
});

function applyTheme(theme, save) {
  document.documentElement.dataset.theme = theme;
  const light = theme === 'light';
  themeBtn.textContent = light ? '☀️' : '🌙';
  themeBtn.setAttribute('aria-pressed', String(light));
  themeBtn.setAttribute('aria-label', light ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro');
  if (save) {
    try { localStorage.setItem('theme', theme); } catch (e) { /* sin almacenamiento */ }
  }
  // Redibuja para que el canvas refleje el cambio aunque esté en pausa / game over
  if (current && next) { draw(); drawNext(); }
}

themeBtn.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light', true);
  themeBtn.blur(); // evita que Espacio/Enter vuelvan a activar el botón
});


applyTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark', false);
init();
