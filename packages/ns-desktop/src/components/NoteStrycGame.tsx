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
}
interface Explosion extends Point { frame: number; }
interface EnemyBullet extends Point { }

// --- Constants ---
const W = 60;  // game width in chars
const H = 40;  // game height in chars
const PLAYER_Y = H - 3;
const TICK_MS = 50; // 20fps for ASCII feel
const ENEMY_CHARS: Record<string, string[]> = {
  bee: ["{o}", "{O}"],
  butterfly: ["<X>", "<x>"],
  boss: ["/V\\", "/v\\"],
  bossHit: ["/W\\", "/w\\"],
};
const PLAYER_SHIP = ">A<";
const PLAYER_SHIP_DEAD = "*X*";
const EXPLOSION_FRAMES = ["*#*", ".+.", " . ", "   "];
const BULLET_CHAR = "|";
const ENEMY_BULLET_CHAR = ":";

// --- Formation layout ---
function createFormation(stage: number): Enemy[] {
  const enemies: Enemy[] = [];
  const centerX = Math.floor(W / 2);

  // Boss row (4 bosses)
  for (let i = 0; i < 4; i++) {
    const x = centerX - 9 + i * 6;
    enemies.push({ x, y: 3, type: "boss", alive: true, hp: 2, diving: false, diveAngle: 0, diveSpeed: 0, diveTime: 0, formationX: x, formationY: 3 });
  }
  // Butterfly rows (2 rows of 8)
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 8; i++) {
      const x = centerX - 14 + i * 4;
      enemies.push({ x, y: 5 + row * 2, type: "butterfly", alive: true, hp: 1, diving: false, diveAngle: 0, diveSpeed: 0, diveTime: 0, formationX: x, formationY: 5 + row * 2 });
    }
  }
  // Bee rows (2 rows of 10)
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 10; i++) {
      const x = centerX - 18 + i * 4;
      enemies.push({ x, y: 9 + row * 2, type: "bee", alive: true, hp: 1, diving: false, diveAngle: 0, diveSpeed: 0, diveTime: 0, formationX: x, formationY: 9 + row * 2 });
    }
  }
  return enemies;
}

function getEnemyPoints(e: Enemy, diving: boolean): number {
  if (e.type === "bee") return diving ? 100 : 50;
  if (e.type === "butterfly") return diving ? 160 : 80;
  return diving ? 400 : 150;
}

// --- Game State ---
type GamePhase = "title" | "playing" | "dying" | "gameover" | "stageclear" | "bonus";

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
  };
}

