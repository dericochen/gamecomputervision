import {CONNECTIONS,HandControls,GestureCalibration} from './gestures.mjs?v=5';
const desktop=globalThis.arenaApp??null;
const elementCache=new Map(),textCache=new Map(),valueCache=new Map();
const $=id=>{let el=elementCache.get(id);if(!el){el=document.getElementById(id);elementCache.set(id,el)}return el};
// Per-frame DOM writes only touch the page when the value actually changes.
function setText(id,value){value=String(value);if(textCache.get(id)!==value){textCache.set(id,value);$(id).textContent=value}}
function setValue(id,value){value=Math.round(value*100)/100;if(valueCache.get(id)!==value){valueCache.set(id,value);$(id).value=value}}
const canvas=$('game'),ctx=canvas.getContext('2d'),map=$('hand-map'),mctx=map.getContext('2d'),video=$('camera');
const W=1280,H=720,CORE_Y=H-78,labels={pinch:'ENERGY BLAST',point:'AIM LOCK',palm:'SHIELD ACTIVE',fist:'CHARGING NOVA',idle:'BIDIK BEBAS'};
let state='menu',mode='camera',boardMode='camera',worker,stream,cameraReady=false,workerBusy=false,workerReady=false,session=0,initTimer,frameTimer,lastInference=0,lastVideoTime=-1,lastDetection=0,landmarks=[],trackingRates=[],last=performance.now(),now=last,elapsed=0,remaining=60,score=0,combo=0,maxCombo=0,hits=0,blocked=0,health=5,shield=100,charge=0,novaCooldown=0,lastShot=-1e6,spawnTimer=0,countdown=0,autoPaused=false,shielding=false,manualShield=false,manualCharge=false,manualFire=false,aim={x:640,y:390},hands=[],gesture='idle',enemies=[],particles=[],beams=[],floaters=[],waves=[],powerups=[],saved=false,annUntil=0,annText='',sound=!!desktop,audio,keys=new Set(),roundCompleted=false;
let feverUntil=0,rapidUntil=0,spreadUntil=0,shots=0,shotHits=0,bossSpawned=false,lastWave=1,lastBeep=null,shake=0,holdProgress=0,resultAt=0,inferenceAvg=30,delegateName='—',loopErrors=0;
let stage=readStage(),autoFire=readFlag('vision-arena:autofire');
function readFlag(key){try{return localStorage.getItem(key)==='1'}catch{return false}}
function writeFlag(key,on){try{localStorage.setItem(key,on?'1':'0')}catch{}}
function syncAutoFire(){setText('autofire-toggle','Tembak otomatis: '+(autoFire?'ON':'OFF'));$('autofire-toggle').setAttribute('aria-pressed',String(autoFire));$('autofire-toggle').classList.toggle('on',autoFire)}
// Auto-fire only shoots when the reticle is actually over something, so it never sprays.
function targetUnderAim(){for(const e of enemies)if(!e.dead&&Math.hypot(e.x-aim.x,e.y-aim.y)<e.r+40)return true;for(const p of powerups)if(!p.taken&&Math.hypot(p.x-aim.x,p.y-aim.y)<p.r+40)return true;return false}
const rand=(a,b)=>a+Math.random()*(b-a),clamp=(x,a,b)=>Math.min(b,Math.max(a,x)),pick=list=>list[Math.floor(Math.random()*list.length)];
// numHands 4: spectators cannot crowd the player's hands out of the detector.
const CROWD_HANDS=4;
const handControls=new HandControls();
const heldActions={fire:new Set(),shield:new Set(),charge:new Set()};
let novaReleaseAt=null,calibrationDraft=null,calibrationStep=0,calibrationRecording=null,latestControls=null;
const triedGestures=new Set();
const poseNames={point:'BIDIK',pinch:'TEMBAK',palm:'SHIELD',fist:'NOVA',idle:'BIDIK BEBAS'};
const calibrationSteps=[
 {kind:'point',icon:'☝',name:'Bidik',help:'Telunjuk tegak, tiga jari lain dilipat. Telapak menghadap kamera. Geser seluruh tangan untuk membidik.'},
 {kind:'pinch',icon:'🤏',name:'Tembak',help:'Sentuhkan ujung ibu jari dan ujung telunjuk sampai menempel. Jari lain boleh terbuka atau ditekuk. Tahan bentuk ini.'},
 {kind:'palm',icon:'✋',name:'Shield',help:'Buka kelima jari. Hadapkan telapak ke kamera dan beri jarak antarjari.'},
 {kind:'fist',icon:'✊',name:'Nova',help:'Kepalkan keempat jari. Letakkan ibu jari di luar kepalan, lalu tahan.'}
];
// Enemy catalogue. Points on kill = 100 + combo bonus + kind bonus.
const KINDS={
 VIRUS:{sides:6,color:'#ffbd73',hp:1,r:[24,34],v:[62,90],sway:22,bonus:0},
 BUG:{sides:4,color:'#ff7ad9',hp:1,r:[18,24],v:[100,130],sway:70,bonus:50},
 TROJAN:{sides:8,color:'#b18cff',hp:3,r:[38,44],v:[40,52],sway:14,bonus:150},
 WORM:{sides:5,color:'#8dff7a',hp:1,r:[28,32],v:[58,78],sway:34,bonus:50,split:true},
 GOLD:{sides:4,color:'#ffe066',hp:1,r:[22,22],v:[0,0],sway:0,bonus:400,gold:true},
 BOSS:{sides:12,color:'#ff5d6c',hp:30,r:[72,72],v:[26,26],sway:260,bonus:3000,boss:true}
};
const WAVE_MIX={1:['VIRUS','VIRUS','VIRUS','BUG'],2:['VIRUS','VIRUS','BUG','TROJAN','WORM'],3:['VIRUS','BUG','BUG','TROJAN','WORM','WORM']};
const POWERUPS={RAPID:{icon:'⚡',name:'RAPID FIRE',color:'#67f8d5'},CHAIN:{icon:'✦',name:'CHAIN BLAST',color:'#b18cff'},REPAIR:{icon:'✚',name:'CORE REPAIR',color:'#8dff7a'},SHIELD:{icon:'◈',name:'SHIELD PENUH',color:'#7ac8ff'}};
let mainTracker=null,mainTracking=false,trackerFallback=false,bitmapFailures=0,cameraShield=false,gesturesArmed=true,wasCharging=false,shieldLocked=false,trackingRecoveredAt=null;
const stars=Array.from({length:90},()=>({x:Math.random()*W,y:Math.random()*H,s:Math.random()<.15?2:1,v:rand(8,40)}));
let backdrop=null;
function readStage(){try{const v=localStorage.getItem('vision-arena:stage');return v===null?!!desktop:v==='1'}catch{return !!desktop}}
function applyStage(){document.body?.classList.toggle('stage',stage);setText('stage-toggle',stage?'Mode halaman':'Mode panggung');try{localStorage.setItem('vision-arena:stage',stage?'1':'0')}catch{}}
function show(id,visible=true){$(id).classList.toggle('hidden',!visible)}
function announce(text,seconds=1.5){annText=text;setText('announcement',text);annUntil=now+seconds*1000}
const fever=()=>now<feverUntil,mult=()=>fever()?2:1;
function ensureAudio(){if(!sound)return null;try{audio??=new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')void audio.resume().catch(()=>{});return audio}catch{return null}}
function tone(freq=400,dur=.1,type='sine',vol=.05,at=0){const a=ensureAudio();if(!a)return;try{const t=at||a.currentTime,o=a.createOscillator(),g=a.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(Math.max(40,freq/2),t+dur);g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);o.connect(g);g.connect(a.destination);o.start(t);o.stop(t+dur)}catch{}}
// Small synthesized soundtrack, scheduled slightly ahead so it never stutters.
const MUSIC={bass:[45,45,52,45,48,48,43,47],arp:[69,72,76,72,69,74,77,74]};let nextBeat=0,beatIndex=0;
function musicTick(){
 if(!sound||state!=='playing'||document.hidden||!audio)return;
 const bpm=fever()?140:bossAlive()?128:118,step=60/bpm/2,lift=bossAlive()?2:0;
 if(nextBeat<audio.currentTime)nextBeat=audio.currentTime+.05;
 while(nextBeat<audio.currentTime+.2){
  const freq=m=>440*2**((m-69+lift)/12);
  if(beatIndex%2===0)tone(freq(MUSIC.bass[(beatIndex/2|0)%8]-12),step*1.8,'triangle',.05,nextBeat);
  tone(freq(MUSIC.arp[beatIndex%8]),step*.8,'square',fever()?.014:.009,nextBeat);
  nextBeat+=step;beatIndex++;
 }
}
function overlays(id){for(const x of ['start-overlay','setup-overlay','pause-overlay','result-overlay'])show(x,x===id)}
function setState(s){state=s;handControls.roundLock=mode==='camera'&&['playing','countdown','paused'].includes(s);$('arena').classList.toggle('is-setup',s==='setup');document.body?.classList.toggle('in-round',['playing','countdown','paused'].includes(s));show('pause',s==='playing'||s==='countdown');show('demo-controls',mode==='demo'&&['playing','countdown','paused'].includes(s));$('mode-label').textContent=mode==='demo'?'MOUSE TRAINING':'CAMERA ARENA';holdProgress=0}
function stopCamera(){
 cancelCalibration();latestControls=null;novaReleaseAt=null;
 session++;clearTimeout(initTimer);clearTimeout(frameTimer);worker?.terminate();worker=null;
 try{mainTracker?.close()}catch{}mainTracker=null;mainTracking=trackerFallback=false;
 stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;
 cameraReady=workerReady=workerBusy=false;landmarks=[];hands=[];gesture='idle';cameraShield=false;
 lastVideoTime=-1;lastInference=0;lastDetection=-Infinity;trackingRates=[];trackingRecoveredAt=null;bitmapFailures=0;inferenceAvg=30;delegateName='—';handControls.reset();
 $('live-label').textContent='OFFLINE';$('live-label').classList.remove('active');for(const id of ['hands-count','nodes','fps','latency','accel'])setText(id,'—');
 setText('feed-status','HAND LANDMARK SYSTEM');$('round-start').disabled=true;$('calibration-start').disabled=true;updateGestureFeedback(null);drawMap();
}
function cameraFailure(message){
 stopCamera();resetInputs();charge=0;wasCharging=false;shielding=false;
 $('setup-title').textContent='Kamera belum siap';$('setup-info').textContent=message;$('status').textContent=message;show('camera-retry');
 if(state!=='result'&&state!=='menu'){setState('setup');overlays('setup-overlay');announce('')}
}
function trackingFresh(){return cameraReady&&hands.length>0&&now-lastDetection<=350}
function trackerReady(){
 clearTimeout(initTimer);cameraReady=true;$('live-label').textContent='LIVE';$('live-label').classList.add('active');setText('accel',delegateName);
 $('setup-title').textContent='Coba bidik dan jepit dahulu';$('setup-info').textContent='Lihat nama gestur di layar. Lingkaran adalah titik tembakmu.';$('calibration-start').disabled=false;show('camera-retry',false);
}
// Hands that belong to the locked player. Spectator hands never count.
function playerHands(controls){return controls?.hands.filter(h=>h.role==='player'||h.role==='partner')??[]}
function processTracking(data,at=performance.now()){
 const aspect=(data.width&&data.height)?data.width/data.height:(video.videoWidth||1280)/(video.videoHeight||720);
 const controls=handControls.update(data,at,aspect);
 latestControls=controls;landmarks=controls.hands;hands=controls.primary?playerHands(controls):[];
 trackingRates.push(at);while(trackingRates.length&&trackingRates[0]<=at-1000)trackingRates.shift();
 if(Number.isFinite(data.latency))inferenceAvg=inferenceAvg*.85+data.latency*.15;
 const ignored=controls.ignored??0;
 setText('hands-count',hands.length+(ignored?` (+${ignored} diabaikan)`:''));setText('nodes',String(controls.hands.length*21));setText('fps',trackingRates.length+' fps');setText('latency',Math.round(data.latency??0)+' ms');
 setText('feed-status',hands.length?(ignored?'PEMAIN TERKUNCI · PENONTON DIABAIKAN':'PEMAIN TERKUNCI'):controls.hands.length?'MENDEKAT KE KAMERA':'SEARCHING FOR HANDS');
 if(controls.primary){
  lastDetection=at;trackingRecoveredAt??=at;
  aim.x=clamp(controls.aim.x*W,20,W-20);aim.y=clamp(controls.aim.y*H,100,H-80);
  gesture=controls.primary.gesture;cameraShield=controls.shield;
  // Attacks re-arm once the hand is not pinching or fisting (any other shape is fine).
  if(!['pinch','fist'].includes(controls.primary.raw))gesturesArmed=true;
 }else{gesture='idle';cameraShield=false;trackingRecoveredAt=null;charge=0;wasCharging=false}
 updateGestureFeedback(controls);
 if(state==='setup'){
  $('round-start').disabled=!hands.length||!!calibrationDraft;
  $('setup-title').textContent=hands.length?'Tes gerakanmu di arena':controls.hands.length?'Mendekatlah ke kamera':'Tunjukkan tangan bidikmu';
  $('setup-info').textContent=hands.length?'Geser lingkaran, lalu jepit. Tahan telapak terbuka 2 detik untuk langsung mulai.':controls.hands.length?'Tangan terlihat terlalu kecil. Pemain perlu berdiri paling dekat dengan kamera.':'Seluruh tangan perlu terlihat. Cari cahaya terang dan beri jarak dari kamera.';
  $('calibration-capture').disabled=!!calibrationRecording||!hands.length||hands.length!==1;
  collectCalibration(controls,at);
 }
 drawMap();
}
function updateGestureFeedback(controls){
 const primary=controls?.primary;
 const current=primary?.gesture??'idle';
 const name=primary?poseNames[current]:'BELUM ADA TANGAN';
 const pending=primary&&current==='idle'&&primary.raw!=='idle';
 setText('setup-live',pending?'TAHAN · '+poseNames[primary.raw]:name);
 setText('gesture-live',pending?'MENGENALI '+poseNames[primary.raw]:name);
 const hints={point:'Bidik terbaca. Geser tangan untuk menggerakkan lingkaran.',pinch:autoFire?'Jepitan terbaca. Tembak otomatis juga aktif saat bidikan mengenai musuh.':'Jepitan terbaca. Tahan untuk menembak; lepas untuk berhenti.',palm:'Telapak terbuka terbaca. Shield aktif selama energi tersedia.',fist:'Kepalan terbaca. Tahan sampai READY, lalu buka telapak.',idle:'Lingkaran tetap bisa dibidik. Tegakkan telunjuk dan hadapkan telapak ke kamera.'};
 const nearPinch=primary&&current!=='pinch'&&primary.raw!=='pinch'&&primary.raw!=='fist'&&(primary.features?.pinch??9)<.7;
 nearPinch&&state==='setup'?setText('setup-live','HAMPIR · RAPATKAN JARI'):0;
 setText('gesture-detail',nearPinch?'Hampir! Tempelkan ujung ibu jari ke ujung telunjuk sampai menyentuh.':primary?(pending?'Pertahankan bentuk sebentar agar aksinya tidak tertukar.':hints[current]):'Tampilkan seluruh tangan dengan cahaya terang. Angkat tangan bidik lebih dulu.');
 const second=controls?.partner;
 setText('secondary-gesture',second?'Tangan kedua: '+poseNames[second.gesture]:'');
 if(state==='setup'&&primary&&current!=='idle')triedGestures.add(current);
 for(const step of calibrationSteps){
  const el=$('test-'+step.kind);el.classList.toggle('seen',triedGestures.has(step.kind));el.classList.toggle('active',!!primary&&current===step.kind);
  setText('test-'+step.kind,step.icon+' '+step.name+(triedGestures.has(step.kind)?' ✓':''));
 }
}
function beginCalibration(){
 if(state!=='setup'||!cameraReady)return;
 calibrationDraft=new GestureCalibration();calibrationStep=0;calibrationRecording=null;
 $('calibration-start').disabled=true;$('round-start').disabled=true;show('calibration-panel');
 $('calibration-status').textContent='Kalibrasi memakai satu tangan. Foto dan video tidak disimpan.';renderCalibrationStep();
}
function renderCalibrationStep(){
 const step=calibrationSteps[calibrationStep];
 $('calibration-step').textContent='LANGKAH '+(calibrationStep+1)+' / 4';$('calibration-title').textContent=step.name;
 $('calibration-icon').textContent=step.icon;$('calibration-help').textContent=step.help;
 $('calibration-info').textContent='Tekan Rekam, lalu siapkan gerakan. Ada waktu 2 detik sebelum perekaman.';
 $('calibration-capture').textContent='Rekam gerakan';$('calibration-progress').value=0;
 $('calibration-capture').disabled=!trackingFresh()||playerHands(latestControls).length!==1;
}
function captureCalibration(){
 if(!calibrationDraft||calibrationRecording||!trackingFresh()||playerHands(latestControls).length!==1)return;
 const at=performance.now();calibrationRecording={start:at+2000,end:at+3200,samples:[],handId:null,invalid:false};
 $('calibration-capture').disabled=true;$('calibration-info').textContent='Siapkan gerakan…';
}
function collectCalibration(controls,at){
 const recording=calibrationRecording;
 if(!recording||at<recording.start||at>recording.end)return;
 if(playerHands(controls).length!==1||!controls.primary?.features){recording.invalid=true;return}
 recording.handId??=controls.primary.id;
 if(controls.primary.id!==recording.handId){recording.invalid=true;return}
 recording.samples.push(controls.primary.features);
}
function updateCalibrationClock(at){
 const recording=calibrationRecording;
 if(!recording)return;
 if(document.hidden){calibrationRecording=null;$('calibration-info').textContent='Perekaman terhenti saat tab ditinggalkan. Ulangi gerakan ini.';return}
 if(at<recording.start){$('calibration-info').textContent='Siapkan '+calibrationSteps[calibrationStep].name.toLowerCase()+' · '+Math.ceil((recording.start-at)/1000)+' detik';return}
 $('calibration-info').textContent=recording.invalid?'Tangan terputus atau berganti. Ulangi setelah perekaman selesai.':'Tahan bentuk tangan…';
 $('calibration-progress').value=clamp((at-recording.start)/1200,0,1);
 if(at<recording.end)return;
 const outcome=recording.invalid||!trackingFresh()?{ok:false,message:'Gunakan satu tangan yang sama dan jaga seluruh jari tetap terlihat.'}:calibrationDraft.capture(calibrationSteps[calibrationStep].kind,recording.samples);
 calibrationRecording=null;
 if(!outcome.ok){$('calibration-info').textContent=outcome.message;$('calibration-capture').textContent='Ulangi gerakan';$('calibration-capture').disabled=!trackingFresh();return}
 calibrationStep++;
 if(calibrationStep<calibrationSteps.length){renderCalibrationStep();return}
 handControls.setCalibration(calibrationDraft);calibrationDraft=null;triedGestures.clear();show('calibration-panel',false);show('calibration-reset');
 $('calibration-start').disabled=false;$('calibration-start').textContent='Kalibrasi ulang';
 $('calibration-status').textContent='Kalibrasi aktif untuk sesi ini. Coba bidik dan tembak sekali lagi, lalu mulai ronde.';
}
function cancelCalibration(notify=false){
 calibrationDraft=null;calibrationRecording=null;show('calibration-panel',false);
 $('calibration-start').disabled=!cameraReady;
 if(notify)$('calibration-status').textContent=handControls.calibration?'Kalibrasi sebelumnya tetap aktif.':'Kalibrasi dibatalkan. Setelan standar tetap aktif.';
}
function drawGesturePractice(){
 ctx.save();ctx.font='bold 20px monospace';ctx.textAlign='center';
 for(const x of [W*.25,W*.5,W*.75]){
  const y=H*.43,hit=trackingFresh()&&gesture==='pinch'&&Math.hypot(aim.x-x,aim.y-y)<75;
  circle(ctx,x,y,44,hit?'#67f8d5':'#ffffff88',hit?5:2);circle(ctx,x,y,14,hit?'#67f8d5':'#ffffff88',2);
  ctx.fillStyle=hit?'#67f8d5':'#e8f3ef';ctx.fillText(hit?'KENA!':'TES BIDIK',x,y+76);
 }
 if(trackingFresh()){
  ctx.fillStyle='#07131ce8';ctx.fillRect(20,20,360,52);ctx.fillStyle='#67f8d5';ctx.textAlign='left';
  ctx.fillText('TERBACA: '+poseNames[gesture],36,54);
  if(gesture==='pinch'){ctx.strokeStyle='#67f8d5';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(W/2,H-77);ctx.lineTo(aim.x,aim.y);ctx.stroke()}
 }
 if(holdProgress>0){
  ctx.fillStyle='#07131ce8';ctx.fillRect(W/2-210,H-170,420,70);
  ctx.strokeStyle='#67f8d5';ctx.lineWidth=6;ctx.beginPath();ctx.arc(W/2-165,H-135,22,-Math.PI/2,-Math.PI/2+Math.PI*2*holdProgress);ctx.stroke();
  ctx.fillStyle='#67f8d5';ctx.textAlign='left';ctx.fillText('TAHAN ✋ UNTUK MULAI',W/2-125,H-128);
 }
 ctx.restore();
}
function trackerOptions(){return {numHands:CROWD_HANDS,minHandDetectionConfidence:.5,minHandPresenceConfidence:.5,minTrackingConfidence:.5}}
async function useMainTracker(generation){
 if(generation!==session||trackerFallback)return;
 trackerFallback=true;clearTimeout(initTimer);clearTimeout(frameTimer);worker?.terminate();worker=null;workerReady=workerBusy=cameraReady=false;
 hands=[];landmarks=[];gesture='idle';cameraShield=false;lastDetection=-Infinity;trackingRecoveredAt=null;charge=0;wasCharging=false;
 $('setup-info').textContent='Menyesuaikan pelacak dengan perangkatmu…';$('status').textContent='Menyesuaikan pelacak tangan. Permainan dijeda sementara.';
 initTimer=setTimeout(()=>{if(generation===session)cameraFailure('Pelacak belum selesai dimuat. Pilih Coba kamera lagi.')},45000);
 try{
  const {GestureRecognizer,FilesetResolver}=await import('./vendor/vision_bundle.mjs');
  if(generation!==session)return;
  const files=await FilesetResolver.forVisionTasks('./vendor/wasm');
  if(generation!==session)return;
  const detector=await GestureRecognizer.createFromOptions(files,{baseOptions:{modelAssetPath:'./vendor/gesture_recognizer.task',delegate:'CPU'},runningMode:'VIDEO',...trackerOptions()});
  if(generation!==session){detector.close();return}
  mainTracker=detector;mainTracking=true;lastVideoTime=-1;delegateName='CPU (fallback)';trackerReady();
 }catch(error){if(generation===session)cameraFailure('Pelacak tangan tidak dapat dimulai. Coba lagi, atau gunakan latihan mouse.')}
}
async function enableCamera(){
 stopCamera();resetInputs();mode='camera';setState('setup');overlays('setup-overlay');show('camera-retry',false);$('setup-title').textContent='Menyiapkan pelacak tangan';$('setup-info').textContent='Izinkan kamera. Model tangan sedang dimuat…';$('round-start').disabled=true;const generation=session;
 if(!navigator.mediaDevices?.getUserMedia){cameraFailure('Perangkat ini tidak mendukung kamera. Gunakan aplikasi desktop, Chrome, atau Edge.');return}
 try{
  const requested=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720},facingMode:'user',frameRate:{ideal:30}},audio:false});
  if(generation!==session){requested.getTracks().forEach(t=>t.stop());return}
  stream=requested;video.srcObject=stream;await video.play();if(generation!==session)return;
  for(const track of stream.getTracks())track.addEventListener('ended',()=>{if(generation===session)cameraFailure('Kamera terputus. Sambungkan kembali lalu pilih Coba kamera lagi.')});
  if(typeof Worker==='undefined'||typeof createImageBitmap!=='function'||typeof OffscreenCanvas==='undefined'){await useMainTracker(generation);return}
  try{worker=new Worker('./tracker-worker.js?v=4')}catch{await useMainTracker(generation);return}
  initTimer=setTimeout(()=>{if(generation===session)void useMainTracker(generation)},40000);
  worker.onerror=()=>{if(generation===session)void useMainTracker(generation)};
  worker.onmessage=({data})=>{
   if(generation!==session||trackerFallback)return;
   if(data.type==='ready'){workerReady=true;delegateName=data.delegate??'CPU';trackerReady()}
   if(data.type==='error'){void useMainTracker(generation);return}
   if(data.type==='result'){clearTimeout(frameTimer);workerBusy=false;bitmapFailures=0;processTracking(data)}
  };
  worker.postMessage({type:'init',...trackerOptions()});
 }catch(e){if(generation!==session)return;const message=e.name==='NotAllowedError'?'Akses kamera belum diizinkan. Izinkan kamera di pengaturan lalu coba lagi.':e.name==='NotFoundError'?'Kamera tidak ditemukan. Sambungkan webcam atau pakai perangkat berkamera.':e.name==='NotReadableError'?'Kamera sedang dipakai aplikasi lain. Tutup aplikasi itu lalu coba lagi.':'Kamera tidak bisa dibuka. Periksa pengaturan kamera dan coba kembali.';cameraFailure(message)}
}
// Tracking runs as fast as the device allows (up to ~30/s) with one frame in flight.
function trackingInterval(){return mainTracking?85:clamp(inferenceAvg+10,33,70)}
async function grabFrame(){
 const vw=video.videoWidth,vh=video.videoHeight;
 // Downscale before transfer: landmarks are normalized, so accuracy holds while copies get cheaper.
 if(vw>960&&vh){try{return await createImageBitmap(video,{resizeWidth:960,resizeHeight:Math.round(960*vh/vw),resizeQuality:'low'})}catch{}}
 return createImageBitmap(video);
}
async function requestFrame(){
 if(document.hidden||(!workerReady&&!mainTracking)||workerBusy||video.readyState<2||now-lastInference<trackingInterval()||video.currentTime===lastVideoTime)return;
 workerBusy=true;lastInference=now;lastVideoTime=video.currentTime;const generation=session;
 try{
  if(mainTracking){const t=performance.now();const result=mainTracker.recognizeForVideo(video,t);workerBusy=false;processTracking({...result,latency:performance.now()-t});return}
  const bitmap=await grabFrame();if(generation!==session||!worker){bitmap.close();return}
  worker.postMessage({type:'frame',bitmap,timestamp:performance.now()},[bitmap]);
  frameTimer=setTimeout(()=>{if(generation===session)void useMainTracker(generation)},6000);
 }catch{
  if(generation!==session)return;workerBusy=false;
  if(mainTracking)cameraFailure('Tracking kamera terhenti. Pilih Coba kamera lagi.');
  else if(++bitmapFailures>=3)void useMainTracker(generation);
 }
}
const roleColor={player:'#67f8d5',partner:'#7ac8ff',ignored:'#6b7a86'};
function drawMap(){mctx.clearRect(0,0,360,190);mctx.strokeStyle='#203a43';mctx.lineWidth=1;mctx.beginPath();for(let x=0;x<360;x+=30){mctx.moveTo(x,0);mctx.lineTo(x,190)}for(let y=0;y<190;y+=30){mctx.moveTo(0,y);mctx.lineTo(360,y)}mctx.stroke();for(const h of landmarks)drawHand(mctx,h,360,190,h.role==='ignored'?.4:1);if(!landmarks.length){mctx.strokeStyle='#41645f';mctx.beginPath();mctx.arc(180,84,40,0,Math.PI*2);mctx.stroke();mctx.beginPath();mctx.moveTo(165,84);mctx.lineTo(195,84);mctx.moveTo(180,69);mctx.lineTo(180,99);mctx.stroke()}}
// One path per hand keeps glow cost low even with several hands on screen.
function drawHand(c,hand,w,h,alpha=1){
 const p=hand.p??hand,role=hand.role??'player',color=roleColor[role]??'#67f8d5';
 c.save();c.globalAlpha=alpha;c.strokeStyle=color;c.lineWidth=2;if(role!=='ignored'){c.shadowBlur=8;c.shadowColor=color}
 c.beginPath();for(const [a,b] of CONNECTIONS){c.moveTo((1-p[a].x)*w,p[a].y*h);c.lineTo((1-p[b].x)*w,p[b].y*h)}c.stroke();
 c.shadowBlur=0;c.fillStyle=role==='ignored'?'#9aa7b1':'#ddfff7';c.beginPath();for(const l of p){c.moveTo((1-l.x)*w+3,l.y*h);c.arc((1-l.x)*w,l.y*h,3,0,Math.PI*2)}c.fill();
 if(w>=W&&role!=='partner'){c.font='bold 14px monospace';c.textAlign='center';c.fillStyle=color;c.fillText(role==='player'?'PEMAIN':'DIABAIKAN',(1-p[0].x)*w,p[0].y*h+22)}
 c.restore();
}
function resetRoundEffects(){enemies=[];particles=[];beams=[];waves=[];floaters=[];powerups=[];feverUntil=rapidUntil=spreadUntil=0;shots=shotHits=0;bossSpawned=false;lastWave=1;lastBeep=null;shake=0;holdProgress=0;$('clock').classList.remove('urgent')}
function startRound(){
 if(mode==='camera'&&(!trackingFresh()||calibrationDraft))return;
 resetInputs();score=combo=maxCombo=hits=blocked=0;health=5;shield=100;shieldLocked=false;charge=0;wasCharging=false;novaReleaseAt=null;gesturesArmed=mode==='demo'||!['pinch','fist'].includes(gesture);
 elapsed=0;remaining=60;novaCooldown=0;spawnTimer=.2;countdown=3;resetRoundEffects();shielding=false;
 if(mode==='demo')aim={x:640,y:390};saved=false;roundCompleted=false;lastShot=-1e6;autoPaused=false;overlays(null);setState('countdown');
 $('status').textContent=mode==='camera'?'Bidik dengan penanda lingkaran. Jepit untuk menembak; tangan kedua boleh membuka shield.':'Latihan mouse · skor dipisahkan dari kamera.';
 canvas.focus({preventScroll:true});$('save-info').textContent='';$('save-score').reset();$('player-name').setCustomValidity('');show('save-score');updateHUD();
}
function enterDemo(){stopCamera();mode='demo';boardMode='demo';renderBoard();startRound()}
function pauseGame(auto=false){
 if(state==='paused'){if(!auto){autoPaused=false;show('resume');$('pause-info').textContent='Waktu berhenti sampai kamu melanjutkan.'}return}
 if(!['playing','countdown'].includes(state))return;
 autoPaused=auto;setState('paused');overlays('pause-overlay');resetInputs();charge=0;wasCharging=false;novaReleaseAt=null;shielding=false;gesturesArmed=false;
 $('pause-reason').textContent=auto?'TRACKING TERPUTUS':'RONDE DIJEDA';$('pause-title').textContent=auto?'Tunjukkan tanganmu lagi.':'Ambil napas dulu.';
 $('pause-info').textContent=auto?'Waktu dan ancaman berhenti. Pemain utama perlu berdiri paling dekat dengan kamera.':'Waktu berhenti sampai kamu melanjutkan.';show('resume',!auto);
 if(!auto)$('resume').focus({preventScroll:true});
}
function resumeGame(){
 if(state!=='paused'||document.hidden)return;
 if(mode==='camera'&&!trackingFresh()){$('pause-info').textContent='Tunjukkan tangan ke kamera untuk melanjutkan.';return}
 autoPaused=false;resetInputs();setState(countdown>0?'countdown':'playing');overlays(null);canvas.focus({preventScroll:true});
 if(mode==='camera')$('status').textContent='Lepas jepitan atau kepalan dahulu, lalu lakukan gerakan lagi untuk menyerang.';
}
function goHome(){stopCamera();resetInputs();mode='camera';boardMode='camera';setState('menu');overlays('start-overlay');show('demo-controls',false);$('mode-label').textContent='CAMERA ARENA';$('status').textContent='Siap saat kamu siap.';announce('',0);annUntil=0;resetRoundEffects();score=0;combo=0;health=5;remaining=60;charge=0;shield=100;shieldLocked=false;wasCharging=false;shielding=false;roundCompleted=false;saved=false;gesture='idle';renderBoard();updateHUD()}
function burst(x,y,color,n=20,speed=330){n=Math.min(n,Math.max(0,700-particles.length));for(let i=0;i<n;i++){const a=rand(0,Math.PI*2),v=rand(80,speed);particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:rand(.3,.7),color})}}
const kindOf=e=>KINDS[e.kind]??KINDS.VIRUS;
function makeEnemy(kind,x,y,extra={}){const k=KINDS[kind],wave=waveAt(elapsed);return {x,y,startX:x,v:rand(...k.v)+(k.boss||k.gold?0:wave*17),r:rand(...k.r),spin:rand(0,6.28),age:0,dead:false,kind,hp:k.hp,maxHp:k.hp,sway:k.sway,flash:0,...extra}}
function dropPowerup(x,y){const options=Object.keys(POWERUPS).filter(k=>k!=='REPAIR'||health<5);powerups.push({x,y,kind:pick(options),life:7,r:26,age:0})}
function destroy(enemy,points,nova=false){
 if(enemy.dead)return;enemy.dead=true;const k=kindOf(enemy),gained=Math.round(points*mult());score+=gained;hits++;
 if(!nova){combo++;maxCombo=Math.max(maxCombo,combo)}
 floaters.push({x:enemy.x,y:enemy.y,text:'+'+gained,life:.7,color:k.boss||k.gold?'#ffe066':fever()?'#ff7ad9':'#67f8d5',big:k.boss||k.gold});
 burst(enemy.x,enemy.y,nova?'#ffbd73':k.color,k.boss?120:20,k.boss?600:330);tone(680+combo*15,.08,'triangle');
 if(k.boss){shake=Math.max(shake,22);announce('BOSS DIHANCURKAN!',2);tone(90,.9,'sawtooth',.09);for(let i=0;i<3;i++)dropPowerup(enemy.x+(i-1)*90,enemy.y)}
 if(k.split&&!enemy.mini)for(const dx of [-1,1])enemies.push(makeEnemy('BUG',enemy.x+dx*20,enemy.y,{r:16,mini:true,startX:enemy.x+dx*40}));
 if(!nova&&(k.gold||Math.random()<(k.hp>1?.35:.07)))dropPowerup(enemy.x,enemy.y);
 if(!nova&&combo>0&&combo%12===0){feverUntil=now+8000;announce('FEVER ×2!',1.4);tone(990,.3,'square',.05)}
 else if(combo>0&&combo%5===0&&!nova)announce('COMBO ×'+combo,1);
}
// One blast deals one damage; armored enemies flash until destroyed.
function hit(enemy){
 enemy.hp=(enemy.hp??1)-1;
 if(enemy.hp>0){enemy.flash=.09;const gained=20*mult();score+=gained;floaters.push({x:enemy.x,y:enemy.y-enemy.r,text:'+'+gained,life:.5,color:'#e9cda8'});burst(enemy.x,enemy.y,kindOf(enemy).color,6);tone(520,.05,'square',.03);if(enemy.boss)shake=Math.max(shake,3);return}
 destroy(enemy,100+Math.min(combo,20)*10+kindOf(enemy).bonus);
}
function collect(p){p.taken=true;const info=POWERUPS[p.kind];if(p.kind==='RAPID')rapidUntil=now+6000;else if(p.kind==='CHAIN')spreadUntil=now+6000;else if(p.kind==='REPAIR')health=Math.min(5,health+1);else{shield=100;shieldLocked=false}announce(info.icon+' '+info.name,1.2);burst(p.x,p.y,info.color,26);tone(880,.18,'triangle',.06);tone(1320,.18,'triangle',.04)}
function fireInterval(){return now<rapidUntil||fever()?120:220}
function fire(){
 if(state!=='playing'||now-lastShot<fireInterval()||(mode==='camera'&&!trackingFresh()))return;lastShot=now;shots++;const {x,y}=aim;
 for(const p of powerups)if(!p.taken&&Math.hypot(p.x-x,p.y-y)<p.r+50)collect(p);
 let target=null,dmin=Infinity;for(const e of enemies){if(e.dead)continue;const d=Math.hypot(e.x-x,e.y-y);if(d<e.r+56&&d<dmin){dmin=d;target=e}}
 beams.push({x:target?.x??x,y:target?.y??y,life:.16});tone(300,.08,'sawtooth',.025);
 if(!target){burst(x,y,'#70918f',5);return}
 shotHits++;hit(target);
 if(now<spreadUntil){
  const chain=enemies.filter(e=>!e.dead&&e!==target&&Math.hypot(e.x-target.x,e.y-target.y)<300).sort((a,b)=>Math.hypot(a.x-target.x,a.y-target.y)-Math.hypot(b.x-target.x,b.y-target.y)).slice(0,2);
  for(const e of chain){beams.push({fromX:target.x,fromY:target.y,x:e.x,y:e.y,life:.2,color:'#b18cff'});hit(e)}
 }
}
function nova(){if(state!=='playing'||charge<.99||novaCooldown>0)return;waves.push({x:aim.x,y:aim.y,r:20,life:.65});for(const e of enemies){if(e.dead)continue;if(kindOf(e).boss){e.hp-=8;e.flash=.2;if(e.hp<=0)destroy(e,70+KINDS.BOSS.bonus,true)}else destroy(e,70,true)}charge=0;novaCooldown=5;shake=Math.max(shake,14);announce('NOVA RELEASED',1.2);tone(100,.6,'sawtooth',.08)}
function waveAt(t){return t<20?1:t<40?2:3}
function bossAlive(){return enemies.some(e=>!e.dead&&e.kind==='BOSS')}
function spawn(){
 const wave=waveAt(elapsed);
 if(elapsed>5&&Math.random()<.05&&!enemies.some(e=>e.kind==='GOLD'&&!e.dead)){const fromLeft=Math.random()<.5,y=rand(150,260);enemies.push(makeEnemy('GOLD',fromLeft?-40:W+40,y,{vx:fromLeft?270:-270,baseY:y}));return}
 enemies.push(makeEnemy(pick(WAVE_MIX[wave]),rand(95,W-95),-50));
}
function spawnBoss(){bossSpawned=true;enemies.push(makeEnemy('BOSS',W/2,-90,{shootTimer:2.5}));announce('⚠ BOSS INCOMING',2);shake=Math.max(shake,10);tone(60,1,'sawtooth',.08)}
function updateHUD(){
 setText('score',String(score).padStart(5,'0'));setText('clock',Math.ceil(remaining)+'s');
 setText('phase',state==='playing'?(bossAlive()?'BOSS WAVE':'WAVE 0'+waveAt(elapsed)):state==='countdown'?'GET READY':state==='paused'?'PAUSED':state==='result'?'COMPLETE':'STANDBY');
 const pips=$('health').children;for(let i=0;i<pips.length;i++)pips[i].classList.toggle('lost',i>=health);
 setValue('charge',charge);setText('charge-label',novaCooldown>0?Math.ceil(novaCooldown)+'s':charge>=.99?'READY':Math.round(charge*100)+'%');setValue('shield',shield);
 setText('multiplier',[combo>=2?'COMBO ×'+combo:'',fever()?'FEVER ×2':''].filter(Boolean).join(' · '));
 const active=[now<rapidUntil?'⚡ '+Math.ceil((rapidUntil-now)/1000)+'s':'',now<spreadUntil?'✦ '+Math.ceil((spreadUntil-now)/1000)+'s':''].filter(Boolean).join('  ');
 setText('powerup-status',active);
 setText('gesture-display',shieldLocked?'SHIELD HABIS · LEPAS TELAPAK':mode==='demo'?(manualCharge?'CHARGING NOVA':shielding?'SHIELD ACTIVE':'MOUSE TRAINING'):(gesture==='pinch'&&shielding?'BLAST + SHIELD':(!trackingFresh()?'TUNJUKKAN TANGAN':labels[gesture]??'BIDIK BEBAS')));
}
// A flawless bot reaches ~60k; human grades are spread below that.
function gradeFor(points){return points>=30000?'S':points>=18000?'A':points>=9000?'B':points>=3000?'C':'D'}
function finish(){
 roundCompleted=true;resetInputs();charge=0;wasCharging=false;shielding=false;
 const board=readBoard(mode),rank=board.filter(r=>r.score>=score).length+1;
 setState('result');overlays('result-overlay');resultAt=now;
 $('result-heading').textContent=mode==='demo'?'TRAINING COMPLETE':health<=0?'CORE DOWN':'ROUND COMPLETE';$('result-score').textContent=score.toLocaleString('id-ID');
 $('result-grade').textContent=gradeFor(score);$('result-grade').className='grade grade-'+gradeFor(score).toLowerCase();
 $('result-rank').textContent=score>0&&board.length&&score>board[0].score?'🏆 REKOR BARU HARI INI!':rank<=10&&score>0?'Peringkat #'+rank+' hari ini':'';
 const accuracy=shots?Math.round(shotHits/shots*100):0;
 $('result-summary').textContent=`${hits} target · combo ${maxCombo} · akurasi ${accuracy}% · ${blocked} block`;
 $('status').textContent=health<=0?'Core kehabisan nyawa. Coba lagi!':'Ronde selesai. Simpan skor dan tantang temanmu.';
 setText('next-hint',mode==='camera'?'Pemain berikutnya: tahan ✋ telapak 2 detik untuk main lagi.':'');setValue('next-progress',0);
 announce('',0);tone(480,.4,'triangle');tone(720,.5,'triangle',.04);
}
function update(dt){
 shake=Math.max(0,shake-dt*40);
 if(state!=='paused')for(const s of stars){s.y+=s.v*dt*(state==='playing'?(fever()?3:1.4):.6);if(s.y>H){s.y=0;s.x=Math.random()*W}}
 if(state==='paused'&&autoPaused&&!document.hidden&&trackingFresh()&&trackingRecoveredAt!==null&&now-trackingRecoveredAt>=350){resumeGame();announce('TRACKING KEMBALI',1)}
 if((state==='playing'||state==='countdown')&&mode==='camera'&&!trackingFresh()){
  charge=0;wasCharging=false;novaReleaseAt=null;shielding=false;gesturesArmed=false;
  if(now-lastDetection>650)pauseGame(true);else if(annText!=='TUNJUKKAN TANGAN')announce('TUNJUKKAN TANGAN',1);
  return;
 }
 if(state==='countdown'){const before=Math.ceil(countdown);countdown-=dt;if(Math.ceil(countdown)!==before&&countdown>0)tone(520,.08,'square',.04);announce(countdown>0?String(Math.ceil(countdown)):'BATTLE START',.7);if(countdown<=0){setState('playing');tone(880,.25,'square',.05)}return}
 if(state!=='playing')return;
 remaining=Math.max(0,remaining-dt);elapsed=60-remaining;novaCooldown=Math.max(0,novaCooldown-dt);
 const wave=waveAt(elapsed);if(wave!==lastWave){lastWave=wave;announce(wave===2?'WAVE 2 · TROJAN & WORM':'WAVE 3 · FINAL',1.6);tone(330,.3,'square',.05)}
 const sec=Math.ceil(remaining);if(sec<=10&&sec>0&&sec!==lastBeep){lastBeep=sec;$('clock').classList.add('urgent');tone(sec<=3?990:660,.07,'square',.04)}
 if(keys.has('ArrowLeft'))aim.x-=dt*650;if(keys.has('ArrowRight'))aim.x+=dt*650;if(keys.has('ArrowUp'))aim.y-=dt*500;if(keys.has('ArrowDown'))aim.y+=dt*500;aim.x=clamp(aim.x,20,W-20);aim.y=clamp(aim.y,100,H-80);
 const charging=mode==='demo'?manualCharge:gesturesArmed&&gesture==='fist';
 if(charging&&novaCooldown===0){charge=Math.min(1,charge+dt/1.5);novaReleaseAt=null}
 else if(mode==='demo'&&wasCharging&&!charging&&charge>=.99&&novaCooldown===0)nova();
 else if(mode==='camera'&&!charging&&charge>=.99&&novaCooldown===0){
  if(wasCharging)novaReleaseAt=now;
  if(novaReleaseAt!==null&&['point','palm','pinch'].includes(gesture)){nova();novaReleaseAt=null}
  else if(novaReleaseAt===null||now-novaReleaseAt>450){charge=0;novaReleaseAt=null}
 }else if(!charging)charge=Math.max(0,charge-dt*1.2);
 wasCharging=charging;
 const wantsShield=mode==='demo'?manualShield:cameraShield;
 if(wantsShield){
  if(shield<=0)shieldLocked=true;
  shielding=!shieldLocked&&shield>0;
  if(shielding){shield=Math.max(0,shield-24*dt);if(shield===0){shieldLocked=true;shielding=false}}
 }else{shielding=false;shield=Math.min(100,shield+22*dt);if(shield>=25)shieldLocked=false}
 const autoShot=autoFire&&gesturesArmed&&!['fist','palm'].includes(gesture)&&targetUnderAim();
 if(mode==='demo'?manualFire:gesturesArmed&&(gesture==='pinch'||autoShot))fire();
 if(!bossSpawned&&elapsed>=42)spawnBoss();
 spawnTimer-=dt;if(spawnTimer<=0){spawn();spawnTimer=Math.max(.48,1.3-elapsed*.012)*(bossAlive()?1.5:1)}
 const spawned=[];
 for(const e of enemies){
  if(e.dead)continue;e.age=(e.age??0)+dt;e.flash=Math.max(0,(e.flash??0)-dt);e.startX??=e.x;
  if(e.kind==='GOLD'){e.x+=e.vx*dt;e.y=e.baseY+Math.sin(e.age*3)*20;e.spin+=dt*3;if(e.x<-60||e.x>W+60)e.dead=true;continue}
  if(e.kind==='BOSS'){e.y+=e.v*dt;e.x=W/2+Math.sin(e.age*.6)*260;e.shootTimer-=dt;if(e.shootTimer<=0&&e.y>40){e.shootTimer=2.2;spawned.push(makeEnemy('BUG',e.x,e.y+e.r,{r:15,mini:true,v:150,sway:40}))}}
  else{e.y+=e.v*dt;e.x=e.startX+Math.sin(e.age*1.8)*(e.sway??22)}
  e.spin+=dt*.8;
  if(e.y>CORE_Y){
   const boss=e.kind==='BOSS';
   if(shielding){blocked++;score+=25*mult();burst(e.x,H-90,'#67f8d5');tone(220,.12,'sine');if(boss){e.y=150;shield=0;shieldLocked=true;shielding=false;shake=Math.max(shake,16)}else e.dead=true}
   else{health=Math.max(0,health-(boss?2:1));combo=0;feverUntil=0;shake=Math.max(shake,12);burst(e.x,H-80,'#ff7c84');tone(70,.25,'sawtooth');announce('CORE HIT',.5);if(boss)e.y=150;else e.dead=true;if(health===0)break}
  }
 }
 enemies=enemies.filter(e=>!e.dead).concat(spawned);
 for(const p of powerups){p.age+=dt;p.life-=dt;p.y=Math.min(H-110,p.y+40*dt)}powerups=powerups.filter(p=>!p.taken&&p.life>0);
 for(const p of particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=100*dt}particles=particles.filter(p=>p.life>0);
 for(const b of beams)b.life-=dt;beams=beams.filter(b=>b.life>0);
 for(const f of floaters){f.life-=dt;f.y-=50*dt}floaters=floaters.filter(f=>f.life>0);
 for(const w of waves){w.r+=2000*dt;w.life-=dt}waves=waves.filter(w=>w.life>0);
 if(health<=0||remaining<=0)finish();
}
// Hands-free booth flow: hold an open palm to start, or to replay from results.
function updateBoothHold(dt){
 const setupReady=state==='setup'&&!calibrationDraft&&!$('round-start').disabled;
 const resultReady=state==='result'&&now-resultAt>3000&&cameraReady;
 const holding=mode==='camera'&&(setupReady||resultReady)&&trackingFresh()&&latestControls?.primary?.gesture==='palm';
 holdProgress=holding?Math.min(1,holdProgress+dt/(resultReady?2:2)):Math.max(0,holdProgress-dt*2);
 if(state==='result')setValue('next-progress',holdProgress);
 if(holdProgress<1)return;
 holdProgress=0;tone(880,.2,'triangle',.05);
 if(setupReady)startRound();else $('again').onclick();
}
function circle(c,x,y,r,color,width=1){c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.strokeStyle=color;c.lineWidth=width;c.stroke()}
// Static gradient + grid are rendered once instead of ~35 strokes every frame.
function getBackdrop(){
 if(backdrop)return backdrop;
 const b=document.createElement('canvas');b.width=W;b.height=H;const c=b.getContext('2d');
 const gradient=c.createRadialGradient(640,390,10,640,390,750);gradient.addColorStop(0,'#2a655318');gradient.addColorStop(1,'#050b1680');c.fillStyle=gradient;c.fillRect(0,0,W,H);
 c.strokeStyle='#4a76631c';c.lineWidth=1;c.beginPath();for(let x=0;x<W;x+=64){c.moveTo(x,0);c.lineTo(x,H)}for(let y=0;y<H;y+=64){c.moveTo(0,y);c.lineTo(W,y)}c.stroke();
 return backdrop=b;
}
function drawEnemy(e){
 const k=kindOf(e);ctx.save();ctx.translate(e.x,e.y);ctx.rotate(e.spin??0);
 const color=e.flash>0?'#ffffff':k.color;ctx.shadowColor=color;ctx.shadowBlur=enemies.length<30?12:0;ctx.strokeStyle=color;ctx.fillStyle=k.color+(e.flash>0?'88':'22');ctx.lineWidth=k.boss?4:2;
 ctx.beginPath();for(let i=0;i<k.sides;i++){const a=i*Math.PI*2/k.sides,r=k.boss&&i%2?e.r*.82:e.r;i?ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r):ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r)}ctx.closePath();ctx.fill();ctx.stroke();
 ctx.shadowBlur=0;circle(ctx,0,0,k.boss?20:8,'#ffdcad',2);ctx.restore();
 if(k.boss)return;
 ctx.fillStyle=k.gold?'#ffe066':'#e9cda8';ctx.font='12px monospace';ctx.textAlign='center';ctx.fillText(k.gold?'BONUS':e.kind??'VIRUS',e.x,e.y+e.r+19);
 if((e.maxHp??1)>1)for(let i=0;i<e.maxHp;i++){ctx.fillStyle=i<e.hp?k.color:'#33414e';ctx.fillRect(e.x-e.maxHp*7+i*14,e.y-e.r-14,11,4)}
}
function drawBossBar(){
 const boss=enemies.find(e=>!e.dead&&e.kind==='BOSS');if(!boss)return;
 ctx.fillStyle='#07131cd0';ctx.fillRect(W/2-220,92,440,26);ctx.fillStyle='#33414e';ctx.fillRect(W/2-210,104,420,8);ctx.fillStyle='#ff5d6c';ctx.fillRect(W/2-210,104,420*clamp(boss.hp/boss.maxHp,0,1),8);
 ctx.font='bold 11px monospace';ctx.textAlign='center';ctx.fillStyle='#ffb3ba';ctx.fillText('MEGA VIRUS',W/2,100);
}
function render(){
 ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#0b1723';ctx.fillRect(0,0,W,H);
 if(shake>0)ctx.translate(rand(-shake,shake),rand(-shake,shake));
 if(cameraReady&&video.readyState>=2){ctx.save();ctx.globalAlpha=state==='setup'?.8:.24;ctx.translate(W,0);ctx.scale(-1,1);ctx.drawImage(video,0,0,W,H);ctx.restore()}
 ctx.drawImage(getBackdrop(),0,0);
 ctx.fillStyle=fever()?'#ff7ad9aa':'#9fd8ff66';for(const s of stars)ctx.fillRect(s.x,s.y,s.s,s.s*(fever()?6:1));
 if(fever()){ctx.fillStyle='#ff3db812';ctx.fillRect(0,0,W,H)}
 ctx.strokeStyle=shielding?'#67f8d5':'#67f8d548';ctx.lineWidth=shielding?5:2;ctx.beginPath();ctx.moveTo(0,H-77);ctx.lineTo(W,H-77);ctx.stroke();
 if(['setup','playing','countdown','paused'].includes(state)){
  for(const h of landmarks)drawHand(ctx,h,W,H,h.role==='ignored'?.3:state==='setup'?.85:.5);
  if(state==='setup')drawGesturePractice();
  for(const e of enemies)drawEnemy(e);
  drawBossBar();
  for(const p of powerups){const info=POWERUPS[p.kind],pulse=1+Math.sin(p.age*6)*.08;ctx.save();ctx.globalAlpha=p.life<1.5?.4+Math.abs(Math.sin(p.age*10))*.6:1;circle(ctx,p.x,p.y,p.r*pulse,info.color,3);ctx.fillStyle=info.color+'22';ctx.fill();ctx.fillStyle=info.color;ctx.font='bold 24px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(info.icon,p.x,p.y+1);ctx.restore()}
  for(const b of beams){const color=b.color??(fever()?'#ff7ad9':'#67f8d5'),max=b.color?.2:.16;ctx.save();ctx.globalAlpha=b.life/max;ctx.strokeStyle=color;ctx.shadowColor=color;ctx.shadowBlur=18;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(b.fromX??W/2,b.fromY??H-76);ctx.lineTo(b.x,b.y);ctx.stroke();circle(ctx,b.x,b.y,12+(1-b.life/max)*50,color,2);ctx.restore()}
  for(const p of particles){ctx.globalAlpha=clamp(p.life*2,0,1);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,3,3)}ctx.globalAlpha=1;
  ctx.textAlign='center';for(const f of floaters){ctx.globalAlpha=clamp(f.life/.7,0,1);ctx.font=f.big?'bold 34px monospace':'bold 22px monospace';ctx.fillStyle=f.color??'#67f8d5';ctx.fillText(f.text,f.x,f.y)}ctx.globalAlpha=1;
  for(const w of waves){ctx.globalAlpha=w.life/.65;circle(ctx,w.x,w.y,w.r,'#ffbd73',6);ctx.globalAlpha=1}
  const color=shielding?'#67f8d5':charge>0?'#ffbd73':fever()?'#ff7ad9':'#dffff7';circle(ctx,aim.x,aim.y,23,color,2);circle(ctx,aim.x,aim.y,4,color,2);ctx.strokeStyle=color;ctx.beginPath();for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ctx.moveTo(aim.x+dx*29,aim.y+dy*29);ctx.lineTo(aim.x+dx*38,aim.y+dy*38)}ctx.stroke();if(shielding)circle(ctx,aim.x,aim.y,85+Math.sin(now/160)*4,'#67f8d5',3);
  if(charge>0){ctx.beginPath();ctx.arc(aim.x,aim.y,42,-Math.PI/2,-Math.PI/2+Math.PI*2*charge);ctx.strokeStyle='#ffbd73';ctx.lineWidth=5;ctx.stroke()}
 }
 if(now>annUntil&&annText){annText='';setText('announcement','')}
}
// The loop keeps running even if a single frame throws, so the game never freezes.
function tick(t){
 try{
  now=t;updateCalibrationClock(t);if(state==='setup'&&!trackingFresh()){$('round-start').disabled=true;$('calibration-capture').disabled=true;if(cameraReady)updateGestureFeedback(null)}
  const gap=Math.max(0,(t-last)/1000);last=t;if(gap>.75&&['playing','countdown'].includes(state))pauseGame();
  if(cameraReady&&!document.hidden)void requestFrame();
  const dt=Math.min(gap,.25);update(dt);updateBoothHold(dt);render();updateHUD();musicTick();loopErrors=0;
 }catch(error){if(++loopErrors<5)console.error(error)}
 requestAnimationFrame(tick);
}
function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function boardKey(kind){return 'vision-arena-002:'+today()+':'+kind}
function readBoard(kind){try{const rows=JSON.parse(localStorage.getItem(boardKey(kind))||'[]');return Array.isArray(rows)?rows.filter(x=>typeof x.name==='string'&&Number.isFinite(x.score)&&x.score>=0).sort((a,b)=>b.score-a.score).slice(0,10):[]}catch{return []}}
function boardRow(i,row){const el=document.createElement('div');el.className='board-row';for(const [cls,text] of [['rank',String(i+1).padStart(2,'0')],['name',row.name],['points',row.score.toLocaleString('id-ID')]]){const span=document.createElement('span');span.className=cls;span.textContent=text;el.append(span)}return el}
function renderBoard(){
 $('board-date').textContent=new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'short'}).format(new Date());
 for(const kind of ['camera','demo']){$('board-'+kind).classList.toggle('selected',kind===boardMode);$('board-'+kind).setAttribute('aria-pressed',String(kind===boardMode))}
 const list=$('board-list');list.replaceChildren();const rows=readBoard(boardMode);
 if(!rows.length){const p=document.createElement('p');p.className='empty';p.textContent=boardMode==='demo'?'Belum ada skor latihan. Coba satu ronde.':'Arena belum punya juara. Jadilah pemain pertama.';list.append(p)}
 for(const [i,row] of rows.entries())list.append(boardRow(i,row));
 const stageList=$('stage-board-list');stageList.replaceChildren();const top=readBoard('camera').slice(0,5);
 if(!top.length){const p=document.createElement('p');p.className='empty';p.textContent='Belum ada juara hari ini.';stageList.append(p)}
 for(const [i,row] of top.entries())stageList.append(boardRow(i,row));
}
$('save-score').addEventListener('submit',e=>{e.preventDefault();if(saved||!roundCompleted)return;const name=$('player-name').value.trim();if(!name){$('player-name').setCustomValidity('Masukkan nama pemain.');$('player-name').reportValidity();return}const rows=readBoard(mode);rows.push({name:name.slice(0,18),score});rows.sort((a,b)=>b.score-a.score);try{localStorage.setItem(boardKey(mode),JSON.stringify(rows.slice(0,10)));saved=true;show('save-score',false);$('save-info').textContent='Skor tersimpan di perangkat ini.';boardMode=mode;renderBoard()}catch{$('save-info').textContent='Skor belum tersimpan. Penyimpanan tidak tersedia.'}});
$('player-name').addEventListener('input',()=> $('player-name').setCustomValidity(''));
$('calibration-start').onclick=beginCalibration;$('calibration-capture').onclick=captureCalibration;$('calibration-cancel').onclick=()=>cancelCalibration(true);$('calibration-reset').onclick=()=>{handControls.setCalibration(null);cancelCalibration();$('calibration-status').textContent='Setelan standar aktif. Kalibrasi bisa diulang kapan saja.';show('calibration-reset',false);};
$('camera-start').onclick=enableCamera;$('camera-retry').onclick=enableCamera;$('demo-start').onclick=enterDemo;$('round-start').onclick=startRound;$('setup-back').onclick=goHome;$('pause').onclick=()=>pauseGame();$('resume').onclick=resumeGame;$('exit-round').onclick=goHome;$('home').onclick=goHome;$('again').onclick=()=>{if(mode==='camera'&&!cameraReady){void enableCamera()}else if(mode==='camera'&&!trackingFresh()){setState('setup');overlays('setup-overlay');$('round-start').disabled=true;$('setup-title').textContent='Tunjukkan tanganmu kembali';$('setup-info').textContent='Setelah tangan terdeteksi, kamu bisa memulai ronde baru.'}else startRound()};
for(const kind of ['camera','demo'])$('board-'+kind).onclick=()=>{boardMode=kind;renderBoard()};
$('board-reset').onclick=()=>{if(typeof confirm==='function'&&!confirm('Hapus skor '+(boardMode==='demo'?'latihan':'kamera')+' hari ini?'))return;try{localStorage.removeItem(boardKey(boardMode))}catch{}renderBoard()};
function syncSound(){for(const id of ['sound','stage-sound']){$(id).textContent=sound?'Suara on':'Suara off';$(id).setAttribute('aria-pressed',String(sound));$(id).setAttribute('aria-label',sound?'Matikan suara':'Aktifkan suara')}}
function toggleSound(){sound=!sound;syncSound();if(sound)tone()}
async function toggleFullscreen(){try{if(desktop?.toggleFullscreen){await desktop.toggleFullscreen();return}if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{$('status').textContent='Layar penuh tidak tersedia di perangkat ini.'}}
$('sound').onclick=toggleSound;$('stage-sound').onclick=toggleSound;$('fullscreen').onclick=toggleFullscreen;$('stage-fullscreen').onclick=toggleFullscreen;
$('autofire-toggle').onclick=()=>{autoFire=!autoFire;writeFlag('vision-arena:autofire',autoFire);syncAutoFire()};
$('stage-toggle').onclick=()=>{stage=!stage;applyStage()};$('stage-exit').onclick=()=>{stage=false;applyStage()};
function pointerAim(e){if(mode!=='demo')return;const r=canvas.getBoundingClientRect();aim={x:clamp((e.clientX-r.left)/r.width*W,20,W-20),y:clamp((e.clientY-r.top)/r.height*H,100,H-80)}}
function syncActions(){
 manualFire=heldActions.fire.size>0;manualShield=heldActions.shield.size>0;manualCharge=heldActions.charge.size>0;
 for(const [id,active] of [['demo-fire',manualFire],['demo-shield',manualShield],['demo-charge',manualCharge]]){$(id).classList.toggle('held',active);$(id).setAttribute('aria-pressed',String(active))}
}
function setAction(kind,source,on){if(on)heldActions[kind].add(source);else heldActions[kind].delete(source);syncActions()}
function releasePointer(e){for(const set of Object.values(heldActions))for(const source of set)if(source.startsWith('pointer:'+e.pointerId+':'))set.delete(source);syncActions()}
function resetInputs(){for(const set of Object.values(heldActions))set.clear();keys.clear();syncActions()}
function acceptsInput(){return mode==='demo'&&['playing','countdown'].includes(state)}
function mouseButtons(e){if(e.pointerType!=='mouse'||e.buttons===undefined)return;setAction('fire','pointer:'+e.pointerId+':fire',!!(e.buttons&1));setAction('shield','pointer:'+e.pointerId+':shield',!!(e.buttons&2))}
canvas.addEventListener('pointermove',e=>{if(acceptsInput()){pointerAim(e);mouseButtons(e)}});
canvas.addEventListener('pointerdown',e=>{
 if(!acceptsInput()||![0,2].includes(e.button))return;e.preventDefault();pointerAim(e);canvas.setPointerCapture(e.pointerId);
 const kind=e.button===2?'shield':'fire';setAction(kind,'pointer:'+e.pointerId+':'+kind,true);mouseButtons(e);canvas.focus({preventScroll:true});
});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('pointerup',releasePointer);window.addEventListener('pointercancel',releasePointer);canvas.addEventListener('lostpointercapture',releasePointer);
function holdButton(id,kind){
 const button=$(id);
 button.addEventListener('pointerdown',e=>{if(!acceptsInput())return;e.preventDefault();button.setPointerCapture(e.pointerId);setAction(kind,'pointer:'+e.pointerId+':'+kind,true)});
 button.addEventListener('pointerup',releasePointer);button.addEventListener('pointercancel',releasePointer);button.addEventListener('lostpointercapture',releasePointer);
 button.addEventListener('keydown',e=>{if(!acceptsInput()||!['Enter',' '].includes(e.key))return;e.preventDefault();setAction(kind,'button:'+id+':'+e.key,true)});
 button.addEventListener('keyup',e=>{if(!['Enter',' '].includes(e.key))return;e.preventDefault();setAction(kind,'button:'+id+':'+e.key,false)});
 button.addEventListener('blur',()=>{for(const source of heldActions[kind])if(source.startsWith('button:'+id+':'))heldActions[kind].delete(source);syncActions()});
}
holdButton('demo-fire','fire');holdButton('demo-shield','shield');holdButton('demo-charge','charge');
function keyAction(key){return key==='Enter'?'fire':key===' '?'charge':key.toLowerCase()==='s'?'shield':null}
window.addEventListener('keydown',e=>{
 if(['INPUT','TEXTAREA'].includes(e.target.tagName)||e.target.isContentEditable)return;
 if(e.key==='Escape'){e.preventDefault();if(!e.repeat)state==='paused'?resumeGame():pauseGame();return}
 if(e.target.tagName==='BUTTON'||!acceptsInput()||e.altKey||e.ctrlKey||e.metaKey)return;
 if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','Enter','s','S'].includes(e.key))return;
 e.preventDefault();const key=e.key.toLowerCase()==='s'?'s':e.key;
 if(e.repeat&&!keys.has(key))return;keys.add(key);const kind=keyAction(key);if(kind)setAction(kind,'keyboard:'+key,true);
});
window.addEventListener('keyup',e=>{const key=e.key.toLowerCase()==='s'?'s':e.key;keys.delete(key);const kind=keyAction(key);if(kind)setAction(kind,'keyboard:'+key,false)});
window.addEventListener('blur',()=>{resetInputs();if(mode==='demo')pauseGame()});
document.addEventListener('visibilitychange',()=>{if(document.hidden){resetInputs();pauseGame()}});
window.addEventListener('pagehide',()=>{resetInputs();pauseGame();stopCamera()});
window.addEventListener('pageshow',e=>{if(e.persisted&&mode==='camera'&&state!=='menu'&&state!=='result'){setState('setup');overlays('setup-overlay');show('camera-retry');$('setup-title').textContent='Aktifkan kamera kembali';$('setup-info').textContent='Kamera dihentikan saat kamu meninggalkan halaman.'}});
if(document.modelContext?.registerTool){try{Promise.resolve(document.modelContext.registerTool({name:'read_arena_state',description:'Read round status and today’s device-local leaderboard. Does not activate the camera or play a round.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:input=>{if(!input||Object.keys(input).length)throw new Error('Expected an empty object');return{state,mode,score,remaining:Math.ceil(remaining),health,leaderboard:readBoard(boardMode)}}})).catch(()=>{})}catch{}}
if(desktop)$('app-edition').textContent='DESKTOP APP';
applyStage();syncSound();syncAutoFire();renderBoard();drawMap();requestAnimationFrame(tick);
