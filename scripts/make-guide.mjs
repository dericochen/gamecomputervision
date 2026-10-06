// Builds docs/Panduan-AI-Hand-Battle.pdf — an illustrated player guide with an
// original BINUS-themed robot mascot named "Vee". The mascot is drawn from
// scratch; it is not an official BINUS logo or character.
import fs from 'node:fs';
import {PDF} from './pdflib.mjs';

// BINUS-flavoured palette (institutional orange + blue), plus the game's cyan.
const C={
 ink:[0.05,0.09,0.14], paper:[0.98,0.99,1], panel:[0.93,0.96,0.99],
 orange:[0.93,0.44,0.09], orangeSoft:[1,0.86,0.72],
 blue:[0.04,0.28,0.56], blueSoft:[0.80,0.88,0.97],
 cyan:[0.21,0.80,0.72], cyanDark:[0.08,0.5,0.46],
 red:[0.95,0.36,0.42], gold:[0.95,0.78,0.2], purple:[0.69,0.55,1],
 grey:[0.45,0.52,0.58], white:[1,1,1], line:[0.82,0.86,0.9]
};
const W=595.28,H=841.89,MX=52;

// ---------------------------------------------------------------- mascot "Vee"
// A friendly robot: rounded blue head, orange visor, cyan bolt on the chest.
function vee(pdf,cx,cy,s=1,pose='wave'){
 const u=v=>v*s;
 pdf.save();
 // soft shadow
 pdf.fill(...C.blue).save();pdf.page.ops.push('/GS 1 gs');pdf.restore();
 pdf.fill(0.85,0.90,0.95).ellipse(cx,cy+u(66),u(44),u(10),'f');
 // body
 pdf.fill(...C.blue).roundRect(cx-u(34),cy+u(10),u(68),u(56),u(16),'f');
 // chest plate
 pdf.fill(...C.white).roundRect(cx-u(22),cy+u(20),u(44),u(34),u(10),'f');
 // lightning bolt on chest (the game logo motif)
 pdf.fill(...C.cyan).poly([
  [cx+u(2),cy+u(22)],[cx-u(12),cy+u(37)],[cx-u(2),cy+u(37)],
  [cx-u(5),cy+u(52)],[cx+u(12),cy+u(33)],[cx+u(2),cy+u(33)]
 ],'f');
 // arms
 pdf.fill(...C.blue);
 if(pose==='wave'){
  pdf.save().lineWidth(u(9)).stroke(...C.blue).lineCap(1);
  pdf.line(cx-u(32),cy+u(26),cx-u(52),cy+u(6));          // left arm up (waving)
  pdf.line(cx+u(32),cy+u(30),cx+u(50),cy+u(44));         // right arm down
  pdf.restore();
  pdf.fill(...C.orange).circle(cx-u(54),cy+u(3),u(7),'f');
  pdf.fill(...C.orange).circle(cx+u(52),cy+u(46),u(7),'f');
 }else if(pose==='point'){
  pdf.save().lineWidth(u(9)).stroke(...C.blue).lineCap(1);
  pdf.line(cx+u(30),cy+u(26),cx+u(56),cy+u(14));
  pdf.line(cx-u(30),cy+u(30),cx-u(48),cy+u(44));
  pdf.restore();
  pdf.fill(...C.orange).circle(cx+u(58),cy+u(12),u(7),'f');
  pdf.fill(...C.orange).circle(cx-u(50),cy+u(46),u(7),'f');
 }else{ // cheer: both arms up
  pdf.save().lineWidth(u(9)).stroke(...C.blue).lineCap(1);
  pdf.line(cx-u(30),cy+u(26),cx-u(50),cy+u(6));
  pdf.line(cx+u(30),cy+u(26),cx+u(50),cy+u(6));
  pdf.restore();
  pdf.fill(...C.orange).circle(cx-u(52),cy+u(3),u(7),'f');
  pdf.fill(...C.orange).circle(cx+u(52),cy+u(3),u(7),'f');
 }
 // antenna
 pdf.save().lineWidth(u(3)).stroke(...C.orange).lineCap(1);pdf.line(cx,cy-u(42),cx,cy-u(54));pdf.restore();
 pdf.fill(...C.orange).circle(cx,cy-u(58),u(5),'f');
 // head
 pdf.fill(...C.blue).roundRect(cx-u(40),cy-u(44),u(80),u(60),u(20),'f');
 // visor
 pdf.fill(...C.ink).roundRect(cx-u(32),cy-u(34),u(64),u(36),u(14),'f');
 // eyes (cyan)
 pdf.fill(...C.cyan).circle(cx-u(14),cy-u(16),u(7),'f').circle(cx+u(14),cy-u(16),u(7),'f');
 pdf.fill(...C.white).circle(cx-u(16),cy-u(18),u(2.4),'f').circle(cx+u(12),cy-u(18),u(2.4),'f');
 // smile
 pdf.save().lineWidth(u(2.4)).stroke(...C.cyan).lineCap(1);
 pdf.page.ops.push(`${pdf._n(cx-u(10))} ${pdf._n(pdf._y(cy-u(4)))} m ${pdf._n(cx)} ${pdf._n(pdf._y(cy+u(2)))} ${pdf._n(cx+u(10))} ${pdf._n(pdf._y(cy-u(4)))} ${pdf._n(cx+u(10))} ${pdf._n(pdf._y(cy-u(4)))} c S`);
 pdf.restore();
 // cheeks
 pdf.fill(...C.orange).circle(cx-u(26),cy-u(8),u(3.5),'f').circle(cx+u(26),cy-u(8),u(3.5),'f');
 pdf.restore();
}

