require('node:fs').mkdirSync('work',{recursive:true});
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');let browser;
const report={checks:[],audio:[],network:[],errors:[]},url=process.env.DUEL_URL||'http://127.0.0.1:5318/';
const pass=s=>{report.checks.push(s);console.log('PASS',s)};
(async()=>{browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),headless:true});
 const context=await browser.newContext({viewport:{width:1536,height:864}});const page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(String(e)));page.on('request',r=>report.network.push(r.url()));
 await page.addInitScript(()=>{
  const Original=window.AudioContext,connect=AudioNode.prototype.connect;
  window.AudioContext=class extends Original{constructor(...args){super(...args);window.__soundContext=this;window.__capture=this.createMediaStreamDestination();const rec=window.__recorder=new MediaRecorder(window.__capture.stream,{mimeType:'audio/webm;codecs=opus'});window.__chunks=[];rec.ondataavailable=e=>{if(e.data.size)window.__chunks.push(e.data)};rec.start(200)}};
  AudioNode.prototype.connect=function(...args){if(args[0]===window.__soundContext?.destination)connect.call(this,window.__capture);return connect.apply(this,args)};
 });
 await page.goto(url);await page.waitForFunction(()=>window.__paperDuel?.info().loaded);assert.equal(await page.evaluate(()=>window.__paperDuel.info().audioState),'not-started');
 await page.getByRole('button',{name:'Begin the three-chapter run'}).click();await page.waitForFunction(()=>window.__paperDuel.info().audioState==='running');
 for(let i=0;i<24;i++){await page.waitForTimeout(500);report.audio.push(await page.evaluate(()=>window.__paperDuel.info()));}
 assert.ok(report.audio.some(x=>x.audioRms>.002));pass('first interaction unlocks real Web Audio with nonzero output across music loop');
 await page.getByRole('button',{name:'Pause game'}).click();await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.__paperDuel.info().audioState),'suspended');assert.equal(await page.evaluate(()=>window.__paperDuel.info().activeAudioVoices),0);pass('pause suspends audio and stops all scheduled voices');
 await page.getByRole('button',{name:'RESUME',exact:true}).click();await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>window.__paperDuel.info().audioState),'running');pass('resume restarts the music scheduler');
 await page.getByRole('button',{name:'Mute sound'}).click();await page.waitForTimeout(400);let muted=await page.evaluate(()=>window.__paperDuel.info());assert.ok(muted.audioRms<.001);pass('mute silences measured output');
 await page.getByRole('button',{name:'Unmute sound'}).click();
 // A second real browser tab checks visibility-driven pausing, without dispatching synthetic visibility events.
 const other=await context.newPage();await other.goto('about:blank');await other.bringToFront();await page.waitForTimeout(200);
 report.visibility={hidden:await page.evaluate(()=>document.hidden),state:await page.evaluate(()=>window.__paperDuel.state())};
 if(report.visibility.hidden){assert.equal(report.visibility.state.paused,true);assert.equal(report.visibility.state.pauseReason,'hidden');pass('real background tab automatically pauses the game');}else report.visibility.note='Headless Chrome did not expose hidden tab state; physical tab switching remains unverified.';
 await other.close();await page.bringToFront();
 const data=await page.evaluate(()=>new Promise(resolve=>{window.__recorder.onstop=()=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(new Blob(window.__chunks,{type:'audio/webm'}))};window.__recorder.stop()}));fs.writeFileSync('work/audio-evidence.webm',Buffer.from(data.split(',')[1],'base64'));
 report.performance={samples:report.audio.map(s=>s.fps).filter(Boolean),worstFrameMs:report.audio.at(-1).worstFrameMs};
 assert.ok(report.network.every(u=>u.startsWith(url)||u.startsWith('data:')));pass('all runtime requests stay on the local game origin');await context.close();
 const c=await browser.newContext(),p=await c.newPage();await c.route('**/assets/hero.webp',r=>r.abort());await p.goto(url);await p.getByRole('button',{name:'Retry loading',exact:true}).waitFor();await p.screenshot({path:'work/loading-failure.png'});await c.unroute('**/assets/hero.webp');await p.getByRole('button',{name:'Retry loading',exact:true}).click();await p.waitForFunction(()=>window.__paperDuel?.info().loaded);pass('failed image load has a functional retry');await c.close();assert.equal(report.errors.length,0);
})().catch(e=>{report.failure=String(e.stack||e);console.error(e);process.exitCode=1}).finally(async()=>{fs.writeFileSync('work/system-report.json',JSON.stringify(report,null,2));await browser?.close()});
