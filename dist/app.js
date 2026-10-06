import {CONNECTIONS,HandControls,GestureCalibration} from './gestures.mjs?v=3';
const $=id=>document.getElementById(id),canvas=$('game'),ctx=canvas.getContext('2d'),map=$('hand-map'),mctx=map.getContext('2d'),video=$('camera');
const W=1280,H=720,labels={pinch:'ENERGY BLAST',point:'AIM LOCK',palm:'SHIELD ACTIVE',fist:'CHARGING NOVA',idle:'BIDIK BEBAS'};
let state='menu',mode='camera',boardMode='camera',worker,stream,cameraReady=false,workerBusy=false,workerReady=false,session=0,initTimer,frameTimer,lastInference=0,lastVideoTime=-1,lastDetection=0,landmarks=[],trackingRates=[],last=performance.now(),now=last,elapsed=0,remaining=60,score=0,combo=0,maxCombo=0,hits=0,blocked=0,health=5,shield=100,charge=0,novaCooldown=0,lastShot=-1e6,spawnTimer=0,countdown=0,autoPaused=false,shielding=false,manualShield=false,manualCharge=false,manualFire=false,aim={x:640,y:390},hands=[],candidate='idle',candidateSince=0,gesture='idle',enemies=[],particles=[],beams=[],floaters=[],waves=[],saved=false,annUntil=0,sound=false,audio,keys=new Set(),roundCompleted=false;
const rand=(a,b)=>a+Math.random()*(b-a),clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const handControls=new HandControls();
const heldActions={fire:new Set(),shield:new Set(),charge:new Set()};
let novaReleaseAt=null,calibrationDraft=null,calibrationStep=0,calibrationRecording=null,latestControls=null;
const triedGestures=new Set();
const poseNames={point:'BIDIK',pinch:'TEMBAK',palm:'SHIELD',fist:'NOVA',idle:'BIDIK BEBAS'};
const calibrationSteps=[
 {kind:'point',icon:'☝',name:'Bidik',help:'Telunjuk tegak, tiga jari lain dilipat. Telapak menghadap kamera. Geser seluruh tangan untuk membidik.'},
 {kind:'pinch',icon:'🤏',name:'Tembak',help:'Sentuhkan ujung ibu jari dan telunjuk. Biarkan tiga jari lain terbuka. Tahan bentuk ini.'},
 {kind:'palm',icon:'✋',name:'Shield',help:'Buka kelima jari. Hadapkan telapak ke kamera dan beri jarak antarjari.'},
 {kind:'fist',icon:'✊',name:'Nova',help:'Kepalkan keempat jari. Letakkan ibu jari di luar kepalan, lalu tahan.'}
];
let mainTracker=null,mainTracking=false,trackerFallback=false,bitmapFailures=0,cameraShield=false,gesturesArmed=true,wasCharging=false,shieldLocked=false,trackingRecoveredAt=null;
function show(id,visible=true){$(id).classList.toggle('hidden',!visible)}
function announce(text,seconds=1.5){$('announcement').textContent=text;annUntil=now+seconds*1000}
function tone(freq=400,dur=.1,type='sine',vol=.05){if(!sound)return;try{audio??=new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')void audio.resume().catch(()=>{});const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(40,freq/2),audio.currentTime+dur);g.gain.setValueAtTime(vol,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+dur);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+dur)}catch{}}
function overlays(id){for(const x of ['start-overlay','setup-overlay','pause-overlay','result-overlay'])show(x,x===id)}
function setState(s){state=s;$('arena').classList.toggle('is-setup',s==='setup');show('pause',s==='playing'||s==='countdown');show('demo-controls',mode==='demo'&&['playing','countdown','paused'].includes(s));$('mode-label').textContent=mode==='demo'?'MOUSE TRAINING':'CAMERA ARENA'}
function stopCamera(){
 cancelCalibration();latestControls=null;novaReleaseAt=null;
 session++;clearTimeout(initTimer);clearTimeout(frameTimer);worker?.terminate();worker=null;
 try{mainTracker?.close()}catch{}mainTracker=null;mainTracking=trackerFallback=false;
 stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;
 cameraReady=workerReady=workerBusy=false;landmarks=[];hands=[];gesture='idle';cameraShield=false;
 lastVideoTime=-1;lastInference=0;lastDetection=-Infinity;trackingRates=[];trackingRecoveredAt=null;bitmapFailures=0;handControls.reset();
 $('live-label').textContent='OFFLINE';$('live-label').classList.remove('active');for(const id of ['hands-count','nodes','fps','latency'])$(id).textContent='—';
 $('feed-status').textContent='HAND LANDMARK SYSTEM';$('round-start').disabled=true;$('calibration-start').disabled=true;updateGestureFeedback(null);drawMap();
}
function cameraFailure(message){
 stopCamera();resetInputs();charge=0;wasCharging=false;shielding=false;
 $('setup-title').textContent='Kamera belum siap';$('setup-info').textContent=message;$('status').textContent=message;show('camera-retry');
 if(state!=='result'&&state!=='menu'){setState('setup');overlays('setup-overlay');announce('')}
}
function trackingFresh(){return cameraReady&&hands.length>0&&now-lastDetection<=350}
function trackerReady(){
 clearTimeout(initTimer);cameraReady=true;$('live-label').textContent='LIVE';$('live-label').classList.add('active');
 $('setup-title').textContent='Coba bidik dan jepit dahulu';$('setup-info').textContent='Lihat nama gestur di layar. Lingkaran adalah titik tembakmu.';$('calibration-start').disabled=false;show('camera-retry',false);
}
function processTracking(data,at=performance.now()){
 const controls=handControls.update(data,at,(video.videoWidth||1280)/(video.videoHeight||720));
 latestControls=controls;landmarks=controls.hands.map(h=>h.p);hands=controls.primary?controls.hands:[];
 trackingRates.push(at);trackingRates=trackingRates.filter(t=>t>at-1000);
 $('hands-count').textContent=String(landmarks.length);$('nodes').textContent=String(landmarks.length*21);$('fps').textContent=trackingRates.length+' fps';$('latency').textContent=Math.round(data.latency??0)+' ms';$('feed-status').textContent=hands.length?'LANDMARKS DETECTED':'SEARCHING FOR HANDS';
 if(controls.primary){
  lastDetection=at;trackingRecoveredAt??=at;
  aim.x=clamp(controls.aim.x*W,20,W-20);aim.y=clamp(controls.aim.y*H,100,H-80);
  gesture=controls.primary.gesture;cameraShield=controls.shield;
  if(gesture==='point'||gesture==='palm')gesturesArmed=true;
 }else{gesture='idle';cameraShield=false;trackingRecoveredAt=null;charge=0;wasCharging=false}
 updateGestureFeedback(controls);
 if(state==='setup'){
  $('round-start').disabled=!hands.length||!!calibrationDraft;
  $('setup-title').textContent=hands.length?'Tes gerakanmu di arena':'Tunjukkan tangan bidikmu';
  $('setup-info').textContent=hands.length?'Geser lingkaran, lalu jepit. Keempat label akan ditandai saat gerakannya berhasil terbaca.':'Seluruh tangan perlu terlihat. Cari cahaya terang dan beri jarak dari kamera.';
  $('calibration-capture').disabled=!!calibrationRecording||!hands.length||controls.hands.length!==1;
  collectCalibration(controls,at);
 }

 drawMap();
}
function updateGestureFeedback(controls){
 const primary=controls?.primary;
 const current=primary?.gesture??'idle';
 const name=primary?poseNames[current]:'BELUM ADA TANGAN';
 const pending=primary&&current==='idle'&&primary.raw!=='idle';
 $('setup-live').textContent=pending?'TAHAN · '+poseNames[primary.raw]:name;
 $('gesture-live').textContent=pending?'MENGENALI '+poseNames[primary.raw]:name;
 const hints={point:'Bidik terbaca. Geser tangan untuk menggerakkan lingkaran.',pinch:'Jepitan terbaca. Tahan untuk menembak; lepas untuk berhenti.',palm:'Telapak terbuka terbaca. Shield aktif selama energi tersedia.',fist:'Kepalan terbaca. Tahan sampai READY, lalu buka telapak.',idle:'Lingkaran tetap bisa dibidik. Tegakkan telunjuk dan hadapkan telapak ke kamera.'};
 $('gesture-detail').textContent=primary?(pending?'Pertahankan bentuk sebentar agar aksinya tidak tertukar.':hints[current]):'Tampilkan seluruh tangan dengan cahaya terang. Angkat tangan bidik lebih dulu.';
 const second=controls?.hands.find(h=>h.id!==primary?.id);
 $('secondary-gesture').textContent=second?'Tangan kedua: '+poseNames[second.gesture]:'';
 if(state==='setup'&&primary&&current!=='idle')triedGestures.add(current);
 for(const step of calibrationSteps){
  const el=$('test-'+step.kind);el.classList.toggle('seen',triedGestures.has(step.kind));el.classList.toggle('active',!!primary&&current===step.kind);
  el.textContent=step.icon+' '+step.name+(triedGestures.has(step.kind)?' ✓':'');
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
 $('calibration-capture').disabled=!trackingFresh()||latestControls?.hands.length!==1;
}
function captureCalibration(){
 if(!calibrationDraft||calibrationRecording||!trackingFresh()||latestControls?.hands.length!==1)return;
 const at=performance.now();calibrationRecording={start:at+2000,end:at+3200,samples:[],handId:null,invalid:false};
 $('calibration-capture').disabled=true;$('calibration-info').textContent='Siapkan gerakan…';
}
function collectCalibration(controls,at){
 const recording=calibrationRecording;
 if(!recording||at<recording.start||at>recording.end)return;
 if(controls.hands.length!==1||!controls.primary?.features){recording.invalid=true;return}
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
 ctx.restore();
}
async function useMainTracker(generation){
 if(generation!==session||trackerFallback)return;
 trackerFallback=true;clearTimeout(initTimer);clearTimeout(frameTimer);worker?.terminate();worker=null;workerReady=workerBusy=cameraReady=false;
 hands=[];landmarks=[];gesture='idle';cameraShield=false;lastDetection=-Infinity;trackingRecoveredAt=null;charge=0;wasCharging=false;
 $('setup-info').textContent='Menyesuaikan pelacak dengan browsermu…';$('status').textContent='Menyesuaikan pelacak tangan. Permainan dijeda sementara.';
 initTimer=setTimeout(()=>{if(generation===session)cameraFailure('Pelacak belum selesai dimuat. Periksa koneksi, lalu pilih Coba kamera lagi.')},45000);
 try{
  const {GestureRecognizer,FilesetResolver}=await import('./vendor/vision_bundle.mjs');
  if(generation!==session)return;
  const files=await FilesetResolver.forVisionTasks('./vendor/wasm');
  if(generation!==session)return;
  const detector=await GestureRecognizer.createFromOptions(files,{baseOptions:{modelAssetPath:'./vendor/gesture_recognizer.task',delegate:'CPU'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.5,minHandPresenceConfidence:.5,minTrackingConfidence:.5});
  if(generation!==session){detector.close();return}
  mainTracker=detector;mainTracking=true;lastVideoTime=-1;trackerReady();
 }catch(error){if(generation===session)cameraFailure('Pelacak tangan tidak dapat dimulai. Coba buka link langsung di browser, atau gunakan latihan mouse.')}
}
async function enableCamera(){
 stopCamera();resetInputs();mode='camera';setState('setup');overlays('setup-overlay');show('camera-retry',false);$('setup-title').textContent='Menyiapkan pelacak tangan';$('setup-info').textContent='Izinkan kamera. Model tangan sedang dimuat…';$('round-start').disabled=true;const generation=session;
 if(!navigator.mediaDevices?.getUserMedia){cameraFailure('Browser ini tidak mendukung kamera. Buka dengan Chrome atau Edge melalui link HTTPS.');return}
 try{
  const requested=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720},facingMode:'user',frameRate:{ideal:30}},audio:false});
  if(generation!==session){requested.getTracks().forEach(t=>t.stop());return}
  stream=requested;video.srcObject=stream;await video.play();if(generation!==session)return;
  for(const track of stream.getTracks())track.addEventListener('ended',()=>{if(generation===session)cameraFailure('Kamera terputus. Sambungkan kembali lalu pilih Coba kamera lagi.')});
  if(typeof Worker==='undefined'||typeof createImageBitmap!=='function'||typeof OffscreenCanvas==='undefined'){await useMainTracker(generation);return}
  try{worker=new Worker('./tracker-worker.js?v=3')}catch{await useMainTracker(generation);return}
  initTimer=setTimeout(()=>{if(generation===session)void useMainTracker(generation)},40000);
  worker.onerror=()=>{if(generation===session)void useMainTracker(generation)};
  worker.onmessage=({data})=>{
   if(generation!==session||trackerFallback)return;
   if(data.type==='ready'){workerReady=true;trackerReady()}
   if(data.type==='error'){void useMainTracker(generation);return}
   if(data.type==='result'){clearTimeout(frameTimer);workerBusy=false;bitmapFailures=0;processTracking(data)}
  };
  worker.postMessage({type:'init'});
 }catch(e){if(generation!==session)return;const message=e.name==='NotAllowedError'?'Akses kamera belum diizinkan. Izinkan kamera di pengaturan browser lalu coba lagi.':e.name==='NotFoundError'?'Kamera tidak ditemukan. Sambungkan webcam atau pakai perangkat berkamera.':e.name==='NotReadableError'?'Kamera sedang dipakai aplikasi lain. Tutup aplikasi itu lalu coba lagi.':'Kamera tidak bisa dibuka. Periksa pengaturan kamera dan coba kembali.';cameraFailure(message)}
}
async function requestFrame(){
 if(document.hidden||(!workerReady&&!mainTracking)||workerBusy||video.readyState<2||now-lastInference<(mainTracking?85:50)||video.currentTime===lastVideoTime)return;
 workerBusy=true;lastInference=now;lastVideoTime=video.currentTime;const generation=session;
 try{
  if(mainTracking){const t=performance.now();const result=mainTracker.recognizeForVideo(video,t);workerBusy=false;processTracking({...result,latency:performance.now()-t});return}
  const bitmap=await createImageBitmap(video);if(generation!==session||!worker){bitmap.close();return}
  worker.postMessage({type:'frame',bitmap,timestamp:performance.now()},[bitmap]);
  frameTimer=setTimeout(()=>{if(generation===session)void useMainTracker(generation)},6000);
 }catch{
  if(generation!==session)return;workerBusy=false;
  if(mainTracking)cameraFailure('Tracking kamera terhenti. Pilih Coba kamera lagi.');
  else if(++bitmapFailures>=3)void useMainTracker(generation);
 }
}
function drawMap(){mctx.clearRect(0,0,360,190);mctx.strokeStyle='#203a43';mctx.lineWidth=1;for(let x=0;x<360;x+=30){mctx.beginPath();mctx.moveTo(x,0);mctx.lineTo(x,190);mctx.stroke()}for(let y=0;y<190;y+=30){mctx.beginPath();mctx.moveTo(0,y);mctx.lineTo(360,y);mctx.stroke()}for(const p of landmarks)drawHand(mctx,p,360,190,1);if(!landmarks.length){mctx.strokeStyle='#41645f';mctx.beginPath();mctx.arc(180,84,40,0,Math.PI*2);mctx.stroke();mctx.beginPath();mctx.moveTo(165,84);mctx.lineTo(195,84);mctx.moveTo(180,69);mctx.lineTo(180,99);mctx.stroke()}}
function drawHand(c,p,w,h,alpha=1){c.save();c.globalAlpha=alpha;c.strokeStyle='#67f8d5';c.lineWidth=2;c.shadowBlur=8;c.shadowColor='#67f8d5';for(const [a,b] of CONNECTIONS){c.beginPath();c.moveTo((1-p[a].x)*w,p[a].y*h);c.lineTo((1-p[b].x)*w,p[b].y*h);c.stroke()}c.fillStyle='#ddfff7';for(const l of p){c.beginPath();c.arc((1-l.x)*w,l.y*h,3,0,Math.PI*2);c.fill()}c.restore()}
function startRound(){
 if(mode==='camera'&&(!trackingFresh()||calibrationDraft))return;
 resetInputs();score=combo=maxCombo=hits=blocked=0;health=5;shield=100;shieldLocked=false;charge=0;wasCharging=false;novaReleaseAt=null;gesturesArmed=mode==='demo'||gesture==='point'||gesture==='palm';
 elapsed=0;remaining=60;novaCooldown=0;spawnTimer=.2;countdown=3;enemies=[];particles=[];beams=[];waves=[];floaters=[];shielding=false;
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
 $('pause-info').textContent=auto?'Waktu dan ancaman berhenti. Tampilkan tangan bidik dengan stabil untuk melanjutkan.':'Waktu berhenti sampai kamu melanjutkan.';show('resume',!auto);
 if(!auto)$('resume').focus({preventScroll:true});
}
function resumeGame(){
 if(state!=='paused'||document.hidden)return;
 if(mode==='camera'&&!trackingFresh()){$('pause-info').textContent='Tunjukkan tangan ke kamera untuk melanjutkan.';return}
 autoPaused=false;resetInputs();setState(countdown>0?'countdown':'playing');overlays(null);canvas.focus({preventScroll:true});
 if(mode==='camera')$('status').textContent='Lepas jepitan atau kepalan dahulu, lalu lakukan gerakan lagi untuk menyerang.';
}
function goHome(){stopCamera();resetInputs();mode='camera';boardMode='camera';setState('menu');overlays('start-overlay');show('demo-controls',false);$('mode-label').textContent='CAMERA ARENA';$('status').textContent='Siap saat kamu siap.';$('announcement').textContent='';annUntil=0;enemies=[];particles=[];beams=[];floaters=[];waves=[];score=0;health=5;remaining=60;charge=0;shield=100;shieldLocked=false;wasCharging=false;shielding=false;roundCompleted=false;saved=false;gesture='idle';renderBoard();updateHUD()}
function burst(x,y,color,n=20){for(let i=0;i<n;i++){const a=rand(0,Math.PI*2),v=rand(80,330);particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:rand(.3,.7),color})}}
function destroy(enemy,points,nova=false){if(enemy.dead)return;enemy.dead=true;score+=points;hits++;if(!nova){combo++;maxCombo=Math.max(maxCombo,combo)}floaters.push({x:enemy.x,y:enemy.y,text:'+'+points,life:.7});burst(enemy.x,enemy.y,nova?'#ffbd73':'#67f8d5');tone(680+combo*15,.08,'triangle');if(combo>0&&combo%5===0&&!nova)announce('COMBO ×'+combo,1)}
function fire(){if(state!=='playing'||now-lastShot<220||(mode==='camera'&&!trackingFresh()))return;lastShot=now;const {x,y}=aim;let target=null,dmin=Infinity;for(const e of enemies){if(e.dead)continue;const d=Math.hypot(e.x-x,e.y-y);if(d<e.r+56&&d<dmin){dmin=d;target=e}}beams.push({x:target?.x??x,y:target?.y??y,life:.16});tone(300,.08,'sawtooth',.025);if(target)destroy(target,100+Math.min(combo,20)*10);else{burst(x,y,'#70918f',5)}}
function nova(){if(state!=='playing'||charge<.99||novaCooldown>0)return;waves.push({x:aim.x,y:aim.y,r:20,life:.65});for(const e of enemies)destroy(e,70,true);charge=0;novaCooldown=5;announce('NOVA RELEASED',1.2);tone(100,.6,'sawtooth',.08)}
function spawn(){const wave=Math.min(3,1+Math.floor(elapsed/20)),x=rand(95,W-95),y=-50;enemies.push({x,y,startX:x,v:rand(62,90)+wave*17,r:rand(24,34),spin:rand(0,6.28),age:0,dead:false,kind:Math.random()>.65?'BUG':'VIRUS'})}
function updateHUD(){ $('score').textContent=String(score).padStart(5,'0');$('clock').textContent=Math.ceil(remaining)+'s';$('phase').textContent=state==='playing'?'WAVE 0'+Math.min(3,1+Math.floor(elapsed/20)):state==='countdown'?'GET READY':state==='paused'?'PAUSED':state==='result'?'COMPLETE':'STANDBY';[...$('health').children].forEach((p,i)=>p.classList.toggle('lost',i>=health));$('health').setAttribute('aria-label',`Nyawa ${health} dari 5`);$('charge').value=charge;$('charge-label').textContent=novaCooldown>0?Math.ceil(novaCooldown)+'s':charge>=.99?'READY':Math.round(charge*100)+'%';$('shield').value=shield;$('gesture-display').textContent=shieldLocked?'SHIELD HABIS · LEPAS TELAPAK':mode==='demo'?(manualCharge?'CHARGING NOVA':shielding?'SHIELD ACTIVE':'MOUSE TRAINING'):(gesture==='pinch'&&shielding?'BLAST + SHIELD':(!trackingFresh()?'TUNJUKKAN TANGAN':labels[gesture]??'BIDIK BEBAS'))}
function finish(){roundCompleted=true;resetInputs();charge=0;wasCharging=false;shielding=false;setState('result');overlays('result-overlay');$('result-heading').textContent=mode==='demo'?'TRAINING COMPLETE':'ROUND COMPLETE';$('result-score').textContent=score.toLocaleString('id-ID');$('result-summary').textContent=`${hits} target · combo tertinggi ${maxCombo} · ${blocked} shield block`;$('status').textContent=health<=0?'Core kehabisan nyawa. Coba lagi!':'Ronde selesai. Simpan skor dan tantang temanmu.';announce('');tone(480,.4,'triangle')}
function update(dt){
 if(state==='paused'&&autoPaused&&!document.hidden&&trackingFresh()&&trackingRecoveredAt!==null&&now-trackingRecoveredAt>=350){resumeGame();announce('TRACKING KEMBALI',1)}
 if((state==='playing'||state==='countdown')&&mode==='camera'&&!trackingFresh()){
  charge=0;wasCharging=false;novaReleaseAt=null;shielding=false;gesturesArmed=false;
  if(now-lastDetection>650)pauseGame(true);else if($('announcement').textContent!=='TUNJUKKAN TANGAN')announce('TUNJUKKAN TANGAN',1);
  return;
 }
 if(state==='countdown'){countdown-=dt;announce(countdown>0?String(Math.ceil(countdown)):'BATTLE START',.7);if(countdown<=0)setState('playing');return}
 if(state!=='playing')return;
 remaining=Math.max(0,remaining-dt);elapsed=60-remaining;novaCooldown=Math.max(0,novaCooldown-dt);
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
 if(mode==='demo'?manualFire:gesturesArmed&&gesture==='pinch')fire();
 spawnTimer-=dt;if(spawnTimer<=0){spawn();spawnTimer=Math.max(.48,1.3-elapsed*.012)}
 for(const e of enemies){if(e.dead)continue;e.age+=dt;e.y+=e.v*dt;e.x=e.startX+Math.sin(e.age*1.8)*22;e.spin+=dt*.8;if(e.y>H-78){e.dead=true;if(shielding){blocked++;score+=25;burst(e.x,H-90,'#67f8d5');tone(220,.12,'sine')}else{health=Math.max(0,health-1);combo=0;burst(e.x,H-80,'#ff7c84');tone(70,.25,'sawtooth');announce('CORE HIT',.5);if(health===0)break}}}
 enemies=enemies.filter(e=>!e.dead);
 for(const p of particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=100*dt}particles=particles.filter(p=>p.life>0);
 for(const b of beams)b.life-=dt;beams=beams.filter(b=>b.life>0);
 for(const f of floaters){f.life-=dt;f.y-=50*dt}floaters=floaters.filter(f=>f.life>0);
 for(const w of waves){w.r+=2000*dt;w.life-=dt}waves=waves.filter(w=>w.life>0);
 if(health<=0||remaining<=0)finish();
}
function circle(c,x,y,r,color,width=1){c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.strokeStyle=color;c.lineWidth=width;c.stroke()}
function render(){
 ctx.clearRect(0,0,W,H);ctx.fillStyle='#0b1723';ctx.fillRect(0,0,W,H);
 if(cameraReady&&video.readyState>=2){ctx.save();ctx.globalAlpha=state==='setup'?.8:.24;ctx.translate(W,0);ctx.scale(-1,1);ctx.drawImage(video,0,0,W,H);ctx.restore()}
 const gradient=ctx.createRadialGradient(640,390,10,640,390,750);gradient.addColorStop(0,'#2a655318');gradient.addColorStop(1,'#050b1680');ctx.fillStyle=gradient;ctx.fillRect(0,0,W,H);
 ctx.strokeStyle='#4a76631c';ctx.lineWidth=1;for(let x=0;x<W;x+=64){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke()}for(let y=0;y<H;y+=64){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}
 ctx.strokeStyle=shielding?'#67f8d5':'#67f8d548';ctx.lineWidth=shielding?5:2;ctx.beginPath();ctx.moveTo(0,H-77);ctx.lineTo(W,H-77);ctx.stroke();
 if(['setup','playing','countdown','paused'].includes(state)){
  for(const p of landmarks)drawHand(ctx,p,W,H,state==='setup'?.85:.5);
  if(state==='setup')drawGesturePractice();
  for(const e of enemies){ctx.save();ctx.translate(e.x,e.y);ctx.rotate(e.spin);ctx.shadowColor='#ffbd73';ctx.shadowBlur=12;ctx.strokeStyle='#ffbd73';ctx.fillStyle='#ffbd731c';ctx.lineWidth=2;ctx.beginPath();const sides=e.kind==='BUG'?4:6;for(let i=0;i<sides;i++){const a=i*Math.PI*2/sides;i?ctx.lineTo(Math.cos(a)*e.r,Math.sin(a)*e.r):ctx.moveTo(Math.cos(a)*e.r,Math.sin(a)*e.r)}ctx.closePath();ctx.fill();ctx.stroke();circle(ctx,0,0,8,'#ffdcad',2);ctx.restore();ctx.fillStyle='#e9cda8';ctx.font='12px monospace';ctx.textAlign='center';ctx.fillText(e.kind,e.x,e.y+e.r+19)}
  for(const b of beams){ctx.save();ctx.globalAlpha=b.life/.16;ctx.strokeStyle='#67f8d5';ctx.shadowColor='#67f8d5';ctx.shadowBlur=18;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(W/2,H-76);ctx.lineTo(b.x,b.y);ctx.stroke();circle(ctx,b.x,b.y,12+(1-b.life/.16)*50,'#67f8d5',2);ctx.restore()}
  for(const p of particles){ctx.globalAlpha=clamp(p.life*2,0,1);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,3,3)}ctx.globalAlpha=1;
  ctx.font='bold 22px monospace';ctx.textAlign='center';for(const f of floaters){ctx.globalAlpha=f.life/.7;ctx.fillStyle='#67f8d5';ctx.fillText(f.text,f.x,f.y)}ctx.globalAlpha=1;
  for(const w of waves){ctx.globalAlpha=w.life/.65;circle(ctx,w.x,w.y,w.r,'#ffbd73',6);ctx.globalAlpha=1}
  const color=shielding?'#67f8d5':charge>0?'#ffbd73':'#dffff7';circle(ctx,aim.x,aim.y,23,color,2);circle(ctx,aim.x,aim.y,4,color,2);ctx.strokeStyle=color;ctx.beginPath();for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ctx.moveTo(aim.x+dx*29,aim.y+dy*29);ctx.lineTo(aim.x+dx*38,aim.y+dy*38)}ctx.stroke();if(shielding)circle(ctx,aim.x,aim.y,85+Math.sin(now/160)*4,'#67f8d5',3);
  if(charge>0){ctx.beginPath();ctx.arc(aim.x,aim.y,42,-Math.PI/2,-Math.PI/2+Math.PI*2*charge);ctx.strokeStyle='#ffbd73';ctx.lineWidth=5;ctx.stroke()}
 }
 if(now>annUntil)$('announcement').textContent='';
}
function tick(t){now=t;updateCalibrationClock(t);if(state==='setup'&&!trackingFresh()){$('round-start').disabled=true;$('calibration-capture').disabled=true;if(cameraReady)updateGestureFeedback(null);}const gap=Math.max(0,(t-last)/1000);last=t;if(gap>.75&&['playing','countdown'].includes(state))pauseGame();if(cameraReady&&!document.hidden)void requestFrame();update(Math.min(gap,.25));render();updateHUD();requestAnimationFrame(tick)}
function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function boardKey(kind){return 'vision-arena-002:'+today()+':'+kind}
function readBoard(kind){try{const rows=JSON.parse(localStorage.getItem(boardKey(kind))||'[]');return Array.isArray(rows)?rows.filter(x=>typeof x.name==='string'&&Number.isFinite(x.score)&&x.score>=0).sort((a,b)=>b.score-a.score).slice(0,10):[]}catch{return []}}
function renderBoard(){ $('board-date').textContent=new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'short'}).format(new Date());for(const kind of ['camera','demo']){$('board-'+kind).classList.toggle('selected',kind===boardMode);$('board-'+kind).setAttribute('aria-pressed',String(kind===boardMode))}const list=$('board-list');list.replaceChildren();const rows=readBoard(boardMode);if(!rows.length){const p=document.createElement('p');p.className='empty';p.textContent=boardMode==='demo'?'Belum ada skor latihan. Coba satu ronde.':'Arena belum punya juara. Jadilah pemain pertama.';list.append(p)}for(const [i,row] of rows.entries()){const el=document.createElement('div');el.className='board-row';for(const [cls,text] of [['rank',String(i+1).padStart(2,'0')],['name',row.name],['points',row.score.toLocaleString('id-ID')]]){const span=document.createElement('span');span.className=cls;span.textContent=text;el.append(span)}list.append(el)}}
$('save-score').addEventListener('submit',e=>{e.preventDefault();if(saved||!roundCompleted)return;const name=$('player-name').value.trim();if(!name){$('player-name').setCustomValidity('Masukkan nama pemain.');$('player-name').reportValidity();return}const rows=readBoard(mode);rows.push({name:name.slice(0,18),score});rows.sort((a,b)=>b.score-a.score);try{localStorage.setItem(boardKey(mode),JSON.stringify(rows.slice(0,10)));saved=true;show('save-score',false);$('save-info').textContent='Skor tersimpan di browser ini.';boardMode=mode;renderBoard()}catch{$('save-info').textContent='Skor belum tersimpan. Penyimpanan browser tidak tersedia.'}});
$('player-name').addEventListener('input',()=> $('player-name').setCustomValidity(''));
$('calibration-start').onclick=beginCalibration;$('calibration-capture').onclick=captureCalibration;$('calibration-cancel').onclick=()=>cancelCalibration(true);$('calibration-reset').onclick=()=>{handControls.setCalibration(null);cancelCalibration();$('calibration-status').textContent='Setelan standar aktif. Kalibrasi bisa diulang kapan saja.';show('calibration-reset',false);};
$('camera-start').onclick=enableCamera;$('camera-retry').onclick=enableCamera;$('demo-start').onclick=enterDemo;$('round-start').onclick=startRound;$('setup-back').onclick=goHome;$('pause').onclick=()=>pauseGame();$('resume').onclick=resumeGame;$('exit-round').onclick=goHome;$('home').onclick=goHome;$('again').onclick=()=>{if(mode==='camera'&&!cameraReady){void enableCamera()}else if(mode==='camera'&&!trackingFresh()){setState('setup');overlays('setup-overlay');$('round-start').disabled=true;$('setup-title').textContent='Tunjukkan tanganmu kembali';$('setup-info').textContent='Setelah tangan terdeteksi, kamu bisa memulai ronde baru.'}else startRound()};
for(const kind of ['camera','demo'])$('board-'+kind).onclick=()=>{boardMode=kind;renderBoard()};
$('sound').onclick=()=>{sound=!sound;$('sound').textContent=sound?'Suara on':'Suara off';$('sound').setAttribute('aria-pressed',String(sound));$('sound').setAttribute('aria-label',sound?'Matikan suara':'Aktifkan suara');if(sound)tone()};
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{$('status').textContent='Layar penuh tidak tersedia di browser ini.'}};
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
window.addEventListener('blur',()=>{resetInputs();pauseGame()});
document.addEventListener('visibilitychange',()=>{if(document.hidden){resetInputs();pauseGame()}});
window.addEventListener('pagehide',()=>{resetInputs();pauseGame();stopCamera()});
window.addEventListener('pageshow',e=>{if(e.persisted&&mode==='camera'&&state!=='menu'&&state!=='result'){setState('setup');overlays('setup-overlay');show('camera-retry');$('setup-title').textContent='Aktifkan kamera kembali';$('setup-info').textContent='Kamera dihentikan saat kamu meninggalkan halaman.'}});
if(document.modelContext?.registerTool){try{Promise.resolve(document.modelContext.registerTool({name:'read_arena_state',description:'Read round status and today’s device-local leaderboard. Does not activate the camera or play a round.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:input=>{if(!input||Object.keys(input).length)throw new Error('Expected an empty object');return{state,mode,score,remaining:Math.ceil(remaining),health,leaderboard:readBoard(boardMode)}}})).catch(()=>{})}catch{}}
renderBoard();drawMap();requestAnimationFrame(tick);