// ---------------------------------------------------------------- gesture icons
// Simple hand glyphs so the guide reads without photos.
function handBase(pdf,cx,cy,s){pdf.fill(...C.orangeSoft).roundRect(cx-18*s,cy-6*s,36*s,30*s,8*s,'f')} // palm block
function finger(pdf,x,y,h,s,up=true){pdf.fill(...C.orangeSoft).roundRect(x-5*s,up?y-h:y,10*s,h,5*s,'f')}
function gesture(pdf,cx,cy,kind,s=1){
 pdf.save();
 if(kind==='point'){
  handBase(pdf,cx,cy,s);
  finger(pdf,cx-9*s,cy-6*s,40*s,s);            // index up
  for(const dx of [-1,8,16])pdf.fill(...C.orange).roundRect(cx+dx*s,cy-10*s,9*s,10*s,4*s,'f'); // curled
  pdf.fill(...C.orange).roundRect(cx-22*s,cy-2*s,10*s,16*s,4*s,'f'); // thumb
 }else if(kind==='pinch'){
  handBase(pdf,cx,cy,s);
  pdf.fill(...C.orangeSoft).roundRect(cx-10*s,cy-30*s,10*s,26*s,5*s,'f'); // index
  pdf.fill(...C.orange).roundRect(cx-24*s,cy-26*s,10*s,24*s,5*s,'f');     // thumb
  pdf.fill(...C.cyan).circle(cx-14*s,cy-28*s,6*s,'f');                     // pinch spark
  for(const dx of [6,15,24])pdf.fill(...C.orangeSoft).roundRect(cx+dx*s,cy-18*s,8*s,22*s,4*s,'f');
 }else if(kind==='palm'){
  handBase(pdf,cx,cy,s);
  for(const dx of [-16,-6,4,14])finger(pdf,cx+dx*s,cy-6*s,34*s,s);
  pdf.fill(...C.orange).roundRect(cx-26*s,cy-4*s,10*s,18*s,4*s,'f'); // thumb
 }else if(kind==='fist'){
  pdf.fill(...C.orangeSoft).roundRect(cx-18*s,cy-10*s,36*s,34*s,10*s,'f');
  for(const dx of [-12,-3,6,15])pdf.save().lineWidth(1.4*s).stroke(...C.orange).line(cx+dx*s,cy-8*s,cx+dx*s,cy+2*s).restore();
  pdf.fill(...C.orange).roundRect(cx-24*s,cy+2*s,10*s,14*s,4*s,'f');
 }
 pdf.restore();
}

