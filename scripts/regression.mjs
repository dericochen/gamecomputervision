import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import * as gestures from '../dist/gestures.mjs';

const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const ids=[...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
const ctx=new Proxy({createRadialGradient:()=>({addColorStop(){}})},{get:(o,k)=>o[k]??(()=>{})});
function element(tagName='DIV'){
 const classes=new Set();
 return {tagName,children:[],value:'',textContent:'',listeners:{},disabled:false,classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),toggle:(k,v)=>v?classes.add(k):classes.delete(k)},
 addEventListener(k,f){(this.listeners[k]??=[]).push(f)},dispatch(k,e={}){for(const f of this.listeners[k]??[])f({target:this,preventDefault(){},...e})},getContext:()=>ctx,
 append(...a){this.children.push(...a)},replaceChildren(){this.children=[]},setAttribute(){},focus(){},reset(){},setCustomValidity(){},reportValidity(){},setPointerCapture(){},hasPointerCapture:()=>true,releasePointerCapture(){},getBoundingClientRect:()=>({left:0,top:0,width:1280,height:720})};
}
function makeApp(){
 const elements=Object.fromEntries(ids.map(id=>[id,element()]));elements.health.children=Array.from({length:5},()=>element());
 const document=Object.assign(element(),{hidden:false,getElementById:id=>{assert(elements[id],id);return elements[id]},createElement:()=>element(),modelContext:undefined});
 const window=element(),storage=new Map();
 const sandbox={console,document,window,navigator:{},performance:{now:()=>1000},requestAnimationFrame(){},setTimeout(){return 1},clearTimeout(){},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},...gestures,Intl,Date,Math,URL,Promise,Set};
 vm.createContext(sandbox);
 const code=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace(/^import .*\n/gm,'');
 vm.runInContext(code,sandbox);
 const run=source=>vm.runInContext(source,sandbox);
 run("mode='camera'; cameraReady=true; hands=[{}]; now=1000; lastDetection=1000; startRound(); countdown=0; state='playing';");
 return {run,window,document,elements,sandbox};
}
const tests=[];
function check(name,fn){tests.push([name,fn])}
check('Bullets use the visible crosshair',()=>{const a=makeApp();a.run("mode='camera'; cameraReady=true; lastDetection=1000; hands=[{gesture:'pinch',x:900,y:400}]; aim={x:300,y:300}; enemies=[{x:300,y:300,r:30}]; fire();");assert.equal(a.run('score'),100)});
check('Missing hands freeze the countdown immediately',()=>{const a=makeApp();a.run("mode='camera'; cameraReady=true; state='countdown'; countdown=3; hands=[]; lastDetection=990; update(.1)");assert.equal(a.run('countdown'),3)});
check('Stale tracking cannot keep a round moving',()=>{const a=makeApp();a.run("mode='camera'; cameraReady=true; hands=[{gesture:'pinch'}]; lastDetection=400; now=1000; update(.1)");assert.equal(a.run('remaining'),60)});
check('Empty shield cannot pulse on while held',()=>{const a=makeApp();a.run("cameraShield=true; shield=0; update(.1); update(.1)");assert.equal(a.run('shielding'),false);assert.equal(a.run('shield'),0)});
check('Simultaneous hits cannot make health negative',()=>{const a=makeApp();a.run("health=1; enemies=Array.from({length:4},()=>({x:300,y:645,startX:300,v:80,r:30,age:0,spin:0})); update(.1)");assert.equal(a.run('health'),0)});
check('Resume returns keyboard control to the canvas',()=>{const a=makeApp();let focused=false;a.elements.game.focus=()=>{focused=true};a.run('pauseGame(); resumeGame()');assert(focused)});
check('Shield recovers only after release',()=>{const a=makeApp();a.run('cameraShield=true; shield=0; update(.1); cameraShield=false; update(1.2)');assert(a.run('shield')>=25);a.run('cameraShield=true; update(.05)');assert(a.run('shielding'))});
check('Backgrounding an auto-paused game prevents auto-resume',()=>{const a=makeApp();a.run("mode='camera'; cameraReady=true; lastDetection=1000; trackingRecoveredAt=0; hands=[{gesture:'point'}]; pauseGame(true)");a.document.hidden=true;a.document.dispatch('visibilitychange');a.run('update(.1)');assert.equal(a.run('state'),'paused');assert.equal(a.run('autoPaused'),false)});
check('A new round clears controls, score-save state, and bomb count',()=>{const a=makeApp();a.run('score=900; bombsHit=2; roundCompleted=true; saved=true; startRound()');assert.equal(a.run('score'),0);assert.equal(a.run('bombsHit'),0);assert.equal(a.run('roundCompleted'),false);assert.equal(a.run('saved'),false)});
function hand(kind='palm',offset=0){
 const p=Array.from({length:21},()=>({x:.4+offset,y:.6,z:0}));p[0]={x:.4+offset,y:.85,z:0};p[4]={x:.1+offset,y:.4,z:0};
 for(const [i,x] of [[5,.25],[9,.35],[13,.45],[17,.55]]){const curled=kind==='fist'||(kind==='point'&&i!==5);p[i]={x:x+offset,y:.6,z:0};p[i+1]={x:x+offset,y:.45,z:0};p[i+2]={x:x+offset,y:curled?.55:.3,z:0};p[i+3]={x:x+offset,y:curled?.66:.2,z:0}}
 if(kind==='pinch')p[4]={...p[8]};
 if(kind==='fist')p[4]={x:.26+offset,y:.64,z:0};
 p.kind=kind;return p;
}
function category(kind){return [{categoryName:{palm:'Open_Palm',fist:'Closed_Fist',point:'Pointing_Up',pinch:'None'}[kind]??'None',score:.95}]}
function detection(hands,labels){return {landmarks:hands,worldLandmarks:hands,handedness:labels.map(categoryName=>[{categoryName}]),gestures:hands.map(p=>category(p.kind)),latency:12}}
check('Two hands can fire and shield together',()=>{const a=makeApp();a.sandbox.frame=detection([hand('pinch'),hand('palm',.3)],['Right','Left']);a.run("mode='camera'; cameraReady=true; now=1000; processTracking(frame,1000); now=1200; processTracking(frame,1200); enemies=[{x:aim.x,y:aim.y,r:30,dead:false},{x:300,y:650,startX:300,v:80,r:30,age:0,spin:0}]; update(.05)");assert.equal(a.run('score'),125);assert.equal(a.run('health'),5);assert.equal(a.run('shielding'),true)});
check('Detector order changes do not swap the aiming hand',()=>{const c=new gestures.HandControls(),p=hand('point'),s=hand('palm',.3);c.update(detection([p,s],['Right','Left']),0);const first=c.update(detection([p,s],['Right','Left']),100);const next=c.update(detection([s,p],['Left','Right']),200);assert.equal(next.primary.id,first.primary.id);assert.equal(next.primary.label,'Right');assert(Math.abs(next.aim.x-first.aim.x)<.0001)});
check('Pinching does not yank the aim toward the folded fingertip',()=>{const c=new gestures.HandControls(),p=hand('point');c.update(detection([p],['Right']),0);const first=c.update(detection([p],['Right']),100);const pinch=hand('pinch');pinch[8]={x:.3,y:.35,z:0};pinch[4]={...pinch[8]};c.update(detection([pinch],['Right']),200);const next=c.update(detection([pinch],['Right']),300);assert(Math.abs(next.aim.y-first.aim.y)<.0001)});
check('Losing the aiming hand does not hand control to a shield immediately',()=>{const c=new gestures.HandControls();c.update(detection([hand('point'),hand('palm',.3)],['Right','Left']),0);c.update(detection([hand('point'),hand('palm',.3)],['Right','Left']),100);const next=c.update(detection([hand('palm',.3)],['Left']),200);assert.equal(next.primary,null)});
check('Gesture classification handles rotation and aspect ratio',()=>{for(const kind of ['palm','fist','point','pinch']){const p=hand(kind);const rotated=p.map(p=>({x:1-p.y,y:p.x,z:0}));assert.equal(gestures.classifyHand(rotated,'idle',undefined,1,category(kind)),kind);const wide=p.map(p=>({...p,x:p.x/2}));assert.equal(gestures.classifyHand(wide,'idle',undefined,2,category(kind)),kind)}});
check('A curled-finger pinch is not mistaken for a fist',()=>{const p=hand('fist');p[8]={x:.29,y:.43,z:0};p[4]={...p[8]};assert.equal(gestures.classifyHand(p),'pinch')});
check('Denied camera permission offers retry without losing control',async()=>{const a=makeApp();a.sandbox.navigator.mediaDevices={getUserMedia:async()=>{throw Object.assign(new Error('denied'),{name:'NotAllowedError'})}};await a.run('enableCamera()');assert.equal(a.run('state'),'setup');assert.equal(a.run('cameraReady'),false);assert.match(a.elements['setup-info'].textContent,/belum diizinkan/);assert.equal(typeof a.elements['camera-retry'].onclick,'function')});
check('Camera permission resolved after cancellation closes the late stream',async()=>{const a=makeApp();let resolve,stops=0;a.sandbox.navigator.mediaDevices={getUserMedia:()=>new Promise(r=>{resolve=r})};const task=a.run('enableCamera()');a.run('goHome()');resolve({getTracks:()=>[{stop(){stops++}}]});await task;assert.equal(stops,1);assert.equal(a.run('state'),'menu');assert.equal(a.run('cameraReady'),false)});
check('An old frame cannot overwrite the busy state of a new camera session',async()=>{const a=makeApp();let resolve,closed=0;a.sandbox.createImageBitmap=()=>new Promise(r=>{resolve=r});a.elements.camera.readyState=4;a.elements.camera.currentTime=1;a.run('workerReady=true; cameraReady=true; lastInference=0; workerBusy=false; now=1000');const task=a.run('requestFrame()');a.run('stopCamera(); workerBusy=true');resolve({close(){closed++}});await task;assert.equal(closed,1);assert.equal(a.run('workerBusy'),true)});
check('Main-thread fallback processes detections and closes its detector',async()=>{const a=makeApp();let detections=0,closes=0;a.sandbox.fakeDetector={recognizeForVideo(){detections++;return detection([hand('point')],['Right'])},close(){closes++}};a.elements.camera.readyState=4;a.elements.camera.currentTime=1;a.run('mainTracker=fakeDetector; mainTracking=true; cameraReady=true; lastInference=0; workerBusy=false; now=1000');await a.run('requestFrame()');assert.equal(detections,1);assert.equal(a.run('hands.length'),1);a.run('stopCamera()');assert.equal(closes,1);assert.equal(a.run('mainTracking'),false)});
check('Uncertain and low-confidence poses do not trigger the shield',()=>{
 for(const kind of ['fist','palm'])assert.equal(gestures.classifyHand(hand(kind),'idle',undefined,1,[{...category(kind)[0],score:.3}]),'idle');
});
check('A single misread frame cannot fire, and releasing stops fire immediately',()=>{
 const c=new gestures.HandControls();
 c.update(detection([hand('point')],['Right']),0);c.update(detection([hand('point')],['Right']),100);
 assert.equal(c.update(detection([hand('pinch')],['Right']),150).primary.gesture,'idle');
 assert.equal(c.update(detection([hand('point')],['Right']),200).primary.gesture,'idle');
 c.update(detection([hand('pinch')],['Right']),250);
 assert.equal(c.update(detection([hand('pinch')],['Right']),400).primary.gesture,'pinch');
 assert.equal(c.update(detection([hand('point')],['Right']),450).primary.gesture,'idle');
});
check('Four personal poses calibrate and reject an incorrect pose',()=>{
 const profile=new gestures.GestureCalibration();
 assert.equal(profile.capture('point',Array(8).fill(gestures.handFeatures(hand('fist')))).ok,false);
 for(const kind of ['point','pinch','palm','fist'])assert.equal(profile.capture(kind,Array(8).fill(gestures.handFeatures(hand(kind)))).ok,true,kind);
 for(const kind of ['point','pinch','palm','fist'])assert.equal(gestures.classifyHand(hand(kind),'idle',undefined,1,[],profile),kind);
 const c=new gestures.HandControls();c.setCalibration(profile);c.reset();assert.equal(c.calibration,profile);
});
check('Calibration ignores two-hand samples and blocks round start',()=>{
 const a=makeApp();a.sandbox.frame=detection([hand('point')],['Right']);
 a.run("mode='camera'; cameraReady=true; state='setup'; now=1000; processTracking(frame,1000); beginCalibration(); startRound()");
 assert.equal(a.run('state'),'setup');
 a.run('captureCalibration()');
 a.sandbox.extra=detection([hand('point'),hand('palm',.3)],['Right','Left']);
 a.run('processTracking(extra,3100); updateCalibrationClock(4300)');
 assert.equal(a.run('calibrationStep'),0);assert.equal(a.run('calibrationDraft.templates.length'),0);
});
check('Calibration wizard completes both gestures with the same tracked hand',()=>{
 const a=makeApp();a.run("mode='camera'; cameraReady=true; state='setup'; now=1000");
 for(const [step,kind] of ['point','palm'].entries()){
  a.sandbox.frame=detection([hand(kind)],['Right']);
  a.run('processTracking(frame,now)');if(step===0)a.run('beginCalibration()');
  a.run('captureCalibration(); calibrationRecording.start=now+10; calibrationRecording.end=now+1210');
  for(let j=1;j<=10;j++)a.run('now+=100; processTracking(frame,now); updateCalibrationClock(now)');
  a.run('now+=300; processTracking(frame,now); updateCalibrationClock(now)');
  assert.equal(a.run('calibrationStep'),step+1);
 }
 assert.equal(a.run('handControls.calibration.templates.length'),2);assert.equal(a.run('calibrationDraft'),null);
});
// Actual MediaPipe model inference on Google's four public sample photos,
// each tested as original, mirrored, and rotated 35 degrees. Images are not bundled.
for(const frame of JSON.parse(fs.readFileSync(new URL('./fixtures/real-landmarks.json',import.meta.url),'utf8'))){
 check('Real image landmarks: '+frame.name,()=>{
  const c=new gestures.HandControls();c.update(frame,0,frame.aspect);const controls=c.update(frame,240,frame.aspect);
  if(frame.name.startsWith('pointing_up'))assert.equal(controls.primary?.gesture,'point');
  else {assert(!['pinch','fist','palm'].includes(controls.primary?.gesture));assert.equal(controls.shield,false)}
 });
}
let failed=0;
for(const [name,test] of tests){try{await test();console.log('PASS '+name)}catch(e){failed++;console.log('FAIL '+name+': '+e.message.split('\n')[0])}}
if(failed)process.exitCode=1;
