// Zero-dependency local server for AI Hand Battle.
// Serves dist/ over http://localhost so the webcam, Web Worker, WASM, and ES
// modules work (localhost counts as a secure context in browsers).
// Usage: node scripts/serve.mjs [port] [--no-open]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

const ROOT=path.join(path.dirname(fileURLToPath(import.meta.url)),'..','dist');
const args=process.argv.slice(2);
const noOpen=args.includes('--no-open');
const portArg=args.find(a=>/^\d+$/.test(a));
const startPort=portArg?Number(portArg):Number(process.env.PORT)||8000;

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.wasm':'application/wasm','.task':'application/octet-stream','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};

const server=http.createServer((req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  let rel=decodeURIComponent(url.pathname).replace(/^\/+/,'')||'index.html';
  let file=path.normalize(path.join(ROOT,rel));
  // Never serve anything outside dist/.
  if(file!==ROOT&&!file.startsWith(ROOT+path.sep)){res.writeHead(403).end('Forbidden');return}
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!fs.existsSync(file)){res.writeHead(404).end('Not found');return}
  const headers={'content-type':MIME[path.extname(file).toLowerCase()]??'application/octet-stream','cache-control':'no-cache',
   // Needed for threaded WASM / SharedArrayBuffer in some browsers; harmless otherwise.
   'cross-origin-opener-policy':'same-origin','cross-origin-embedder-policy':'require-corp','cross-origin-resource-policy':'cross-origin'};
  res.writeHead(200,headers);
  if(req.method==='HEAD'){res.end();return}
  fs.createReadStream(file).pipe(res);
 }catch{res.writeHead(500).end('Server error')}
});

function openBrowser(url){
 if(noOpen)return;
 const cmd=process.platform==='win32'?['cmd',['/c','start','',url]]
  :process.platform==='darwin'?['open',[url]]
  :['xdg-open',[url]];
 try{spawn(cmd[0],cmd[1],{stdio:'ignore',detached:true}).unref()}catch{}
}

// Try the chosen port; if busy, step up until one is free.
function listen(port,attempt=0){
 server.once('error',err=>{
  if(err.code==='EADDRINUSE'&&attempt<20){listen(port+1,attempt+1)}
  else{console.error('Tidak bisa membuka server:',err.message);process.exit(1)}
 });
 server.listen(port,()=>{
  const url=`http://localhost:${port}/`;
  console.log('\n  AI Hand Battle berjalan di:');
  console.log('  '+url+'\n');
  console.log('  Buka link di atas pada Chrome atau Edge, lalu izinkan kamera.');
  console.log('  Tekan Ctrl+C untuk berhenti.\n');
  openBrowser(url);
 });
}
listen(startPort);

for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{server.close(()=>process.exit(0))});
