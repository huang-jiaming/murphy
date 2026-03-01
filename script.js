/* ============================================================
   Gomoku (五子棋) — Game Logic, Rendering, and Hard AI
   ============================================================ */

// ---- Configuration ----
const BOARD_SIZE = 15;
const WIN_LENGTH = 5;

const PLAYER_BLACK = 1;
const PLAYER_WHITE = 2;
const HUMAN_PLAYER = PLAYER_BLACK;
const CPU_PLAYER = PLAYER_WHITE;

const GAME_MODE_PVP = "pvp";
const GAME_MODE_CPU = "cpu";

const DIRECTIONS = [
  { dr: 0, dc: 1 },   // horizontal
  { dr: 1, dc: 0 },   // vertical
  { dr: 1, dc: 1 },   // diagonal ↘
  { dr: 1, dc: -1 },  // diagonal ↙
];

const WIN_SCORE = 1_000_000_000;
const AI_TIMEOUT = "AI_TIMEOUT";
const AI_CONFIG = {
  timeLimitMs: 700,
  candidateRadius: 2,
  maxDepthEarly: 3,
  maxDepthLate: 4,
};

// ---- State ----
let board = [];
let currentPlayer = PLAYER_BLACK;
let gameOver = false;
let moveHistory = [];  // [{row, col, player}, ...]
let moveCount = 0;
let winningCells = []; // [{row, col}, ...]
let soundEnabled = true;
let audioCtx = null;
let gameMode = GAME_MODE_PVP;
let aiThinking = false;

// ---- DOM References ----
const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const moveCounterEl = document.getElementById("move-counter");
const historyEl = document.getElementById("history");
const modeBtn = document.getElementById("mode-btn");
const restartBtn = document.getElementById("restart-btn");
const undoBtn = document.getElementById("undo-btn");
const soundBtn = document.getElementById("sound-btn");
const colLabelsEl = document.getElementById("col-labels");
const rowLabelsEl = document.getElementById("row-labels");

// Star-point positions for a 15x15 board (traditional)
const STAR_POINTS = [
  [3, 3], [3, 7], [3, 11],
  [7, 3], [7, 7], [7, 11],
  [11, 3], [11, 7], [11, 11],
];

// ---- Initialization ----

function initGame() {
  board = Array.from({ length: BOARD_SIZE }, () =>
    Array(BOARD_SIZE).fill(0)
  );
  currentPlayer = PLAYER_BLACK;
  gameOver = false;
  moveHistory = [];
  moveCount = 0;
  winningCells = [];
  aiThinking = false;

  updateModeButton();
  renderCoordinates();
  renderBoard();
  updateStatus();
  renderHistory();
}

// ---- Coordinate Labels ----

function renderCoordinates() {
  colLabelsEl.innerHTML = "";
  rowLabelsEl.innerHTML = "";

  colLabelsEl.style.gridTemplateColumns = `repeat(${BOARD_SIZE}, var(--cell-size))`;

  for (let c = 0; c < BOARD_SIZE; c++) {
    const span = document.createElement("span");
    span.textContent = String.fromCharCode(65 + c); // A-O
    colLabelsEl.appendChild(span);
  }

  for (let r = 0; r < BOARD_SIZE; r++) {
    const span = document.createElement("span");
    span.textContent = r + 1;
    span.style.height = "var(--cell-size)";
    rowLabelsEl.appendChild(span);
  }
}

// ---- Rendering ----

function canHumanMove() {
  if (gameOver || aiThinking) return false;
  if (gameMode === GAME_MODE_CPU) return currentPlayer === HUMAN_PLAYER;
  return true;
}

