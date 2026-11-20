# Valaak's — 1v1 Duel

A browser-based 3D FPS 1v1 against an AI opponent, modelled on VALORANT's sensitivity, shooting, weapons and movement. Plain HTML + CSS + ES modules + Three.js (loaded from a CDN through an import map). No build step, no server code, no account.

## Play

- **Hosted (recommended):** open the site URL (see GitHub Pages below).
- **Locally:** double-click `index.html`. Browsers block ES-module imports from `file://`, so on `file://` the page forwards to `index.offline.html`, a generated single-file copy of the same code (weapon data comes from the copy embedded in `js/weapons.js`). An internet connection is needed the first time so the browser can fetch Three.js from jsDelivr.
  For the most reliable local run, serve the folder: `python -m http.server` then open `http://localhost:8000`.
- Use **Chrome or Edge** for raw mouse input (`unadjustedMovement`, no OS acceleration). Firefox works but uses normal pointer lock; the game shows a warning when raw input is unavailable.

### Controls

| Action | Key |
|---|---|
| Shoot | Left mouse |
| ADS (rifles, SMGs, heavies — hold) / scope cycle (snipers — click) / alt fire (Classic, Bucky) | Right mouse |
| Reload | R |
| Pause | ESC (or losing focus/pointer lock) |
| Restart | F5 |
| Play again on results | Enter |
| Move inside the spawn square / walk / crouch / jump (on by default; toggle in Gameplay) | WASD / Shift / C or Ctrl / Space |

### How a match works

PLAY → weapon select → START. You spawn in the square at the near end, the bot spawns at the far end of the same arena. Each round has a 3-second freeze, then it's live until one of you dies (both have 150 HP) or the round timer runs out. First to N rounds wins (3/5/7/13). Results show K/D, damage per round, accuracy, HS%, reaction time and time-to-kill, and are saved to Statistics.

**The bot** walks a navigation grid between cover around the pillars and platforms, hears your running/jumping footsteps (walk with Shift to stay quiet), turns toward you when it spots you, waits its reaction time, counter-strafes to stop before shooting, and fires taps/bursts through the same weapon engine, recoil and damage tables you use. Difficulty (Easy/Normal/Hard/Pro) sets its reaction time, aim error, how often it aims at the head, turn speed and strafing. Its weapon can match yours, be from the same class, random, or a specific gun (Match settings).

You can walk anywhere in the arena; pillars, platforms and walls block movement and bullets.

## Host on GitHub Pages

1. Create a new GitHub repository and upload the contents of this folder (keep the folder structure: `index.html`, `css/`, `js/`, `data/`).
2. Repository → **Settings → Pages** → *Build and deployment* → Source: **Deploy from a branch**, Branch: `main`, folder `/ (root)` → Save.
3. After a minute the site is live at `https://<user>.github.io/<repo>/`.

Netlify: drag the folder onto app.netlify.com/drop.

## Sensitivity maths

All of this is applied to the camera, not just displayed (`js/sensitivity.js`, `applyLook()` in `js/main.js`).

- Degrees per mouse count = `0.07 × sensitivity` (yaw and pitch).
- Counts per 360° = `360 / (0.07 × sens)`.
- cm/360 = `counts/360 × 2.54 / DPI`. Example: 800 DPI × 0.4 → 12 857 counts → **40.82 cm**.
- Field of view: horizontal **103° at 16:9**, i.e. vertical `2·atan(tan(51.5°) × 9/16) ≈ 70.53°`. The vertical FOV is kept constant on other aspect ratios (Hor+).
- Zoom: `zoomedHFOV = 2·atan(tan(51.5°) / zoom)`; zoomed deg/count = `0.07 × sens × scopedMultiplier × zoomedHFOV / 103`.
- Pitch is clamped to ±89°.
- Polling rate is informational only (it changes how often the mouse reports, not how far the camera turns).
- Every `pointermove` (and its `getCoalescedEvents()` samples, in arrival order) is queued. Each frame the queue is processed **before** the simulation: mouse movement rotates the camera, and a click fires with the camera angle at that exact point in the queue, hit-tested against the target positions that were on screen.

## Sounds

All sounds are synthesised with Web Audio by default. Settings → Video & Audio → **Custom sounds** lets you load your own audio files for the kill, headshot, body hit and each gun class (plus suppressed). They're stored in the browser's IndexedDB and replace the built-in sound for that slot.

## Weapons

`data/weapons.json` holds all 20 guns. Fire rates, magazines, reloads, damage bands, pellets, first-shot error, ADS zoom/rate/burst/move speed and suppressors are the verified game-file values. Recoil, bloom, recovery and movement error are estimates (Riot doesn't publish them) — edit them freely; the engine has no gun-specific code beyond the generic switches each entry can turn on (burst, scope, zoom list, alt type, fire-rate ramp, sustained spread decay).

If you edit the JSON and want `file://` play to use the changes too, update the embedded copy between the `// fallback data start` and `// fallback data end` comments at the bottom of `js/weapons.js`.

## Self-test and debug views

- `index.html?selftest` runs the automated checks (results on screen and in the console): fire rate (±3%), magazine and reload (±0.02 s) for all 20 guns in a 1/480 s simulated clock, damage at every band midpoint, pellet counts, Classic alt fire, Bucky air-burst, ADS bursts, Odin ramp, scope cycles, zero first-shot deviation when scoped, unique recoil parameters and spray paths, sensitivity maths, collision (pillars, walls, jump height), bot pathfinding, end-to-end hitbox/damage shots, and a bot-vs-player check (Pro kills a standing player; Easy reacts slower).
- **Spray patterns** (Settings → Gameplay → Debug, or from the self-test page): one full magazine per automatic gun, standing, at 1° = 30 px.

## Files

```
index.html          page + import map
css/style.css       UI
js/main.js          game loop, state machine, shooting
js/input.js         pointer lock, raw mouse, ordered input queue
js/sensitivity.js   sensitivity / FOV maths
js/world.js         arena, cover stations, collision, decals
js/targets.js       humanoid model + hitboxes (bot, and the player's own hitbox)
js/bot.js           bot AI (vision, hearing, reaction, aim, fire control)
js/nav.js           navigation grid + A* pathfinding
js/player.js        movement physics + collision
js/weapons.js       weapon engine (+ embedded data fallback)
js/viewmodel.js     first-person gun models (separate render pass)
js/hud.js           crosshair, hit markers, damage numbers, ammo, scope
js/ui.js            menus, settings, loadout, results, statistics
js/stats.js         session stats, history, charts
js/audio.js         Web Audio synthesised sounds
js/storage.js       localStorage persistence
js/selftest.js      ?selftest checks
index.offline.html  generated single-file copy for file:// (don't edit by hand)
data/weapons.json   weapon database
```

Valaak's is an independent fan-made trainer and is not affiliated with or endorsed by Riot Games.
