import { useState, useEffect, useRef, useCallback } from "react";

// --- Types ---
interface Point { x: number; y: number; }
interface Bullet extends Point { }
interface Enemy extends Point {
  type: "bee" | "butterfly" | "boss";
  alive: boolean;
  hp: number;
  diving: boolean;
  diveAngle: number;
  diveSpeed: number;
  diveTime: number;
  formationX: number;
  formationY: number;
  // Tractor beam state
  tractorBeam: boolean;
  tractorTimer: number;
  capturedShipX: number; // x of captured ship in formation (-1 = none)
  // Entry animation
  entering: boolean;
  entryDelay: number; // ticks before starting to enter
  entryTime: number;  // ticks since entry started
  entryFromX: number; // start position
  entryFromY: number;
  entryMidX: number;  // midpoint for curve
  entryMidY: number;
}
interface Explosion extends Point { frame: number; }
interface EnemyBullet extends Point { }
interface Star { x: number; y: number; layer: number; } // layer 0=far, 1=mid, 2=near

// --- Constants ---
const W = 60;
const H = 40;
const PLAYER_Y = H - 3;
const TICK_MS = 50;
const ENEMY_CHARS: Record<string, string[]> = {
  bee: ["{o}", "{O}"],
  butterfly: ["<X>", "<x>"],
  boss: ["/V\\", "/v\\"],
  bossHit: ["/W\\", "/w\\"],
};
const PLAYER_SHIP = ">A<";
const DUAL_SHIP = ">A<>A<";
const PLAYER_SHIP_DEAD = "*X*";
const CAPTURED_SHIP = ">a<";
const EXPLOSION_FRAMES = ["*#*", ".+.", " . ", "   "];
const BULLET_CHAR = "|";
const ENEMY_BULLET_CHAR = ":";
const TRACTOR_BEAM_CHAR = "!";
const TRACTOR_BEAM_DURATION = 60; // ticks
const TRACTOR_BEAM_WIDTH = 3;

// Starfield — 3 depth layers with different speeds and characters
const STAR_CHARS = [".", "\u00B7", "\u2022"]; // far=dim dot, mid=middle dot, near=bullet dot
const STAR_SPEEDS_IDLE = [0.15, 0.35, 0.7]; // title/between stages
const STAR_SPEEDS_ACTIVE = [0.4, 0.8, 1.5]; // during gameplay
const STAR_COUNT = 30; // total stars on screen

// --- Formation layout ---
function makeEnemy(type: "bee" | "butterfly" | "boss", formX: number, formY: number, hp: number, delay: number, fromX: number, fromY: number, midX: number, midY: number): Enemy {
  return {
    x: fromX, y: fromY, type, alive: true, hp, diving: false, diveAngle: 0, diveSpeed: 0, diveTime: 0,
    formationX: formX, formationY: formY, tractorBeam: false, tractorTimer: 0, capturedShipX: -1,
    entering: true, entryDelay: delay, entryTime: 0, entryFromX: fromX, entryFromY: fromY, entryMidX: midX, entryMidY: midY,
  };
}

function createFormation(_stage: number): Enemy[] {
  const enemies: Enemy[] = [];
  const centerX = Math.floor(W / 2);
  let delay = 0;

  // Wave 1: Bees come from top-left, curving right (bottom two rows)
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 10; i++) {
      const fx = centerX - 18 + i * 4;
      const fy = 9 + row * 2;
      const fromX = -5 + (i % 2) * 3;
      const fromY = -3 - i * 1;
      const midX = centerX + 12;
      const midY = PLAYER_Y - 4;
      enemies.push(makeEnemy("bee", fx, fy, 1, delay + i * 3 + row * 15, fromX, fromY, midX, midY));
    }
  }
  delay += 50;

  // Wave 2: Butterflies come from top-right, curving left
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 8; i++) {
      const fx = centerX - 14 + i * 4;
      const fy = 5 + row * 2;
      const fromX = W + 5 - (i % 2) * 3;
      const fromY = -3 - i * 1;
      const midX = centerX - 12;
      const midY = PLAYER_Y - 4;
      enemies.push(makeEnemy("butterfly", fx, fy, 1, delay + i * 3 + row * 12, fromX, fromY, midX, midY));
    }
  }
  delay += 45;

  // Wave 3: Bosses come from top center, swooping down and up
  for (let i = 0; i < 4; i++) {
    const fx = centerX - 9 + i * 6;
    const fy = 3;
    const fromX = centerX - 6 + i * 4;
    const fromY = -4;
    const midX = centerX + (i < 2 ? -15 : 15);
    const midY = PLAYER_Y - 4;
    enemies.push(makeEnemy("boss", fx, fy, 2, delay + i * 6, fromX, fromY, midX, midY));
  }

  return enemies;
}

function getEnemyPoints(e: Enemy, diving: boolean): number {
  if (e.type === "bee") return diving ? 100 : 50;
  if (e.type === "butterfly") return diving ? 160 : 80;
  return diving ? 400 : 150;
}

// --- Game State ---
type GamePhase = "title" | "entering" | "playing" | "dying" | "retreat" | "gameover" | "stageclear" | "challenge" | "challenge_results" | "captured" | "captured_return";