function renderBoard() {
  boardEl.innerHTML = "";
  boardEl.style.gridTemplateColumns = `repeat(${BOARD_SIZE}, var(--cell-size))`;
  boardEl.classList.toggle("game-over", gameOver);
  boardEl.classList.toggle(
    "ai-thinking",
    gameMode === GAME_MODE_CPU && !gameOver && (currentPlayer === CPU_PLAYER || aiThinking)
  );

  const lastMove = moveHistory.length > 0
    ? moveHistory[moveHistory.length - 1]
    : null;

  const interactive = canHumanMove();

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.row = r;
      cell.dataset.col = c;
      cell.setAttribute("role", "button");
      cell.setAttribute("aria-label",
        `${String.fromCharCode(65 + c)}${r + 1}` +
        (board[r][c] === PLAYER_BLACK ? " (Black)" : board[r][c] === PLAYER_WHITE ? " (White)" : "")
      );

      if (!interactive) {
        cell.classList.add("disabled");
      }

      // Edge classes to clip grid lines at borders
      if (r === 0) cell.classList.add("edge-top");
      if (r === BOARD_SIZE - 1) cell.classList.add("edge-bottom");
      if (c === 0) cell.classList.add("edge-left");
      if (c === BOARD_SIZE - 1) cell.classList.add("edge-right");

      // Star points
      if (STAR_POINTS.some(([sr, sc]) => sr === r && sc === c) && board[r][c] === 0) {
        const dot = document.createElement("div");
        dot.className = "star-dot";
        cell.classList.add("star-point");
        cell.appendChild(dot);
      }

      const val = board[r][c];
      if (val !== 0) {
        const piece = document.createElement("div");
        piece.className = "piece " + (val === PLAYER_BLACK ? "black" : "white");

        if (lastMove && lastMove.row === r && lastMove.col === c) {
          piece.classList.add("last-move");
        }

        if (isWinningCell(r, c)) {
          piece.classList.add("winning");
        }

        cell.appendChild(piece);
      } else {
        cell.classList.add("empty");

        // Hover preview stone only when a human can move
        if (interactive) {
          const hover = document.createElement("div");
          hover.className = "hover-stone " +
            (currentPlayer === PLAYER_BLACK ? "preview-black" : "preview-white");
          cell.appendChild(hover);
        }
      }

      cell.addEventListener("click", () => handleCellClick(r, c));
      boardEl.appendChild(cell);
    }
  }
}

function isWinningCell(r, c) {
  return winningCells.some(cell => cell.row === r && cell.col === c);
}

// ---- Game Logic ----

function handleCellClick(row, col) {
  if (!canHumanMove()) return;
  if (board[row][col] !== 0) return;
  applyMove(row, col);
}

function applyMove(row, col) {
  if (gameOver || board[row][col] !== 0) return false;

  const movingPlayer = currentPlayer;
  board[row][col] = movingPlayer;
  moveCount++;
  moveHistory.push({ row, col, player: movingPlayer });

  playSound();

  const win = checkWin(row, col);
  if (win) {
    winningCells = win;
    gameOver = true;
    renderBoard();
    updateStatus(movingPlayer === PLAYER_BLACK ? "black" : "white");
    renderHistory();
    return true;
  }

  if (checkDraw()) {
    gameOver = true;
    renderBoard();
    updateStatus("draw");
    renderHistory();
    return true;
  }

  currentPlayer = movingPlayer === PLAYER_BLACK ? PLAYER_WHITE : PLAYER_BLACK;
  renderBoard();
  updateStatus();
  renderHistory();

  if (gameMode === GAME_MODE_CPU && currentPlayer === CPU_PLAYER) {
    triggerComputerTurn();
  }

  return true;
}

/**
 * Check for WIN_LENGTH in a row around (row, col).
 * Returns array of winning cell coordinates, or null.
 */
function checkWin(row, col) {
  const player = board[row][col];

  for (const { dr, dc } of DIRECTIONS) {
    const cells = [{ row, col }];

    // Scan positive direction
    for (let i = 1; i < WIN_LENGTH; i++) {
      const nr = row + dr * i;
      const nc = col + dc * i;
      if (!inBounds(nr, nc) || board[nr][nc] !== player) break;
      cells.push({ row: nr, col: nc });
    }

    // Scan negative direction
    for (let i = 1; i < WIN_LENGTH; i++) {
      const nr = row - dr * i;
      const nc = col - dc * i;
      if (!inBounds(nr, nc) || board[nr][nc] !== player) break;
      cells.push({ row: nr, col: nc });
    }

    if (cells.length >= WIN_LENGTH) return cells;
  }

  return null;
}

function checkWinAt(row, col, player) {
  for (const { dr, dc } of DIRECTIONS) {
    let count = 1;

    let nr = row + dr;
    let nc = col + dc;
    while (inBounds(nr, nc) && board[nr][nc] === player) {
      count++;
      nr += dr;
      nc += dc;
    }

    nr = row - dr;
    nc = col - dc;
    while (inBounds(nr, nc) && board[nr][nc] === player) {
      count++;
      nr -= dr;
      nc -= dc;
    }

    if (count >= WIN_LENGTH) return true;
  }
  return false;
}

