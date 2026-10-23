import './style.css';
import { GameEngine, seededRandom } from './engine.ts';
import type { GameEvent } from './engine.ts';
import { LABELS } from './config.ts';
import { loadAssets } from './assets.ts';
import { Renderer } from './renderer.ts';
import { PaperAudio } from './audio.ts';

const stage = document.querySelector<HTMLCanvasElement>('#stage')!;
const overlay = document.querySelector<HTMLElement>('#overlay')!;
const controls = document.querySelector<HTMLElement>('#hud-controls')!;
const rotateOverlay = document.querySelector<HTMLElement>('#rotation')!;
const pauseButton = document.querySelector<HTMLButtonElement>('#pause')!;
const muteButton = document.querySelector<HTMLButtonElement>('#mute')!;
const accessible = document.querySelector<HTMLElement>('#accessible-status')!;
const audio = new PaperAudio();
const seedFromUrl = Number(new URLSearchParams(location.search).get('seed'));
const baseSeed = Number.isFinite(seedFromUrl) && new URLSearchParams(location.search).has('seed') ? seedFromUrl : crypto.getRandomValues(new Uint32Array(1))[0];
let run = 0;
let engine = new GameEngine(seededRandom(baseSeed));
let renderer: Renderer | null = null;
let lastFrame = performance.now();
let overlayKey = '';
let hasAssets = false;
let bestScore = 0;
let tutorial = true;
let frameCount = 0, sampleStart = performance.now(), averageFps = 0;
let worstFrame = 0;
const recentEvents: GameEvent[] = [];
try { bestScore = Number(localStorage.getItem('paper-duel-best')) || 0; tutorial = localStorage.getItem('paper-duel-tutorial') !== 'done'; } catch { /* storage is optional */ }

function artButton(action: string, label: string, kind = '', aria = label): string {
  return `<button type="button" class="art-button ${kind}" data-action="${action}" aria-label="${aria}"><span>${label}</span></button>`;
}
function updateMute(): void {
  muteButton.setAttribute('aria-pressed', String(audio.settings.muted));
  muteButton.setAttribute('aria-label', audio.settings.muted ? 'Unmute sound' : 'Mute sound');
  muteButton.innerHTML = audio.settings.muted ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4zM17 8q5 4 0 8M19 4q8 8 0 16"/></svg>';
}
function syncInputClock(): void {
  const now = performance.now(); engine.step(Math.min(.10, (now - lastFrame) / 1000)); lastFrame = now;
}
function flushEvents(): void {
  const events = engine.drainEvents();
  for (const event of events) {
    renderer?.handle(event); audio.handle(event); recentEvents.push({ ...event });
    if (recentEvents.length > 300) recentEvents.shift();
    if (event.type === 'judgement' && ['good', 'perfect'].includes(event.quality || '') && tutorial) {
      tutorial = false; try { localStorage.setItem('paper-duel-tutorial', 'done'); } catch { /* storage */ }
    }
    if (event.type === 'judgement') accessible.textContent = `${event.quality?.toUpperCase()}. ${event.kind ? LABELS[event.kind] : 'No action'}.`;
    if (event.type === 'player_attack') accessible.textContent = `${event.roll?.critical ? 'Critical hit' : 'Hit'}. ${event.amount! / 2} heart damage.`;
    if (event.type === 'player_miss') accessible.textContent = `Rolled ${event.roll?.raw}. Attack missed.`;
    if (event.type === 'lost' || event.type === 'won' || event.type === 'wave_clear') saveBest();
  }
}
function saveBest(): void {
  if (engine.state.score > bestScore) { bestScore = engine.state.score; try { localStorage.setItem('paper-duel-best', String(bestScore)); } catch { /* storage */ } }
}
function tap(): void {
  if (!hasAssets || rotateOverlay.hidden === false) return;
  syncInputClock(); engine.tap(); flushEvents(); renderOverlay();
}
function portrait(): boolean { return matchMedia('(orientation: portrait)').matches && innerWidth < 850; }
function resize(): void {
  renderer?.resize(); const rotated = portrait(); rotateOverlay.hidden = !rotated;
  if (rotated && engine.state.phase === 'battle' && !engine.state.paused) { engine.pause('portrait'); flushEvents(); }
  lastFrame = performance.now(); renderOverlay();
}
function showPause(): void {
  if (!hasAssets) return;
  if (engine.state.paused) { if (!portrait()) { void audio.start(); engine.resume(); } }
  else { syncInputClock(); engine.pause(); }
  flushEvents(); overlayKey = ''; renderOverlay();
}

