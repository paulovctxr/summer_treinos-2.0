import type { TrainingPlan } from './training-plans.ts';
import { displayDate } from './assessments.ts';

// A4 portrait contains two horizontal A5 cards, matching the academy's paper form.
export async function printTraining(plan:TrainingPlan){
  const popup=window.open('','_blank','width=960,height=1000');
  if(!popup)throw new Error('Impressão bloqueada');
  popup.opener=null;
  const doc=popup.document;
  doc.open();doc.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head><body></body></html>');doc.close();
  doc.title='Ficha de treino — '+(plan.student_name||'Rascunho');
  // Embed the logo so the printable document also works after the app is closed.
  let logoData='';
  try{const response=await fetch('/summer-fit-brand.jpeg',{signal:AbortSignal.timeout(5000)});if(response.ok){const blob=await response.blob();logoData=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(blob);});}}catch{/* The academy name remains visible if the logo cannot be loaded. */}
  if(popup.closed)return;
  const style=doc.createElement('style');style.textContent=`
    *{box-sizing:border-box}body{margin:0;background:#eee;color:#111;font-family:Arial,sans-serif}
    .controls{position:sticky;top:0;z-index:2;background:#fff;padding:16px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;border-bottom:1px solid #aaa}
    button{padding:12px 18px;cursor:pointer;border:1px solid #aaa;border-radius:8px;background:#fff}button:first-child{background:#bd1425;color:#fff;border-color:#bd1425}
    .hint{flex-basis:100%;font-size:13px;margin:0;line-height:1.5}
    .sheet{width:210mm;height:297mm;display:flex;flex-direction:column;background:#fff;margin:16px auto;break-after:page;page-break-after:always}
    .sheet:last-child{break-after:auto;page-break-after:auto}
    .half{width:210mm;height:148.5mm;padding:6mm 7mm 8mm;display:flex;flex-direction:column;position:relative;flex-shrink:0}
    .half:first-child{border-bottom:1px dashed #888}
    .brand{height:12mm;display:flex;align-items:center;gap:5mm;border:1px solid #444;padding:1mm 2mm}
    .brand img{width:40mm;height:10mm;object-fit:contain}.brand strong{font-size:13pt;letter-spacing:.4px}.draft{font-size:8pt;font-weight:bold;margin-left:auto}
    .identity{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8pt}
    .identity td{border:1px solid #777;padding:1mm 1.5mm;overflow-wrap:anywhere;line-height:1.2}
    .identity td:nth-child(1){width:22mm;font-size:7pt;font-weight:bold;white-space:nowrap}
    .identity td:nth-child(3){width:22mm;font-size:7pt;font-weight:bold}
    .identity td:nth-child(4){width:31mm}
    .workout{font-size:8pt;font-weight:bold;line-height:1.25;background:#eee;border:1px solid #777;border-top:0;padding:1.5mm;overflow-wrap:anywhere}
    .rows{flex:1;min-height:0;padding-top:2mm}
    .exercises{width:100%;table-layout:fixed;border-collapse:collapse;font-size:8pt}
    .exercises th,.exercises td{border:1px solid #777;padding:1mm 1.2mm;line-height:1.25;overflow-wrap:anywhere;white-space:pre-wrap;vertical-align:middle}
    .exercises th{font-size:7pt;background:#eee;text-align:center}
    .exercises td:nth-child(2),.exercises td:nth-child(3),.exercises td:nth-child(4){text-align:center}
    .exercises tr{min-height:5mm}.exercises .notes{text-align:left;font-size:7.5pt}.footer{position:absolute;bottom:3mm;left:7mm;right:7mm;font-size:6.5pt;display:flex;justify-content:space-between}
    @page{size:A4 portrait;margin:0}
    @media print{body{background:white}.controls{display:none}.sheet{margin:0}.half{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
  `;doc.head.append(style);
  const controls=doc.createElement('div');controls.className='controls';doc.body.append(controls);
  const print=doc.createElement('button');print.textContent='Imprimir ficha';print.onclick=()=>{popup.focus();popup.print();};controls.append(print);
  const label=doc.createElement('label');const copies=doc.createElement('input');copies.type='checkbox';copies.checked=true;label.append(copies,doc.createTextNode(' Duas cópias por folha A4'));controls.append(label);
  const hint=doc.createElement('p');hint.className='hint';hint.textContent='Ficha horizontal de meia folha A4. Na impressão, use papel A4, orientação retrato, escala 100% e desative cabeçalhos e rodapés do navegador. Corte na linha pontilhada. Cada treino tem sua ficha; fichas longas continuam nas folhas seguintes.';controls.append(hint);
  const root=doc.createElement('div');doc.body.append(root);
  const text=(parent:HTMLElement,tag:string,value:string,className='')=>{const el=doc.createElement(tag);el.textContent=value;el.className=className;parent.append(el);return el;};
  const panels:HTMLElement[]=[];let rows!:HTMLElement;let body!:HTMLTableSectionElement;let currentTitle='';
  const date=(v:string|null|undefined)=>v?displayDate(v):'';
  function next(){
    const sheet=doc.createElement('section');sheet.className='sheet';root.append(sheet);
    const panel=doc.createElement('article');panel.className='half';sheet.append(panel);panels.push(panel);
    const header=doc.createElement('header');panel.append(header);
    const brand=doc.createElement('div');brand.className='brand';header.append(brand);
    if(logoData){const logo=doc.createElement('img');logo.src=logoData;logo.alt='Summer Fit';brand.append(logo);}
    text(brand,'strong','PROGRAMA SUMMER FIT');if(plan.status==='draft')text(brand,'span','RASCUNHO','draft');
    const identity=doc.createElement('table');identity.className='identity';header.append(identity);
    for(const values of [
      ['NOME',plan.student_name||'', 'MATRÍCULA',plan.registration||''],
      ['PROFESSOR',plan.instructor||'', 'DATA',date(plan.starts_on)],
      ['OBJETIVO',plan.objective||'', 'REVISÃO',date(plan.reviewed_on)],
      ['ZONA ALVO',plan.target_zone||'', 'REAVALIAÇÃO',date(plan.reassess_on)],
    ]){const tr=doc.createElement('tr');identity.append(tr);for(const value of values)text(tr,'td',value);}
    text(header,'div',(plan.title?plan.title+' · ':'')+currentTitle,'workout');
    rows=doc.createElement('div');rows.className='rows';panel.append(rows);
    const table=doc.createElement('table');table.className='exercises';rows.append(table);
    const cols=doc.createElement('colgroup');table.append(cols);for(const width of ['45%','8%','12%','10%','25%']){const col=doc.createElement('col');col.style.width=width;cols.append(col);}
    const thead=doc.createElement('thead');table.append(thead);const tr=doc.createElement('tr');thead.append(tr);
    for(const name of ['EXERCÍCIOS','SÉRIES','REPET. / TEMPO','CARGA','OBSERVAÇÃO'])text(tr,'th',name);
    body=doc.createElement('tbody');table.append(body);
  }
  function addRow(values:string[],general=false){
    const row=doc.createElement('tr');body.append(row);
    if(general){const cell=text(row,'td',values[0],'notes') as HTMLTableCellElement;cell.colSpan=5;}
    else for(const value of values)text(row,'td',value);
    return row;
  }
  function append(values:string[],general=false){
    let remaining=[...values];
    while(remaining.some(Boolean)){
      let element=addRow(remaining,general);
      if(rows.scrollHeight<=rows.clientHeight+1)return;
      element.remove();
      if(body.children.length){next();element=addRow(remaining,general);if(rows.scrollHeight<=rows.clientHeight+1)return;element.remove();}
      // Split even exceptionally long multiline notes instead of cutting or omitting content.
      let low=1,high=Math.max(...remaining.map(s=>s.length)),best=0;
      while(low<=high){const mid=Math.floor((low+high)/2);const probe=addRow(remaining.map(s=>s.slice(0,mid)),general);
        if(rows.scrollHeight<=rows.clientHeight+1){best=mid;low=mid+1;}else high=mid-1;probe.remove();}
      if(!best){popup?.close();throw new Error('Não foi possível paginar a ficha.');}
      addRow(remaining.map(s=>s.slice(0,best)),general);
      remaining=remaining.map(s=>s.slice(best));if(remaining.some(Boolean))next();
    }
  }
  for(const w of plan.workouts){
    currentTitle=w.title+(w.focus?' · '+w.focus:'');next();
    for(const e of w.exercises)append([e.name||'Exercício não informado',e.sets?e.sets+'x':'',e.reps,e.weight===undefined?'':e.weight+' '+(e.weightUnit||'kg'),[e.restSeconds!==undefined?'Descanso: '+e.restSeconds+'s':'',e.notes||''].filter(Boolean).join('\n')]);
    if(plan.notes)append(['ORIENTAÇÕES: '+plan.notes],true);
    // Keep a few ruled lines for handwritten adjustments without making another page.
    for(let i=0;i<3;i++){const row=addRow([' ',' ',' ',' ',' ']);row.style.height='5mm';if(rows.scrollHeight>rows.clientHeight+1){row.remove();break;}}
  }
  panels.forEach((panel,i)=>{const footer=doc.createElement('footer');footer.className='footer';text(footer,'span','Siga as orientações do professor · Summer Fit');text(footer,'span',(i+1)+' / '+panels.length);panel.append(footer);});
  const refreshCopies=()=>{root.querySelectorAll('.duplicate').forEach(n=>n.remove());if(copies.checked)for(const panel of panels){const copy=panel.cloneNode(true) as HTMLElement;copy.classList.add('duplicate');panel.parentElement?.append(copy);}};
  copies.onchange=refreshCopies;refreshCopies();popup.focus();
}