function checkDraw() {
  return moveCount === BOARD_SIZE * BOARD_SIZE;
}

function inBounds(row, col) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function getOpponent(player) {
  return player === PLAYER_BLACK ? PLAYER_WHITE : PLAYER_BLACK;
}

// ---- Computer Player (Hard) ----

function triggerComputerTurn() {
  if (gameMode !== GAME_MODE_CPU || gameOver || currentPlayer !== CPU_PLAYER || aiThinking) return;

  aiThinking = true;
  renderBoard();
  updateStatus("thinking");

  // Yield to the browser so UI updates first.
  setTimeout(() => {
    if (gameOver || gameMode !== GAME_MODE_CPU) {
      aiThinking = false;
      renderBoard();
      updateStatus();
      return;
    }

    const move = computeBestMove(CPU_PLAYER) || getFallbackMove();
    aiThinking = false;

    if (!move) return;
    applyMove(move.row, move.col);
  }, 30);
}

function getFallbackMove() {
  const center = Math.floor(BOARD_SIZE / 2);
  if (board[center][center] === 0) return { row: center, col: center };

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === 0) return { row: r, col: c };
    }
  }
  return null;
}

function getCandidateMoves() {
  if (moveCount === 0) {
    const center = Math.floor(BOARD_SIZE / 2);
    return [{ row: center, col: center }];
  }

  const radius = AI_CONFIG.candidateRadius;
  const set = new Set();
  let hasAny = false;

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === 0) continue;
      hasAny = true;

      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (!inBounds(nr, nc) || board[nr][nc] !== 0) continue;
          set.add(`${nr},${nc}`);
        }
      }
    }
  }

  if (!hasAny) return [getFallbackMove()];

  return Array.from(set, (key) => {
    const [row, col] = key.split(",").map(Number);
    return { row, col };
  });
}

function getCandidateLimit() {
  if (moveCount < 10) return 12;
  if (moveCount < 30) return 14;
  return 18;
}

function evaluatePattern(length, openEnds) {
  if (length >= 5) return WIN_SCORE / 2;
  if (openEnds === 0) return 0;

  if (length === 4) return openEnds === 2 ? 5_000_000 : 300_000;
  if (length === 3) return openEnds === 2 ? 120_000 : 15_000;
  if (length === 2) return openEnds === 2 ? 7_000 : 800;
  if (length === 1) return openEnds === 2 ? 50 : 10;
  return 0;
}

function evaluateMovePotential(row, col, player) {
  let total = 0;

  for (const { dr, dc } of DIRECTIONS) {
    let chain = 1;
    let openEnds = 0;

    let nr = row + dr;
    let nc = col + dc;
    while (inBounds(nr, nc) && board[nr][nc] === player) {
      chain++;
      nr += dr;
      nc += dc;
    }
    if (inBounds(nr, nc) && board[nr][nc] === 0) openEnds++;

    nr = row - dr;
    nc = col - dc;
    while (inBounds(nr, nc) && board[nr][nc] === player) {
      chain++;
      nr -= dr;
      nc -= dc;
    }
    if (inBounds(nr, nc) && board[nr][nc] === 0) openEnds++;

    total += evaluatePattern(chain, openEnds);
  }

  return total;
}

function scoreCandidate(move, player) {
  const opponent = getOpponent(player);
  const attack = evaluateMovePotential(move.row, move.col, player);
  const defense = evaluateMovePotential(move.row, move.col, opponent);
  const center = (BOARD_SIZE - 1) / 2;
  const dist = Math.abs(move.row - center) + Math.abs(move.col - center);
  const centerBonus = BOARD_SIZE * 2 - dist;

  return attack * 1.2 + defense * 1.05 + centerBonus;
}

