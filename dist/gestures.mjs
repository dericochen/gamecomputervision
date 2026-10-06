export const CONNECTIONS=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const length=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,(a.z??0)-(b.z??0));
const valid=p=>p?.length===21&&p.every(v=>Number.isFinite(v.x)&&Number.isFinite(v.y)&&Number.isFinite(v.z??0));
const shapeDistance=(a,b)=>Math.sqrt(a.reduce((sum,v,i)=>sum+(v-b[i])**2,0)/a.length);
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];

// Ratios in 3D stay independent of handedness, camera aspect, and in-plane rotation.
export function handFeatures(landmarks,world,aspect=1){
 if(!valid(landmarks))return null;
 const p=valid(world)?world:landmarks.map(v=>({x:v.x*aspect,y:v.y,z:(v.z??0)*aspect}));
 const size=Math.max(length(p[0],p[9]),length(p[5],p[17]));
 if(size<1e-5)return null;
 const reach=[5,9,13,17].map(i=>length(p[i],p[i+3])/Math.max(1e-5,length(p[i],p[i+1])+length(p[i+1],p[i+2])+length(p[i+2],p[i+3])));
 const pinch=length(p[4],p[8])/size;
 const indexOut=length(p[5],p[8])/size;
 const vector=[...reach,Math.min(pinch,2)*.65,Math.min(length(p[4],p[5])/size,2)*.3,Math.min(length(p[8],p[0])/size,2.5)*.3,Math.min(length(p[4],p[0])/size,2.5)*.3];
 return {reach,pinch,indexOut,vector};
}

// Four explicit samples teach personal shapes without saving images or guessing labels.
export class GestureCalibration {
 constructor(){this.templates=[]}
 capture(kind,samples){
  if(samples.length<6)return {ok:false,message:'Sampel belum cukup. Tahan satu tangan tetap terlihat, lalu ulangi.'};
  const vector=samples[0].vector.map((_,i)=>median(samples.map(s=>s.vector[i])));
  const reach=vector.slice(0,4),pinch=median(samples.map(s=>s.pinch));
  const suitable=kind==='point'?reach[0]>.74&&pinch>.45:kind==='pinch'?pinch<.5:kind==='palm'?reach.filter(r=>r>.74).length>=3:reach.every(r=>r<.75);
  if(!suitable)return {ok:false,message:'Bentuknya belum sesuai contoh. Hadapkan tangan ke kamera dan coba lagi.'};
  const spread=Math.max(...samples.map(s=>shapeDistance(s.vector,vector)));
  if(spread>.14)return {ok:false,message:'Tangan masih banyak bergerak. Tahan bentuk yang sama selama perekaman.'};
  if(this.templates.some(t=>t.kind!==kind&&shapeDistance(t.vector,vector)<.14))return {ok:false,message:'Gerakan ini terlalu mirip gerakan sebelumnya. Bedakan posisi jari, lalu ulangi.'};
  this.templates=this.templates.filter(t=>t.kind!==kind);
  this.templates.push({kind,vector,pinch,radius:clamp(spread+.07,.09,.16)});
  return {ok:true};
 }
 match(features){
  if(this.templates.length!==4)return null;
  const ranked=this.templates.map(t=>({...t,error:shapeDistance(t.vector,features.vector)})).sort((a,b)=>a.error-b.error);
  const best=ranked[0];
  if(best.error>best.radius||ranked[1].error-best.error<.045)return null;
  if(best.kind==='pinch'&&features.pinch>Math.min(.5,best.pinch+.14))return null;
  return {gesture:best.kind,score:clamp(1-best.error,0,1),source:'calibration'};
 }
}

