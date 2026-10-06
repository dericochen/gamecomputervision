import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {classifyHand,CONNECTIONS,HandControls,GestureCalibration} from '../dist/gestures.mjs';
const root=path.resolve(import.meta.dirname,'..');
const html=fs.readFileSync(path.join(root,'dist/index.html'),'utf8');
for(const file of ['app.js','style.css','gestures.mjs','tracker-worker.js','vendor/vision_bundle.mjs','vendor/wasm/vision_wasm_internal.js','vendor/wasm/vision_wasm_internal.wasm','vendor/wasm/vision_wasm_nosimd_internal.js','vendor/wasm/vision_wasm_nosimd_internal.wasm','vendor/gesture_recognizer.task'])assert(fs.statSync(path.join(root,'dist',file)).size>0,file);
const ids=[...html.matchAll(/id="([^"]+)"/g)].map(x=>x[1]);assert.equal(new Set(ids).size,ids.length,'Unique IDs');
// Synthetic straight and curled finger chains test distinct gesture branches.
function hand(curled=false){const p=Array.from({length:21},()=>({x:.5,y:.6}));p[0]={x:.5,y:.85};p[4]={x:.15,y:.4};for(const [i,x] of [[5,.35],[9,.45],[13,.55],[17,.65]]){p[i]={x,y:.6};p[i+1]={x,y:.45};p[i+2]={x,y:curled?.55:.3};p[i+3]={x,y:curled?.66:.2}}return p}
const palm=hand();assert.equal(classifyHand(palm,'idle',undefined,1,[{categoryName:'Open_Palm',score:.95}]),'palm');const fist=hand(true);fist[4]={x:.36,y:.64};assert.equal(classifyHand(fist,'idle',undefined,1,[{categoryName:'Closed_Fist',score:.95}]),'fist');const pinch=hand();pinch[4]={x:.355,y:.205};assert.equal(classifyHand(pinch),'pinch');const point=hand(true);for(let i=5;i<=8;i++)point[i]=palm[i];assert.equal(classifyHand(point),'point');assert.equal(classifyHand([]),'idle');
const context2d=new Proxy({createRadialGradient:()=>({addColorStop(){}})},{get:(t,k)=>t[k]??(()=>{})});
function element(){const classes=new Set();return {textContent:'',value:'',children:[],className:'',tagName:'DIV',disabled:false,listeners:{},classList:{toggle(k,v){v?classes.add(k):classes.delete(k)},add(k){classes.add(k)},remove(k){classes.delete(k)},contains:k=>classes.has(k)},addEventListener(k,f){this.listeners[k]=f},setAttribute(){},append(x){this.children.push(x)},replaceChildren(){this.children=[]},getContext:()=>context2d,focus(){},reset(){},setCustomValidity(){},reportValidity(){},getBoundingClientRect:()=>({left:0,top:0,width:1280,height:720})}}
const elements=Object.fromEntries(ids.map(id=>[id,element()]));elements.health.children=Array.from({length:5},element);const storage=new Map();let clock=0;const registered=[];
const sandbox={console,performance:{now:()=>clock},document:{getElementById:id=>{assert(elements[id],id);return elements[id]},createElement:()=>element(),addEventListener(){},modelContext:{registerTool:x=>{registered.push(x)}}},window:{addEventListener(){}},navigator:{},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},requestAnimationFrame(){},setTimeout,clearTimeout,Intl,Date,Math,URL,Promise,classifyHand,CONNECTIONS};
sandbox.HandControls=HandControls;sandbox.GestureCalibration=GestureCalibration;
vm.createContext(sandbox);let code=fs.readFileSync(path.join(root,'dist/app.js'),'utf8').replace(/^import .*\n/,'');code+='\n globalThis.test={enterDemo,startRound,update,pauseGame,resumeGame,goHome,fire,nova,finish,readBoard,get:()=>({state,mode,score,health,remaining,charge}),set:v=>{if(v.now!==undefined)now=v.now;if(v.enemies)enemies=v.enemies;if(v.aim)aim=v.aim;if(v.charge!==undefined)charge=v.charge;if(v.shielding!==undefined)shielding=v.shielding;if(v.manualShield!==undefined)manualShield=v.manualShield;},enemies:()=>enemies};';vm.runInContext(code,sandbox);const t=sandbox.test;
t.enterDemo();assert.equal(t.get().state,'countdown');t.update(3.1);assert.equal(t.get().state,'playing');
t.set({now:1000,enemies:[{x:300,y:300,r:30,dead:false}],aim:{x:300,y:300}});t.fire();assert.equal(t.get().score,100,'Blast scoring');
t.pauseGame();const time=t.get().remaining;t.update(1);assert.equal(t.get().remaining,time,'Pause freezes clock');t.resumeGame();assert.equal(t.get().state,'playing');
t.set({now:1400,manualShield:true,enemies:[{x:300,y:650,startX:300,r:30,spin:0,v:80,age:0,dead:false}]});t.update(.05);assert.equal(t.get().health,5,'Shield prevents core damage');assert.equal(t.get().score,125);
t.set({now:1800,charge:1,enemies:[{x:400,y:300,r:30,dead:false},{x:800,y:200,r:30,dead:false}]});t.nova();assert.equal(t.get().score,265,'Nova scoring');assert.equal(t.get().charge,0,'Nova consumes charge');
t.finish();elements['player-name'].value='<svg onload=x>';elements['save-score'].listeners.submit({preventDefault(){}});assert.equal(t.readBoard('demo')[0].score,265);assert.equal(t.readBoard('camera').length,0,'Training is separate');elements['save-score'].listeners.submit({preventDefault(){}});assert.equal(t.readBoard('demo').length,1,'No duplicate saves');
assert.equal(registered.length,1);assert.equal(registered[0].name,'read_arena_state');assert.equal(registered[0].execute({}).score,265);assert.throws(()=>registered[0].execute({unexpected:true}));
t.goHome();assert.equal(t.get().state,'menu');assert.equal(t.get().score,0);
console.log('PASS: assets, 5 gesture cases, countdown, blast, pause/resume, shield, nova, leaderboard isolation, safe rendering, duplicate guard, optional tool contract, menu reset.');
