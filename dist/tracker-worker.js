let detector,delegate='CPU';
async function create(vision,options,useGpu){
 return GestureRecognizerClass.createFromOptions(vision,{
  baseOptions:{modelAssetPath:new URL('./vendor/gesture_recognizer.task',self.location.href).href,delegate:useGpu?'GPU':'CPU'},
  runningMode:'VIDEO',numHands:options.numHands??4,
  minHandDetectionConfidence:.5,minHandPresenceConfidence:.5,minTrackingConfidence:.5
 });
}
let GestureRecognizerClass;
self.onmessage=async({data})=>{
 if(data.type==='init'){
  try{
   const {GestureRecognizer,FilesetResolver}=await import('./vendor/vision_bundle.mjs');
   GestureRecognizerClass=GestureRecognizer;
   const vision=await FilesetResolver.forVisionTasks(new URL('./vendor/wasm',self.location.href).href);
   // GPU is much faster when available; any failure falls back to CPU.
   if(data.gpu!==false&&typeof OffscreenCanvas!=='undefined'){
    try{detector=await create(vision,data,true);delegate='GPU'}catch{detector=null}
   }
   if(!detector){detector=await create(vision,data,false);delegate='CPU'}
   self.postMessage({type:'ready',delegate});
  }catch(e){self.postMessage({type:'error',message:e.message})}
 }
 if(data.type==='frame'){
  try{
   const t=performance.now();
   const result=detector.recognizeForVideo(data.bitmap,data.timestamp);
   self.postMessage({type:'result',landmarks:result.landmarks,worldLandmarks:result.worldLandmarks,handedness:result.handedness,gestures:result.gestures,latency:performance.now()-t,width:data.bitmap.width,height:data.bitmap.height});
  }catch(e){self.postMessage({type:'error',message:e.message})}
  finally{data.bitmap.close()}
 }
};