export function recognizeHand(landmarks,previous='idle',world,aspect=1,categories=[],calibration=null){
 const features=handFeatures(landmarks,world,aspect);
 if(!features)return {gesture:'idle',score:0,source:'none',features:null};
 const model=[...categories].sort((a,b)=>(b.score??0)-(a.score??0))[0];
 const modelName=model?.categoryName??'None',score=model?.score??0;
 const personal=calibration?.match(features);
 if(personal)return {...personal,features,modelName};
 const closed=modelName==='Closed_Fist'&&score>=.55;
 // Pinch is a geometric action, not a canned model class. A confident fist vetoes it.
 const pinching=features.pinch<(previous==='pinch'?.38:.28)&&features.indexOut>.3;
 if(pinching&&!closed)return {gesture:'pinch',score:1-features.pinch,source:'pinch',features,modelName};
 const modelGesture={Pointing_Up:'point',Open_Palm:'palm',Closed_Fist:'fist'}[modelName];
 if(modelGesture&&score>=.55)return {gesture:modelGesture,score,source:'model',features,modelName};
 const [index,...others]=features.reach;
 if(index>.84&&others.every(r=>r<.76)&&features.pinch>.45)return {gesture:'point',score:.7,source:'geometry',features,modelName};
 // Unrecognized shapes still move the cursor, but never trigger a special action.
 return {gesture:'idle',score:0,source:'uncertain',features,modelName};
}
export function classifyHand(landmarks,previous='idle',world,aspect=1,categories=[],calibration=null){return recognizeHand(landmarks,previous,world,aspect,categories,calibration).gesture}

// Apparent hand size in frame-height units. Bigger means closer to the camera.
export function handSize(p,aspect=1){
 return Math.max(Math.hypot((p[0].x-p[9].x)*aspect,p[0].y-p[9].y),Math.hypot((p[5].x-p[17].x)*aspect,p[5].y-p[17].y));
}

// Crowd defaults: the detector may see spectators, but only the locked player
// (and that player's second hand) can aim, fire, shield, or charge.
export const CROWD_DEFAULTS={minAcquireSize:.05,minKeepSize:.03,partnerSizeRatio:[.55,1.8],partnerReach:5.5,rememberMs:3000};