function renderOverlay(): void {
  if (!hasAssets) return;
  const s = engine.state;
  const endedReady = (renderer?.endAge ?? 0) > .75;
  const key = `${s.phase}|${s.paused}|${endedReady}|${audio.failed}`;
  if (key === overlayKey) return; overlayKey = key;
  controls.hidden = s.phase !== 'battle' || s.paused;
  if (s.paused) {
    overlay.innerHTML = `<div class="panel paused"><h1>PAUSED</h1>${artButton('resume','RESUME')}
      <div class="text-row"><button class="text-control" data-action="restart">Restart run</button><button class="text-control" data-action="tutorial">Show timing guide</button></div>
      <div class="sound-settings"><label for="music">Music</label><input id="music" aria-label="Music volume" type="range" min="0" max="100" value="${Math.round(audio.settings.music * 100)}" />
      <label for="effects">Effects</label><input id="effects" aria-label="Effects volume" type="range" min="0" max="100" value="${Math.round(audio.settings.effects * 100)}" /></div>
      ${audio.failed ? '<button class="text-control" data-action="audio">Retry audio</button>' : ''}
      <details><summary>How the folds work</summary><div class="help-content"><p><b>Tap or Space</b> stops the marker. Yellow adds +2 to your D4 roll. You need 3+ to hit; a natural 4 is critical.</p><p>Sword: attack · Shield: block · Heart: heal.</p><p>Right arrows speed up; left arrows slow down. Avoid red skulls.</p><p>Choose upgrades on the same track. Awaken the familiar to add its tile to your deck.</p></div></details></div>`;
  } else if (s.phase === 'ready') {
    overlay.innerHTML = `<div class="panel ready"><p class="chapter">A HANDCRAFTED TIMING BATTLE</p><h1>PAPER DICE DUEL</h1><p class="rules">Tap or Space to stop the marker.<br>Yellow adds +2. Roll 3+ to hit.</p>${artButton('start','BEGIN','', 'Begin the three-chapter run')}<p class="subtle">Three opponents. One little wayfarer.</p></div>`;
  } else if (s.phase === 'intermission' && endedReady) {
    overlay.innerHTML = `<div class="panel"><p class="chapter">CHAPTER ${['I','II','III'][s.wave]} CLOSED</p><h1>WELL FOUGHT</h1><p class="score">${s.score.toLocaleString('en-US')} POINTS · ${s.bestCombo} BEST COMBO</p>${artButton('next','NEXT CHAPTER','next')}<p class="subtle">Your health and folds carry forward.</p></div>`;
  } else if (s.phase === 'won' && endedReady) {
    overlay.innerHTML = `<div class="panel"><p class="chapter">THREE CHAPTERS · ONE VICTORY</p><h1>VICTORY</h1><p class="score">${s.score.toLocaleString('en-US')} POINTS · ${s.bestCombo} BEST COMBO</p>${artButton('restart','PLAY AGAIN','restart')}<p class="subtle">BEST ${bestScore.toLocaleString('en-US')}</p></div>`;
  } else if (s.phase === 'lost' && endedReady) {
    overlay.innerHTML = `<div class="panel"><p class="chapter">CHAPTER ${['I','II','III'][s.wave]}</p><h1>DEFEAT</h1><p class="score">${s.score.toLocaleString('en-US')} POINTS · ${s.bestCombo} BEST COMBO</p>${artButton('restart','TRY AGAIN','restart')}<p class="subtle">BEST ${bestScore.toLocaleString('en-US')}</p></div>`;
  } else overlay.innerHTML = '';
}