function rankCandidates(moves, player, limit = getCandidateLimit()) {
  return moves
    .map((move) => ({ move, score: scoreCandidate(move, player) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(limit, moves.length))
    .map((entry) => entry.move);
}

function findImmediateWinningMove(player, candidates) {
  for (const move of candidates) {
    board[move.row][move.col] = player;
    const wins = checkWinAt(move.row, move.col, player);
    board[move.row][move.col] = 0;
    if (wins) return move;
  }
  return null;
}

function evaluateBoard(forPlayer) {
  const opponent = getOpponent(forPlayer);
  let score = 0;

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const owner = board[r][c];
      if (owner === 0) continue;

      for (const { dr, dc } of DIRECTIONS) {
        const pr = r - dr;
        const pc = c - dc;
        if (inBounds(pr, pc) && board[pr][pc] === owner) continue;

        let length = 0;
        let nr = r;
        let nc = c;
        while (inBounds(nr, nc) && board[nr][nc] === owner) {
          length++;
          nr += dr;
          nc += dc;
        }

        let openEnds = 0;
        if (inBounds(pr, pc) && board[pr][pc] === 0) openEnds++;
        if (inBounds(nr, nc) && board[nr][nc] === 0) openEnds++;

        const lineScore = evaluatePattern(length, openEnds);
        if (owner === forPlayer) {
          score += lineScore;
        } else if (owner === opponent) {
          score -= lineScore * 1.1;
        }
      }
    }
  }

  return score;
}

function ensureTime(startTime) {
  if (performance.now() - startTime > AI_CONFIG.timeLimitMs) {
    throw new Error(AI_TIMEOUT);
  }
}

function negamax(depth, alpha, beta, player, lastMove, startTime) {
  ensureTime(startTime);

  // If previous move won, this position is losing for current player.
  if (lastMove && checkWinAt(lastMove.row, lastMove.col, getOpponent(player))) {
    return -WIN_SCORE - depth;
  }

  if (depth === 0 || checkDraw()) {
    return evaluateBoard(player);
  }

  const candidates = rankCandidates(getCandidateMoves(), player);
  if (candidates.length === 0) return 0;

  let best = -Infinity;
  for (const move of candidates) {
    board[move.row][move.col] = player;
    moveCount++;

    const score = -negamax(depth - 1, -beta, -alpha, getOpponent(player), move, startTime);

    board[move.row][move.col] = 0;
    moveCount--;

    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }

  return best;
}

function searchRoot(depth, player, candidates, startTime) {
  let alpha = -Infinity;
  const beta = Infinity;
  let bestMove = candidates[0];

  for (const move of candidates) {
    ensureTime(startTime);

    board[move.row][move.col] = player;
    moveCount++;

    let score;
    if (checkWinAt(move.row, move.col, player)) {
      score = WIN_SCORE + depth;
    } else {
      score = -negamax(depth - 1, -beta, -alpha, getOpponent(player), move, startTime);
    }

    board[move.row][move.col] = 0;
    moveCount--;

    if (score > alpha) {
      alpha = score;
      bestMove = move;
    }
  }

  return { bestMove, score: alpha };
}

function computeBestMove(player) {
  const candidates = rankCandidates(getCandidateMoves(), player, 24);
  if (candidates.length === 0) return null;

  const winningNow = findImmediateWinningMove(player, candidates);
  if (winningNow) return winningNow;

  const opponent = getOpponent(player);
  const mustBlock = findImmediateWinningMove(opponent, candidates);
  if (mustBlock) return mustBlock;

  const startTime = performance.now();
  const maxDepth = moveCount < 16 ? AI_CONFIG.maxDepthEarly : AI_CONFIG.maxDepthLate;

  let ordered = [...candidates];
  let bestMove = ordered[0];
  let bestScore = -Infinity;

  for (let depth = 1; depth <= maxDepth; depth++) {
    try {
      const result = searchRoot(depth, player, ordered, startTime);
      bestMove = result.bestMove;
      bestScore = result.score;

      // Principal variation first: improves alpha-beta cuts at next depth.
      ordered = [
        bestMove,
        ...ordered.filter((move) => move.row !== bestMove.row || move.col !== bestMove.col),
      ];

      if (Math.abs(bestScore) >= WIN_SCORE / 2) break;
    } catch (err) {
      if (err instanceof Error && err.message === AI_TIMEOUT) break;
      throw err;
    }
  }

  return bestMove;
}

// ---- Controls ----

function toggleGameMode() {
  if (aiThinking) return;
  gameMode = gameMode === GAME_MODE_PVP ? GAME_MODE_CPU : GAME_MODE_PVP;
  initGame();
}

