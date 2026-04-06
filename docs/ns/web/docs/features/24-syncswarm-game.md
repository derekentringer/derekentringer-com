# 24 — SyncSwarm Game

## Summary

Hidden Galaga-style ASCII space shooter mini game accessible from the rocket icon in the ribbon. Features authentic arcade mechanics including enemy formations, diving attacks, tractor beam capture, dual fighter mode, challenge stages, and a parallax starfield background.

## What Was Built

### SyncSwarmGame (`ns-web`)
- **`SyncSwarmGame.tsx`** — Full arcade game rendered as ASCII art in a monospace `pre` element with green-on-black retro aesthetic and text glow effect

### Game Mechanics
- **Enemy types**: Bees (`{o}`), butterflies (`<X>`), and bosses (`/V\`) with 2 HP
- **Formation entry**: Enemies fly into formation via bezier curve entry animations
- **Diving attacks**: Enemies periodically dive at player with wobble patterns
- **Tractor beam**: Boss tractor beam capture mechanic — beam pulls player ship up, captured ship sits above boss in formation
- **Dual fighter**: Destroying boss with captured ship rescues it, giving double-wide ship with twin bullets
- **Boss dive**: Boss continues downward dive with wobble after failed tractor beam
- **Challenge stages**: Every 3 levels with 5 waves of fly-through enemies (no shooting back)
- **Challenge results**: Results screen with hit count and bonus scoring (perfect = 10,000)
- **Stage progression**: Stage clear leads to next stage with fresh formation

### Starfield Background
- 3 depth layers with parallax scrolling
- Far stars (`.` dark grey `#252525`), mid stars (`·` medium grey `#3a3a3a`), near stars (`•` light grey `#555555`)
- Stars rendered as colored spans with no text glow
- Speed increases during gameplay, slows on title/game over screens

### Rendering Engine
- Per-character color support via `RenderSegment` arrays
- Each row is an array of `{text, color?}` segments, rendered as spans
- Star cells tracked in separate `starLayer` buffer; game elements drawn on top automatically clear star markers

### Screens
- **Title screen**: Figlet ASCII art "SyncSwarm" title, "BY NOTESYNC" subtitle
- **Game over screen**: Skips drawing enemies/bullets to prevent character overlap with score display

### Persistence & Controls
- **High score**: Persisted to localStorage (`ns-syncswarm-highscore`)
- **Controls**: Arrow keys/WASD to move, Space to fire, Escape to exit
- Launched from rocket ship icon in Ribbon component

## Files Changed

| File | Change |
|------|--------|
| `packages/ns-web/src/components/SyncSwarmGame.tsx` | **New** — Full ASCII arcade game with formation AI, tractor beam, challenge stages, parallax starfield |
| `packages/ns-web/src/components/Ribbon.tsx` | Updated — Added rocket ship icon to launch SyncSwarm game |

## Tests

- No dedicated tests for this feature (game logic is self-contained rendering loop).
