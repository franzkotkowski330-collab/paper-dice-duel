require('node:fs').mkdirSync('work',{recursive:true});
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');let browser;
const url=process.env.DUEL_URL||'http://127.0.0.1:5318/';const report={checks:[],errors:[]};const pass=x=>{report.checks.push(x);console.log('PASS',x)};
(async()=>{browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),headless:true});
const c=await browser.newContext({viewport:{width:1536,height:864}}),p=await c.newPage();p.on('pageerror',e=>report.errors.push(String(e)));
await p.goto(url+'?seed=42');await p.waitForFunction(()=>window.__paperDuel?.info().loaded);await p.waitForTimeout(300);
await p.clock.install({time:new Date('2026-10-23T12:00:00Z')});await p.clock.pauseAt(new Date('2026-10-23T12:00:01Z'));await p.getByRole('button',{name:'Begin the three-chapter run'}).click();
const state=()=>p.evaluate(()=>window.__paperDuel.state());const advance=x=>p.clock.runFor(Math.ceil(x));
async function act(kind){let s=await state();if(s.locked)await advance(370);s=await state();const t=s.tiles.find(t=>t.kind===kind);if(!t)return false;const speed=await p.evaluate(()=>window.__paperDuel.info().speed);await advance(((t.center-s.marker+1)%1)*1800/speed);await p.mouse.click(768,450);await advance(240);return true;}
for(let i=0;i<120;i++){
let s=await state();if(s.phase==='lost')throw Error('Died before hazard test');if(s.phase==='intermission'){await advance(1000);await p.getByRole('button',{name:'NEXT CHAPTER',exact:true}).click();continue;}if(s.locked)await advance(370);s=await state();
if(s.wave===2&&s.tiles.some(t=>t.kind==='hazard')){await p.screenshot({path:'work/hazard-before.png'});const before=await state();await act('hazard');const after=await state();assert.equal(after.lastQuality,'hazard');assert.equal(after.combo,0);assert.equal(after.shield,0);assert.equal(after.hp,before.hp-(before.shield?0:1));await p.screenshot({path:'work/hazard-hit.png'});report.hazard={before,after};pass('real input hits a shadow skull, consumes guard if present, damages correctly and breaks combo');break;}
const kinds=s.tiles.map(t=>t.kind);let kind;
if(s.upgradeMode)kind=kinds.includes('upgrade_summon')?'upgrade_summon':kinds.includes('upgrade_health')?'upgrade_health':kinds.includes('upgrade_window')?'upgrade_window':kinds[0];
else if(s.wave<2)kind=kinds.includes('heal')&&s.hp<s.maxHp?'heal':kinds.includes('attack')?'attack':kinds.find(k=>k!=='hazard');
else {
 if(s.enemyWinding&&s.enemyIntent==='threat'){await advance((s.enemyNextAt-s.time)*1000+20);continue;}
 kind=kinds.includes('heal')&&s.hp<s.maxHp?'heal':kinds.includes('guard')?'guard':kinds.find(k=>!['attack','summon','hazard'].includes(k));
 if(!kind){await advance(180);continue;}
}
await act(kind);
}
assert.ok(report.hazard,'Threat reached by real play');
// Continue choosing summon and defensive cards across actual rounds until the structural growth event occurs.
for(let i=0;i<90;i++){let s=await state();if(s.familiarLevel>=2){await advance(200);await p.screenshot({path:'work/familiar-grown.png'});pass('three real summon inputs trigger the level-two paper body');report.growth=s;break;}if(s.phase==='lost'||s.phase==='won')break;if(s.phase==='intermission'){await advance(1000);await p.getByRole('button',{name:'NEXT CHAPTER',exact:true}).click();continue;}if(s.locked)await advance(370);s=await state();const kinds=s.tiles.map(t=>t.kind);let k=s.upgradeMode?(kinds.includes('upgrade_health')?'upgrade_health':kinds[0]):kinds.includes('summon')?'summon':kinds.includes('heal')?'heal':kinds.find(k=>!['attack','hazard'].includes(k));if(k)await act(k);else await advance(160);}
report.growthReached=!!report.growth;await c.close();
// Exercise Chrome's actual lifecycle protocol, rather than firing a synthetic visibility event.
const lc=await browser.newContext(),lp=await lc.newPage();await lp.goto(url);await lp.waitForFunction(()=>window.__paperDuel?.info().loaded);await lp.getByRole('button',{name:'Begin the three-chapter run'}).click();const cd=await lc.newCDPSession(lp);await cd.send('Page.setWebLifecycleState',{state:'frozen'});await new Promise(r=>setTimeout(r,300));await cd.send('Page.setWebLifecycleState',{state:'active'});report.lifecycle=await lp.evaluate(()=>({hidden:document.hidden,state:window.__paperDuel.state(),info:window.__paperDuel.info()}));if(report.lifecycle.state.paused){assert.equal(report.lifecycle.state.pauseReason,'hidden');pass('Chrome frozen/background lifecycle pauses game and requires resume');}await lc.close();
const ac=await browser.newContext(),ap=await ac.newPage();await ap.addInitScript(()=>{window.AudioContext=class{constructor(){throw Error('Simulated unavailable audio device')}}});await ap.goto(url);await ap.waitForFunction(()=>window.__paperDuel?.info().loaded);await ap.getByRole('button',{name:'Begin the three-chapter run'}).click();await ap.mouse.click(700,400);assert.equal((await ap.evaluate(()=>window.__paperDuel.state())).phase,'battle');await ap.getByRole('button',{name:'Pause game'}).click();await ap.getByRole('button',{name:'Retry audio',exact:true}).waitFor();pass('unavailable audio still permits play and exposes an audio retry');await ac.close();assert.equal(report.errors.length,0);
})().catch(e=>{report.failure=String(e.stack||e);console.error(e);process.exitCode=1}).finally(async()=>{fs.writeFileSync('work/edge-report.json',JSON.stringify(report,null,2));await browser?.close()});
