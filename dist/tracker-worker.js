let detector;
self.onmessage=async({data})=>{
 if(data.type==='init'){
  try{
   const {GestureRecognizer,FilesetResolver}=await import('./vendor/vision_bundle.mjs');
   const vision=await FilesetResolver.forVisionTasks(new URL('./vendor/wasm',self.location.href).href);
   detector=await GestureRecognizer.createFromOptions(vision,{baseOptions:{modelAssetPath:new URL('./vendor/gesture_recognizer.task',self.location.href).href,delegate:'CPU'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.5,minHandPresenceConfidence:.5,minTrackingConfidence:.5});
   self.postMessage({type:'ready'});
  }catch(e){self.postMessage({type:'error',message:e.message})}
 }
 if(data.type==='frame'){
  try{
   const t=performance.now();
   const result=detector.recognizeForVideo(data.bitmap,data.timestamp);
   self.postMessage({type:'result',landmarks:result.landmarks,worldLandmarks:result.worldLandmarks,handedness:result.handedness,gestures:result.gestures,latency:performance.now()-t});
  }catch(e){self.postMessage({type:'error',message:e.message})}
  finally{data.bitmap.close()}
 }
};