function updateModeButton() {
  if (gameMode === GAME_MODE_CPU) {
    modeBtn.textContent = "🤖 Vs Computer (Hard)";
    modeBtn.classList.add("active-mode");
  } else {
    modeBtn.textContent = "🤝 Two Players";
    modeBtn.classList.remove("active-mode");
  }
}

// ---- Undo ----

function undoMove() {
  if (aiThinking || moveHistory.length === 0 || gameOver) return;

  const steps = gameMode === GAME_MODE_CPU ? Math.min(2, moveHistory.length) : 1;
  for (let i = 0; i < steps; i++) {
    const last = moveHistory.pop();
    board[last.row][last.col] = 0;
    moveCount--;
  }

  winningCells = [];
  gameOver = false;

  if (moveHistory.length === 0) {
    currentPlayer = PLAYER_BLACK;
  } else {
    const last = moveHistory[moveHistory.length - 1];
    currentPlayer = last.player === PLAYER_BLACK ? PLAYER_WHITE : PLAYER_BLACK;
  }

  renderBoard();
  updateStatus();
  renderHistory();
}

// ---- Status Updates ----

function updateStatus(result) {
  moveCounterEl.textContent = `Move: ${moveCount}`;

  if (result === "thinking") {
    statusEl.innerHTML = `<span class="status-piece white"></span> Computer is thinking...`;
    return;
  }

  if (result === "draw") {
    statusEl.innerHTML = "Game over — <strong>Draw!</strong>";
    return;
  }

  if (result === "black" || result === "white") {
    const pieceHTML = `<span class="status-piece ${result}"></span>`;
    let name = result === "black" ? "Black" : "White";
    if (gameMode === GAME_MODE_CPU) {
      name = result === "black" ? "You" : "Computer";
    }
    statusEl.innerHTML = `${pieceHTML} <strong>${name} wins!</strong>`;
    return;
  }

  const color = currentPlayer === PLAYER_BLACK ? "black" : "white";
  let name;
  if (gameMode === GAME_MODE_CPU) {
    name = currentPlayer === HUMAN_PLAYER ? "Your" : "Computer";
  } else {
    name = currentPlayer === PLAYER_BLACK ? "Black" : "White";
  }
  const pieceHTML = `<span class="status-piece ${color}"></span>`;
  statusEl.innerHTML = `${pieceHTML} ${name}'s turn`;
}

// ---- Move History ----

function renderHistory() {
  historyEl.innerHTML = "";

  moveHistory.forEach((move, idx) => {
    const li = document.createElement("li");
    if (idx === moveHistory.length - 1) li.classList.add("latest");

    const dot = document.createElement("span");
    dot.className = "hist-piece " + (move.player === PLAYER_BLACK ? "black" : "white");

    const coord = document.createElement("span");
    coord.textContent = formatCoord(move.row, move.col);

    li.appendChild(dot);
    li.appendChild(coord);
    historyEl.appendChild(li);
  });

  // Scroll history panel to bottom
  const panel = historyEl.closest(".history-panel");
  if (panel) panel.scrollTop = panel.scrollHeight;
}

function formatCoord(row, col) {
  return String.fromCharCode(65 + col) + (row + 1);
}

// ---- Sound ----

function playSound() {
  if (!soundEnabled) return;

  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.type = "sine";
  osc.frequency.setValueAtTime(800, audioCtx.currentTime);
  gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.06);

  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + 0.06);
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  soundBtn.textContent = soundEnabled ? "🔊 Sound" : "🔇 Sound";
  soundBtn.classList.toggle("muted", !soundEnabled);
}

// ---- Event Listeners ----

modeBtn.addEventListener("click", toggleGameMode);
restartBtn.addEventListener("click", initGame);
undoBtn.addEventListener("click", undoMove);
soundBtn.addEventListener("click", toggleSound);

// ---- Start ----

initGame();
/* ============================================================
   Gomoku (五子棋) — Game Logic & Rendering
   ============================================================ */

// ---- Configuration (tweak these) ----
const BOARD_SIZE = 15;
const WIN_LENGTH = 5;

// ---- State ----
let board = [];
let currentPlayer = 1; // 1 = black, 2 = white
let gameOver = false;
let moveHistory = [];  // [{row, col, player}, ...]
let moveCount = 0;
let winningCells = []; // [{row, col}, ...]
let soundEnabled = true;
let audioCtx = null;