// ---------------------------------------------------------------- layout helpers
function pageBg(pdf){pdf.fill(...C.paper).rect(0,0,W,H,'f')}
function footer(pdf,n){
 pdf.save().lineWidth(0.8).stroke(...C.line).line(MX,H-46,W-MX,H-46).restore();
 pdf.text(MX,H-40,'AI Hand Battle  ·  Vision Arena',{size:8,font:'Helvetica-Bold',color:C.blue});
 pdf.text(W-MX,H-40,'Halaman '+n,{size:8,color:C.grey,align:'right'});
 pdf.text(W/2,H-40,'Dipandu Vee',{size:8,color:C.orange,align:'center'});
}
function pill(pdf,x,y,label,bg,fg){
 const w=pdf.textWidth(label,8.5,'Helvetica-Bold')+16;
 pdf.fill(...bg).roundRect(x,y,w,16,8,'f');
 pdf.text(x+8,y+4,label,{size:8.5,font:'Helvetica-Bold',color:fg});
 return w;
}
function stepCard(pdf,x,y,w,h,num,title,body,accent){
 pdf.fill(...C.white).roundRect(x,y,w,h,12,'f');
 pdf.save().lineWidth(1).stroke(...C.line).roundRect(x,y,w,h,12,'S').restore();
 pdf.fill(...accent).circle(x+26,y+26,15,'f');
 pdf.text(x+26,y+19,String(num),{size:14,font:'Helvetica-Bold',color:C.white,align:'center'});
 pdf.text(x+50,y+16,title,{size:12.5,font:'Helvetica-Bold',color:C.ink});
 pdf.paragraph(x+50,y+34,body,{size:9.5,color:[0.25,0.3,0.35],width:w-66,leading:13});
}

const pdf=new PDF({width:W,height:H});

// ============================================================ PAGE 1 — COVER
pdf.addPage();pageBg(pdf);
// top banner
pdf.fill(...C.blue).rect(0,0,W,250,'f');
pdf.fill(...C.orange).rect(0,250,W,10,'f');
// subtle bolts in banner
pdf.save();pdf.fill(0.12,0.36,0.62);
for(const [bx,by,bs] of [[70,60,0.8],[500,70,1.1],[120,180,0.7],[470,190,0.6]])
 pdf.poly([[bx+8*bs,by],[bx-7*bs,by+15*bs],[bx+bs,by+15*bs],[bx-bs,by+30*bs],[bx+14*bs,by+11*bs],[bx+2*bs,by+11*bs]],'f');
pdf.restore();
pdf.text(MX,60,'PANDUAN BERMAIN',{size:13,font:'Helvetica-Bold',color:C.cyan});
pdf.text(MX,80,'AI HAND BATTLE',{size:40,font:'Helvetica-Bold',color:C.white});
pdf.text(MX,128,'Vision Arena — kendalikan arena dengan gerakan tangan',{size:12,color:C.blueSoft});
pill(pdf,MX,150,'TEMA BINUS',C.orange,C.white);
pill(pdf,MX+120,150,'60 DETIK',C.cyan,C.ink);
pill(pdf,MX+230,150,'TANPA STIK',C.white,C.blue);
// mascot
vee(pdf,470,150,1.15,'wave');
pdf.text(470,250,'Halo! Aku Vee.',{size:11,font:'Helvetica-Bold',color:C.white,align:'center'});
// intro card
pdf.fill(...C.white).roundRect(MX,300,W-2*MX,150,16,'f');
pdf.save().lineWidth(1).stroke(...C.line).roundRect(MX,300,W-2*MX,150,16,'S').restore();
pdf.fill(...C.orange).roundRect(MX,300,8,150,4,'f');
pdf.text(MX+28,322,'Apa ini?',{size:15,font:'Helvetica-Bold',color:C.blue});
pdf.paragraph(MX+28,348,'AI Hand Battle adalah game kamera. Kameramu membaca gerakan tangan untuk membidik, menembak, memasang perisai, dan melepas serangan nova. Semua diproses di perangkatmu — video tidak direkam dan tidak diunggah. Lindungi "core" selama 60 detik, kumpulkan skor setinggi mungkin, dan rebut papan peringkat.',
 {size:10.5,color:[0.2,0.26,0.32],width:W-2*MX-56,leading:15});
