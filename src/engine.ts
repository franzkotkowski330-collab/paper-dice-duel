import { CONFIG, ENEMIES } from './config.ts';
import type { ActionKind, TileKind, UpgradeKind } from './config.ts';

export type Phase = 'ready' | 'battle' | 'intermission' | 'won' | 'lost';
export type Quality = 'perfect' | 'good' | 'miss' | 'hazard';
export type Tile = { kind: TileKind; center: number; width: number };
export type Roll = { raw: number; bonus: number; total: number; hit: boolean; critical: boolean };
export type GameEvent = {
  id: number; type: string; time: number; quality?: Quality; kind?: TileKind;
  amount?: number; roll?: Roll; text?: string;
};
export type GameState = {
  phase: Phase; paused: boolean; pauseReason: 'manual' | 'hidden' | 'portrait'; time: number;
  wave: number; hp: number; maxHp: number; enemyHp: number; enemyMaxHp: number;
  score: number; combo: number; bestCombo: number; level: number; xp: number;
  pendingUpgrades: number; upgradesChosen: number; upgradeMode: boolean;
  attackUpgrades: number; windowUpgrades: number; summonUnlocked: boolean; paceOffset: number;
  marker: number; lockUntil: number; locked: boolean; tiles: Tile[]; refreshAfterLock: boolean;
  shield: number; shieldUntil: number; threatUntil: number;
  familiarLevel: number; familiarUntil: number; familiarCount: number; familiarNextAttack: number;
  enemyNextAt: number; enemyWinding: boolean; enemyIntent: 'attack' | 'heal' | 'threat'; enemyActions: number;
  lastQuality: Quality | null; lastAction: TileKind | null; lastRoll: Roll | null;
  lastEnemyRoll: Roll | null; lastActionAt: number; waveEndedAt: number;
  pendingAttack: { at: number; amount: number; roll: Roll; quality: 'good' | 'perfect' } | null;
};