// ---- DOM References ----
const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const moveCounterEl = document.getElementById("move-counter");
const historyEl = document.getElementById("history");
const restartBtn = document.getElementById("restart-btn");
const undoBtn = document.getElementById("undo-btn");
const soundBtn = document.getElementById("sound-btn");
const colLabelsEl = document.getElementById("col-labels");
const rowLabelsEl = document.getElementById("row-labels");

// Star-point positions for a 15x15 board (traditional)
const STAR_POINTS = [
  [3, 3], [3, 7], [3, 11],
  [7, 3], [7, 7], [7, 11],
  [11, 3], [11, 7], [11, 11],
];

// ---- Initialization ----

function initGame() {
  board = Array.from({ length: BOARD_SIZE }, () =>
    Array(BOARD_SIZE).fill(0)
  );
  currentPlayer = 1;
  gameOver = false;
  moveHistory = [];
  moveCount = 0;
  winningCells = [];

  renderCoordinates();
  renderBoard();
  updateStatus();
  renderHistory();
}

// ---- Coordinate Labels ----

function renderCoordinates() {
  colLabelsEl.innerHTML = "";
  rowLabelsEl.innerHTML = "";

  colLabelsEl.style.gridTemplateColumns = `repeat(${BOARD_SIZE}, var(--cell-size))`;

  for (let c = 0; c < BOARD_SIZE; c++) {
    const span = document.createElement("span");
    span.textContent = String.fromCharCode(65 + c); // A-O
    colLabelsEl.appendChild(span);
  }

  for (let r = 0; r < BOARD_SIZE; r++) {
    const span = document.createElement("span");
    span.textContent = r + 1;
    span.style.height = "var(--cell-size)";
    rowLabelsEl.appendChild(span);
  }
}

// ---- Rendering ----

function renderBoard() {
  boardEl.innerHTML = "";
  boardEl.style.gridTemplateColumns = `repeat(${BOARD_SIZE}, var(--cell-size))`;
  boardEl.classList.toggle("game-over", gameOver);

  const lastMove = moveHistory.length > 0
    ? moveHistory[moveHistory.length - 1]
    : null;

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.row = r;
      cell.dataset.col = c;
      cell.setAttribute("role", "button");
      cell.setAttribute("aria-label",
        `${String.fromCharCode(65 + c)}${r + 1}` +
        (board[r][c] === 1 ? " (Black)" : board[r][c] === 2 ? " (White)" : "")
      );

      // Edge classes to clip grid lines at borders
      if (r === 0) cell.classList.add("edge-top");
      if (r === BOARD_SIZE - 1) cell.classList.add("edge-bottom");
      if (c === 0) cell.classList.add("edge-left");
      if (c === BOARD_SIZE - 1) cell.classList.add("edge-right");

      // Star points
      if (STAR_POINTS.some(([sr, sc]) => sr === r && sc === c) && board[r][c] === 0) {
        const dot = document.createElement("div");
        dot.className = "star-dot";
        cell.classList.add("star-point");
        cell.appendChild(dot);
      }

      const val = board[r][c];
      if (val !== 0) {
        const piece = document.createElement("div");
        piece.className = "piece " + (val === 1 ? "black" : "white");

        if (lastMove && lastMove.row === r && lastMove.col === c) {
          piece.classList.add("last-move");
        }

        if (isWinningCell(r, c)) {
          piece.classList.add("winning");
        }

        cell.appendChild(piece);
      } else {
        cell.classList.add("empty");

        // Hover preview stone
        const hover = document.createElement("div");
        hover.className = "hover-stone " +
          (currentPlayer === 1 ? "preview-black" : "preview-white");
        cell.appendChild(hover);
      }

      cell.addEventListener("click", () => handleCellClick(r, c));
      boardEl.appendChild(cell);
    }
  }
}

function isWinningCell(r, c) {
  return winningCells.some(cell => cell.row === r && cell.col === c);
}

// ---- Game Logic ----

