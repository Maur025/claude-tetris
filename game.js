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

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, piecesSincePowerUp;

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
  // combo: bloqueos de pieza consecutivos que eliminan al menos una línea
  combo = cleared ? combo + 1 : 0;
  maxCombo = Math.max(maxCombo, combo);
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
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

// ---- Récords locales ----
const RECORDS_KEY = 'records';
const MAX_RECORDS = 5;
const DEFAULT_NAME = 'Jugador';
const NAME_MAX = 12;
const NAME_FOCUS_DELAY = 500; // ms

const startScreen = document.getElementById('start-screen');
const startRecordsEl = document.getElementById('start-records');
const playBtn = document.getElementById('play-btn');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const gameOverRecordsEl = document.getElementById('gameover-records');
const recordMsg = document.getElementById('record-msg');
const recordForm = document.getElementById('record-form');
const recordNameInput = document.getElementById('record-name');
const overlayRecordsEl = document.getElementById('overlay-records');

let combo, maxCombo;
let pendingRecord = null; // récord recién guardado cuyo nombre aún se puede cambiar

// Entero no negativo, o 0 si el dato guardado no es válido
function toCount(value) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function cleanName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  return Array.from(name).slice(0, NAME_MAX).join('') || DEFAULT_NAME;
}

// Lee los récords tolerando datos ausentes, corruptos o mal formados
function loadRecords() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(RECORDS_KEY)); } catch (e) { /* sin almacenamiento o JSON corrupto */ }
  const top = (Array.isArray(data?.top) ? data.top : [])
    .filter(r => r && toCount(r.score) > 0)
    .map(r => ({
      name: cleanName(r.name),
      score: toCount(r.score),
      lines: toCount(r.lines),
      combo: toCount(r.combo),
      date: typeof r.date === 'string' ? r.date : '',
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RECORDS);
  return { top, bestCombo: toCount(data?.bestCombo), maxLines: toCount(data?.maxLines) };
}

function saveRecords(records) {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(records)); } catch (e) { /* sin almacenamiento */ }
}

function createEl(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}

function isSameRecord(a, b) {
  return a.date === b.date && a.score === b.score;
}

// Pinta la tabla y las marcas históricas; `highlight` es la entrada a resaltar
function renderRecords(container, records, highlight) {
  container.replaceChildren();
  if (records.top.length) {
    const table = createEl('table', undefined, 'records-table');
    const head = table.createTHead().insertRow();
    for (const title of ['#', 'Nombre', 'Puntos', 'Líneas', 'Combo'])
      head.appendChild(createEl('th', title));
    const body = table.createTBody();
    records.top.forEach((r, i) => {
      const row = body.insertRow();
      if (highlight && isSameRecord(r, highlight)) row.className = 'new-record';
      for (const value of [i + 1, r.name, r.score.toLocaleString(), r.lines, r.combo])
        row.appendChild(createEl('td', value));
    });
    container.appendChild(table);
  } else {
    container.appendChild(createEl('p', 'Aún no hay récords', 'records-empty'));
  }
  container.appendChild(createEl('p', `Mejor combo: ${records.bestCombo} · Máx. líneas: ${records.maxLines}`, 'records-stats'));
}

// Registra la partida terminada. Si entra en el top se guarda ya con el nombre
// por defecto (para no perderla al reiniciar o recargar) y luego se puede renombrar.
function recordGame() {
  const records = loadRecords();
  records.bestCombo = Math.max(records.bestCombo, maxCombo);
  records.maxLines = Math.max(records.maxLines, lines);
  const last = records.top[MAX_RECORDS - 1];
  const qualifies = score > 0 && (!last || score > last.score);
  const entry = qualifies
    ? { name: DEFAULT_NAME, score, lines, combo: maxCombo, date: new Date().toISOString() }
    : null;
  if (entry) {
    // sort estable: en empate queda por delante la marca más antigua
    records.top = [...records.top, entry].sort((a, b) => b.score - a.score).slice(0, MAX_RECORDS);
  }
  saveRecords(records);

  pendingRecord = entry && { records, entry };
  recordMsg.classList.toggle('hidden', !entry);
  recordForm.classList.toggle('hidden', !entry);
  renderRecords(overlayRecordsEl, records, entry);
  gameOverRecordsEl.classList.remove('hidden');
  if (entry) {
    recordNameInput.value = DEFAULT_NAME;
    // Se enfoca con retardo para que las pulsaciones rezagadas de la partida no cambien el nombre
    setTimeout(() => {
      if (!pendingRecord) return;
      recordNameInput.focus();
      recordNameInput.select();
    }, NAME_FOCUS_DELAY);
  }
}

// Aplica el nombre escrito al récord pendiente (una sola vez, sin duplicar la entrada)
function commitRecordName() {
  if (!pendingRecord) return;
  const { records, entry } = pendingRecord;
  pendingRecord = null;
  entry.name = cleanName(recordNameInput.value);
  // Relee por si otra pestaña cambió los récords; si la marca ya no está, no la recrea
  const stored = loadRecords();
  const match = stored.top.find(r => isSameRecord(r, entry));
  if (match) {
    match.name = entry.name;
    saveRecords(stored);
  }
  recordForm.classList.add('hidden');
  renderRecords(overlayRecordsEl, match ? stored : records, entry);
}

recordForm.addEventListener('submit', e => {
  e.preventDefault();
  recordNameInput.blur();
  commitRecordName();
});

// Una tecla de juego que se sigue manteniendo pulsada no debe editar el nombre
recordNameInput.addEventListener('keydown', e => {
  if (e.repeat && (e.code.startsWith('Arrow') || e.code === 'Space' || e.code === 'KeyX')) e.preventDefault();
});

// Los espacios de caídas rápidas rezagadas no deben ocupar el nombre
recordNameInput.addEventListener('input', () => {
  const trimmed = recordNameInput.value.trimStart();
  if (trimmed !== recordNameInput.value) recordNameInput.value = trimmed;
});

playBtn.addEventListener('click', () => {
  playBtn.blur(); // evita que Espacio vuelva a activar el botón
  startScreen.classList.add('hidden');
  init();
});

resetRecordsBtn.addEventListener('click', () => {
  if (!confirm('¿Seguro que quieres borrar todos los récords?')) return;
  try { localStorage.removeItem(RECORDS_KEY); } catch (e) { /* sin almacenamiento */ }
  renderRecords(startRecordsEl, loadRecords());
});

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
  recordGame();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
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
  commitRecordName(); // por si se reinicia sin pulsar Guardar
  gameOverRecordsEl.classList.add('hidden');
  combo = 0;
  maxCombo = 0;
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  piecesSincePowerUp = 0;
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement) return; // escribir el nombre no controla el juego
  if (!current) return; // pantalla de inicio: aún no hay partida
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
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
renderRecords(startRecordsEl, loadRecords()); // la partida empieza al pulsar Jugar