stage.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0) return;
  event.preventDefault(); stage.focus({ preventScroll: true }); tap();
});
document.addEventListener('keydown', event => {
  if ((event.target as HTMLElement).closest('input,button,summary,details,a')) return;
  if (event.code === 'Space' && !event.repeat) { event.preventDefault(); tap(); }
  if ((event.code === 'Escape' || event.code === 'KeyP') && !event.repeat) { event.preventDefault(); showPause(); }
});
pauseButton.addEventListener('click', showPause);
muteButton.addEventListener('click', () => { audio.settings.muted = !audio.settings.muted; audio.apply(); updateMute(); });
overlay.addEventListener('click', event => {
  const action = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]')?.dataset.action;
  if (!action) return;
  if (action === 'start') { void audio.start(); engine.start(); }
  if (action === 'restart') {
    saveBest(); audio.reset(); void audio.start(); engine = new GameEngine(seededRandom(baseSeed + ++run));
    engine.start(); recentEvents.length = 0;
  }
  if (action === 'resume' && !portrait()) { void audio.start(); engine.resume(); }
  if (action === 'next') { engine.nextWave(); void audio.start(); }
  if (action === 'tutorial') { tutorial = true; if (!portrait()) { void audio.start(); engine.resume(); } }
  if (action === 'audio') void audio.start().then(() => { overlayKey = ''; renderOverlay(); });
  if (action === 'retry') { void boot(); return; }
  lastFrame = performance.now(); flushEvents(); overlayKey = ''; renderOverlay();
  if (action !== 'audio') stage.focus({ preventScroll: true });
});
overlay.addEventListener('input', event => {
  const input = event.target as HTMLInputElement;
  if (input.id === 'music') audio.settings.music = Number(input.value) / 100;
  if (input.id === 'effects') audio.settings.effects = Number(input.value) / 100;
  audio.apply();
});
window.addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && engine.state.phase === 'battle') { engine.pause('hidden'); flushEvents(); renderOverlay(); }
  lastFrame = performance.now();
});

function frame(now: number): void {
  const elapsed = Math.max(0, (now - lastFrame) / 1000);
  const dt = Math.min(.1, elapsed); lastFrame = now;
  if (hasAssets && renderer) {
    engine.step(dt); flushEvents(); renderer.update(dt, engine.state.paused); renderer.draw(engine, bestScore, tutorial); renderOverlay();
  }
  if (!document.hidden) { frameCount++; worstFrame = Math.max(worstFrame, elapsed * 1000); }
  if (now - sampleStart > 2000) { averageFps = frameCount * 1000 / (now - sampleStart); frameCount = 0; sampleStart = now; }
  requestAnimationFrame(frame);
}

async function boot(): Promise<void> {
  hasAssets = false; controls.hidden = true;
  overlay.innerHTML = '<div class="panel"><h1>Unfolding the stage</h1><p>Preparing paper, a little courage, and a die.</p><div class="progress"><i style="width:0%"></i></div></div>';
  try {
    const assets = await loadAssets(progress => { const bar = overlay.querySelector<HTMLElement>('.progress i'); if (bar) bar.style.width = `${Math.round(progress * 100)}%`; }, true);
    renderer = new Renderer(stage, assets);
    const root = document.documentElement;
    root.style.setProperty('--play-img', `url("${assets.icons.dataUrl(10)}")`);
    root.style.setProperty('--next-img', `url("${assets.icons.dataUrl(11)}")`);
    root.style.setProperty('--restart-img', `url("${assets.icons.dataUrl(12)}")`);
    root.style.setProperty('--pause-img', `url("${assets.icons.dataUrl(13)}")`);
    root.style.setProperty('--panel-img', `url("${assets.icons.dataUrl(14)}")`);
    hasAssets = true; overlayKey = ''; lastFrame = performance.now(); updateMute(); resize(); renderOverlay();
  } catch (error) {
    overlay.innerHTML = `<div class="panel"><h1>A fold came loose</h1><p class="error">${error instanceof Error ? error.message : 'Assets could not load.'}</p><button class="text-control" data-action="retry">Retry loading</button></div>`;
  }
}

// Read-only observability for input-driven acceptance tests and performance checks.
Object.defineProperty(window, '__paperDuel', { value: Object.freeze({
  state: () => structuredClone(engine.state), events: () => structuredClone(recentEvents),
  info: () => ({ loaded: hasAssets, speed: engine.speed, seed: baseSeed, fps: averageFps, worstFrameMs: worstFrame,
    audioState: audio.context?.state ?? 'not-started', audioRms: audio.rms, activeAudioVoices: audio.voices.size,
    sound: { ...audio.settings }, atlasFrames: renderer ? { hero: renderer.assets.hero.frames.length, skeleton: renderer.assets.skeleton.frames.length, familiar: renderer.assets.familiar.frames.length } : null }),
}), writable: false });
requestAnimationFrame(frame); void boot();