function handleCellClick(row, col) {
  if (gameOver || board[row][col] !== 0) return;

  board[row][col] = currentPlayer;
  moveCount++;
  moveHistory.push({ row, col, player: currentPlayer });

  playSound();

  const win = checkWin(row, col);
  if (win) {
    winningCells = win;
    gameOver = true;
    renderBoard();
    updateStatus(currentPlayer === 1 ? "black" : "white");
    renderHistory();
    return;
  }

  if (checkDraw()) {
    gameOver = true;
    renderBoard();
    updateStatus("draw");
    renderHistory();
    return;
  }

  currentPlayer = currentPlayer === 1 ? 2 : 1;
  renderBoard();
  updateStatus();
  renderHistory();
}

/**
 * Check for WIN_LENGTH in a row around (row, col).
 * Scans 4 axes: horizontal, vertical, and both diagonals.
 * Returns array of winning cell coordinates, or null.
 */
function checkWin(row, col) {
  const player = board[row][col];
  const directions = [
    { dr: 0, dc: 1 },  // horizontal
    { dr: 1, dc: 0 },  // vertical
    { dr: 1, dc: 1 },  // diagonal ↘
    { dr: 1, dc: -1 }, // diagonal ↙
  ];

  for (const { dr, dc } of directions) {
    const cells = [{ row, col }];

    // Scan positive direction
    for (let i = 1; i < WIN_LENGTH; i++) {
      const nr = row + dr * i;
      const nc = col + dc * i;
      if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) break;
      if (board[nr][nc] !== player) break;
      cells.push({ row: nr, col: nc });
    }

    // Scan negative direction
    for (let i = 1; i < WIN_LENGTH; i++) {
      const nr = row - dr * i;
      const nc = col - dc * i;
      if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) break;
      if (board[nr][nc] !== player) break;
      cells.push({ row: nr, col: nc });
    }

    if (cells.length >= WIN_LENGTH) return cells;
  }

  return null;
}

function checkDraw() {
  return moveCount === BOARD_SIZE * BOARD_SIZE;
}

// ---- Undo ----

function undoMove() {
  if (moveHistory.length === 0 || gameOver) return;

  const last = moveHistory.pop();
  board[last.row][last.col] = 0;
  moveCount--;
  currentPlayer = last.player;

  renderBoard();
  updateStatus();
  renderHistory();
}

// ---- Status Updates ----

function updateStatus(result) {
  moveCounterEl.textContent = `Move: ${moveCount}`;

  if (result === "draw") {
    statusEl.innerHTML = "Game over — <strong>Draw!</strong>";
    return;
  }

  if (result === "black" || result === "white") {
    const pieceHTML = `<span class="status-piece ${result}"></span>`;
    const name = result === "black" ? "Black" : "White";
    statusEl.innerHTML = `${pieceHTML} <strong>${name} wins!</strong>`;
    return;
  }

  const color = currentPlayer === 1 ? "black" : "white";
  const name = currentPlayer === 1 ? "Black" : "White";
  const pieceHTML = `<span class="status-piece ${color}"></span>`;
  statusEl.innerHTML = `${pieceHTML} ${name}'s turn`;
}

// ---- Move History ----

function renderHistory() {
  historyEl.innerHTML = "";

  moveHistory.forEach((move, idx) => {
    const li = document.createElement("li");
    if (idx === moveHistory.length - 1) li.classList.add("latest");

    const dot = document.createElement("span");
    dot.className = "hist-piece " + (move.player === 1 ? "black" : "white");

    const coord = document.createElement("span");
    coord.textContent = formatCoord(move.row, move.col);

    li.appendChild(dot);
    li.appendChild(coord);
    historyEl.appendChild(li);
  });

  // Scroll history panel to bottom
  const panel = historyEl.closest(".history-panel");
  if (panel) panel.scrollTop = panel.scrollHeight;
}

function formatCoord(row, col) {
  return String.fromCharCode(65 + col) + (row + 1);
}

// ---- Sound ----

function playSound() {
  if (!soundEnabled) return;

  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.type = "sine";
  osc.frequency.setValueAtTime(800, audioCtx.currentTime);
  gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.06);

  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + 0.06);
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  soundBtn.textContent = soundEnabled ? "🔊 Sound" : "🔇 Sound";
  soundBtn.classList.toggle("muted", !soundEnabled);
}

// ---- Event Listeners ----

restartBtn.addEventListener("click", initGame);
undoBtn.addEventListener("click", undoMove);
soundBtn.addEventListener("click", toggleSound);

// ---- Start ----

initGame();