// --- Render ---
function renderGame(state: GameState): string {
  const buf: string[][] = Array.from({ length: H }, () => Array(W).fill(" "));

  function drawStr(x: number, y: number, s: string) {
    for (let i = 0; i < s.length; i++) {
      const cx = x + i;
      if (cx >= 0 && cx < W && y >= 0 && y < H) buf[y][cx] = s[i];
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
      " _   _       _       ____  _                   ",
      "| \\ | | ___ | |_ ___/ ___|| |_ _ __ _   _  ___ ",
      "|  \\| |/ _ \\| __/ _ \\___ \\| __| '__| | | |/ __|",
      "| |\\  | (_) | ||  __/___) | |_| |  | |_| | (__ ",
      "|_| \\_|\\___/ \\__\\___|____/ \\__|_|   \\__, |\\___|",
      "                                    |___/       ",
    ];
    const startY = 9;
    for (let i = 0; i < lines.length; i++) {
      drawStr(Math.floor((W - lines[i].length) / 2), startY + i, lines[i]);
    }
    drawStr(Math.floor((W - 15) / 2), 20, "- BY NOTESYNC -");
    const blink = Math.floor(state.tick / 10) % 2 === 0;
    if (blink) {
      drawStr(Math.floor((W - 22) / 2), 26, "PRESS SPACE TO START");
    }
    drawStr(Math.floor((W - 26) / 2), 30, "ARROWS/WASD: MOVE  SPACE: FIRE");
    drawStr(Math.floor((W - 14) / 2), 32, "ESC: EXIT GAME");
    // Lives
    const livesStr = "LIVES: " + ">A< ".repeat(3).trim();
    drawStr(1, H - 1, livesStr);
    return buf.map((r) => r.join("")).join("\n");
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

  if (state.phase === "bonus") {
    const bonusText = "-- CHALLENGING STAGE --";
    drawStr(Math.floor((W - bonusText.length) / 2), 1, bonusText);
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
    const ch = chars[animFrame];
    drawStr(Math.round(e.x), Math.round(e.y), ch);
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
  if (state.phase === "playing" || state.phase === "bonus" || state.phase === "stageclear") {
    drawStr(state.playerX, PLAYER_Y, PLAYER_SHIP);
  } else if (state.phase === "dying") {
    drawStr(state.playerX, PLAYER_Y, PLAYER_SHIP_DEAD);
  }

  // Lives display
  const livesStr = ">A< ".repeat(Math.max(0, state.lives - 1)).trim();
  drawStr(1, H - 1, `LIVES: ${livesStr}`);

  // Stage clear message
  if (state.phase === "stageclear") {
    drawStr(Math.floor((W - 14) / 2), Math.floor(H / 2), "STAGE CLEARED!");
  }

  return buf.map((r) => r.join("")).join("\n");
}

// --- Game Component ---
interface NoteStrycGameProps {
  onExit: () => void;
}

export function NoteStrycGame({ onExit }: NoteStrycGameProps) {
  const [display, setDisplay] = useState("");
  const stateRef = useRef<GameState>(initState(0));
  const keysRef = useRef<Set<string>>(new Set());
  const gameLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load high score
  useEffect(() => {
    try {
      const stored = localStorage.getItem("ns-notestryc-highscore");
      if (stored) stateRef.current.highScore = Number(stored);
    } catch {}
  }, []);

  const tick = useCallback(() => {
    const s = stateRef.current;
    s.tick++;
    const keys = keysRef.current;

    if (s.phase === "title") {
      if (keys.has(" ")) {
        s.phase = "playing";
        s.enemies = createFormation(s.stage);
        s.bullets = [];
        s.enemyBullets = [];
        s.explosions = [];
        s.stageTimer = 0;
        keys.delete(" ");
      }
      setDisplay(renderGame(s));
      return;
    }

    if (s.phase === "gameover") {
      if (keys.has(" ")) {
        const hs = s.highScore;
        Object.assign(s, initState(hs));
        s.phase = "playing";
        s.enemies = createFormation(s.stage);
        keys.delete(" ");
      }
      setDisplay(renderGame(s));
      return;
    }

    if (s.phase === "dying") {
      s.dyingTimer++;
      // Advance explosions
      s.explosions = s.explosions.map((e) => ({ ...e, frame: e.frame + 1 })).filter((e) => e.frame < EXPLOSION_FRAMES.length);
      if (s.dyingTimer > 30) {
        if (s.lives <= 0) {
          if (s.score > s.highScore) {
            s.highScore = s.score;
            try { localStorage.setItem("ns-notestryc-highscore", String(s.highScore)); } catch {}
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

    if (s.phase === "stageclear") {
      s.stageTimer++;
      if (s.stageTimer > 40) {
        s.stage++;
        const isBonus = s.stage % 4 === 3;
        s.phase = isBonus ? "bonus" : "playing";
        s.enemies = createFormation(s.stage);
        s.bullets = [];
        s.enemyBullets = [];
        s.explosions = [];
        s.stageTimer = 0;
        s.bonusKills = 0;
      }
      setDisplay(renderGame(s));
      return;
    }

    const isBonus = s.phase === "bonus";

    // Player movement
    if (keys.has("ArrowLeft") || keys.has("a")) s.playerX = Math.max(0, s.playerX - 1);
    if (keys.has("ArrowRight") || keys.has("d")) s.playerX = Math.min(W - 3, s.playerX + 1);

    // Player fire (max 2 bullets on screen)
    if (keys.has(" ") && s.bullets.length < 2) {
      s.bullets.push({ x: s.playerX + 1, y: PLAYER_Y - 1 });
      keys.delete(" ");
    }

    // Move bullets
    s.bullets = s.bullets.map((b) => ({ ...b, y: b.y - 1 })).filter((b) => b.y >= 0);

    // Move enemy bullets
    if (!isBonus) {
      s.enemyBullets = s.enemyBullets.map((b) => ({ ...b, y: b.y + 0.5 })).filter((b) => b.y < H);
    }

    // Formation sway
    s.formationOffset += s.formationDir * 0.1;
    if (Math.abs(s.formationOffset) > 3) s.formationDir *= -1;

    // Update enemies
    for (const e of s.enemies) {
      if (!e.alive) continue;
      if (!e.diving) {
        e.x = e.formationX + s.formationOffset;
        e.y = e.formationY;
      }
    }

    // Diving logic
    const diveChance = Math.min(0.02 + s.stage * 0.003, 0.08);
    const aliveEnemies = s.enemies.filter((e) => e.alive && !e.diving);
    if (aliveEnemies.length > 0 && Math.random() < diveChance) {
      const diver = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
      diver.diving = true;
      diver.diveTime = 0;
      diver.diveSpeed = 0.4 + Math.min(s.stage * 0.05, 0.6);
      diver.diveAngle = Math.atan2(PLAYER_Y - diver.y, s.playerX - diver.x + 1);
    }

    // Move diving enemies
    for (const e of s.enemies) {
      if (!e.alive || !e.diving) continue;
      e.diveTime++;
      // Sine wave motion while diving
      const wobble = Math.sin(e.diveTime * 0.15) * 0.5;
      e.y += e.diveSpeed;
      e.x += Math.cos(e.diveAngle) * e.diveSpeed * 0.5 + wobble;

      // Enemy fires while diving
      if (!isBonus && Math.random() < 0.03 + s.stage * 0.005) {
        s.enemyBullets.push({ x: e.x + 1, y: e.y + 1 });
      }

      // Off screen — return to formation
      if (e.y > H + 2 || e.x < -5 || e.x > W + 5) {
        e.diving = false;
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
            if (isBonus) s.bonusKills++;
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
    if (!isBonus) {
      for (const b of s.enemyBullets) {
        if (b.x >= s.playerX && b.x <= s.playerX + 2 && Math.abs(b.y - PLAYER_Y) < 1) {
          s.lives--;
          s.phase = "dying";
          s.dyingTimer = 0;
          s.explosions.push({ x: s.playerX + 1, y: PLAYER_Y, frame: 0 });
          s.enemyBullets = [];
          break;
        }
      }
    }

    // Diving enemy-player collision
    for (const e of s.enemies) {
      if (!e.alive || !e.diving) continue;
      if (Math.abs(e.x - s.playerX) < 3 && Math.abs(e.y - PLAYER_Y) < 1) {
        e.alive = false;
        s.score += getEnemyPoints(e, true);
        s.explosions.push({ x: e.x + 1, y: e.y, frame: 0 });
        if (!isBonus) {
          s.lives--;
          s.phase = "dying";
          s.dyingTimer = 0;
          s.explosions.push({ x: s.playerX + 1, y: PLAYER_Y, frame: 0 });
        }
      }
    }

    // Advance explosions
    s.explosions = s.explosions.map((e) => ({ ...e, frame: e.frame + 1 })).filter((e) => e.frame < EXPLOSION_FRAMES.length);

    // Extra life
    if (s.score >= 20000 && s.score - getEnemyPoints(s.enemies[0] || { type: "bee", diving: false } as Enemy, false) < 20000) {
      // Simplified: just check milestone
    }

    // Check stage clear
    if (s.enemies.every((e) => !e.alive)) {
      if (isBonus) {
        s.score += s.bonusKills === 40 ? 10000 : s.bonusKills * 100;
      }
      s.phase = "stageclear";
      s.stageTimer = 0;
    }

    // Update high score live
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
        // Save high score on exit
        try { localStorage.setItem("ns-notestryc-highscore", String(stateRef.current.highScore)); } catch {}
        onExit();
        return;
      }
      keysRef.current.add(e.key);
      // Prevent page scroll
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
        {display}
      </pre>
    </div>
  );
}
