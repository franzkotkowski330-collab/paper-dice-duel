require('node:fs').mkdirSync('work',{recursive:true});
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const url=process.env.DUEL_URL||'http://127.0.0.1:5318/';
const report={url,checks:[],runs:[],errors:[]};let browser;
function check(name){report.checks.push(name);console.log('PASS',name)}
async function setup(mobile=false,seed=42){
 const context=await browser.newContext(mobile?{viewport:{width:844,height:390},deviceScaleFactor:2,isMobile:true,hasTouch:true}:{viewport:{width:1536,height:864}});
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
 await page.goto(url+'?seed='+seed);await page.waitForFunction(()=>window.__paperDuel?.info().loaded);await page.waitForTimeout(300);
 await page.clock.install({time:new Date('2026-10-23T12:00:00Z')});await page.clock.pauseAt(new Date('2026-10-23T12:00:01Z'));
 await page.getByRole('button',{name:'Begin the three-chapter run'}).click();
 const state=()=>page.evaluate(()=>window.__paperDuel.state());const advance=ms=>page.clock.runFor(Math.ceil(ms));
 let count=0;
 async function act(kind,quality='perfect',input=mobile?'touch':'mouse'){
  let s=await state();if(s.locked)await advance(370);s=await state();assert.equal(s.phase,'battle');assert.equal(s.paused,false);
  const tile=s.tiles.find(t=>t.kind===kind);assert.ok(tile,'Available action '+kind);const speed=await page.evaluate(()=>window.__paperDuel.info().speed);
  const target=tile.center+(quality==='good'?.065:0);await advance(((target-s.marker+1)%1)*1800/speed);
  if(input==='key')await page.keyboard.press('Space');else if(input==='touch')await page.touchscreen.tap(410,220);else await page.mouse.click(768,450);
  s=await state();assert.equal(s.lastAction,kind);assert.equal(s.lastQuality,kind==='hazard'?'hazard':quality);count++;
  await advance(240);return s;
 }
 return{page,context,state,advance,act,count:()=>count};
}
async function choose(h){const s=await h.state(),k=s.tiles.map(t=>t.kind);
 if(s.upgradeMode)return k.includes('upgrade_summon')?'upgrade_summon':s.hp<4&&k.includes('upgrade_health')?'upgrade_health':k.includes('upgrade_attack')?'upgrade_attack':k[0];
 if(k.includes('heal')&&s.hp<s.maxHp)return'heal';
 if(k.includes('summon')&&s.familiarUntil-s.time<4)return'summon';
 if(k.includes('attack'))return'attack';
 return k.find(x=>x==='guard')||k.find(x=>x!=='hazard');
}
(async()=>{browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),headless:true});
 for(const mobile of [false,true]){
  const h=await setup(mobile);const{page,advance,state,act}=h;const name=mobile?'mobile':'desktop';
  // Opening builds the deck by actual timing inputs; no state mutations or win shortcuts.
  await act('guard');await advance(370);await act((await state()).tiles.find(t=>t.kind!=='attack').kind,'perfect',mobile?'touch':'key');await advance(370);await act('upgrade_summon');
  for(let i=0;i<100;i++){
   let s=await state();if(s.phase==='won')break;if(s.phase==='lost')throw Error(name+' autoplay died');
   if(s.phase==='intermission'){await advance(1000);await page.screenshot({path:`work/${name}-wave-${s.wave+1}-clear.png`});await page.getByRole('button',{name:'NEXT CHAPTER',exact:true}).click();continue;}
   if(s.locked)await advance(370);s=await state();if(s.phase!=='battle')continue;
   const kind=await choose(h);await act(kind,'perfect',mobile?'touch':i%2?'key':'mouse');
   if(kind==='summon')await page.screenshot({path:`work/${name}-summon.png`});
   if(s.wave>0&&i%4===0)await page.screenshot({path:`work/${name}-wave-${s.wave+1}.png`});
  }
  const s=await state();assert.equal(s.phase,'won');await advance(1200);await page.screenshot({path:`work/${name}-victory.png`});
  report.runs.push({name,actions:h.count(),state:s,info:await page.evaluate(()=>window.__paperDuel.info())});check(name+' three chapters won with real '+(mobile?'touch':'mouse and Space')+' input');
  await page.getByRole('button',{name:'PLAY AGAIN',exact:true}).click();s2=await state();assert.equal(s2.wave,0);assert.equal(s2.hp,6);assert.equal(s2.level,1);assert.equal(s2.familiarCount,0);check(name+' victory replay resets growth, health and enemy');
  await page.getByRole('button',{name:'Pause game'}).click();const frozen=await state();await advance(2400);assert.deepEqual(await state(),frozen);check(name+' pause freezes every rule timer');
  await page.getByRole('slider',{name:'Music volume'}).fill('21');await page.getByRole('slider',{name:'Effects volume'}).fill('48');
  await page.getByRole('button',{name:'RESUME',exact:true}).click();await advance(100);
  if(mobile){await page.setViewportSize({width:390,height:844});await advance(100);assert.equal((await state()).paused,true);await page.screenshot({path:'work/mobile-portrait.png'});const t=(await state()).time;await advance(2000);assert.equal((await state()).time,t);await page.setViewportSize({width:844,height:390});await advance(100);assert.equal((await state()).paused,true);await page.getByRole('button',{name:'RESUME',exact:true}).click();check('portrait automatically pauses; landscape requires explicit resume');}
  // Long press and repeated keydown must not repeat, even after the input lock ends.
  await page.keyboard.down('Space');const before=(await state()).lastActionAt;await advance(600);await page.keyboard.down('Space');await advance(50);assert.equal((await state()).lastActionAt,before);await page.keyboard.up('Space');check(name+' held Space suppresses repeated actions');
  await page.getByRole('button',{name:'Pause game'}).click();await page.getByRole('button',{name:'Restart run',exact:true}).click();
  for(let i=0;i<20&&(await state()).phase==='battle';i++)await advance(3400);
  assert.equal((await state()).phase,'lost');await advance(1100);await page.screenshot({path:`work/${name}-defeat.png`});await page.getByRole('button',{name:'TRY AGAIN',exact:true}).click();assert.equal((await state()).hp,6);check(name+' defeat and retry follow normal inputs');
  await page.reload();await page.waitForFunction(()=>window.__paperDuel?.info().loaded);assert.equal((await state()).phase,'ready');const info=await page.evaluate(()=>window.__paperDuel.info());assert.equal(info.sound.music,.21);assert.equal(info.sound.effects,.48);assert.ok(await page.evaluate(()=>Number(localStorage.getItem('paper-duel-best'))>0));assert.equal(await page.evaluate(()=>localStorage.getItem('paper-duel-tutorial')),'done');check(name+' preferences, best score and tutorial persist; run does not');
  await h.context.close();
 }
 // Opposite attack outcome and blank miss are input-driven, with seed fixing only randomness.
 const h=await setup(false,7);await h.act('attack','good');let s=await h.state();assert.equal(s.enemyHp,6);assert.equal(s.combo,1);await h.page.screenshot({path:'work/green-roll-miss.png'});check('GOOD with low natural D4 misses while retaining timing combo');
 await h.advance(370);await h.page.mouse.click(768,450);s=await h.state();assert.equal(s.lastQuality,'miss');assert.equal(s.combo,0);await h.advance(120);await h.page.screenshot({path:'work/blank-miss.png'});check('blank miss does not damage health and breaks combo');
 await h.context.close();assert.equal(report.errors.length,0);check('no browser page errors');
})().catch(e=>{report.failure=String(e.stack||e);console.error(e);process.exitCode=1}).finally(async()=>{fs.writeFileSync('work/acceptance-report.json',JSON.stringify(report,null,2));await browser?.close()});
