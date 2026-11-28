# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JS Tetris (HTML5 Canvas). No dependencies, no build, no tests, no linter. README and UI text are in Spanish.

## Run

Open `index.html` directly, or serve statically (e.g. `python3 -m http.server`) and visit `localhost:8000`.

## Architecture

Three files: `index.html` (DOM + canvases), `style.css`, `game.js` (all logic, one global script, `'use strict'`, no modules).

`game.js` details that span the file:

- Game state lives in module-level `let` globals (`board`, `current`, `next`, `score`, `lines`, `level`, `dropInterval`, `animId`...), reset in `init()`. Page load only shows `#start-screen`; `init()` first runs from its Jugar button (so `board`/`current` are undefined until then). Restart button calls `init()` again.
- Records: `localStorage` key `records` = `{ top (max 5), bestCombo, maxLines }`, read through `loadRecords()` (sanitizes bad data). `endGame()` → `recordGame()` saves a qualifying score immediately with a default name; `commitRecordName()` (Guardar or `init()`) only renames it. `combo`/`maxCombo` are updated in `clearLines()`.
- Board is a `ROWS×COLS` 2D array; `0` = empty, `1–8` = piece type index (8 = nut, 3×3 ring) into both `COLORS` and `PIECES` (same index scheme; shape cells hold their own type number). Indices `9` = bomb and `10` = gravity power-ups (1×1), never stored in `board`.
- Loop: `requestAnimationFrame(loop)` accumulates `dropAccum` vs `dropInterval`; `draw()` runs every frame. Pause/game over cancel `animId`; unpause restarts `loop` manually.
- Piece lifecycle: `lockPiece()` = `merge()` (or `explode()` for the bomb: clears 3×3, per-column gravity, scores per cell; or `compact()` for gravity: drops every column to fill gaps) → `clearLines()` → `spawn()`. `randomPiece()` enforces `POWERUP_COOLDOWN` normal pieces between power-ups (`piecesSincePowerUp`). `spawn()` promotes `next` and triggers `endGame()` if the new piece collides.
- Scoring/levels in `clearLines()`: `LINE_SCORES[cleared] * level`; level = `floor(lines/10)+1`; `dropInterval = max(100, 1000 - (level-1)*90)`. Soft drop +1/cell, hard drop +2/cell.
- Skins: `SKINS` (retro, neon, pastel, pixel) each define `colors` (same index scheme), optional canvas `background`/`grid` and `drawCell(context, px, py, size, color)`. `let COLORS` points to the active skin's colors; `applySkin()` swaps it, sets `data-skin` on `<html>` (canvas CSS), persists `localStorage.skin` and redraws. Independent of the light/dark theme. `drawBomb`, `drawGravity` and `drawNutHole` branch on skin flags (`glow`, `pixelated`).
- Rotation: `rotateCW` + horizontal-only kicks `[0,-1,1,-2,2]` in `tryRotate()`.
- Input: single `keydown` listener (arrows, Up/X rotate, Space hard drop, P pause); ignored for input targets and before the first game.
