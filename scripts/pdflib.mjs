// Tiny zero-dependency PDF writer: enough vector + text primitives to draw a
// multi-page illustrated guide. Coordinates use a top-left origin (y grows down);
// we flip into PDF's bottom-left space on output. Units are points (72 = 1 inch).
import zlib from 'node:zlib';

const STD_FONTS={Helvetica:'Helvetica','Helvetica-Bold':'Helvetica-Bold','Helvetica-Oblique':'Helvetica-Oblique'};

export class PDF{
 constructor({width=595.28,height=841.89}={}){ // A4 portrait
  this.width=width;this.height=height;this.pages=[];this.page=null;
 }
 addPage(){this.page={ops:[]};this.pages.push(this.page);return this.page}
 _y(y){return this.height-y}
 // --- graphics state ---
 _n(v){return (Math.round(v*1000)/1000).toString()}
 fill(r,g,b){this.page.ops.push(`${this._n(r)} ${this._n(g)} ${this._n(b)} rg`);return this}
 stroke(r,g,b){this.page.ops.push(`${this._n(r)} ${this._n(g)} ${this._n(b)} RG`);return this}
 lineWidth(w){this.page.ops.push(`${this._n(w)} w`);return this}
 lineCap(c){this.page.ops.push(`${c} J`);return this} // 0 butt,1 round,2 square
 lineJoin(j){this.page.ops.push(`${j} j`);return this}
 save(){this.page.ops.push('q');return this}
 restore(){this.page.ops.push('Q');return this}
 // --- shapes ---
 rect(x,y,w,h,mode='f'){this.page.ops.push(`${this._n(x)} ${this._n(this._y(y+h))} ${this._n(w)} ${this._n(h)} re ${mode}`);return this}
 roundRect(x,y,w,h,r,mode='f'){
  const k=0.5522847498*r,yy=y;
  const Y=v=>this._y(v);
  const p=[];
  p.push(`${this._n(x+r)} ${this._n(Y(yy))} m`);
  p.push(`${this._n(x+w-r)} ${this._n(Y(yy))} l`);
  p.push(`${this._n(x+w-r+k)} ${this._n(Y(yy))} ${this._n(x+w)} ${this._n(Y(yy+r-k))} ${this._n(x+w)} ${this._n(Y(yy+r))} c`);
  p.push(`${this._n(x+w)} ${this._n(Y(yy+h-r))} l`);
  p.push(`${this._n(x+w)} ${this._n(Y(yy+h-r+k))} ${this._n(x+w-r+k)} ${this._n(Y(yy+h))} ${this._n(x+w-r)} ${this._n(Y(yy+h))} c`);
  p.push(`${this._n(x+r)} ${this._n(Y(yy+h))} l`);
  p.push(`${this._n(x+r-k)} ${this._n(Y(yy+h))} ${this._n(x)} ${this._n(Y(yy+h-r+k))} ${this._n(x)} ${this._n(Y(yy+h-r))} c`);
  p.push(`${this._n(x)} ${this._n(Y(yy+r))} l`);
  p.push(`${this._n(x)} ${this._n(Y(yy+r-k))} ${this._n(x+r-k)} ${this._n(Y(yy))} ${this._n(x+r)} ${this._n(Y(yy))} c`);
  this.page.ops.push(p.join(' ')+` ${mode}`);
  return this;
 }
 circle(cx,cy,r,mode='f'){
  const k=0.5522847498*r,Y=v=>this._y(v);
  this.page.ops.push([
   `${this._n(cx+r)} ${this._n(Y(cy))} m`,
   `${this._n(cx+r)} ${this._n(Y(cy-k))} ${this._n(cx+k)} ${this._n(Y(cy-r))} ${this._n(cx)} ${this._n(Y(cy-r))} c`,
   `${this._n(cx-k)} ${this._n(Y(cy-r))} ${this._n(cx-r)} ${this._n(Y(cy-k))} ${this._n(cx-r)} ${this._n(Y(cy))} c`,
   `${this._n(cx-r)} ${this._n(Y(cy+k))} ${this._n(cx-k)} ${this._n(Y(cy+r))} ${this._n(cx)} ${this._n(Y(cy+r))} c`,
   `${this._n(cx+k)} ${this._n(Y(cy+r))} ${this._n(cx+r)} ${this._n(Y(cy+k))} ${this._n(cx+r)} ${this._n(Y(cy))} c`,
  ].join(' ')+` ${mode}`);
  return this;
 }
 ellipse(cx,cy,rx,ry,mode='f'){
  const kx=0.5522847498*rx,ky=0.5522847498*ry,Y=v=>this._y(v);
  this.page.ops.push([
   `${this._n(cx+rx)} ${this._n(Y(cy))} m`,
   `${this._n(cx+rx)} ${this._n(Y(cy-ky))} ${this._n(cx+kx)} ${this._n(Y(cy-ry))} ${this._n(cx)} ${this._n(Y(cy-ry))} c`,
   `${this._n(cx-kx)} ${this._n(Y(cy-ry))} ${this._n(cx-rx)} ${this._n(Y(cy-ky))} ${this._n(cx-rx)} ${this._n(Y(cy))} c`,
   `${this._n(cx-rx)} ${this._n(Y(cy+ky))} ${this._n(cx-kx)} ${this._n(Y(cy+ry))} ${this._n(cx)} ${this._n(Y(cy+ry))} c`,
   `${this._n(cx+kx)} ${this._n(Y(cy+ry))} ${this._n(cx+rx)} ${this._n(Y(cy+ky))} ${this._n(cx+rx)} ${this._n(Y(cy))} c`,
  ].join(' ')+` ${mode}`);
  return this;
 }
 line(x1,y1,x2,y2){this.page.ops.push(`${this._n(x1)} ${this._n(this._y(y1))} m ${this._n(x2)} ${this._n(this._y(y2))} l S`);return this}
 // path from [[x,y],...]; close+fill or stroke
 poly(points,mode='f',close=true){
  const ops=points.map(([x,y],i)=>`${this._n(x)} ${this._n(this._y(y))} ${i?'l':'m'}`);
  this.page.ops.push(ops.join(' ')+(close?' h':'')+` ${mode}`);
  return this;
 }
 // --- text ---
 _esc(s){return String(s).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)')}
 text(x,y,str,{size=11,font='Helvetica',color=[0,0,0],align='left',width=0}={}){
  const w=this.textWidth(str,size,font);
  let tx=x;if(align==='center')tx=x-w/2;else if(align==='right')tx=x-w;
  this.page.ops.push(`BT /${this._fontKey(font)} ${this._n(size)} Tf ${this._n(color[0])} ${this._n(color[1])} ${this._n(color[2])} rg ${this._n(tx)} ${this._n(this._y(y+size*0.72))} Td (${this._esc(str)}) Tj ET`);
  return w;
 }
 // naive word wrap, returns new y
 paragraph(x,y,str,{size=11,font='Helvetica',color=[0,0,0],width=400,leading=null}={}){
  leading=leading??size*1.45;
  const words=str.split(/\s+/);let line='';let cy=y;
  for(const word of words){
   const trial=line?line+' '+word:word;
   if(this.textWidth(trial,size,font)>width&&line){this.text(x,cy,line,{size,font,color});cy+=leading;line=word}
   else line=trial;
  }
  if(line){this.text(x,cy,line,{size,font,color});cy+=leading}
  return cy;
 }
 _fontKey(font){return font==='Helvetica-Bold'?'FB':font==='Helvetica-Oblique'?'FI':'F1'}
 // Approximate Helvetica widths (per 1000 units). Good enough for layout.
 textWidth(str,size,font='Helvetica'){
  const bold=font==='Helvetica-Bold';
  let total=0;
  for(const ch of String(str)){total+=charWidth(ch,bold)}
  return total/1000*size;
 }
 toBuffer(){
  const objects=[];
  const add=s=>{objects.push(s);return objects.length};
  // Fonts
  const fontObjs={};
  for(const [key,base] of [['F1','Helvetica'],['FB','Helvetica-Bold'],['FI','Helvetica-Oblique']]){
   fontObjs[key]=add(`<< /Type /Font /Subtype /Type1 /BaseFont /${base} /Encoding /WinAnsiEncoding >>`);
  }
  const kids=[];const pagesId=objects.length+1; // placeholder count; fix after
  // We need Pages id known before pages reference it. Reserve it.
  const reservedPages=add('PENDING');
  const contentIds=[];
  for(const page of this.pages){
   const stream=page.ops.join('\n');
   const compressed=zlib.deflateSync(Buffer.from(stream,'latin1'));
   const cid=add({stream:compressed,dict:`<< /Length ${compressed.length} /Filter /FlateDecode >>`});
   contentIds.push(cid);
  }
  const pageIds=[];
  for(let i=0;i<this.pages.length;i++){
   const pid=add(`<< /Type /Page /Parent ${reservedPages} 0 R /MediaBox [0 0 ${this._n(this.width)} ${this._n(this.height)}] /Resources << /Font << /F1 ${fontObjs.F1} 0 R /FB ${fontObjs.FB} 0 R /FI ${fontObjs.FI} 0 R >> >> /Contents ${contentIds[i]} 0 R >>`);
   pageIds.push(pid);kids.push(`${pid} 0 R`);
  }
  objects[reservedPages-1]=`<< /Type /Pages /Count ${pageIds.length} /Kids [${kids.join(' ')}] >>`;
  const catalog=add(`<< /Type /Catalog /Pages ${reservedPages} 0 R >>`);
  // Serialize
  let out=Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n','latin1');
  const offsets=[];
  const chunks=[out];
  let pos=out.length;
  for(let i=0;i<objects.length;i++){
   offsets[i]=pos;
   const obj=objects[i];
   let head,body;
   if(typeof obj==='object'&&obj.stream){
    head=Buffer.from(`${i+1} 0 obj\n${obj.dict}\nstream\n`,'latin1');
    const tail=Buffer.from('\nendstream\nendobj\n','latin1');
    const buf=Buffer.concat([head,obj.stream,tail]);
    chunks.push(buf);pos+=buf.length;
   }else{
    const buf=Buffer.from(`${i+1} 0 obj\n${obj}\nendobj\n`,'latin1');
    chunks.push(buf);pos+=buf.length;
   }
  }
  const xrefPos=pos;
  let xref=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  for(const off of offsets)xref+=String(off).padStart(10,'0')+' 00000 n \n';
  xref+=`trailer\n<< /Size ${objects.length+1} /Root ${catalog} 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  chunks.push(Buffer.from(xref,'latin1'));
  return Buffer.concat(chunks);
 }
}

// Minimal Helvetica metrics table (AFM-derived, common glyphs).
const HELV={' ':278,'!':278,'"':355,'#':556,'$':556,'%':889,'&':667,"'":191,'(':333,')':333,'*':389,'+':584,',':278,'-':333,'.':278,'/':278,'0':556,'1':556,'2':556,'3':556,'4':556,'5':556,'6':556,'7':556,'8':556,'9':556,':':278,';':278,'<':584,'=':584,'>':584,'?':556,'@':1015,'A':667,'B':667,'C':722,'D':722,'E':667,'F':611,'G':778,'H':722,'I':278,'J':500,'K':667,'L':556,'M':833,'N':722,'O':778,'P':667,'Q':778,'R':722,'S':667,'T':611,'U':722,'V':667,'W':944,'X':667,'Y':667,'Z':611,'[':278,'\\':278,']':278,'^':469,'_':556,'`':333,'a':556,'b':556,'c':500,'d':556,'e':556,'f':278,'g':556,'h':556,'i':222,'j':222,'k':500,'l':222,'m':833,'n':556,'o':556,'p':556,'q':556,'r':333,'s':500,'t':278,'u':556,'v':500,'w':722,'x':500,'y':500,'z':500,'{':334,'|':260,'}':334,'~':584};
const HELVB={' ':278,'!':333,'"':474,'#':556,'$':556,'%':889,'&':722,"'":238,'(':333,')':333,'*':389,'+':584,',':278,'-':333,'.':278,'/':278,'0':556,'1':556,'2':556,'3':556,'4':556,'5':556,'6':556,'7':556,'8':556,'9':556,':':333,';':333,'<':584,'=':584,'>':584,'?':611,'@':975,'A':722,'B':722,'C':722,'D':722,'E':667,'F':611,'G':778,'H':722,'I':278,'J':556,'K':722,'L':611,'M':833,'N':722,'O':778,'P':667,'Q':778,'R':722,'S':667,'T':611,'U':722,'V':667,'W':944,'X':667,'Y':667,'Z':611,'[':333,'\\':278,']':333,'^':584,'_':556,'`':333,'a':556,'b':611,'c':556,'d':611,'e':556,'f':333,'g':611,'h':611,'i':278,'j':278,'k':556,'l':278,'m':889,'n':611,'o':611,'p':611,'q':611,'r':389,'s':556,'t':333,'u':611,'v':556,'w':778,'x':556,'y':556,'z':500,'{':389,'|':280,'}':389,'~':584};
function charWidth(ch,bold){const t=bold?HELVB:HELV;return t[ch]??(bold?611:556)}
