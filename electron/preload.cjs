// Minimal, explicit bridge. The page gets no Node.js access.
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('arenaApp',{
 isDesktop:true,
 platform:process.platform,
 toggleFullscreen:()=>ipcRenderer.invoke('toggle-fullscreen'),
 quit:()=>ipcRenderer.invoke('quit')
});