interface GameState {
  phase: GamePhase;
  playerX: number;
  lives: number;
  score: number;
  highScore: number;
  stage: number;
  enemies: Enemy[];
  bullets: Bullet[];
  enemyBullets: EnemyBullet[];
  explosions: Explosion[];
  tick: number;
  stageTimer: number;
  bonusKills: number;
  dyingTimer: number;
  formationDir: number;
  formationOffset: number;
  dualFighter: boolean;
  capturedTimer: number;
  capturingBossIdx: number;
  challengeWave: number;     // current wave (0-4)
  challengeSpawned: number;  // enemies spawned in current wave
  challengeHits: number;     // total hits this challenge stage
  challengeWaveTimer: number;
  stars: Star[];
}

function createStarfield(): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      x: Math.floor(Math.random() * W),
      y: Math.random() * H,
      layer: i < 12 ? 0 : i < 22 ? 1 : 2, // more far stars, fewer near
    });
  }
  return stars;
}

function initState(highScore: number): GameState {
  return {
    phase: "title",
    playerX: Math.floor(W / 2) - 1,
    lives: 3,
    score: 0,
    highScore,
    stage: 1,
    enemies: [],
    bullets: [],
    enemyBullets: [],
    explosions: [],
    tick: 0,
    stageTimer: 0,
    bonusKills: 0,
    dyingTimer: 0,
    formationDir: 1,
    formationOffset: 0,
    dualFighter: false,
    capturedTimer: 0,
    capturingBossIdx: -1,
    challengeWave: 0,
    challengeSpawned: 0,
    challengeHits: 0,
    challengeWaveTimer: 0,
    stars: createStarfield(),
  };
}

// --- Render ---
// Star grey shades per layer: far=darkest, near=brightest
const STAR_COLORS = ["#252525", "#3a3a3a", "#555555"];

// Active gameplay phases
const ACTIVE_PHASES: Set<GamePhase> = new Set(["entering", "playing", "dying", "challenge", "captured", "captured_return", "retreat"]);

interface RenderSegment { text: string; color?: string; }