export function seededRandom(seed: number): () => number {
  let n = seed >>> 0;
  return () => { n += 0x6D2B79F5; let t = n; t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

export function resolveRoll(raw: number, quality: 'good' | 'perfect'): Roll {
  const bonus = quality === 'perfect' ? 2 : 0;
  return { raw, bonus, total: raw + bonus, hit: raw + bonus >= 3, critical: raw === 4 };
}

export function judge(marker: number, tiles: readonly Tile[], windowUpgrades = 0): { quality: Quality; tile?: Tile } {
  for (const tile of tiles) {
    const distance = Math.abs(marker - tile.center);
    if (distance <= tile.width / 2 + 1e-10) {
      if (tile.kind === 'hazard') return { quality: 'hazard', tile };
      const width = CONFIG.yellowWidth + windowUpgrades * .01;
      return { quality: distance <= width / 2 + 1e-10 ? 'perfect' : 'good', tile };
    }
  }
  return { quality: 'miss' };
}

function freshState(): GameState {
  return {
    phase: 'ready', paused: false, pauseReason: 'manual', time: 0,
    wave: 0, hp: CONFIG.initialHp, maxHp: CONFIG.initialHp, enemyHp: ENEMIES[0].hp, enemyMaxHp: ENEMIES[0].hp,
    score: 0, combo: 0, bestCombo: 0, level: 1, xp: 0,
    pendingUpgrades: 0, upgradesChosen: 0, upgradeMode: false,
    attackUpgrades: 0, windowUpgrades: 0, summonUnlocked: false, paceOffset: 0,
    marker: 0, lockUntil: 0, locked: false, refreshAfterLock: false,
    tiles: [{ kind: 'attack', center: .49, width: .18 }, { kind: 'guard', center: .80, width: .18 }],
    shield: 0, shieldUntil: 0, threatUntil: 0,
    familiarLevel: 1, familiarUntil: 0, familiarCount: 0, familiarNextAttack: Infinity,
    enemyNextAt: ENEMIES[0].interval, enemyWinding: false, enemyIntent: 'attack', enemyActions: 0,
    lastQuality: null, lastAction: null, lastRoll: null, lastEnemyRoll: null, lastActionAt: -10, waveEndedAt: -10, pendingAttack: null,
  };
}

export class GameEngine {
  state: GameState;
  events: GameEvent[] = [];
  rng: () => number;
  eventId = 0;
  roundsWithoutAttack = 0;
  settling = false;
  constructor(rng: () => number = Math.random) { this.rng = rng; this.state = freshState(); }

  get speed(): number {
    const s = this.state;
    return Math.max(CONFIG.minSpeed, Math.min(CONFIG.maxSpeed, 1 + s.paceOffset + Math.min(s.combo * CONFIG.comboSpeed, CONFIG.maxComboSpeed)));
  }
  get nextXp(): number { return CONFIG.xp[this.state.level - 1] ?? 0; }
  get familiarActive(): boolean { return this.state.time < this.state.familiarUntil; }
  get enemy() { return ENEMIES[this.state.wave]; }

  emit(type: string, details: Omit<GameEvent, 'id' | 'type' | 'time'> = {}): void {
    this.events.push({ id: ++this.eventId, type, time: this.state.time, ...details });
  }
  drainEvents(): GameEvent[] { const events = this.events; this.events = []; return events; }

  start(): void {
    if (this.state.phase !== 'ready') return;
    this.state.phase = 'battle'; this.emit('start');
  }
  restart(): void {
    this.state = freshState(); this.events = []; this.roundsWithoutAttack = 0;
    this.start();
  }
  pause(reason: GameState['pauseReason'] = 'manual'): void {
    if (!['battle', 'intermission'].includes(this.state.phase) || this.state.paused) return;
    this.state.paused = true; this.state.pauseReason = reason; this.emit('pause');
  }
  resume(): void {
    if (!this.state.paused) return;
    this.state.paused = false; this.emit('resume');
  }

  step(dt: number): void {
    if (this.state.paused || this.state.phase !== 'battle' || !Number.isFinite(dt) || dt <= 0) return;
    let remaining = Math.min(dt, 30);
    while (remaining > 1e-8 && this.state.phase === 'battle' && !this.state.paused) {
      const deadlines = [this.state.pendingAttack?.at, this.state.enemyNextAt,
        this.familiarActive ? this.state.familiarNextAttack : undefined];
      const until = Math.min(...deadlines.filter((at): at is number => at !== undefined && at - this.state.time > 1e-8).map(at => at - this.state.time));
      const step = Math.min(remaining, .02, until); remaining -= step;
      this.tick(step);
    }
  }

  tick(dt: number): void {
    const s = this.state; s.time += dt;
    const attackAt = s.pendingAttack?.at;
    const companionAt = this.familiarActive ? s.familiarNextAttack : Infinity;
    this.settling = s.enemyIntent === 'attack' && s.time + 1e-9 >= s.enemyNextAt &&
      ((attackAt !== undefined && Math.abs(attackAt - s.enemyNextAt) < 1e-8) || Math.abs(companionAt - s.enemyNextAt) < 1e-8);
    if (s.pendingAttack && s.time + 1e-9 >= s.pendingAttack.at) {
      const hit = s.pendingAttack; s.pendingAttack = null;
      if (hit.roll.hit) {
        if (hit.roll.critical) s.score += 100;
        this.emit('player_attack', { amount: hit.amount, roll: hit.roll, quality: hit.quality });
        this.damageEnemy(hit.amount, 'player');
      } else this.emit('player_miss', { roll: hit.roll, quality: hit.quality });
      if (s.phase !== 'battle') return;
    }
    if (s.shield && s.time >= s.shieldUntil) { s.shield = 0; this.emit('shield_end'); }
    if (s.threatUntil && s.time >= s.threatUntil) {
      s.threatUntil = 0;
      if (s.tiles.some(t => t.kind === 'hazard')) s.tiles = this.normalTiles();
      this.emit('threat_end');
    }
    if (s.locked) {
      if (s.time + 1e-9 >= s.lockUntil) {
        s.locked = false; s.marker = 0;
        if (s.refreshAfterLock) { s.tiles = s.pendingUpgrades > 0 ? this.upgradeTiles() : this.normalTiles(); s.refreshAfterLock = false; }
      }
    } else { s.marker = (s.marker + dt * this.speed / CONFIG.sweep) % 1; }

    if (this.familiarActive) {
      if (s.time + 1e-9 >= s.familiarNextAttack) {
        s.familiarNextAttack += CONFIG.familiarAttackInterval;
        this.emit('familiar_attack', { amount: s.familiarLevel }); this.damageEnemy(s.familiarLevel, 'familiar');
      }
    } else if (Number.isFinite(s.familiarNextAttack)) { s.familiarNextAttack = Infinity; this.emit('familiar_exit'); }
    if (s.phase !== 'battle') return;

    if (!s.enemyWinding && s.time >= s.enemyNextAt - CONFIG.enemyWindup) {
      s.enemyWinding = true; s.enemyIntent = this.intent(); this.emit('enemy_windup', { text: s.enemyIntent });
    }
    if (s.time + 1e-9 >= s.enemyNextAt) {
      this.resolveEnemy(); s.enemyWinding = false; s.enemyActions++;
      s.enemyNextAt = s.time + this.enemy.interval;
    }
    this.settling = false; this.checkDeaths();
  }

  roll(): number { return Math.min(4, Math.max(1, Math.floor(this.rng() * 4) + 1)); }

  tap(): { quality: Quality; tile?: Tile } | null {
    const s = this.state;
    if (s.phase !== 'battle' || s.paused || s.locked) return null;
    const result = judge(s.marker, s.tiles, s.windowUpgrades);
    s.locked = true; s.lockUntil = s.time + CONFIG.lock; s.lastActionAt = s.time;
    s.lastQuality = result.quality; s.lastAction = result.tile?.kind ?? null; s.lastRoll = null;
    this.emit('judgement', { quality: result.quality, kind: result.tile?.kind });
    if (result.quality === 'miss') { s.combo = 0; return result; }
    if (result.quality === 'hazard') {
      s.combo = 0; s.threatUntil = 0; this.damagePlayer(1, 'hazard'); s.refreshAfterLock = true;
      return result;
    }
    const quality = result.quality;
    const kind = result.tile!.kind;
    s.combo++; s.bestCombo = Math.max(s.bestCombo, s.combo);
    s.score += quality === 'perfect' ? 100 : 50;
    const isUpgrade = kind.startsWith('upgrade_');
    if (isUpgrade) this.applyUpgrade(kind as UpgradeKind);
    else this.resolveAction(kind as ActionKind, quality);
    this.gainXp(quality === 'perfect' ? 2 : 1);
    s.refreshAfterLock = true;
    this.checkDeaths();
    return result;
  }

  resolveAction(kind: ActionKind, quality: 'good' | 'perfect'): void {
    const s = this.state; const perfect = quality === 'perfect';
    if (kind === 'attack') {
      const roll = resolveRoll(this.roll(), quality); s.lastRoll = roll;
      const amount = ((perfect ? 2 : 1) + s.attackUpgrades) * (roll.critical ? 2 : 1);
      s.pendingAttack = { at: s.time + .22, amount, roll, quality };
      this.emit('player_roll', { roll, quality });
    } else if (kind === 'guard') {
      s.shield = perfect ? 2 : 1; s.shieldUntil = s.time + CONFIG.shieldDuration;
      this.emit('guard', { amount: s.shield });
    } else if (kind === 'heal') {
      const amount = Math.min(s.maxHp - s.hp, perfect ? 2 : 1); s.hp += amount;
      this.emit(amount ? 'heal' : 'no_heal', { amount });
    } else if (kind === 'fast' || kind === 'slow') {
      const delta = (perfect ? .2 : .1) * (kind === 'fast' ? 1 : -1);
      s.paceOffset = Math.max(-.65, Math.min(1, Number((s.paceOffset + delta).toFixed(2))));
      this.emit('speed', { amount: delta, kind });
    } else if (kind === 'summon' && s.summonUnlocked) {
      const active = this.familiarActive;
      s.familiarUntil = s.time + (active ? Math.min(12, s.familiarUntil - s.time + (perfect ? 8 : 4)) : 8);
      if (!active) s.familiarNextAttack = s.time + CONFIG.familiarAttackInterval;
      s.familiarCount++;
      if (s.familiarCount % 3 === 0 && s.familiarLevel < 3) {
        s.familiarLevel++; this.emit('familiar_grow', { amount: s.familiarLevel });
      } else this.emit(active ? 'familiar_gulp' : 'summon', { amount: s.familiarLevel });
    }
  }

  gainXp(amount: number): void {
    const s = this.state;
    if (s.level >= CONFIG.maxLevel) return;
    s.xp += amount;
    while (s.level < CONFIG.maxLevel && s.xp >= this.nextXp) {
      s.xp -= this.nextXp; s.level++; s.pendingUpgrades++; this.emit('level_up', { amount: s.level });
    }
  }

  applyUpgrade(kind: UpgradeKind): void {
    const s = this.state;
    if (!s.upgradeMode || s.pendingUpgrades < 1) return;
    if (kind === 'upgrade_summon') s.summonUnlocked = true;
    if (kind === 'upgrade_health' && s.maxHp < CONFIG.maxHp) { s.maxHp++; s.hp = Math.min(s.maxHp, s.hp + 1); }
    if (kind === 'upgrade_attack') s.attackUpgrades = Math.min(2, s.attackUpgrades + 1);
    if (kind === 'upgrade_window') s.windowUpgrades = Math.min(2, s.windowUpgrades + 1);
    s.pendingUpgrades--; s.upgradesChosen++; s.upgradeMode = false;
    this.emit('upgrade', { kind });
  }

  upgradeTiles(): Tile[] {
    const s = this.state; s.upgradeMode = true;
    let choices: UpgradeKind[];
    if (s.upgradesChosen === 0) choices = ['upgrade_summon', 'upgrade_health'];
    else {
      const pool: UpgradeKind[] = [];
      if (!s.summonUnlocked) pool.push('upgrade_summon');
      if (s.maxHp < CONFIG.maxHp) pool.push('upgrade_health');
      if (s.attackUpgrades < 2) pool.push('upgrade_attack');
      if (s.windowUpgrades < 2) pool.push('upgrade_window');
      choices = this.pickDistinct(pool, 2);
    }
    return choices.map((kind, index) => ({ kind, center: index ? .79 : .43, width: .18 }));
  }

  pickDistinct<T>(pool: T[], count: number): T[] {
    const remaining = [...pool]; const result: T[] = [];
    while (result.length < count && remaining.length) {
      const index = Math.min(remaining.length - 1, Math.floor(this.rng() * remaining.length));
      result.push(remaining.splice(index, 1)[0]);
    }
    return result;
  }

  normalTiles(): Tile[] {
    const s = this.state; s.upgradeMode = false;
    const weights: [ActionKind, number][] = [['attack', 4], ['guard', 2], ['heal', 2], ['fast', 1], ['slow', 1]];
    if (s.summonUnlocked) weights.push(['summon', 2]);
    const result: ActionKind[] = [];
    for (let i = 0; i < 2; i++) {
      const pool = weights.filter(([kind]) => !result.includes(kind));
      let value = this.rng() * pool.reduce((a, [, weight]) => a + weight, 0);
      let picked = pool[pool.length - 1][0];
      for (const [kind, weight] of pool) { value -= weight; if (value < 0) { picked = kind; break; } }
      result.push(picked);
    }
    if (!result.includes('attack')) {
      this.roundsWithoutAttack++;
      if (this.roundsWithoutAttack >= 3) { result[0] = 'attack'; this.roundsWithoutAttack = 0; }
    } else this.roundsWithoutAttack = 0;
    if (s.threatUntil > s.time) {
      if(result[1]==='attack')result[0]='attack';
      result[1] = 'hazard';
    }
    return result.map((kind, index) => ({ kind, center: index ? .75 + this.rng() * .10 : .35 + this.rng() * .14, width: .18 }));
  }

  intent(): 'attack' | 'heal' | 'threat' {
    const s = this.state;
    if (s.wave === 1 && (s.enemyActions + 1) % 3 === 0 && s.enemyHp < s.enemyMaxHp) return 'heal';
    if (s.wave === 2) {
      const kind = (['attack', 'attack', 'threat', 'attack', 'heal'] as const)[s.enemyActions % 5];
      return kind === 'heal' && s.enemyHp === s.enemyMaxHp ? 'attack' : kind;
    }
    return 'attack';
  }

  resolveEnemy(): void {
    const s = this.state;
    if (s.phase !== 'battle' || (s.enemyHp <= 0 && !this.settling)) return;
    if (s.enemyIntent === 'heal') {
      const amount = Math.min(1, s.enemyMaxHp - s.enemyHp); s.enemyHp += amount; this.emit('enemy_heal', { amount });
    } else if (s.enemyIntent === 'threat') {
      s.threatUntil = s.time + CONFIG.threatDuration;
      if (!s.upgradeMode) {
        if(s.tiles[1]?.kind==='attack')s.tiles[0]={...s.tiles[0],kind:'attack'};
        s.tiles[1] = { kind: 'hazard', center: .80, width: .18 };
      }
      this.emit('threat');
    } else {
      const roll = resolveRoll(this.roll(), 'good'); s.lastEnemyRoll = roll;
      this.emit('enemy_attack', { roll, amount: roll.hit ? (roll.critical ? 2 : 1) : 0 });
      if (roll.hit) this.damagePlayer(roll.critical ? 2 : 1, 'enemy');
      else this.emit('enemy_miss', { roll });
    }
  }

  damagePlayer(amount: number, source: string): void {
    const s = this.state;
    const blocked = Math.min(s.shield, amount);
    if (s.shield > 0) { s.shield = 0; s.shieldUntil = 0; }
    if (blocked) this.emit('blocked', { amount: blocked, text: source });
    const damage = amount - blocked; s.hp = Math.max(0, s.hp - damage);
    if (damage) this.emit('player_hurt', { amount: damage, text: source });
    this.checkDeaths();
  }
  damageEnemy(amount: number, source: string): void {
    const s = this.state;
    if (s.phase !== 'battle' || s.enemyHp <= 0) return;
    s.enemyHp = Math.max(0, s.enemyHp - amount); this.emit('enemy_hurt', { amount, text: source });
    this.checkDeaths();
  }
  checkDeaths(): void {
    const s = this.state;
    if (s.phase !== 'battle' || this.settling) return;
    if (s.hp <= 0) {
      s.phase = 'lost'; s.enemyWinding = false; s.pendingAttack = null; this.emit('lost');
    } else if (s.enemyHp <= 0) {
      s.score += 200; s.hp = Math.min(s.maxHp, s.hp + 1); s.waveEndedAt = s.time;
      s.enemyWinding = false; s.enemyNextAt = Infinity;
      s.pendingAttack = null;
      s.phase = s.wave === ENEMIES.length - 1 ? 'won' : 'intermission';
      this.emit('enemy_defeated'); this.emit(s.phase === 'won' ? 'won' : 'wave_clear');
    }
  }
  nextWave(): void {
    const s = this.state;
    if (s.phase !== 'intermission' || s.paused) return;
    s.wave++; s.enemyMaxHp = this.enemy.hp; s.enemyHp = this.enemy.hp;
    s.enemyActions = 0; s.enemyWinding = false; s.enemyIntent = 'attack';
    s.enemyNextAt = s.time + this.enemy.interval; s.threatUntil = 0; s.shield = 0;
    s.phase = 'battle'; s.marker = 0; s.locked = false; s.refreshAfterLock = false;
    s.tiles = s.pendingUpgrades > 0 ? this.upgradeTiles() : this.normalTiles();
    this.emit('next_wave');
  }
}
