# 26 — SyncSwarm Game

## Summary

Hidden Galaga-style ASCII space shooter mini game accessible from the rocket icon in the ribbon. Mirrors web implementation (ns-web feature 24). Full arcade mechanics including enemy formations, diving attacks, tractor beam capture, dual fighter mode, challenge stages, and parallax starfield.

## What Was Built

### SyncSwarmGame Component (`ns-desktop`)
- **`SyncSwarmGame.tsx`** — Identical to web implementation; ASCII art game with green-on-black retro aesthetic
- **Enemy types**: Three enemy types (bees, butterflies, bosses) with distinct ASCII art and behavior
- **Entry animations**: Bezier curve entry paths for enemy formations
- **Diving attacks**: Enemies break formation and dive at player with projectiles
- **Tractor beam**: Boss enemies deploy tractor beam capture mechanic
- **Dual fighter mode**: Rescued captured fighter docks alongside player for double firepower
- **Challenge stages**: Special bonus stages every 3 levels with scripted enemy waves
- **Starfield**: 3 parallax depth layers with grey-toned stars, speed varies by game phase
- **Per-character color rendering**: `RenderSegment` spans for grey stars against green game elements
- **High score**: Persisted to localStorage
- **Launch**: Triggered from rocket icon in desktop Ribbon

## Files Changed

| File | Change |
|------|--------|
| `packages/ns-desktop/src/components/SyncSwarmGame.tsx` | **New** — Full Galaga-style ASCII space shooter game |
| `packages/ns-desktop/src/components/Ribbon.tsx` | Added rocket icon to launch SyncSwarm game |
| `packages/ns-desktop/src/styles/global.css` | Game overlay, retro terminal, starfield styles |

## Tests

- None

## Status

- **Status**: Complete
- **Phase**: 4 — Polish
- **Priority**: Low