// what you need
pdf.fill(...C.panel).roundRect(MX,470,W-2*MX,120,16,'f');
pdf.text(MX+24,490,'Yang kamu butuhkan',{size:13,font:'Helvetica-Bold',color:C.blue});
const needs=[['Laptop/PC berkamera','atau webcam eksternal'],['Browser Chrome / Edge','atau aplikasi desktop'],['Cahaya cukup terang','tangan terlihat jelas'],['Ruang gerak tangan','sekitar 1 meter dari kamera']];
needs.forEach(([a,b],i)=>{const x=MX+24+(i%2)*((W-2*MX-48)/2);const y=512+Math.floor(i/2)*38;
 pdf.fill(...C.cyan).circle(x+6,y+6,5,'f');
 pdf.text(x+20,y,a,{size:10.5,font:'Helvetica-Bold',color:C.ink});
 pdf.text(x+20,y+14,b,{size:9,color:C.grey});});
// safety note
pdf.text(MX,620,'Vee bilang:',{size:10,font:'Helvetica-Bold',color:C.orange});
pdf.paragraph(MX,636,'"Kamera cuma membaca bentuk tangan. Tidak ada rekaman yang disimpan atau dikirim ke mana pun. Aman untuk dimainkan ramai-ramai di booth!"',
 {size:10,font:'Helvetica-Oblique',color:[0.3,0.35,0.4],width:W-2*MX,leading:14});
vee(pdf,W-110,660,0.55,'point');
footer(pdf,1);

// ============================================================ PAGE 2 — CARA MENJALANKAN
pdf.addPage();pageBg(pdf);
pdf.fill(...C.blue).rect(0,0,W,96,'f');pdf.fill(...C.orange).rect(0,96,W,6,'f');
pdf.text(MX,34,'1  ·  Cara menjalankan',{size:22,font:'Helvetica-Bold',color:C.white});
pdf.text(MX,70,'Pilih salah satu. Semua jalan di perangkatmu sendiri.',{size:11,color:C.blueSoft});
vee(pdf,520,52,0.5,'wave');

let y=128;
pdf.text(MX,y,'A. Paling gampang — aplikasi (.exe / .dmg / .AppImage)',{size:13,font:'Helvetica-Bold',color:C.orange});y+=22;
stepCard(pdf,MX,y,W-2*MX,66,1,'Download aplikasi','Buka halaman GitHub Releases proyek ini, lalu unduh file untuk sistemmu: Windows (.exe), macOS (.dmg), atau Linux (.AppImage). Tidak perlu memasang apa pun yang lain.',C.blue);y+=78;
stepCard(pdf,MX,y,W-2*MX,66,2,'Buka dan izinkan kamera','Jalankan aplikasinya. Saat diminta, izinkan akses kamera. Game langsung tampil layar penuh — cocok untuk panggung atau booth.',C.cyanDark);y+=90;

pdf.text(MX,y,'B. Dari Command Prompt (butuh Node.js)',{size:13,font:'Helvetica-Bold',color:C.orange});y+=22;
stepCard(pdf,MX,y,W-2*MX,78,1,'Siapkan sekali saja','Pasang Node.js versi 22+ dari nodejs.org. Lalu unduh/clone proyek:  git clone https://github.com/dericochen/gamecomputervision.git',C.blue);y+=90;
stepCard(pdf,MX,y,W-2*MX,92,2,'Jalankan','Di PowerShell:   cd gamecomputervision   lalu   .\\Main-Game.cmd\nDi Command Prompt biasa cukup:   Main-Game.cmd\nBrowser akan terbuka di http://localhost:8000. Izinkan kamera, dan main! Tekan Ctrl+C di jendela hitam untuk berhenti.',C.cyanDark);y+=104;

pdf.fill(...C.orangeSoft).roundRect(MX,y,W-2*MX,56,12,'f');
pdf.text(MX+18,y+16,'Catatan Vee',{size:10.5,font:'Helvetica-Bold',color:C.orange});
pdf.paragraph(MX+18,y+32,'Di PowerShell wajib ada ".\\" di depan nama file. Kalau Node.js belum ada, file .cmd akan memberi tahu. Besok tinggal ulangi langkah "Jalankan" saja — tidak perlu pasang ulang.',
 {size:9,color:[0.4,0.3,0.2],width:W-2*MX-130,leading:12});
