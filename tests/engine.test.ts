import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine, judge, resolveRoll, seededRandom } from '../src/engine.ts';
import type { TileKind } from '../src/config.ts';

function setup(random = .51) { const e = new GameEngine(() => random); e.start(); return e; }
function tap(e: GameEngine, kind: TileKind, quality: 'perfect' | 'good' = 'perfect') {
  e.state.locked = false; e.state.tiles = [{ kind, center: .5, width: .18 }];
  e.state.marker = quality === 'perfect' ? .5 : .565; const result = e.tap();
  if (kind === 'attack') e.step(.23);
  return result;
}

test('yellow has priority at inclusive boundaries; green outside yellow; blank misses', () => {
  const tiles = [{ kind: 'attack' as const, center: .5, width: .18 }];
  assert.equal(judge(.525, tiles).quality, 'perfect');
  assert.equal(judge(.526, tiles).quality, 'good');
  assert.equal(judge(.59, tiles).quality, 'good');
  assert.equal(judge(.591, tiles).quality, 'miss');
  assert.equal(judge(.535, tiles, 2).quality, 'perfect');
});
test('all D4 outcomes and natural-only criticals', () => {
  for (let raw = 1; raw <= 4; raw++) {
    assert.equal(resolveRoll(raw, 'good').hit, raw >= 3);
    assert.equal(resolveRoll(raw, 'perfect').hit, true);
    assert.equal(resolveRoll(raw, 'perfect').critical, raw === 4);
  }
  assert.equal(resolveRoll(2, 'perfect').total, 4);
  assert.equal(resolveRoll(2, 'perfect').critical, false);
});
test('green attack may miss without breaking timing combo; perfect hit and natural crit differ', () => {
  const e = setup(.01); tap(e, 'attack', 'good');
  assert.equal(e.state.enemyHp, 6); assert.equal(e.state.combo, 1);
  tap(e, 'attack'); assert.equal(e.state.enemyHp, 4);
  const c = setup(.99); tap(c, 'attack'); assert.equal(c.state.enemyHp, 2);
});
test('350ms input lock rejects repeated taps and then resets scanning', () => {
  const e = setup(); tap(e, 'guard'); const combo = e.state.combo;
  assert.equal(e.tap(), null); e.step(.34); assert.equal(e.tap(), null);
  e.step(.02); assert.equal(e.state.locked, false); assert.ok(e.state.marker < .03);
  assert.equal(e.state.combo, combo);
});
test('blank miss resets combo, keeps targets and does not harm player', () => {
  const e = setup(); e.state.combo = 5; e.state.marker = 0; const before = structuredClone(e.state.tiles);
  e.tap(); assert.equal(e.state.hp, 6); assert.equal(e.state.combo, 0);
  e.step(.36); assert.deepEqual(e.state.tiles, before);
});
test('half-heart health, healing cap and no-heal feedback', () => {
  const e = setup(); e.state.hp = 3; tap(e, 'heal', 'good'); assert.equal(e.state.hp, 4);
  tap(e, 'heal'); assert.equal(e.state.hp, 6); tap(e, 'heal');
  assert.ok(e.events.some(x => x.type === 'no_heal'));
});
test('guard absorbs one hit, never stacks, and expires', () => {
  const e = setup(); tap(e, 'guard'); tap(e, 'guard', 'good'); assert.equal(e.state.shield, 1);
  e.damagePlayer(2, 'test'); assert.equal(e.state.hp, 5); assert.equal(e.state.shield, 0);
  tap(e, 'guard'); e.step(2.51); assert.equal(e.state.shield, 0);
});
test('speed clamps and changes do not alter enemy clock', () => {
  const e = setup(.01); const next = e.state.enemyNextAt;
  for (let i = 0; i < 20; i++) tap(e, 'fast');
  assert.equal(e.speed, 2); assert.equal(e.state.enemyNextAt, next);
  e.state.combo = 0; for (let i = 0; i < 20; i++) tap(e, 'slow');
  e.state.combo = 0; assert.equal(e.speed, .75);
});
test('first upgrade is chosen through timing, then summon enters action pool', () => {
  const e = setup(.01); tap(e, 'guard'); tap(e, 'guard'); e.step(.36);
  assert.equal(e.state.level, 2); assert.equal(e.state.upgradeMode, true);
  assert.deepEqual(e.state.tiles.map(t => t.kind), ['upgrade_summon', 'upgrade_health']);
  e.state.marker = .43; e.tap(); assert.equal(e.state.summonUnlocked, true);
  const kinds = new Set<string>(); e.rng = seededRandom(42);
  for (let i = 0; i < 100; i++) e.normalTiles().forEach(t => kinds.add(t.kind));
  assert.ok(kinds.has('summon'));
});
test('upgrade choices respect limits and lack duplicate options', () => {
  const e = setup(); e.state.upgradesChosen = 1; e.state.pendingUpgrades = 1;
  e.state.summonUnlocked = true; e.state.maxHp = 8;
  const kinds = e.upgradeTiles().map(t => t.kind);
  assert.deepEqual(new Set(kinds), new Set(['upgrade_attack', 'upgrade_window']));
});
test('summon duration cap, attacks, structural growth and expiry', () => {
  const e = setup(.01); e.state.summonUnlocked = true; e.state.enemyHp = 100;
  tap(e, 'summon'); assert.equal(e.state.familiarUntil, 8);
  tap(e, 'summon'); assert.equal(e.state.familiarUntil, 12);
  tap(e, 'summon'); assert.equal(e.state.familiarLevel, 2);
  e.step(2.01); assert.equal(e.state.enemyHp, 98);
  e.step(10.1); assert.equal(e.familiarActive, false);
});
test('hazard can be blocked, resets combo, has no hidden follow-up damage', () => {
  const e = setup(); e.state.combo = 9; e.state.shield = 2;
  tap(e, 'hazard'); assert.equal(e.state.hp, 6); assert.equal(e.state.combo, 0);
  assert.equal(e.state.shield, 0);
});
test('enemy windup, seeded rolls, ape heal and shadow threat are actionable', () => {
  const e = setup(.01); e.step(2.41); assert.equal(e.state.enemyWinding, true);
  e.step(1); assert.equal(e.state.hp, 6); assert.ok(e.state.lastEnemyRoll);
  e.state.wave = 1; e.state.enemyActions = 2; e.state.enemyHp = 5; e.state.enemyMaxHp = 10;
  assert.equal(e.intent(), 'heal'); e.state.enemyIntent = 'heal'; e.resolveEnemy(); assert.equal(e.state.enemyHp, 6);
  e.state.wave = 2; e.state.enemyActions = 2; assert.equal(e.intent(), 'threat');
  e.state.enemyIntent = 'threat'; e.resolveEnemy(); assert.ok(e.state.tiles.some(t => t.kind === 'hazard'));
  e.state.enemyNextAt = Infinity; e.step(6.01); assert.ok(!e.state.tiles.some(t => t.kind === 'hazard'));
});
test('paused game freezes cursor, enemy, familiar and shield; restart clears run', () => {
  const e = setup(); tap(e, 'guard'); e.pause(); const before = structuredClone(e.state);
  e.step(20); assert.deepEqual(e.state, before);
  e.resume(); e.step(.1); assert.ok(e.state.time > before.time);
  e.restart(); assert.equal(e.state.wave, 0); assert.equal(e.state.hp, 6);
  assert.equal(e.state.shield, 0); assert.equal(e.state.summonUnlocked, false);
});
test('three victories preserve progression, heal once and cancel old enemy attacks', () => {
  const e = setup(); e.state.hp = 3; e.state.summonUnlocked = true; e.state.level = 3;
  e.damageEnemy(100, 'test'); assert.equal(e.state.phase, 'intermission'); assert.equal(e.state.hp, 4);
  e.step(20); assert.equal(e.state.hp, 4); e.nextWave();
  assert.equal(e.state.wave, 1); assert.equal(e.state.enemyHp, 10); assert.equal(e.state.level, 3);
  assert.equal(e.state.summonUnlocked, true);
  e.damageEnemy(100, 'test'); e.nextWave(); e.damageEnemy(100, 'test');
  assert.equal(e.state.phase, 'won'); assert.equal(e.state.score, 600);
});
test('player death takes priority and emits one terminal event', () => {
  const e = setup(); e.state.hp = 0; e.state.enemyHp = 0; e.checkDeaths(); e.checkDeaths();
  assert.equal(e.state.phase, 'lost'); assert.equal(e.events.filter(x => x.type === 'lost').length, 1);
});
test('simultaneous fatal impacts lose; an earlier kill cancels the enemy impact', () => {
  for (const offset of [0, -.01]) {
    const e = setup(.51); e.state.hp = 1; e.state.enemyHp = 2; e.state.time = 3.3;
    e.state.enemyWinding = true;
    e.state.pendingAttack = { at: 3.4 + offset, amount: 2, roll: resolveRoll(3, 'perfect'), quality: 'perfect' };
    e.step(.12);
    assert.equal(e.state.phase, offset === 0 ? 'lost' : 'intermission');
    assert.equal(e.events.filter(x => x.type === 'enemy_attack').length, offset === 0 ? 1 : 0);
  }
});
test('weighted tiles stay separate, distinct and cannot omit attack for 3 rounds', () => {
  const e = new GameEngine(seededRandom(91)); let missing = 0;
  for (let i = 0; i < 200; i++) {
    const tiles = e.normalTiles(); assert.notEqual(tiles[0].kind, tiles[1].kind);
    assert.ok(tiles[1].center - tiles[0].center > .18);
    missing = tiles.some(t => t.kind === 'attack') ? 0 : missing + 1; assert.ok(missing < 3);
  }
});
test('red threats cannot replace the only attack or break the attack availability guarantee', () => {
  const e=new GameEngine(seededRandom(91));e.start();e.state.wave=2;e.state.enemyIntent='threat';
  e.state.tiles=[{kind:'guard',center:.43,width:.18},{kind:'attack',center:.79,width:.18}];
  e.resolveEnemy();assert.deepEqual(e.state.tiles.map(t=>t.kind),['attack','hazard']);
  let missing=0;
  for(let i=0;i<100;i++){const tiles=e.normalTiles();assert.equal(tiles[1].kind,'hazard');missing=tiles.some(t=>t.kind==='attack')?0:missing+1;assert.ok(missing<3);}
});
