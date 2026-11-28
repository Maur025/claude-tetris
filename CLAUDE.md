# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JS Tetris (HTML5 Canvas). No dependencies, no build, no tests, no linter. README and UI text are in Spanish.

## Run

Open `index.html` directly, or serve statically (e.g. `python3 -m http.server`) and visit `localhost:8000`.

## Architecture

Three files: `index.html` (DOM + canvases), `style.css`, `game.js` (all logic, one global script, `'use strict'`, no modules).

`game.js` details that span the file:

- Game state lives in module-level `let` globals (`board`, `current`, `next`, `score`, `lines`, `level`, `dropInterval`, `animId`...), reset in `init()`. Both restart buttons (game over and pause menu) call `init()` again.
- Board is a `ROWS×COLS` 2D array; `0` = empty, `1–8` = piece type index (8 = nut, 3×3 ring) into both `COLORS` and `PIECES` (same index scheme; shape cells hold their own type number). Indices `9` = bomb and `10` = gravity power-ups (1×1), never stored in `board`.
- Loop: `requestAnimationFrame(loop)` accumulates `dropAccum` vs `dropInterval`; `draw()` runs every frame. Pause/game over cancel `animId`; unpause restarts `loop` manually.
- Piece lifecycle: `lockPiece()` = `merge()` (or `explode()` for the bomb: clears 3×3, per-column gravity, scores per cell; or `compact()` for gravity: drops every column to fill gaps) → `clearLines()` → `spawn()`. `randomPiece()` enforces `POWERUP_COOLDOWN` normal pieces between power-ups (`piecesSincePowerUp`). `spawn()` promotes `next` and triggers `endGame()` if the new piece collides.
- Scoring/levels in `clearLines()`: `LINE_SCORES[cleared] * level`; level = `max(startLevel, floor(lines/10)+1)`; `dropInterval = dropIntervalFor(level)` = `max(100, 1000 - (level-1)*90)`. Soft drop +1/cell, hard drop +2/cell.
- Rotation: `rotateCW` + horizontal-only kicks `[0,-1,1,-2,2]` in `tryRotate()`.
- Input: single `keydown` listener (arrows, Up/X rotate, Space hard drop, P/Escape pause). While paused every other key is left to the focused menu control; `pressedKeys` drops auto-repeats of keys held since before resume/restart.
- Pause: `togglePause()` opens/closes `#pause-menu` (`#overlay` is only for game over) and resets `dropAccum` on resume. The start level selector sets `nextStartLevel` (localStorage `startLevel`), which `init()` copies into `startLevel` for the new game.