vee(pdf,W-96,y+30,0.42,'point');
footer(pdf,2);

// ============================================================ PAGE 3 — GERAKAN TANGAN
pdf.addPage();pageBg(pdf);
pdf.fill(...C.blue).rect(0,0,W,96,'f');pdf.fill(...C.orange).rect(0,96,W,6,'f');
pdf.text(MX,34,'2  ·  Empat gerakan inti',{size:22,font:'Helvetica-Bold',color:C.white});
pdf.text(MX,70,'Angkat tangan bidik lebih dulu, telapak menghadap kamera.',{size:11,color:C.blueSoft});
vee(pdf,520,52,0.5,'cheer');

const moves=[
 ['point','Bidik','Telunjuk tegak, tiga jari dilipat. Geser tangan untuk menggerakkan lingkaran sasaran.',C.cyanDark],
 ['pinch','Energy Blast','Tempelkan ujung ibu jari ke ujung telunjuk; jari lain bebas. Tahan untuk menembak. Susah? Nyalakan Tembak otomatis.',C.orange],
 ['palm','Shield','Buka kelima jari. Perisai menyala selama energi ada. Lepas telapak untuk mengisi ulang.',C.blue],
 ['fist','Nova','Kepalkan tangan 1,5 detik sampai READY, lalu buka telapak untuk melepas ledakan ke seluruh arena.',C.purple],
];
y=120;
const cardW=(W-2*MX-20)/2, cardH=180;
moves.forEach((m,i)=>{
 const x=MX+(i%2)*(cardW+20), yy=y+Math.floor(i/2)*(cardH+18);
 pdf.fill(...C.white).roundRect(x,yy,cardW,cardH,14,'f');
 pdf.save().lineWidth(1).stroke(...C.line).roundRect(x,yy,cardW,cardH,14,'S').restore();
 pdf.fill(...m[3]).roundRect(x,yy,cardW,34,14,'f');pdf.fill(...m[3]).rect(x,yy+20,cardW,14,'f');
 pdf.text(x+16,yy+10,m[1].toUpperCase(),{size:12,font:'Helvetica-Bold',color:C.white});
 pdf.text(x+cardW-16,yy+10,'0'+(i+1),{size:12,font:'Helvetica-Bold',color:C.blueSoft,align:'right'});
 pdf.fill(...C.panel).roundRect(x+16,yy+48,cardW-32,86,10,'f');
 gesture(pdf,x+cardW/2,yy+112,m[0],1.3);
 pdf.paragraph(x+16,yy+144,m[2],{size:9.3,color:[0.25,0.3,0.35],width:cardW-32,leading:12});
});
y+=2*(cardH+18)+6;
pdf.fill(...C.blueSoft).roundRect(MX,y,W-2*MX,46,10,'f');
pdf.text(MX+16,y+13,'Tangan kedua?',{size:10.5,font:'Helvetica-Bold',color:C.blue});
pdf.paragraph(MX+16,y+28,'Boleh! Tangan satu menembak, tangan kedua bisa membuka telapak untuk memasang shield pada saat bersamaan.',
 {size:9,color:[0.2,0.3,0.4],width:W-2*MX-32,leading:12});
footer(pdf,3);

// ============================================================ PAGE 4 — SKOR, MUSUH, MODE RAMAI
pdf.addPage();pageBg(pdf);
pdf.fill(...C.blue).rect(0,0,W,96,'f');pdf.fill(...C.orange).rect(0,96,W,6,'f');
pdf.text(MX,34,'3  ·  Musuh, skor & bermain ramai',{size:21,font:'Helvetica-Bold',color:C.white});
pdf.text(MX,70,'Bertahan tiga wave, kalahkan boss, kejar grade S.',{size:11,color:C.blueSoft});
vee(pdf,525,52,0.48,'point');

