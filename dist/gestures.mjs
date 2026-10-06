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

export class HandControls {
 constructor(){this.calibration=null;this.reset()}
 reset(){this.tracks=[];this.primaryId=null;this.nextId=1;this.aim=null;this.lastAt=null;this.presentSince=null;this.pinchAnchor=null;this.lastPoint=null}
 setCalibration(profile){this.calibration=profile;this.reset()}
 update(result,at,aspect=1){
  const available=this.tracks.filter(t=>at-t.lastAt<700),used=new Set();
  const hands=(result.landmarks??[]).map((p,i)=>({p,i})).filter(({p})=>valid(p)).map(({p,i})=>{
   const center={x:(p[0].x+p[9].x)/2,y:(p[0].y+p[9].y)/2};
   const label=result.handedness?.[i]?.[0]?.categoryName??'';
   let old=null,best=Infinity;
   for(const t of available){if(used.has(t.id))continue;const d=distance(center,t.center)+(label&&t.label&&label!==t.label?.2:0);if(d<best&&d<.5){old=t;best=d}}
   const t=old??{id:this.nextId++,gesture:'idle',candidate:'idle',since:at,samples:0};used.add(t.id);
   if(old&&at-old.lastAt>250){t.gesture='idle';t.candidate='idle';t.samples=0;t.since=at}
   const recognition=recognizeHand(p,t.gesture,result.worldLandmarks?.[i],aspect,result.gestures?.[i],this.calibration),raw=recognition.gesture;
   if(raw!==t.candidate){t.candidate=raw;t.since=at;t.samples=1}else t.samples++;
   // Release an old action immediately; require sustained evidence to enter a new one.
   if(raw!==t.gesture)t.gesture='idle';
   const dwell={point:60,pinch:100,palm:130,fist:220,idle:0}[raw];
   if(at-t.since>=dwell&&t.samples>=2)t.gesture=raw;
   return {...t,p,center,label,lastAt:at,raw,...recognition,gesture:t.gesture};
  });
  const previous=available.find(t=>t.id===this.primaryId);
  let primary=hands.find(t=>t.id===this.primaryId);
  if(!primary&&(!previous||at-previous.lastAt>500)){
   primary=hands.find(t=>t.raw==='point')??hands.find(t=>t.raw==='pinch')??hands[0];
   this.primaryId=primary?.id??null;this.aim=null;this.pinchAnchor=null;this.lastPoint=null;
  }
  this.tracks=[...hands,...available.filter(t=>!used.has(t.id))];
  if(!primary){this.presentSince=null;this.pinchAnchor=null;return {hands,primary:null,shield:false,aim:this.aim}}
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
  return {hands,primary,aim:this.aim,shield:hands.some(t=>t.gesture==='palm'),presentSince:this.presentSince};
 }
}
