// AI Hand Battle desktop shell. Serves the game from a private app:// origin so the
// camera, Web Worker, WASM and ES modules behave exactly like a secure website.
const {app,BrowserWindow,protocol,session,ipcMain,Menu,powerSaveBlocker,systemPreferences,shell}=require('electron');
const path=require('node:path');
const fs=require('fs').promises; // Electron's patched fs reads straight from app.asar.

const ROOT=path.join(__dirname,'..','dist');
const ORIGIN='app://arena';
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.wasm':'application/wasm','.task':'application/octet-stream','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};

protocol.registerSchemesAsPrivileged([{scheme:'app',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true,codeCache:true}}]);

// Keep the game smooth: no background throttling, prefer the discrete GPU.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');

if(!app.requestSingleInstanceLock())app.quit();

let win=null,blocker=null;

async function serve(request){
 const url=new URL(request.url);
 if(url.host!=='arena')return new Response('Not found',{status:404});
 const rel=decodeURIComponent(url.pathname).replace(/^\/+/,'')||'index.html';
 const file=path.normalize(path.join(ROOT,rel));
 if(file!==ROOT&&!file.startsWith(ROOT+path.sep))return new Response('Forbidden',{status:403});
 try{
  const body=await fs.readFile(file);
  return new Response(body,{headers:{'content-type':MIME[path.extname(file).toLowerCase()]??'application/octet-stream','cache-control':'no-cache'}});
 }catch{return new Response('Not found',{status:404})}
}

function createWindow(){
 win=new BrowserWindow({
  width:1600,height:900,minWidth:960,minHeight:600,backgroundColor:'#080e16',show:false,autoHideMenuBar:true,
  title:'Hand Battle',icon:path.join(__dirname,'..','build','icon.png'),
  webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false,spellcheck:false}
 });
 win.once('ready-to-show',()=>{win.show();win.maximize()});
 // External links open in the system browser; the game window never navigates away.
 win.webContents.setWindowOpenHandler(({url})=>{if(/^https:/.test(url))void shell.openExternal(url);return {action:'deny'}});
 win.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(ORIGIN))event.preventDefault()});
 win.webContents.on('render-process-gone',()=>{if(!win.isDestroyed())win.reload()});
 win.on('enter-full-screen',()=>win.webContents.send('fullscreen',true));
 win.on('leave-full-screen',()=>win.webContents.send('fullscreen',false));
 void win.loadURL(ORIGIN+'/index.html');
}

app.whenReady().then(async()=>{
 protocol.handle('app',serve);
 // Only the game origin may use the camera; everything else is refused.
 const trusted=origin=>typeof origin==='string'&&origin.startsWith(ORIGIN);
 session.defaultSession.setPermissionRequestHandler((wc,permission,callback,details)=>{
  callback((permission==='media'&&!(details.mediaTypes??[]).includes('audio')&&trusted(details.requestingUrl??wc.getURL()))||(permission==='fullscreen'&&trusted(wc.getURL())));
 });
 session.defaultSession.setPermissionCheckHandler((wc,permission,origin)=>['media','fullscreen'].includes(permission)&&trusted(origin));
 if(process.platform==='darwin'){try{await systemPreferences.askForMediaAccess('camera')}catch{}}
 ipcMain.handle('toggle-fullscreen',()=>{if(win)win.setFullScreen(!win.isFullScreen());return win?.isFullScreen()??false});
 ipcMain.handle('quit',()=>app.quit());
 Menu.setApplicationMenu(Menu.buildFromTemplate([
  ...(process.platform==='darwin'?[{role:'appMenu'}]:[]),
  {label:'Game',submenu:[{label:'Layar penuh',accelerator:'F11',click:()=>win?.setFullScreen(!win.isFullScreen())},{role:'reload',label:'Muat ulang'},{type:'separator'},{role:'quit',label:'Keluar'}]},
  {label:'Bantuan',submenu:[{role:'toggleDevTools',label:'Developer tools'}]}
 ]));
 // Booth laptops must not dim or sleep in the middle of an event.
 blocker=powerSaveBlocker.start('prevent-display-sleep');
 createWindow();
 app.on('activate',()=>{if(!BrowserWindow.getAllWindows().length)createWindow()});
});
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus()}});
app.on('window-all-closed',()=>{if(blocker!==null&&powerSaveBlocker.isStarted(blocker))powerSaveBlocker.stop(blocker);app.quit()});
