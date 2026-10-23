import { CONFIG, ENEMIES, ICONS, LABELS } from './config.ts';
import { GameEngine } from './engine.ts';
import type { GameEvent, GameState, Tile } from './engine.ts';
import type { Assets, Atlas } from './assets.ts';

type VisualEvent = GameEvent & { age: number };
type Point3 = { x: number; y: number; z: number };
export const TRACK = { x: 428, y: 70, w: 680, h: 112 };
const INK = '#41372c', RED = '#a7452f', SAGE = '#58614b';

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  assets: Assets;
  events: VisualEvent[] = [];
  visualTime = 0;
  endAge = Infinity;
  scale = 1;
  mobile = false;
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  paper: CanvasPattern | null = null;
  lastPhase = 'ready';
  constructor(canvas: HTMLCanvasElement, assets: Assets) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d')!; this.assets = assets;
    const texture = document.createElement('canvas'); texture.width = texture.height = 96;
    texture.getContext('2d')!.drawImage(assets.icons.image, 1310, 776, 96, 96, 0, 0, 96, 96);
    this.paper = this.ctx.createPattern(texture, 'repeat');
    this.resize();
  }
  resize(): void {
    const box = this.canvas.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(box.width * dpr); this.canvas.height = Math.round(box.height * dpr);
    this.scale = box.width / CONFIG.width; this.mobile = box.height < 510;
  }
  handle(event: GameEvent): void {
    if (event.type === 'start' || event.type === 'next_wave') { this.events = []; this.endAge = Infinity; }
    this.events.push({ ...event, age: 0 });
    if (event.type === 'enemy_defeated' || event.type === 'lost') this.endAge = 0;
  }
  update(dt: number, paused: boolean): void {
    if (paused) return;
    this.visualTime += dt; this.endAge += dt;
    for (const event of this.events) event.age += dt;
    this.events = this.events.filter(event => event.age < (['lost', 'enemy_defeated', 'won', 'wave_clear'].includes(event.type) ? 999 : 2.5));
  }
  latest(types: string[], limit = Infinity): VisualEvent | undefined {
    for (let i = this.events.length - 1; i >= 0; i--) if (types.includes(this.events[i].type) && this.events[i].age < limit) return this.events[i];
    return undefined;
  }
  font(size: number, weight = '', family = 'Georgia'): string {
    const scaled = this.mobile ? Math.max(size, Math.min(29, 12 / this.scale)) : size;
    return `${weight} ${scaled}px ${family}`.trim();
  }
  text(text: string, x: number, y: number, size: number, color = INK, align: CanvasTextAlign = 'left', weight = ''): void {
    const c = this.ctx; c.fillStyle = color; c.font = this.font(size, weight); c.textAlign = align; c.textBaseline = 'middle'; c.fillText(text, x, y);
  }
  paperStrip(x: number, y: number, w: number, h: number, alpha = 1): void {
    const c = this.ctx, atlas = this.assets.icons, f = atlas.frames[14];
    c.save(); c.globalAlpha *= alpha;
    const cap = Math.min(h * .28, w / 4), sourceCap = f.h * .28;
    c.drawImage(atlas.image, f.x, f.y, sourceCap, f.h, x, y, cap, h);
    c.drawImage(atlas.image, f.x + sourceCap, f.y, f.w - 2 * sourceCap, f.h, x + cap, y, w - 2 * cap, h);
    c.drawImage(atlas.image, f.x + f.w - sourceCap, f.y, sourceCap, f.h, x + w - cap, y, cap, h);
    c.restore();
  }
  heart(x: number, y: number, fill: number, size = 32): void {
    const c = this.ctx;
    // The heart is a crop of the generated paper-heart ticket, not an emoji.
    c.save(); c.globalAlpha = .22;
    c.drawImage(this.assets.icons.image, 727, 144, 175, 150, x, y, size, size * .88);
    c.globalAlpha = 1;
    if (fill > 0) { c.beginPath(); c.rect(x, y, size * Math.min(1, fill), size * .88); c.clip();
      c.drawImage(this.assets.icons.image, 727, 144, 175, 150, x, y, size, size * .88); }
    c.restore();
  }
  health(x: number, y: number, hp: number, max: number, right = false): void {
    const size = this.mobile ? 38 : 34, gap = size + 7, count = Math.ceil(max / 2);
    for (let i = 0; i < count; i++) this.heart(right ? x - (count - i) * gap : x + i * gap, y, Math.max(0, Math.min(1, (hp - i * 2) / 2)), size);
  }
  shadow(x: number, y: number, width: number, alpha = .16): void {
    const c = this.ctx; c.save(); c.fillStyle = `rgba(55,43,32,${alpha})`; c.beginPath(); c.ellipse(x, y, width, 12, 0, 0, Math.PI * 2); c.fill(); c.restore();
  }
  draw(engine: GameEngine, bestScore: number, tutorial: boolean): void {
    const c = this.ctx, s = engine.state;
    c.setTransform(this.canvas.width / CONFIG.width, 0, 0, this.canvas.height / CONFIG.height, 0, 0);
    c.clearRect(0, 0, CONFIG.width, CONFIG.height);
    c.drawImage(this.assets.background, 0, 0, CONFIG.width, CONFIG.height);
    c.save();
    const hurt = this.latest(['player_hurt'], .22);
    if (hurt && !this.reducedMotion) c.translate(Math.sin(hurt.age * 90) * 3 * (1 - hurt.age / .22), 0);
    this.drawHero(s); this.drawEnemy(engine); this.drawFamiliar(engine); this.drawAttackEffects(s); this.drawDice(s);
    this.drawHud(engine, bestScore);
    if (s.phase === 'battle' || (s.phase !== 'ready' && this.endAge < .75)) this.drawTrack(engine);
    if (!s.paused) this.drawFeedback(s);
    if (tutorial && s.phase === 'battle') {
      this.paperStrip(442, 762, 652, 64, .95);
      this.text('TAP or SPACE when the marker meets a tile', 768, 789, 22, INK, 'center');
    }
    this.text(ENEMIES[s.wave].subtitle.toUpperCase(), 60, 824, 17, '#e9d2ac');
    if (!tutorial) this.text('GOOD  ·  PERFECT +2', 768, 824, 17, '#e9d2ac', 'center');
    if (s.paused) { c.fillStyle = 'rgba(35,30,25,.54)'; c.fillRect(0, 0, 1536, 864); }
    else if (['ready', 'intermission', 'won', 'lost'].includes(s.phase)) {
      c.fillStyle = `rgba(239,224,194,${s.phase === 'ready' ? .10 : .08})`; c.fillRect(0, 0, 1536, 864);
    }
    const curtain=this.latest(['next_wave'],.32);
    if(curtain&&!this.reducedMotion){const width=768*(1-curtain.age/.32);this.paperStrip(-10,0,width+10,864);this.paperStrip(1536-width,0,width+10,864);}
    c.restore();
    this.lastPhase = s.phase;
  }

  drawHud(engine: GameEngine, best: number): void {
    const s = engine.state;
    this.text('THE LITTLE WAYFARER', 66, 38, 17, '#75634b'); this.health(65, 62, s.hp, s.maxHp);
    this.paperStrip(54, 111, 175, 44, .9); this.text(`COMBO ${s.combo}`, 141, 133, 24, INK, 'center', 'bold');
    this.text(`${engine.speed.toFixed(2)}×`, 258, 133, 25, INK, 'left', 'bold');
    this.text(`SCORE ${s.score.toLocaleString('en-US')}`, 66, 182, 20);
    this.text(`LV ${s.level}`, 66, 221, 18, '#5c5140', 'left', 'bold');
    const c = this.ctx;
    c.fillStyle = '#b8a98e'; c.fillRect(126, 213, 153, 12);
    c.fillStyle = '#b4873d'; c.fillRect(126, 213, 153 * (s.level === 5 ? 1 : s.xp / engine.nextXp), 12);
    this.text(s.level === 5 ? 'MASTERED' : `${s.xp} / ${engine.nextXp}`, 295, 220, 15, '#736448');
    if (s.shield > 0) {
      this.assets.icons.icon(c, 1, 89, 269, 39, 47);
      this.text(`GUARD ${s.shield / 2} · ${Math.max(0, s.shieldUntil - s.time).toFixed(1)}s`, 120, 270, 17, '#52625f');
    }
    this.text(ENEMIES[s.wave].name, 1470, 38, 17, '#75634b', 'right'); this.health(1477, 62, s.enemyHp, s.enemyMaxHp, true);
    this.text('D4', 1467, 137, 25, INK, 'right', 'bold');
    this.text(`${s.wave + 1} / 3`, 1240, 137, 23, '#736448', 'right');
    if (s.phase === 'battle') {
      const remaining = Math.max(0, s.enemyNextAt - s.time);
      const label = s.enemyWinding ? (s.enemyIntent === 'heal' ? 'MENDING' : s.enemyIntent === 'threat' ? 'DARK OMEN' : 'WIND UP') : 'WATCH THE ENEMY';
      this.text(label, 1469, 183, s.enemyWinding ? 23 : 17, s.enemyWinding ? RED : '#85775f', 'right', s.enemyWinding ? 'bold' : '');
      const w = 180, x = 1288, ratio = Math.min(1, remaining / engine.enemy.interval);
      c.fillStyle = 'rgba(78,62,40,.18)'; c.fillRect(x, 214, w, 5);
      c.fillStyle = s.enemyWinding ? RED : '#8c8c68'; c.fillRect(x, 214, w * (1 - ratio), 5);
    } else if (best) this.text(`BEST ${best.toLocaleString('en-US')}`, 1467, 182, 18, '#736448', 'right');
  }

  drawTrack(engine: GameEngine): void {
    const c = this.ctx, s = engine.state, { x, y, w, h } = TRACK;
    c.save();
    this.paperStrip(x - 15, y - 10, w + 30, h + 20);
    c.fillStyle = 'rgba(74,60,38,.10)'; c.beginPath(); c.roundRect(x + 4, y + 12, w - 8, h - 22, 5); c.fill();
    if (s.upgradeMode) this.text('CHOOSE A NEW FOLD', x + w / 2, y - 27, 19, RED, 'center', 'bold');
    else this.text('STOP THE MARKER', x + w / 2, y - 27, 16, '#7b694f', 'center');
    for (const tile of s.tiles) this.drawTile(engine, tile);
    const markerX = x + s.marker * w;
    c.strokeStyle = '#2d352b'; c.lineWidth = 4;
    c.beginPath(); c.moveTo(markerX, y - 8); c.lineTo(markerX, y + h + 9); c.stroke();
    c.fillStyle = '#2d352b'; c.beginPath(); c.moveTo(markerX - 8, y - 16); c.lineTo(markerX + 8, y - 16); c.lineTo(markerX, y - 6); c.closePath(); c.fill();
    if (s.locked) { c.fillStyle = s.lastQuality === 'perfect' ? '#ca9e3e' : s.lastQuality === 'good' ? '#6a8056' : '#a24430'; c.beginPath(); c.arc(markerX, y + h + 14, 5, 0, Math.PI * 2); c.fill(); }
    c.restore();
  }
  drawTile(engine: GameEngine, tile: Tile): void {
    const c = this.ctx, s = engine.state, { x, y, w, h } = TRACK;
    const cx = x + tile.center * w, tw = tile.width * w;
    c.save();
    c.fillStyle = tile.kind === 'hazard' ? 'rgba(161,55,38,.65)' : 'rgba(94,124,67,.43)';
    c.beginPath();c.moveTo(cx-tw/2+2,y+13);c.lineTo(cx+tw/2-1,y+15);c.lineTo(cx+tw/2,y+h-12);c.lineTo(cx-tw/2,y+h-10);c.closePath();c.fill();
    if (tile.kind !== 'hazard') {
      const yellow = (CONFIG.yellowWidth + s.windowUpgrades * .01) * w;
      c.fillStyle = '#e9c360'; c.fillRect(cx - yellow / 2, y + 15, yellow, h - 27);
    }
    const selected = s.locked && Math.abs(s.marker - tile.center) <= tile.width / 2;
    if (selected) { c.strokeStyle = s.lastQuality === 'hazard' ? RED : s.lastQuality === 'perfect' ? '#b17822' : '#3d623b'; c.lineWidth = 4; c.strokeRect(cx - tw / 2 + 2, y + 15, tw - 4, h - 27); }
    c.save();c.shadowColor='#43331d45';c.shadowBlur=3;c.shadowOffsetY=3;
    this.assets.icons.icon(c, ICONS[tile.kind], cx, y + h / 2, 57, 76);c.restore();
    const label = LABELS[tile.kind];
    if (s.upgradeMode) {
      const words = label.split(' '), line1 = words.slice(0, -1).join(' '), line2 = words.at(-1)!;
      this.text(line1, cx, y + h + 35, 16, INK, 'center', 'bold'); this.text(line2, cx, y + h + 57, 16, INK, 'center');
    } else this.text(label, cx, y + h + 37, 16, '#6b5b41', 'center', 'bold');
    c.restore();
  }

  drawHero(s: GameState): void {
    const c = this.ctx;
    const roll = this.latest(['player_roll'], .22), attack = this.latest(['player_attack', 'player_miss'], .44);
    const hurt = this.latest(['player_hurt'], .42), guard = this.latest(['guard', 'blocked'], .8);
    const healing = this.latest(['heal', 'summon', 'familiar_grow', 'upgrade'], .65);
    let frame = 0, dx = 0, tilt = 0;
    if (s.phase === 'lost') frame = 7;
    else if ((s.phase === 'won' || s.phase === 'intermission') && !attack) frame = 6;
    else if (hurt) { frame = 4; dx = -Math.sin(hurt.age / .42 * Math.PI) * 18; }
    else if (roll) frame = 1;
    else if (attack) { frame = 2; dx = Math.sin(Math.min(1, attack.age / .44) * Math.PI) * 26; }
    else if (guard || s.shield) frame = 3;
    else if (healing) frame = 5;
    if (!this.reducedMotion && frame === 0) tilt = Math.sin(this.visualTime * 1.5) * .006;
    this.shadow(300 + dx, 741, frame === 7 ? 155 : 125);
    c.save(); c.translate(300 + dx, 739); c.rotate(tilt);
    this.assets.hero.draw(c, frame, 0, 0, 385); c.restore();
    if (s.shield) {
      c.save(); c.strokeStyle = 'rgba(230,217,161,.75)'; c.lineWidth = 5;
      c.beginPath(); c.ellipse(415, 554, 47, 94, -.18, -1.8, 1.7); c.stroke(); c.restore();
    }
    if (healing?.type === 'heal') this.paperSpecks(330, 510, healing.age, '#909b68', 12);
  }

  drawEnemy(engine: GameEngine): void {
    const s = engine.state, c = this.ctx;
    const atlas = s.wave === 1 ? this.assets.ape ?? this.assets.skeleton : s.wave === 2 ? this.assets.shadow ?? this.assets.skeleton : this.assets.skeleton;
    const defeated = s.enemyHp <= 0, hit = this.latest(['enemy_hurt'], .36), strike = this.latest(['enemy_attack'], .4);
    const healing = this.latest(['enemy_heal'], .55);
    let frame = 0, dx = 0;
    if (defeated) frame = this.endAge < .4 ? 4 : 5;
    else if (hit) { frame = 3; dx = Math.sin(hit.age / .36 * Math.PI) * 20; }
    else if (strike) { frame = 2; dx = -Math.sin(strike.age / .4 * Math.PI) * 35; }
    else if (s.enemyWinding) frame = 1;
    const height = s.wave === 0 ? 518 : s.wave === 1 ? 420 : 495;
    const enemyX=s.wave===1?1150:1218;
    this.shadow(enemyX + dx, 741, defeated ? 168 : 147);
    c.save();
    if (!this.reducedMotion && !defeated && !hit && !strike && !s.enemyWinding) {
      c.translate(1220, 740); c.scale(1, 1 + Math.sin(this.visualTime * 1.3 + 2) * .005); c.translate(-1220, -740);
    }
    atlas.draw(c, frame, enemyX + dx, 740, height);
    c.restore();
    if (defeated && this.endAge < 1.1 && !this.reducedMotion) this.boneFragments(atlas, enemyX, 683, this.endAge);
    if (hit) {
      const alpha = Math.max(0, 1 - hit.age / .36);
      this.paperSpecks(1155, 475, hit.age, s.wave === 0 ? '#c4b78e' : s.wave === 1 ? '#70774b' : '#33332d', 15);
      this.text(`−${hit.amount! / 2}`, 1170, 312 - hit.age * 90, 38, RED, 'center', 'bold');
      c.save(); c.globalAlpha = alpha * .45; c.fillStyle = '#f4dc9a';
      c.beginPath(); c.arc(1155, 472, 18 + hit.age * 90, 0, Math.PI * 2); c.fill(); c.restore();
    }
    if (healing) { this.paperSpecks(1218, 480, healing.age, '#879362', 10); this.text('+½', 1218, 300 - healing.age * 40, 32, SAGE, 'center'); }
    if (s.enemyWinding) {
      const pulse = .65 + .35 * Math.sin(this.visualTime * 12);
      c.save(); c.globalAlpha = pulse;
      const color = s.enemyIntent === 'heal' ? SAGE : RED;
      this.text(s.enemyIntent === 'heal' ? 'MEND' : s.enemyIntent === 'threat' ? 'OMEN' : '!', 1220, s.wave === 0 ? 250 : 290, 38, color, 'center', 'bold'); c.restore();
    }
  }

  drawFamiliar(engine: GameEngine): void {
    const s = engine.state, c = this.ctx;
    const exit = this.latest(['familiar_exit'], .45);
    if (!engine.familiarActive && !exit) return;
    const attack = this.latest(['familiar_attack'], .45), gulp = this.latest(['familiar_gulp', 'familiar_grow', 'summon'], .6);
    const appear = this.latest(['summon'], .5);
    const row = s.familiarLevel - 1, pose = attack ? 1 : gulp ? 2 : 0;
    let x = 550 + (attack ? Math.sin(attack.age / .45 * Math.PI) * 110 : 0), scale = 1;
    if (appear) scale = Math.min(1, appear.age / .28);
    if (exit) scale = Math.max(0, 1 - exit.age / .45);
    this.shadow(x, 746, 55 * scale, .12);
    c.save(); c.translate(x, 745); c.scale(scale, scale);
    this.assets.familiar.draw(c, row * 3 + pose, 0, 0, 175 + row * 28); c.restore();
    if (gulp) this.paperSpecks(x, 590, gulp.age, '#b76a43', 5);
    this.paperStrip(465, 771, 166, 34, .95);
    this.text(`FAMILIAR ${s.familiarLevel}`, 548, 788, 15, '#51462f', 'center');
    if (engine.familiarActive) {
      c.fillStyle = 'rgba(71,62,40,.17)'; c.fillRect(507, 807, 82, 4);
      c.fillStyle = '#86916d'; c.fillRect(507, 807, 82 * Math.min(1, (s.familiarUntil - s.time) / 12), 4);
    }
  }

  drawAttackEffects(_s: GameState): void {
    const c = this.ctx;
    const attack = this.latest(['player_attack'], .32);
    if (attack) {
      const fade = 1 - attack.age / .32; c.save(); c.globalAlpha = fade;
      const startX=518+Math.sin(Math.min(1,attack.age/.44)*Math.PI)*26, startY=489;
      const spread=attack.roll?.critical?19:12;
      c.beginPath();c.moveTo(startX,startY);c.lineTo(708,468-spread);c.lineTo(690,479);c.lineTo(926,461);c.lineTo(905,475);c.lineTo(1144,475);c.lineTo(906,490);c.lineTo(925,498);c.lineTo(700,487+spread);c.closePath();
      c.fillStyle=this.paper||'#ead5ac';c.fill();c.fillStyle='rgba(179,73,39,.68)';c.fill();
      c.beginPath();c.moveTo(startX+20,startY);c.lineTo(865,474);c.lineTo(842,481);c.lineTo(1144,475);c.lineTo(855,487);c.closePath();c.fillStyle='#f6dfb2';c.fill();
      this.paperSpecks(1144,475,attack.age,'#af5134',attack.roll?.critical?24:16);c.restore();
    }
    const miss=this.latest(['player_miss'],.35);if(miss)this.paperSpecks(526,490,miss.age,'#b77548',9);
    const enemyAttack = this.latest(['enemy_attack'], .3);
    if (enemyAttack) {
      c.save(); c.globalAlpha = Math.max(0, .7 - enemyAttack.age * 2.2);
      c.strokeStyle = '#4b4337'; c.lineWidth = 6; c.beginPath(); c.moveTo(1120, 430); c.quadraticCurveTo(700, 345, 390, 521); c.stroke();
      c.lineWidth = 2; c.strokeStyle = '#f4e0b8'; c.stroke(); c.restore();
    }
    const familiar = this.latest(['familiar_attack'], .3);
    if (familiar) { c.save(); c.globalAlpha = 1 - familiar.age / .3; c.strokeStyle = '#eee1bc'; c.lineWidth = 5; c.beginPath(); c.moveTo(620, 625); c.lineTo(1140, 520); c.stroke(); c.restore(); }
  }

  paperSpecks(x: number, y: number, age: number, color: string, count: number): void {
    if (this.reducedMotion) return;
    const c = this.ctx;
    for (let i = 0; i < count; i++) {
      const angle = i * 2.39996, speed = 80 + (i * 39 % 170), life = Math.max(0, 1 - age / .65);
      c.save(); c.globalAlpha *= life; c.translate(x + Math.cos(angle) * speed * age, y + Math.sin(angle) * speed * age + age * age * 100); c.rotate(angle + age * (i % 2 ? 3 : -3));
      c.fillStyle = i % 3 === 0 ? '#e2c995' : color; c.beginPath(); c.moveTo(-4, -3); c.lineTo(7, -2); c.lineTo(1, 5); c.closePath(); c.fill(); c.restore();
    }
  }
  boneFragments(atlas: Atlas, x: number, y: number, age: number): void {
    if (age < .18) return;
    const c = this.ctx, f = atlas.frames[5], t = age - .18;
    for (let i = 0; i < 12; i++) {
      const col = i % 4, row = Math.floor(i / 4), sw = f.w / 4, sh = f.h / 3;
      c.save(); c.globalAlpha = Math.max(0, 1 - t / .85);
      c.translate(x + Math.cos(i * 2.4) * t * 170, y - Math.sin(i * .7 + .5) * t * 140 + t * t * 120);
      c.rotate(t * (i % 2 ? 2 : -2));
      c.drawImage(atlas.image, f.x + col * sw, f.y + row * sh, sw, sh, -sw * .25, -sh * .25, sw * .5, sh * .5); c.restore();
    }
  }

  drawDice(s: GameState): void {
    const c = this.ctx, rolling = this.latest(['player_roll'], .24), attack = this.latest(['player_attack', 'player_miss'], 1.8);
    const p = rolling ? rolling.age / .24 : 1;
    const tumble = rolling && !this.reducedMotion ? (1 - p) : 0;
    const ax = .42 + tumble * 7, ay = .82 + tumble * 10, az = -.08 + tumble * 3;
    // Regular tetrahedron resting on its equilateral base (edge length 2.4).
    const vertices: Point3[] = [{ x:0,y:-1.469694,z:0 },{x:0,y:.489898,z:1.385641},{x:-1.2,y:.489898,z:-.692820},{x:1.2,y:.489898,z:-.692820}];
    const rotate = (p: Point3): Point3 => {
      const x1 = p.x, y1 = p.y * Math.cos(ax) - p.z * Math.sin(ax), z1 = p.y * Math.sin(ax) + p.z * Math.cos(ax);
      const x2 = x1 * Math.cos(ay) + z1 * Math.sin(ay), z2 = -x1 * Math.sin(ay) + z1 * Math.cos(ay);
      return { x: x2 * Math.cos(az) - y1 * Math.sin(az), y: x2 * Math.sin(az) + y1 * Math.cos(az), z: z2 };
    };
    const transformed = vertices.map(rotate);
    const rise = Math.sin(p * Math.PI) * (rolling ? 52 : 0), centerX = 768, centerY = 700 - rise;
    const project = (p: Point3) => ({ x: centerX + p.x * 300 / (4.4 + p.z), y: centerY + p.y * 300 / (4.4 + p.z) });
    const faces = [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]].map((indices, number) => {
      const [a, b, d] = indices.map(i => transformed[i]);
      return { points: [a, b, d].map(project), z: (a.z + b.z + d.z) / 3, number };
    }).sort((a, b) => b.z - a.z);
    this.shadow(768, 767, rolling ? 81 - rise * .3 : 86, .18);
    const raw = s.lastRoll?.raw ?? 1;
    for (let i = 0; i < faces.length; i++) {
      const f = faces[i], a = f.points[0], b = f.points[1], d = f.points[2];
      c.save(); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(d.x, d.y); c.closePath();
      c.fillStyle = this.paper || '#e1cc9f'; c.fill();
      c.fillStyle = i === 3 ? 'rgba(250,225,168,.05)' : i === 2 ? 'rgba(112,75,39,.44)' : 'rgba(83,51,30,.62)'; c.fill();
      c.strokeStyle = '#776044'; c.lineWidth = 2; c.stroke();
      {
        const cx = (a.x + b.x + d.x) / 3, cy = (a.y + b.y + d.y) / 3;
        const area = Math.abs((b.x - a.x) * (d.y - a.y) - (b.y - a.y) * (d.x - a.x));
        const font = Math.min(55, Math.sqrt(area) * .48) * (i===3?1:.48);
        c.fillStyle = i===3?'#332719':'#aa916e'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `${i===3?'bold':'italic'} ${font}px Georgia`;
        c.translate(cx, cy); c.rotate(-.08 + tumble * 2);
        c.fillText(String(i === 3 ? raw : ((raw+2-i)%4)+1), 0, 0);
      }
      c.restore();
    }
    if (attack && s.lastRoll) {
      const r = s.lastRoll;
      this.paperStrip(647, 774, 242, 38, .95);
      this.text(r.bonus ? `${r.raw} + ${r.bonus} = ${r.total}  ·  ${r.hit ? 'HIT' : 'MISS'}` : `${r.raw} ROLLED  ·  ${r.hit ? 'HIT' : 'MISS'}`, 768, 793, 17, r.hit ? INK : RED, 'center');
    } else this.text('D4  ·  3+ TO HIT', 768, 791, 16, '#736044', 'center');
  }

  drawFeedback(s: GameState): void {
    const c = this.ctx;
    if(s.upgradeMode)return;
    const judgement = this.latest(['judgement'], .65);
    if (judgement && s.phase === 'battle') {
      const quality = judgement.quality!;
      const label = quality === 'hazard' ? 'DANGER' : quality.toUpperCase();
      c.save(); c.globalAlpha = Math.min(1, (1 - judgement.age / .65) * 2);
      this.text(label, 768, 284 - judgement.age * 15, quality === 'perfect' ? 37 : 30,
        quality === 'perfect' ? '#855318' : quality === 'good' ? '#455238' : RED, 'center', 'bold'); c.restore();
    }
    const feedback = this.latest(['player_attack', 'player_miss', 'no_heal', 'heal', 'blocked', 'speed', 'summon', 'familiar_grow', 'upgrade'], .9);
    if (feedback && s.phase === 'battle') {
      const map: Record<string, string> = {
        player_attack: feedback.roll?.critical ? 'CRITICAL!' : 'HIT', player_miss: 'ROLL MISSED', no_heal: 'NO HEAL',
        heal: `MEND +${(feedback.amount || 0) / 2}`, blocked: 'BLOCK', speed: feedback.amount! > 0 ? 'QUICKEN' : 'STEADY',
        summon: 'FAMILIAR AWAKENED', familiar_grow: `FAMILIAR LEVEL ${feedback.amount}`, upgrade: 'A NEW FOLD',
      };
      c.save(); c.globalAlpha = Math.min(1, (1 - feedback.age / .9) * 2);
      this.text(map[feedback.type] || '', 768, 332, feedback.roll?.critical ? 31 : 24, feedback.type === 'player_miss' ? RED : '#493b2c', 'center'); c.restore();
    }
  }
}