function renderGame(state: GameState): RenderSegment[][] {
  const buf: string[][] = Array.from({ length: H }, () => Array(W).fill(" "));
  const starLayer: (number | -1)[][] = Array.from({ length: H }, () => Array(W).fill(-1));

  function drawStr(x: number, y: number, s: string) {
    for (let i = 0; i < s.length; i++) {
      const cx = x + i;
      if (cx >= 0 && cx < W && y >= 0 && y < H) {
        buf[y][cx] = s[i];
        starLayer[y][cx] = -1; // non-star content overwrites star markers
      }
    }
  }

  // Starfield background — drawn first so everything overlays on top
  for (const star of state.stars) {
    const sx = Math.floor(star.x);
    const sy = Math.floor(star.y);
    if (sx >= 0 && sx < W && sy >= 1 && sy < H) { // skip row 0 (header)
      buf[sy][sx] = STAR_CHARS[star.layer];
      starLayer[sy][sx] = star.layer;
    }
  }

  // Header
  const scoreStr = `SCORE ${String(state.score).padStart(7, "0")}`;
  const highStr = `HI ${String(state.highScore).padStart(7, "0")}`;
  const stageStr = `STAGE ${state.stage}`;
  drawStr(1, 0, scoreStr);
  drawStr(W - highStr.length - 1, 0, highStr);
  drawStr(Math.floor((W - stageStr.length) / 2), 0, stageStr);

  if (state.phase === "title") {
    const lines = [
      "  ____                   ____                              ",
      " / ___| _   _ _ __   ___/ ___|_      ____ _ _ __ _ __ ___ ",
      " \\___ \\| | | | '_ \\ / __\\___ \\ \\ /\\ / / _` | '__| '_ ` _ \\",
      "  ___) | |_| | | | | (__ ___) \\ V  V / (_| | |  | | | | | |",
      " |____/ \\__, |_| |_|\\___|____/ \\_/\\_/ \\__,_|_|  |_| |_| |_|",
      "        |___/                                               ",
    ];
    const startY = 9;
    const maxLen = Math.max(...lines.map((l) => l.length));
    const startX = Math.floor((W - maxLen) / 2);
    for (let i = 0; i < lines.length; i++) {
      drawStr(startX, startY + i, lines[i]);
    }
    drawStr(Math.floor((W - 15) / 2), 20, "- BY NOTESYNC -");
    const blink = Math.floor(state.tick / 10) % 2 === 0;
    if (blink) {
      drawStr(Math.floor((W - 22) / 2), 26, "PRESS SPACE TO START");
    }
    drawStr(Math.floor((W - 26) / 2), 30, "ARROWS/WASD: MOVE  SPACE: FIRE");
    drawStr(Math.floor((W - 14) / 2), 32, "ESC: EXIT GAME");
    const livesStr = "LIVES: " + ">A< ".repeat(3).trim();
    drawStr(1, H - 1, livesStr);
    return buildSegments();
  }

  if (state.phase === "gameover") {
    drawStr(Math.floor((W - 9) / 2), Math.floor(H / 2) - 1, "GAME OVER");
    const finalStr = `FINAL SCORE: ${state.score}`;
    drawStr(Math.floor((W - finalStr.length) / 2), Math.floor(H / 2) + 1, finalStr);
    if (state.score >= state.highScore) {
      drawStr(Math.floor((W - 15) / 2), Math.floor(H / 2) + 3, "NEW HIGH SCORE!");
    }
    const blink = Math.floor(state.tick / 10) % 2 === 0;
    if (blink) {
      drawStr(Math.floor((W - 22) / 2), Math.floor(H / 2) + 6, "PRESS SPACE TO RETRY");
    }
  }

  if (state.phase === "entering" && state.stageTimer < 40) {
    const readyText = `STAGE ${state.stage}`;
    drawStr(Math.floor((W - readyText.length) / 2), Math.floor(H / 2), readyText);
  }

  if (state.phase === "challenge") {
    const bonusText = "-- CHALLENGING STAGE --";
    drawStr(Math.floor((W - bonusText.length) / 2), 1, bonusText);
    const hitsText = `HITS: ${state.challengeHits}`;
    drawStr(W - hitsText.length - 2, 1, hitsText);
  }

  if (state.phase === "challenge_results") {
    const title = "-- RESULTS --";
    drawStr(Math.floor((W - title.length) / 2), Math.floor(H / 2) - 3, title);
    const hitsLine = `NUMBER OF HITS: ${state.challengeHits}`;
    drawStr(Math.floor((W - hitsLine.length) / 2), Math.floor(H / 2) - 1, hitsLine);
    if (state.challengeHits === 40) {
      const perfectLine = "PERFECT! +10,000";
      drawStr(Math.floor((W - perfectLine.length) / 2), Math.floor(H / 2) + 1, perfectLine);
    } else {
      const scoreLine = `BONUS: ${state.challengeHits * 100}`;
      drawStr(Math.floor((W - scoreLine.length) / 2), Math.floor(H / 2) + 1, scoreLine);
    }
  }

  if (state.phase === "gameover") {
    return buildSegments();
  }

  // Enemies
  const animFrame = Math.floor(state.tick / 8) % 2;
  for (const e of state.enemies) {
    if (!e.alive) continue;
    let chars: string[];
    if (e.type === "boss" && e.hp === 1) {
      chars = ENEMY_CHARS.bossHit;
    } else {
      chars = ENEMY_CHARS[e.type];
    }
    drawStr(Math.round(e.x), Math.round(e.y), chars[animFrame]);

    // Draw captured ship above boss — follows boss everywhere
    if (e.capturedShipX >= 0) {
      drawStr(Math.round(e.x), Math.round(e.y) - 1, CAPTURED_SHIP);
    }

    // Draw tractor beam
    if (e.tractorBeam && e.tractorTimer < TRACTOR_BEAM_DURATION) {
      const beamX = Math.round(e.x);
      for (let by = Math.round(e.y) + 1; by < PLAYER_Y; by++) {
        const blink = (state.tick + by) % 3 !== 0;
        if (blink) {
          for (let bx = 0; bx < TRACTOR_BEAM_WIDTH; bx++) {
            const cx = beamX + bx;
            if (cx >= 0 && cx < W && by >= 0 && by < H) {
              buf[by][cx] = TRACTOR_BEAM_CHAR;
            }
          }
        }
      }
    }
  }

  // Bullets
  for (const b of state.bullets) {
    if (b.y >= 0 && b.y < H && b.x >= 0 && b.x < W) {
      buf[Math.round(b.y)][Math.round(b.x)] = BULLET_CHAR;
    }
  }

  // Enemy bullets
  for (const b of state.enemyBullets) {
    if (b.y >= 0 && b.y < H && b.x >= 0 && b.x < W) {
      buf[Math.round(b.y)][Math.round(b.x)] = ENEMY_BULLET_CHAR;
    }
  }

  // Explosions
  for (const ex of state.explosions) {
    const ch = EXPLOSION_FRAMES[Math.min(ex.frame, EXPLOSION_FRAMES.length - 1)];
    drawStr(Math.round(ex.x) - 1, Math.round(ex.y), ch);
  }

  // Player
  if (state.phase === "playing" || state.phase === "challenge" || state.phase === "challenge_results" || state.phase === "stageclear" || state.phase === "entering") {
    if (state.dualFighter) {
      drawStr(state.playerX - 1, PLAYER_Y, DUAL_SHIP);
    } else {
      drawStr(state.playerX, PLAYER_Y, PLAYER_SHIP);
    }
  } else if (state.phase === "dying") {
    drawStr(state.playerX, PLAYER_Y, PLAYER_SHIP_DEAD);
  } else if (state.phase === "captured") {
    // Ship being pulled up toward boss
    const boss = state.capturingBossIdx >= 0 ? state.enemies[state.capturingBossIdx] : null;
    const targetY = boss ? boss.y - 1 : 5;
    const pullY = Math.round(PLAYER_Y - state.capturedTimer * 0.5);
    if (pullY > targetY) {
      drawStr(state.playerX, pullY, PLAYER_SHIP);
    }
  }
  // captured_return and retreat: no player ship shown

  // Lives display
  const livesStr = ">A< ".repeat(Math.max(0, state.lives - 1)).trim();
  drawStr(1, H - 1, `LIVES: ${livesStr}`);
  if (state.dualFighter) {
    drawStr(W - 12, H - 1, "DUAL FIGHTER");
  }

  // Stage clear message
  if (state.phase === "stageclear") {
    drawStr(Math.floor((W - 14) / 2), Math.floor(H / 2), "STAGE CLEARED!");
  }

  function buildSegments(): RenderSegment[][] {
    const rows: RenderSegment[][] = [];
    for (let y = 0; y < H; y++) {
      const segs: RenderSegment[] = [];
      let curText = "";
      let curColor: string | undefined = undefined;
      for (let x = 0; x < W; x++) {
        const layer = starLayer[y][x];
        const color = layer >= 0 ? STAR_COLORS[layer] : undefined;
        if (color !== curColor) {
          if (curText) segs.push({ text: curText, color: curColor });
          curText = buf[y][x];
          curColor = color;
        } else {
          curText += buf[y][x];
        }
      }
      if (curText) segs.push({ text: curText, color: curColor });
      rows.push(segs);
    }
    return rows;
  }

  return buildSegments();
}