export class HandControls {
 constructor(options={}){this.options={...CROWD_DEFAULTS,...options};this.calibration=null;this.roundLock=false;this.reset()}
 reset(){this.tracks=[];this.primaryId=null;this.partnerId=null;this.nextId=1;this.aim=null;this.lastAt=null;this.presentSince=null;this.pinchAnchor=null;this.lastPoint=null;this.lastPrimary=null}
 setCalibration(profile){this.calibration=profile;this.reset()}
 // Pick who controls the game. Prefer intentional aiming poses, then the closest,
 // most central hand, and the spot where the last player stood.
 acquire(hands,at,aspect){
  const o=this.options;
  // Soon after losing a player (or at any time during a round) a newcomer must be
  // about as close to the camera as that player, so spectators cannot take over.
  const recent=this.lastPrimary&&(this.roundLock||at-this.lastPrimary.at<o.rememberMs)?this.lastPrimary:null;
  const minSize=recent?Math.max(o.minAcquireSize,recent.size*.6):o.minAcquireSize;
  const eligible=hands.filter(h=>h.size>=minSize);
  if(!eligible.length)return null;
  const biggest=Math.max(...eligible.map(h=>h.size));
  const rank=h=>{
   let s=h.size/biggest-Math.abs(h.center.x-.5)*.35;
   if(recent)s+=Math.max(0,.6-distance(h.center,recent.center)/Math.max(.08,recent.size*3))*.8;
   if(h.raw==='point'||h.raw==='pinch')s+=.5;
   return s;
  };
  // Intentional poses only win among hands at a similar distance to the closest one.
  const close=eligible.filter(h=>h.size>=biggest*.6);
  return close.sort((a,b)=>rank(b)-rank(a))[0];
 }
 update(result,at,aspect=1){
  const o=this.options,available=this.tracks.filter(t=>at-t.lastAt<700),used=new Set();
  const hands=(result.landmarks??[]).map((p,i)=>({p,i})).filter(({p})=>valid(p)).map(({p,i})=>{
   const center={x:(p[0].x+p[9].x)/2,y:(p[0].y+p[9].y)/2},size=handSize(p,aspect);
   const label=result.handedness?.[i]?.[0]?.categoryName??'';
   let old=null,best=Infinity;
   for(const t of available){
    if(used.has(t.id))continue;
    // A track only continues with a hand at a similar place and distance, so a
    // spectator stepping in cannot inherit the player's identity.
    const ratio=t.size?size/t.size:1;if(ratio<.5||ratio>2)continue;
    const d=distance(center,t.center)+(label&&t.label&&label!==t.label?.2:0);
    // Radius grows with hand size and the time since it was last seen (fast swipes ~2.5 frames/s).
    const radius=Math.min(.5,Math.max(.12,(t.size??size)+2.5*Math.max(0,at-t.lastAt)/1000));
    if(d<best&&d<radius){old=t;best=d}
   }
   const t=old??{id:this.nextId++,gesture:'idle',candidate:'idle',since:at,samples:0};used.add(t.id);
   if(old&&at-old.lastAt>250){t.gesture='idle';t.candidate='idle';t.samples=0;t.since=at}
   const recognition=recognizeHand(p,t.gesture,result.worldLandmarks?.[i],aspect,result.gestures?.[i],this.calibration),raw=recognition.gesture;
   if(raw!==t.candidate){t.candidate=raw;t.since=at;t.samples=1}else t.samples++;
   // Release an old action immediately; require sustained evidence to enter a new one.
   if(raw!==t.gesture)t.gesture='idle';
   const dwell={point:60,pinch:100,palm:130,fist:220,idle:0}[raw];
   if(at-t.since>=dwell&&t.samples>=2)t.gesture=raw;
   return {...t,p,center,size,label,lastAt:at,raw,...recognition,gesture:t.gesture,role:'ignored'};
  });
  const previous=available.find(t=>t.id===this.primaryId);
  let primary=hands.find(t=>t.id===this.primaryId);
  if(primary&&primary.size<o.minKeepSize)primary=null;
  if(!primary&&(!previous||at-previous.lastAt>500)){
   primary=this.acquire(hands,at,aspect);
   this.primaryId=primary?.id??null;this.partnerId=null;this.aim=null;this.pinchAnchor=null;this.lastPoint=null;
  }
  this.tracks=[...hands,...available.filter(t=>!used.has(t.id))];
  if(!primary){this.presentSince=null;this.pinchAnchor=null;return {hands,primary:null,partner:null,ignored:hands.length,shield:false,aim:this.aim}}
  primary.role='player';
  this.lastPrimary={at,center:{...primary.center},size:primary.size};
  // The player's other hand: similar distance from the camera and within arm's reach.
  const [lo,hi]=o.partnerSizeRatio,reach=o.partnerReach*primary.size;
  const partners=hands.filter(h=>h!==primary&&h.size/primary.size>=lo&&h.size/primary.size<=hi&&distance(h.center,primary.center)<=reach);
  const partner=partners.find(h=>h.id===this.partnerId)??partners.sort((a,b)=>distance(a.center,primary.center)-distance(b.center,primary.center))[0]??null;
  this.partnerId=partner?.id??null;if(partner)partner.role='partner';
  const ignored=hands.filter(h=>h.role==='ignored').length;
  this.presentSince??=at;
  // A comfortable inner camera region maps onto the whole arena.
  let target={x:clamp((1-primary.p[8].x-.12)/.76,0,1),y:clamp((primary.p[8].y-.10)/.74,0,1)};
  if(primary.raw==='pinch'||primary.raw==='fist'){
   this.pinchAnchor??=this.lastPoint&&at-this.lastPoint.at<450?this.lastPoint:{center:{...primary.center},aim:this.aim?{...this.aim}:target};
   target={x:clamp(this.pinchAnchor.aim.x-(primary.center.x-this.pinchAnchor.center.x)/.76,0,1),y:clamp(this.pinchAnchor.aim.y+(primary.center.y-this.pinchAnchor.center.y)/.74,0,1)};
  }else this.pinchAnchor=null;
  const alpha=1-Math.exp(-Math.min(150,at-(this.lastAt??at-50))/55);
  this.aim=this.aim?{x:this.aim.x+(target.x-this.aim.x)*alpha,y:this.aim.y+(target.y-this.aim.y)*alpha}:target;
  if(primary.raw==='point')this.lastPoint={at,center:{...primary.center},aim:{...this.aim}};
  this.lastAt=at;
  return {hands,primary,partner,ignored,aim:this.aim,shield:primary.gesture==='palm'||partner?.gesture==='palm',presentSince:this.presentSince};
 }
}
