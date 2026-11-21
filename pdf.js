/* Offline PDF writer for private weekly planner; no network or external dependencies. */
(function () {
 'use strict';
 const PAGE_W=1190.55, PAGE_H=841.89, MARGIN=35;
 function safe(s){return String(s??'').replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').trim();}
 function escapePdf(s){
  const win={0x20ac:128,0x201a:130,0x0192:131,0x201e:132,0x2026:133,0x2020:134,0x2021:135,0x02c6:136,0x2030:137,0x0160:138,0x2039:139,0x0152:140,0x017d:142,0x2018:145,0x2019:146,0x201c:147,0x201d:148,0x2022:149,0x2013:150,0x2014:151,0x02dc:152,0x2122:153,0x0161:154,0x203a:155,0x0153:156,0x017e:158,0x0178:159};
  let out='';
  for(const ch of safe(s)){
   const cp=ch.codePointAt(0),v=cp<=255?cp:(win[cp]??63);
   if(v===40||v===41||v===92)out+='\\'+String.fromCharCode(v);
   else if(v<32||v>126)out+='\\'+v.toString(8).padStart(3,'0');
   else out+=String.fromCharCode(v);
  }
  return out;
 }
 function approxWidth(text,size,bold){let n=0;for(const c of text){n+=c===' '?0.29:/[il\.,:;\!\|]/.test(c)?0.25:/[mwMW@]/.test(c)?0.78:0.51;}return n*size*(bold?1.04:1)}
 function wrap(text,maxWidth,size,bold,maxLines=100){
  const words=safe(text).split(' ');let lines=[],line='';
  for(const word of words){
   let test=line?line+' '+word:word;
   if(approxWidth(test,size,bold)<=maxWidth){line=test;continue;}
   if(line){lines.push(line);line=''}
   if(approxWidth(word,size,bold)<=maxWidth){line=word;continue;}
   let segment='';for(const c of word){if(approxWidth(segment+c,size,bold)>maxWidth&&segment){lines.push(segment);segment=''}segment+=c}line=segment;
  }
  if(line)lines.push(line);
  if(lines.length>maxLines){lines=lines.slice(0,maxLines);let t=lines[maxLines-1];while(approxWidth(t+'...',size,bold)>maxWidth&&t.length)t=t.slice(0,-1);lines[maxLines-1]=t+'...';}
  return lines.length?lines:[''];
 }
 function color(hex){const s=/^#[0-9a-f]{6}$/i.test(hex||'')?hex:'#3775c9';return [1,3,5].map(i=>parseInt(s.slice(i,i+2),16)/255)}
 const bg=(hex)=>color(hex).map(x=>0.9+0.1*x);
 function number(n){return Number(n.toFixed(2)).toString()}
 function makeCanvas(){
  const commands=[];
  const rect=(x,y,w,h,fill,stroke)=>{commands.push(`${fill.map(number).join(' ')} rg`,`${stroke.map(number).join(' ')} RG`,`${number(x)} ${number(y)} ${number(w)} ${number(h)} re B`)};
  const text=(value,x,y,fontSize=9,bold=false,fill=[0.11,0.16,0.23])=>{commands.push(`${fill.map(number).join(' ')} rg`,`BT /${bold?'F2':'F1'} ${number(fontSize)} Tf 1 0 0 1 ${number(x)} ${number(y)} Tm (${escapePdf(value)}) Tj ET`)};
  return {commands,rect,text};
 }
 function dateKey(d){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
 function addDays(d,n){return new Date(d.getFullYear(),d.getMonth(),d.getDate()+n)}
 function timeStr(m){const t=m%1440;return String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0')}
 function timeLine(e){const end=e.start+e.duration;return `${timeStr(e.start)}-${timeStr(end)}${end>=1440?' (+1 Tag)':''} (${String(e.duration/60).replace('.',',')} Std.)`}
 function eventLayout(e,w){
  const sz=8.3, line=10.1, result=[];
  const title=wrap(e.title,w,sz,true,2);for(const str of title)result.push({str,sz,bold:true,h:line});
  const loc=wrap(e.location?.trim()||'keine Ortsvorgabe',w,7.4,false,1);for(const str of loc)result.push({str,sz:7.4,bold:false,h:9.4});
  result.push({str:timeLine(e),sz:7.6,bold:true,h:10});
  if(e.notes?.trim())for(const str of wrap(e.notes,w,7.2,false,3))result.push({str,sz:7.2,bold:false,h:9});
  return {lines:result,height:result.reduce((a,x)=>a+x.h,0)+8};
 }
 function bytes(text){return new TextEncoder().encode(text)}
 function concat(arr){let len=arr.reduce((s,x)=>s+x.length,0),buffer=new Uint8Array(len),pos=0;for(const b of arr){buffer.set(b,pos);pos+=b.length}return buffer}
 function pdfFile(pages){
  // Objects: catalog, pages, 2 standard fonts, then one page + content stream for each sheet.
  const objs=['<< /Type /Catalog /Pages 2 0 R >>',null,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
  const pageIds=[];
  for(const page of pages){const pageId=objs.length+1,streamId=pageId+1;pageIds.push(pageId);
   objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${number(PAGE_W)} ${number(PAGE_H)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamId} 0 R >>`);
   const stream=page.commands.join('\n')+'\n';objs.push(`<< /Length ${bytes(stream).length} >>\nstream\n${stream}endstream`);
  }
  objs[1]=`<< /Type /Pages /Kids [${pageIds.map(x=>x+' 0 R').join(' ')}] /Count ${pages.length} >>`;
  const parts=[bytes('%PDF-1.4\n%PDF-Generator\n')],offsets=[0];let length=parts[0].length;
  for(let i=0;i<objs.length;i++){offsets.push(length);const b=bytes(`${i+1} 0 obj\n${objs[i]}\nendobj\n`);parts.push(b);length+=b.length}
  const xrefOffset=length;
  let xref=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`;
  for(let i=1;i<offsets.length;i++)xref+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
  xref+=`trailer\n<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  parts.push(bytes(xref));return concat(parts);
 }
 function createPdf(data,monday,weekNo,year){
  const deps=data.departments.filter(d=>d.visible!==false),col0=155,col=(PAGE_W-2*MARGIN-col0)/7;
  const dates=Array.from({length:7},(_,i)=>addDays(monday,i));
  const detail=deps.map(dep=>({dep,cells:dates.map(d=>data.events.filter(e=>e.date===dateKey(d)&&e.dept===dep.id).sort((a,b)=>a.start-b.start).map(e=>eventLayout(e,col-16)))}));
  for(const row of detail)row.height=Math.max(51,...row.cells.map(c=>c.reduce((n,x)=>n+x.height+3,9)));
  const pages=[];let current=makeCanvas(),y=PAGE_H-MARGIN;
  const drawHeader=()=>{
   current.text('Wochenplanung Schwerpunkte',MARGIN,y-18,20,true);
   current.text(`KW ${String(weekNo).padStart(2,'0')} / ${year}`,MARGIN,y-41,11,true);
   current.text(`${dateKey(dates[0])} bis ${dateKey(dates[6])}`,PAGE_W-250,y-41,10,false);
   y-=66;
   current.rect(MARGIN,y-31,col0,31,[0.88,0.92,0.97],[0.76,0.81,0.88]);current.text('Dienststelle',MARGIN+9,y-21,10,true);
   for(let i=0;i<7;i++){let x=MARGIN+col0+i*col;current.rect(x,y-31,col,31,[0.88,0.92,0.97],[0.76,0.81,0.88]);current.text(['Mo','Di','Mi','Do','Fr','Sa','So'][i]+' '+String(dates[i].getDate()).padStart(2,'0')+'.'+String(dates[i].getMonth()+1).padStart(2,'0')+'.',x+8,y-21,9,true)}y-=31;
  };
  const finish=()=>{current.text('Privater Kalender - ausschliesslich lokal auf dem Geraet gespeichert',MARGIN,19,8,false,[0.45,0.5,0.59]);pages.push(current);};
  drawHeader();
  for(const row of detail){
   const h=Math.min(row.height,640); // Extremely crowded cells are clipped only if exceeding a whole page.
   if(y-h<MARGIN+20){finish();current=makeCanvas();y=PAGE_H-MARGIN;drawHeader()}
   current.rect(MARGIN,y-h,col0,h,[0.96,0.97,0.99],[0.77,0.82,0.88]);
   current.rect(MARGIN,y-h,4,h,color(row.dep.color),color(row.dep.color));
   const name=wrap(row.dep.name,col0-20,10,true,3);name.forEach((line,i)=>current.text(line,MARGIN+12,y-20-i*12,10,true));
   for(let i=0;i<7;i++){
    const x=MARGIN+col0+i*col;current.rect(x,y-h,col,h,i>=5?[0.974,0.978,0.986]:[1,1,1],[0.77,0.82,0.88]);
    let yy=y-5;
    for(const event of row.cells[i]){
     if(yy-event.height<y-h+1){current.text('Weitere Termine ...',x+8,y-h+8,7);break}
     current.rect(x+4,yy-event.height,col-8,event.height-2,bg(row.dep.color),bg(row.dep.color));
     current.rect(x+4,yy-event.height,3,event.height-2,color(row.dep.color),color(row.dep.color));
     let ty=yy-11;
     for(const line of event.lines){current.text(line.str,x+12,ty,line.sz,line.bold);ty-=line.h}
     yy-=event.height+3;
    }
   }
   y-=h;
  }
  finish();return pdfFile(pages);
 }
 window.WochenplanungPDF={createPdf};
})();