// --- Game Component ---
interface SyncSwarmGameProps {
  onExit: () => void;
}

export function SyncSwarmGame({ onExit }: SyncSwarmGameProps) {
  const stateRef = useRef<GameState>(initState(0));
  const [display, setDisplay] = useState<RenderSegment[][]>(() => renderGame(stateRef.current));
  const keysRef = useRef<Set<string>>(new Set());
  const gameLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("ns-syncswarm-highscore");
      if (stored) stateRef.current.highScore = Number(stored);
    } catch {}
  }, []);

  const tick = useCallback(() => {
    const s = stateRef.current;
    s.tick++;
    const keys = keysRef.current;

    // Scroll starfield — faster during active gameplay
    const speeds = ACTIVE_PHASES.has(s.phase) ? STAR_SPEEDS_ACTIVE : STAR_SPEEDS_IDLE;
    for (const star of s.stars) {
      star.y += speeds[star.layer];
      if (star.y >= H) {
        star.y = 0;
        star.x = Math.floor(Math.random() * W);
      }
    }

    if (s.phase === "title") {
      if (keys.has(" ")) {
        s.phase = "entering";
        s.enemies = createFormation(s.stage);
        s.bullets = [];
        s.enemyBullets = [];
        s.explosions = [];
        s.stageTimer = 0;
        s.dualFighter = false;
        keys.delete(" ");
      }
      setDisplay(renderGame(s));
      return;
    }

    if (s.phase === "gameover") {
      if (keys.has(" ")) {
        const hs = s.highScore;
        Object.assign(s, initState(hs));
        s.phase = "entering";
        s.enemies = createFormation(s.stage);
        keys.delete(" ");
      }
      setDisplay(renderGame(s));
      return;
    }

    // Entering phase — enemies fly into formation
    if (s.phase === "entering") {
      s.stageTimer++;
      let allSettled = true;

      for (const e of s.enemies) {
        if (!e.alive || !e.entering) continue;
        if (s.stageTimer < e.entryDelay) { allSettled = false; continue; }

        allSettled = false;
        e.entryTime++;
        const duration = 40; // ticks to reach formation
        const t = Math.min(e.entryTime / duration, 1);
        // Quadratic bezier: from → mid → formation
        const u = 1 - t;
        e.x = u * u * e.entryFromX + 2 * u * t * e.entryMidX + t * t * e.formationX;
        e.y = u * u * e.entryFromY + 2 * u * t * e.entryMidY + t * t * e.formationY;

        if (t >= 1) {
          e.entering = false;
          e.x = e.formationX;
          e.y = e.formationY;
        }
      }

      // Player can shoot during entry
      const entryShipWidth = s.dualFighter ? 6 : 3;
      if (keys.has("ArrowLeft") || keys.has("a")) s.playerX = Math.max(s.dualFighter ? 1 : 0, s.playerX - 1);
      if (keys.has("ArrowRight") || keys.has("d")) s.playerX = Math.min(W - entryShipWidth, s.playerX + 1);
      if (keys.has(" ") && s.bullets.length < (s.dualFighter ? 4 : 2)) {
        s.bullets.push({ x: s.playerX + 1, y: PLAYER_Y - 1 });
        if (s.dualFighter) s.bullets.push({ x: s.playerX + 4, y: PLAYER_Y - 1 });
        keys.delete(" ");
      }
      s.bullets = s.bullets.map((b) => ({ ...b, y: b.y - 1 })).filter((b) => b.y >= 0);

      // Bullet-enemy collision during entry
      const newBullets: Bullet[] = [];
      for (const b of s.bullets) {
        let hit = false;
        for (const e of s.enemies) {
          if (!e.alive) continue;
          if (b.x >= e.x && b.x <= e.x + 2 && Math.abs(b.y - e.y) < 1) {
            e.hp--;
            if (e.hp <= 0) { e.alive = false; s.score += getEnemyPoints(e, true); }
            s.explosions.push({ x: e.x + 1, y: e.y, frame: 0 });
            hit = true;
            break;
          }
        }
        if (!hit) newBullets.push(b);
      }
      s.bullets = newBullets;

      s.explosions = s.explosions.map((e) => ({ ...e, frame: e.frame + 1 })).filter((e) => e.frame < EXPLOSION_FRAMES.length);

      if (allSettled && s.enemies.every((e) => !e.entering || !e.alive)) {
        if (s.enemies.every((e) => !e.alive)) {
          s.phase = "stageclear";
        } else {
          s.phase = "playing";
        }
        s.stageTimer = 0;
      }

      if (s.score > s.highScore) s.highScore = s.score;
      setDisplay(renderGame(s));
      return;
    }

    // Captured phase — ship being pulled up to boss position
    if (s.phase === "captured") {
      s.capturedTimer++;
      const boss = s.capturingBossIdx >= 0 ? s.enemies[s.capturingBossIdx] : null;
      if (!boss) { s.phase = "retreat"; s.dyingTimer = 0; setDisplay(renderGame(s)); return; }

      const targetY = boss.y - 1; // above the boss
      const pullY = PLAYER_Y - s.capturedTimer * 0.5;

      if (pullY <= targetY) {
        // Ship reached the boss — attach it and have boss return to formation
        boss.capturedShipX = boss.formationX;
        boss.tractorBeam = false;
        s.lives--;
        s.capturingBossIdx = -1;
        // Boss now returns to formation (diving = true, heading home)
        s.phase = "captured_return";
        s.capturedTimer = 0;
      }
      setDisplay(renderGame(s));
      return;
    }

    // Captured return phase — boss flies back to formation with captured ship
    if (s.phase === "captured_return") {
      s.capturedTimer++;
      // Move all diving enemies back to formation (including the capturing boss)
      let allBack = true;
      for (const e of s.enemies) {
        if (!e.alive || !e.diving) continue;
        allBack = false;
        const dx = (e.formationX + s.formationOffset) - e.x;
        const dy = e.formationY - e.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) {
          e.diving = false;
          e.x = e.formationX + s.formationOffset;
          e.y = e.formationY;
        } else {
          const speed = 1.0;
          e.x += (dx / dist) * speed;
          e.y += (dy / dist) * speed;
        }
      }
      // Formation sway continues
      s.formationOffset += s.formationDir * 0.1;
      if (Math.abs(s.formationOffset) > 3) s.formationDir *= -1;
      for (const e of s.enemies) {
        if (!e.alive || e.diving) continue;
        e.x = e.formationX + s.formationOffset;
        e.y = e.formationY;
      }

      if (allBack || s.capturedTimer > 80) {
        // Force all back
        for (const e of s.enemies) {
          if (e.diving) { e.diving = false; e.x = e.formationX; e.y = e.formationY; }
        }
        if (s.lives <= 0) {
          if (s.score > s.highScore) {
            s.highScore = s.score;
            try { localStorage.setItem("ns-syncswarm-highscore", String(s.highScore)); } catch {}
          }
          s.phase = "gameover";
        } else {
          s.phase = "playing";
          s.playerX = Math.floor(W / 2) - 1;
          s.enemyBullets = [];
          s.dyingTimer = 0;
        }
      }
      setDisplay(renderGame(s));
      return;
    }

    // Dying phase — show explosion
    if (s.phase === "dying") {
      s.dyingTimer++;
      s.explosions = s.explosions.map((e) => ({ ...e, frame: e.frame + 1 })).filter((e) => e.frame < EXPLOSION_FRAMES.length);
      if (s.dyingTimer > 20) {
        // Transition to retreat — enemies return to formation
        s.phase = "retreat";
        s.dyingTimer = 0;
      }
      setDisplay(renderGame(s));
      return;
    }

    // Retreat phase — all diving enemies return to formation
    if (s.phase === "retreat") {
      s.dyingTimer++;
      let allReturned = true;
      for (const e of s.enemies) {
        if (!e.alive || !e.diving) continue;
        allReturned = false;
        // Move back to formation position
        const dx = (e.formationX + s.formationOffset) - e.x;
        const dy = e.formationY - e.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) {
          e.diving = false;
          e.x = e.formationX + s.formationOffset;
          e.y = e.formationY;
        } else {
          const speed = 1.2;
          e.x += (dx / dist) * speed;
          e.y += (dy / dist) * speed;
        }
      }
      if (allReturned || s.dyingTimer > 60) {
        // Force all back
        for (const e of s.enemies) {
          if (e.diving) {
            e.diving = false;
            e.x = e.formationX;
            e.y = e.formationY;
          }
        }
        if (s.lives <= 0) {
          if (s.score > s.highScore) {
            s.highScore = s.score;
            try { localStorage.setItem("ns-syncswarm-highscore", String(s.highScore)); } catch {}
          }
          s.phase = "gameover";
        } else {
          s.phase = "playing";
          s.playerX = Math.floor(W / 2) - 1;
          s.enemyBullets = [];
          s.dyingTimer = 0;
        }
      }
      // Formation sway continues
      s.formationOffset += s.formationDir * 0.1;
      if (Math.abs(s.formationOffset) > 3) s.formationDir *= -1;
      for (const e of s.enemies) {
        if (!e.alive || e.diving) continue;
        e.x = e.formationX + s.formationOffset;
        e.y = e.formationY;
      }
      s.explosions = s.explosions.map((e) => ({ ...e, frame: e.frame + 1 })).filter((e) => e.frame < EXPLOSION_FRAMES.length);
      setDisplay(renderGame(s));
      return;
    }

    if (s.phase === "stageclear") {
      s.stageTimer++;
      if (s.stageTimer > 40) {
        s.stage++;
        const isChallenge = (s.stage - 3) % 4 === 0 && s.stage >= 3;
        if (isChallenge) {
          s.phase = "challenge";
          s.enemies = [];
          s.challengeWave = 0;
          s.challengeSpawned = 0;
          s.challengeHits = 0;
          s.challengeWaveTimer = 0;
        } else {
          s.phase = "entering";
          s.enemies = createFormation(s.stage);
        }
        s.bullets = [];
        s.enemyBullets = [];
        s.explosions = [];
        s.stageTimer = 0;
      }
      setDisplay(renderGame(s));
      return;
    }

    // Challenge stage logic
    if (s.phase === "challenge") {
      s.challengeWaveTimer++;

      // Player movement and firing
      if (keys.has("ArrowLeft") || keys.has("a")) s.playerX = Math.max(s.dualFighter ? 1 : 0, s.playerX - 1);
      if (keys.has("ArrowRight") || keys.has("d")) s.playerX = Math.min(W - (s.dualFighter ? 6 : 3), s.playerX + 1);
      if (keys.has(" ") && s.bullets.length < (s.dualFighter ? 4 : 2)) {
        s.bullets.push({ x: s.playerX + 1, y: PLAYER_Y - 1 });
        if (s.dualFighter) s.bullets.push({ x: s.playerX + 4, y: PLAYER_Y - 1 });
        keys.delete(" ");
      }
      s.bullets = s.bullets.map((b) => ({ ...b, y: b.y - 1 })).filter((b) => b.y >= 0);

      // Spawn enemies in waves — 8 per wave, 5 waves total
      const CHALLENGE_WAVES = 5;
      const ENEMIES_PER_WAVE = 8;
      const WAVE_INTERVAL = 60; // ticks between waves
      const SPAWN_INTERVAL = 6; // ticks between spawns within a wave
      const stageVariant = Math.floor((s.stage - 3) / 4) % 8;

      if (s.challengeWave < CHALLENGE_WAVES) {
        const waveSpawned = s.challengeSpawned - s.challengeWave * ENEMIES_PER_WAVE;
        if (waveSpawned < ENEMIES_PER_WAVE && s.challengeWaveTimer >= waveSpawned * SPAWN_INTERVAL) {
          const spawnIdx = waveSpawned;
          {
            // Spawn an enemy with a swooping path based on wave pattern
            const centerX = Math.floor(W / 2);
            let fromX: number, fromY: number, midX: number, midY: number;
            const wave = s.challengeWave;

            // 8 different patterns cycling based on stageVariant + wave
            const pattern = (stageVariant + wave) % 8;
            switch (pattern) {
              case 0: // From top-left, swoop down-right and exit bottom-right
                fromX = -3 + spawnIdx * 2; fromY = -2 - spawnIdx; midX = centerX + 10; midY = PLAYER_Y - 5; break;
              case 1: // From top-right, curve down-left and exit bottom-left
                fromX = W + 3; fromY = -2 - spawnIdx; midX = centerX - 10; midY = PLAYER_Y - 3; break;
              case 2: // From top-left, curve down-right
                fromX = -3; fromY = -2 - spawnIdx; midX = centerX + 15; midY = PLAYER_Y - 4; break;
              case 3: // From top center, V spread down
                fromX = centerX + (spawnIdx - 4) * 2; fromY = -3; midX = centerX + (spawnIdx - 4) * 8; midY = PLAYER_Y - 2; break;
              case 4: // From right side, swoop down past player
                fromX = W + 3; fromY = 3 + spawnIdx * 2; midX = centerX - 5; midY = PLAYER_Y - 3; break;
              case 5: // From left side, swoop down past player
                fromX = -3; fromY = 3 + spawnIdx * 2; midX = centerX + 5; midY = PLAYER_Y - 3; break;
              case 6: // From top, split left and right, dive deep
                fromX = centerX; fromY = -3; midX = spawnIdx < 4 ? centerX - 20 : centerX + 20; midY = PLAYER_Y - 2; break;
              default: // From top, wide arcs
                fromX = centerX + (spawnIdx % 2 === 0 ? -15 : 15); fromY = -3 - spawnIdx; midX = centerX + (spawnIdx % 2 === 0 ? 15 : -15); midY = PLAYER_Y - 4; break;
            }

            // Exit off the bottom or sides
            const exitX = pattern % 2 === 0 ? W + 5 : -5;
            const exitY = H + 5;
            const e = makeEnemy(
              spawnIdx < 2 ? "boss" : spawnIdx < 5 ? "butterfly" : "bee",
              exitX, exitY, // formationX/Y = exit point (they fly through)
              spawnIdx < 2 ? 2 : 1,
              0, fromX, fromY, midX, midY,
            );
            e.entering = true;
            e.entryDelay = 0;
            e.entryTime = 0;
            s.enemies.push(e);
            s.challengeSpawned++;
          }
        }
        // Check if wave is complete — all 8 spawned and all exited/killed
        const waveEnemiesSpawned = s.challengeSpawned >= (s.challengeWave + 1) * ENEMIES_PER_WAVE;
        const waveStart = s.challengeWave * ENEMIES_PER_WAVE;
        const waveEnemies = s.enemies.slice(waveStart, waveStart + ENEMIES_PER_WAVE);
        const allWaveDone = waveEnemiesSpawned && waveEnemies.every((e) => !e.alive || !e.entering);
        if (allWaveDone) {
          s.challengeWave++;
          s.challengeWaveTimer = 0;
        }
      }

      // Move entering enemies along bezier then exit
      for (const e of s.enemies) {
        if (!e.alive) continue;
        if (e.entering) {
          e.entryTime++;
          const duration = 70; // longer path for challenge enemies
          const t = Math.min(e.entryTime / duration, 1);
          const u = 1 - t;
          e.x = u * u * e.entryFromX + 2 * u * t * e.entryMidX + t * t * e.formationX;
          e.y = u * u * e.entryFromY + 2 * u * t * e.entryMidY + t * t * e.formationY;
          if (t >= 1) {
            e.alive = false;
            e.entering = false;
          }
        }
      }

      // Bullet-enemy collision
      const newBullets: Bullet[] = [];
      for (const b of s.bullets) {
        let hit = false;
        for (const e of s.enemies) {
          if (!e.alive) continue;
          if (b.x >= e.x && b.x <= e.x + 2 && Math.abs(b.y - e.y) < 1) {
            e.alive = false;
            s.score += 100;
            s.challengeHits++;
            s.explosions.push({ x: e.x + 1, y: e.y, frame: 0 });
            hit = true;
            break;
          }
        }
        if (!hit) newBullets.push(b);
      }
      s.bullets = newBullets;
      s.explosions = s.explosions.map((e) => ({ ...e, frame: e.frame + 1 })).filter((e) => e.frame < EXPLOSION_FRAMES.length);

      // Check if challenge is complete
      if (s.challengeWave >= CHALLENGE_WAVES && s.enemies.every((e) => !e.alive || !e.entering)) {
        // Award bonus
        s.score += s.challengeHits === 40 ? 10000 : s.challengeHits * 100;
        s.phase = "challenge_results";
        s.stageTimer = 0;
      }

      if (s.score > s.highScore) s.highScore = s.score;
      setDisplay(renderGame(s));
      return;
    }

    // Challenge results display
    if (s.phase === "challenge_results") {
      s.stageTimer++;
      if (s.stageTimer > 60) {
        s.phase = "stageclear";
        s.stageTimer = 0;
      }
      setDisplay(renderGame(s));
      return;
    }

    const shipWidth = s.dualFighter ? 6 : 3;

    // Player movement
    if (keys.has("ArrowLeft") || keys.has("a")) s.playerX = Math.max(s.dualFighter ? 1 : 0, s.playerX - 1);
    if (keys.has("ArrowRight") || keys.has("d")) s.playerX = Math.min(W - shipWidth, s.playerX + 1);

    // Player fire (max 2 bullets, dual fighter fires 2 at once)
    if (keys.has(" ") && s.bullets.length < (s.dualFighter ? 4 : 2)) {
      s.bullets.push({ x: s.playerX + 1, y: PLAYER_Y - 1 });
      if (s.dualFighter) {
        s.bullets.push({ x: s.playerX + 4, y: PLAYER_Y - 1 });
      }
      keys.delete(" ");
    }

    // Move bullets
    s.bullets = s.bullets.map((b) => ({ ...b, y: b.y - 1 })).filter((b) => b.y >= 0);

    // Move enemy bullets
    s.enemyBullets = s.enemyBullets.map((b) => ({ ...b, y: b.y + 0.5 })).filter((b) => b.y < H);

    // Formation sway
    s.formationOffset += s.formationDir * 0.1;
    if (Math.abs(s.formationOffset) > 3) s.formationDir *= -1;

    // Update non-diving enemies
    for (const e of s.enemies) {
      if (!e.alive) continue;
      if (!e.diving) {
        e.x = e.formationX + s.formationOffset;
        e.y = e.formationY;
      }
    }

    // Tractor beam logic for active beaming bosses
    for (const e of s.enemies) {
      if (!e.alive || !e.tractorBeam) continue;
      e.tractorTimer++;
      // Check if player is under the beam
      if (e.tractorTimer > 10 && e.tractorTimer < TRACTOR_BEAM_DURATION) {
        const beamLeft = Math.round(e.x);
        const beamRight = beamLeft + TRACTOR_BEAM_WIDTH - 1;
        const playerCenter = s.playerX + 1;
        if (playerCenter >= beamLeft && playerCenter <= beamRight) {
          // Captured!
          s.phase = "captured";
          s.capturedTimer = 0;
          s.capturingBossIdx = s.enemies.indexOf(e);
          s.bullets = [];
          s.enemyBullets = [];
          setDisplay(renderGame(s));
          return;
        }
      }
      // Beam ends without capture — boss continues diving down with wobble
      if (e.tractorTimer >= TRACTOR_BEAM_DURATION) {
        e.tractorBeam = false;
        // Resume normal dive — will go off screen and return to formation
        e.diveTime = 0;
        e.diveSpeed = 0.5;
        e.diveAngle = Math.PI / 2; // straight down
      }
    }

    // Diving logic
    const diveChance = Math.min(0.02 + s.stage * 0.003, 0.08);
    const aliveEnemies = s.enemies.filter((e) => e.alive && !e.diving && !e.tractorBeam);
    if (aliveEnemies.length > 0 && Math.random() < diveChance) {
      const diver = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];

      // Boss has a chance to do tractor beam instead of regular dive
      if (diver.type === "boss" && diver.capturedShipX < 0 && Math.random() < 0.25 && s.stage >= 2) {
        diver.diving = true;
        diver.diveTime = 0;
        diver.diveSpeed = 0.3;
        diver.diveAngle = Math.PI / 2; // straight down
        diver.tractorBeam = false;
        diver.tractorTimer = 0;
        // Boss will hover at mid-screen and activate beam
      } else {
        diver.diving = true;
        diver.diveTime = 0;
        diver.diveSpeed = 0.4 + Math.min(s.stage * 0.05, 0.6);
        diver.diveAngle = Math.atan2(PLAYER_Y - diver.y, s.playerX - diver.x + 1);
      }
    }

    // Move diving enemies
    for (const e of s.enemies) {
      if (!e.alive || !e.diving) continue;
      if (e.tractorBeam) continue; // beaming boss stays put
      e.diveTime++;

      // Boss tractor beam activation — hover at mid-screen
      if (e.type === "boss" && e.capturedShipX < 0 && !e.tractorBeam && e.diveTime > 15 && e.y >= H * 0.45 && e.y <= H * 0.55 && Math.random() < 0.1 && s.stage >= 2) {
        e.tractorBeam = true;
        e.tractorTimer = 0;
        e.diving = true; // stay in place
        continue;
      }

      const wobble = Math.sin(e.diveTime * 0.15) * 0.5;
      e.y += e.diveSpeed;
      e.x += Math.cos(e.diveAngle) * e.diveSpeed * 0.5 + wobble;

      if (Math.random() < 0.03 + s.stage * 0.005) {
        s.enemyBullets.push({ x: e.x + 1, y: e.y + 1 });
      }

      if (e.y > H + 2 || e.x < -5 || e.x > W + 5) {
        e.diving = false;
        e.tractorBeam = false;
        e.x = e.formationX;
        e.y = e.formationY;
      }
    }

    // Bullet-enemy collision
    const newBullets: Bullet[] = [];
    for (const b of s.bullets) {
      let hit = false;
      for (const e of s.enemies) {
        if (!e.alive) continue;
        if (b.x >= e.x && b.x <= e.x + 2 && Math.abs(b.y - e.y) < 1) {
          e.hp--;
          if (e.hp <= 0) {
            e.alive = false;
            s.score += getEnemyPoints(e, e.diving);
            // If this boss had a captured ship, rescue it!
            if (e.capturedShipX >= 0) {
              e.capturedShipX = -1;
              s.dualFighter = true;
              s.score += 1000; // Rescue bonus
            }
          }
          s.explosions.push({ x: e.x + 1, y: e.y, frame: 0 });
          hit = true;
          break;
        }
      }
      if (!hit) newBullets.push(b);
    }
    s.bullets = newBullets;

    // Enemy bullet-player collision
    for (const b of s.enemyBullets) {
      const hitLeft = s.dualFighter ? s.playerX - 1 : s.playerX;
      const hitRight = hitLeft + shipWidth - 1;
      if (b.x >= hitLeft && b.x <= hitRight && Math.abs(b.y - PLAYER_Y) < 1) {
        if (s.dualFighter) {
          s.dualFighter = false;
          s.explosions.push({ x: s.playerX + 3, y: PLAYER_Y, frame: 0 });
          s.enemyBullets = s.enemyBullets.filter((eb) => eb !== b);
        } else {
          s.lives--;
          s.phase = "dying";
          s.dyingTimer = 0;
          s.explosions.push({ x: s.playerX + 1, y: PLAYER_Y, frame: 0 });
          s.enemyBullets = [];
        }
        break;
      }
    }

    // Diving enemy-player collision
    for (const e of s.enemies) {
      if (!e.alive || !e.diving || e.tractorBeam) continue;
      const hitLeft = s.dualFighter ? s.playerX - 1 : s.playerX;
      if (Math.abs(e.x - hitLeft) < shipWidth && Math.abs(e.y - PLAYER_Y) < 1) {
        e.alive = false;
        s.score += getEnemyPoints(e, true);
        s.explosions.push({ x: e.x + 1, y: e.y, frame: 0 });
        if (s.dualFighter) {
          s.dualFighter = false;
          s.explosions.push({ x: s.playerX + 3, y: PLAYER_Y, frame: 0 });
        } else {
          s.lives--;
          s.phase = "dying";
          s.dyingTimer = 0;
          s.explosions.push({ x: s.playerX + 1, y: PLAYER_Y, frame: 0 });
        }
      }
    }

    // Advance explosions
    s.explosions = s.explosions.map((e) => ({ ...e, frame: e.frame + 1 })).filter((e) => e.frame < EXPLOSION_FRAMES.length);

    // Check stage clear (ignore captured ships in formation)
    if (s.enemies.every((e) => !e.alive)) {
      s.phase = "stageclear";
      s.stageTimer = 0;
    }

    if (s.score > s.highScore) {
      s.highScore = s.score;
    }

    setDisplay(renderGame(s));
  }, []);

  useEffect(() => {
    setDisplay(renderGame(stateRef.current));
    gameLoopRef.current = setInterval(tick, TICK_MS);
    return () => {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current);
    };
  }, [tick]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        try { localStorage.setItem("ns-syncswarm-highscore", String(stateRef.current.highScore)); } catch {}
        onExit();
        return;
      }
      keysRef.current.add(e.key);
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
        e.preventDefault();
      }
    }
    function handleKeyUp(e: KeyboardEvent) {
      keysRef.current.delete(e.key);
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [onExit]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
      <pre
        className="text-green-400 font-mono text-[11px] leading-[13px] select-none"
        style={{ textShadow: "0 0 4px rgba(74, 222, 128, 0.4)" }}
      >
        {display.map((row, y) => (
          <div key={y}>
            {row.map((seg, i) =>
              seg.color ? (
                <span key={i} style={{ color: seg.color, textShadow: "none" }}>{seg.text}</span>
              ) : (
                <span key={i}>{seg.text}</span>
              )
            )}
          </div>
        ))}
      </pre>
    </div>
  );
}