y=120;
pdf.text(MX,y,'Musuh & bonus',{size:13,font:'Helvetica-Bold',color:C.orange});y+=20;
const rows=[
 ['VIRUS / BUG','Musuh dasar yang bergerak zig-zag. Bug lebih cepat.','+100',C.cyan],
 ['TROJAN','Berlapis baja, perlu 3 tembakan.','+150',C.purple],
 ['WORM','Pecah jadi dua bug saat hancur.','+50',C.cyanDark],
 ['BONUS EMAS','Melintas cepat. Pasti menjatuhkan power-up.','+400',C.gold],
 ['BOSS (detik 42)','Mega Virus 30 nyawa. Nova memberi 8 damage.','+3000',C.red],
];
rows.forEach((r,i)=>{
 const ry=y+i*30;
 pdf.fill(...(i%2?C.white:C.panel)).roundRect(MX,ry,W-2*MX,27,7,'f');
 pdf.fill(...r[3]).circle(MX+16,ry+13,6,'f');
 pdf.text(MX+32,ry+9,r[0],{size:10,font:'Helvetica-Bold',color:C.ink});
 pdf.text(MX+150,ry+9,r[1],{size:9,color:C.grey});
 pdf.text(W-MX-14,ry+8,r[2],{size:11,font:'Helvetica-Bold',color:r[3],align:'right'});
});
y+=rows.length*30+16;

pdf.text(MX,y,'Power-up (tembak ikonnya)',{size:13,font:'Helvetica-Bold',color:C.orange});y+=20;
const pu=[['Rapid Fire','tembakan lebih cepat'],['Chain Blast','kena 2 musuh terdekat'],['Core Repair','+1 nyawa'],['Shield Penuh','isi ulang perisai']];
pu.forEach(([a,b],i)=>{const x=MX+(i%2)*((W-2*MX)/2);const yy=y+Math.floor(i/2)*34;
 pdf.fill(...C.cyan).roundRect(x,yy,20,20,6,'f');
 pdf.text(x+30,yy+2,a,{size:10,font:'Helvetica-Bold',color:C.ink});
 pdf.text(x+30,yy+15,b,{size:8.5,color:C.grey});});
y+=2*34+6;
pdf.fill(...C.orangeSoft).roundRect(MX,y,W-2*MX,30,8,'f');
pdf.text(MX+14,y+10,'FEVER x2:',{size:10,font:'Helvetica-Bold',color:C.orange});
pdf.text(MX+76,y+10,'setiap combo kelipatan 12 — skor dobel & tembakan super cepat 8 detik.',{size:9.5,color:[0.4,0.3,0.2]});
y+=42;

pdf.fill(...C.blue).roundRect(MX,y,W-2*MX,118,14,'f');
pdf.text(MX+20,y+18,'Main ramai-ramai (mode booth)',{size:13,font:'Helvetica-Bold',color:C.white});
const booth=[
 'Pemain = orang yang tangannya paling dekat ke kamera. Tangan penonton diabaikan (abu-abu).',
 'Tanpa sentuh: tahan telapak terbuka 2 detik untuk mulai, dan untuk pemain berikutnya di layar hasil.',
 'Selama ronde, penonton tidak bisa mengambil alih. Kalau pemain keluar frame, game otomatis jeda.',
 'Mode panggung menampilkan arena layar penuh + Top 5 skor hari ini.',
];
let by=y+36;
for(const b of booth){pdf.fill(...C.cyan).circle(MX+24,by+4,3,'f');by=pdf.paragraph(MX+34,by,b,{size:9.3,color:C.blueSoft,width:W-2*MX-90,leading:12})+2}
vee(pdf,W-92,y+60,0.42,'cheer');
footer(pdf,4);

// ---------------------------------------------------------------- write
const outDir=new URL('../docs/',import.meta.url);
fs.mkdirSync(outDir,{recursive:true});
const outFile=new URL('../docs/Panduan-AI-Hand-Battle.pdf',import.meta.url);
fs.writeFileSync(outFile,pdf.toBuffer());
console.log('Wrote docs/Panduan-AI-Hand-Battle.pdf ('+fs.statSync(outFile).size+' bytes, '+pdf.pages.length+' halaman)');
