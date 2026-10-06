// Renders build/icon.png (512x512) from the favicon's lightning bolt without any image library.
import fs from 'node:fs';
import zlib from 'node:zlib';
const S=512,SS=4,out=Buffer.alloc(S*S*4);
const bolt=[[18,4],[7,18],[15,18],[14,28],[25,13],[17,13]].map(([x,y])=>[x/32*S,y/32*S]);
const inside=(x,y,poly)=>{let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,yi]=poly[i],[xj,yj]=poly[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)c=!c}return c};
const inRounded=(x,y)=>{const r=S*.22,cx=Math.min(Math.max(x,r),S-r),cy=Math.min(Math.max(y,r),S-r);return (x-cx)**2+(y-cy)**2<=r*r};
const edge=(x,y)=>{let d=Infinity;for(let i=0,j=bolt.length-1;i<bolt.length;j=i++){const [x1,y1]=bolt[j],[x2,y2]=bolt[i],dx=x2-x1,dy=y2-y1,t=Math.max(0,Math.min(1,((x-x1)*dx+(y-y1)*dy)/(dx*dx+dy*dy)));d=Math.min(d,Math.hypot(x-x1-t*dx,y-y1-t*dy))}return d};
for(let y=0;y<S;y++)for(let x=0;x<S;x++){
 let bg=0,fg=0;
 for(let sy=0;sy<SS;sy++)for(let sx=0;sx<SS;sx++){const px=x+(sx+.5)/SS,py=y+(sy+.5)/SS;if(inRounded(px,py)){bg++;if(inside(px,py,bolt))fg++}}
 bg/=SS*SS;fg/=SS*SS;
 const glow=fg<1&&bg>0?Math.max(0,1-edge(x+.5,y+.5)/60)**2*.55:0;
 const base=[8,14,22],cyan=[103,248,213];
 const mix=c=>Math.round(base[c]+(cyan[c]-base[c])*Math.min(1,fg+glow*(1-fg)));
 const i=(y*S+x)*4;out[i]=mix(0);out[i+1]=mix(1);out[i+2]=mix(2);out[i+3]=Math.round(255*bg);
}
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0});
const crc=buf=>{let c=0xffffffff;for(const b of buf)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0};
const chunk=(type,data)=>{const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([len,td,c])};
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(S,0);ihdr.writeUInt32BE(S,4);ihdr[8]=8;ihdr[9]=6;
const raw=Buffer.alloc(S*(S*4+1));for(let y=0;y<S;y++){raw[y*(S*4+1)]=0;out.copy(raw,y*(S*4+1)+1,y*S*4,(y+1)*S*4)}
fs.mkdirSync(new URL('../build/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('../build/icon.png',import.meta.url),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]));
console.log('build/icon.png written');
