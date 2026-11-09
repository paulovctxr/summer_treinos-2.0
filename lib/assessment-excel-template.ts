import ExcelJS from 'exceljs';
import { ASSESSMENT_FIELDS, displayDate, type Assessment } from './assessments.ts';
import { calculateBodyComposition } from './body-composition.ts';

const C = { red:'FFBD1425', yellow:'FFFFE457', ink:'FF24241F', line:'FFE0E0D6', input:'FFFFFBEA', derived:'FFF2F3EF', white:'FFFFFFFF' };
type Value = string | number | null;
type PairField = [string, Value, string?];

function bodyCompositionChartSvg(record: Assessment) {
  const numberValue=(value:string|undefined)=>{if(!value?.trim())return null;const parsed=Number(value.replace(',','.'));return Number.isFinite(parsed)?parsed:null;};
  const calculated=calculateBodyComposition(record.data,record.model,record.assessed_on);
  const bodyFat=calculated.bodyFat??numberValue(record.data.body_fat);const fatMass=calculated.fatMass??numberValue(record.data.fat_mass);const leanMass=calculated.leanMass??numberValue(record.data.lean_mass);
  const total=fatMass!==null&&leanMass!==null?fatMass+leanMass:null;
  const fatPercent=total&&total>0&&fatMass!==null?fatMass/total*100:bodyFat;
  if(fatPercent===null)return null;
  const bounded=Math.max(0,Math.min(100,fatPercent));const circumference=2*Math.PI*46;const fatArc=circumference*bounded/100;
  const fatLabel=bounded.toLocaleString('pt-BR',{maximumFractionDigits:1});const leanLabel=(100-bounded).toLocaleString('pt-BR',{maximumFractionDigits:1});
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="190" viewBox="0 0 320 190"><rect width="320" height="190" rx="14" fill="#fffdf1"/><text x="18" y="26" font-family="Arial" font-size="16" font-weight="700" fill="#24241f">Composição corporal</text><circle cx="78" cy="105" r="46" fill="none" stroke="#b8d76c" stroke-width="28"/><circle cx="78" cy="105" r="46" fill="none" stroke="#bd1425" stroke-width="28" stroke-dasharray="${fatArc} ${circumference-fatArc}" transform="rotate(-90 78 105)"/><text x="78" y="101" text-anchor="middle" font-family="Arial" font-size="17" font-weight="700" fill="#24241f">${fatLabel}%</text><text x="78" y="118" text-anchor="middle" font-family="Arial" font-size="10" fill="#67675f">gordura</text><circle cx="166" cy="83" r="6" fill="#bd1425"/><text x="180" y="88" font-family="Arial" font-size="13" fill="#24241f">Gordura ${fatLabel}%</text><circle cx="166" cy="111" r="6" fill="#b8d76c"/><text x="180" y="116" font-family="Arial" font-size="13" fill="#24241f">Massa magra ${leanLabel}%</text>${bodyFat!==null?`<text x="166" y="145" font-family="Arial" font-size="11" fill="#67675f">Gordura atual: ${bodyFat.toLocaleString('pt-BR')}%</text>`:''}</svg>`;
  const bytes=new TextEncoder().encode(svg);let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return `data:image/svg+xml;base64,${btoa(binary)}`;
}

/** Same report sections and templates as the academy XLS, without its sample data or unverified clinical formulas. */
export function buildAssessmentWorkbook(a: Assessment, logoBase64?: string) {
  const book = new ExcelJS.Workbook();
  book.creator='Summer Treinos';book.title='Avaliação física — Summer Fit';book.calcProperties.fullCalcOnLoad=true;
  book.views=[{x:0,y:0,width:1200,height:850,visibility:'visible',activeTab:a.model==='MULHERES'?1:0,firstSheet:0}];
  const logo=logoBase64?book.addImage({base64:logoBase64,extension:'jpeg'}):null;
  for(const model of ['HOMENS','MULHERES'] as const){
    const filled=model===a.model;
    const record:Assessment=filled?a:{...a,model,student_name:'',registration:'',instructor:'',assessed_on:'',reassess_on:null,data:{}};
    const sheet=book.addWorksheet(model,{
      properties:{defaultRowHeight:22,tabColor:{argb:filled?C.red:C.yellow}},
      views:[{state:'frozen',ySplit:4,showGridLines:false,zoomScale:90}],
      pageSetup:{paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0,horizontalCentered:true,
        margins:{left:.3,right:.3,top:.4,bottom:.4,header:.15,footer:.15},printTitlesRow:'1:4'},
      headerFooter:{oddFooter:`&LSummer Fit · Avaliação física&C${model}&RPágina &P de &N`},
    });
    sheet.columns=Array.from({length:12},()=>({width:8.7}));
    let row=1;
    const sources=new Map<string,{address:string;value:Value}>();const written=new Set<string>();
    function merged(r:number,start:number,end:number,value:ExcelJS.CellValue,fill=C.white,bold=false,size=11){
      if(end>start)sheet.mergeCells(r,start,r,end);
      const cell=sheet.getCell(r,start);cell.value=value;
      cell.font={name:'Calibri',size,bold,color:{argb:C.ink}};
      cell.alignment={vertical:'middle',wrapText:true,indent:1};
      cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:fill}};
      cell.border={bottom:{style:'hair',color:{argb:C.line}}};return cell;
    }
    function band(title:string,pageBreak=false){
      if(pageBreak&&row>5)sheet.getRow(row-1).addPageBreak();
      merged(row,1,12,title,C.yellow,true,13);sheet.getRow(row++).height=30;
    }
    function gap(){sheet.getRow(row++).height=10;}
    function line(value:string,fill=C.white,size=11){
      merged(row,1,12,value,fill,false,size);sheet.getRow(row++).height=Math.max(23,Math.ceil(value.length/105)*16+10);
    }
    function fieldValue(key:string):Value{
      const value=record.data[key];if(!value)return null;
      const f=ASSESSMENT_FIELDS.find(f=>f.key===key);
      return f?.type==='number'?Number(value):f?.type==='date'?displayDate(value):value;
    }
    function input(r:number,start:number,end:number,value:Value,key?:string){
      const source=key?sources.get(key):null;
      const cell=merged(r,start,end,source?{formula:`IF(${source.address}="","",${source.address})`,result:source.value??''}:value,source?C.derived:C.input,true);
      if(typeof value==='number')cell.numFmt='0.##';
      if(key){
        written.add(key);if(!source)sources.set(key,{address:cell.address,value});
        const f=ASSESSMENT_FIELDS.find(f=>f.key===key);
        if(!source&&f?.type==='number')cell.dataValidation={type:'decimal',operator:'between',allowBlank:true,formulae:[f.min!,f.max!],showErrorMessage:true,errorTitle:'Confira a medida',error:`Informe ${f.min} a ${f.max} ${f.unit||''}.`};
      }
      return cell;
    }
    function pair(left:PairField,right?:PairField){
      merged(row,1,4,left[0]);input(row,5,6,left[1],left[2]);
      if(right){merged(row,7,10,right[0]);input(row,11,12,right[1],right[2]);}sheet.getRow(row++).height=36;
    }
    function measure(key:string,label?:string):PairField{
      const f=ASSESSMENT_FIELDS.find(f=>f.key===key)!;
      return [`${label||f.label}${f.unit?` (${f.unit})`:''}`,fieldValue(key),key];
    }
    function textBlock(label:string,value:string,key?:string){
      merged(row,1,12,label,C.derived,true);sheet.getRow(row++).height=Math.max(25,Math.ceil(label.length/100)*17+8);
      // Bounded rows keep long notes legible, without truncation or Excel row-height overflow.
      const chunks=value?value.match(/[^\n]{1,145}|\n/g)||['']:[''];
      for(const chunk of chunks){merged(row,1,12,chunk==='\n'?'':chunk,C.input);sheet.getRow(row++).height=36;}
      if(key)written.add(key);gap();
    }
    function block(key:string,label?:string){textBlock(label||ASSESSMENT_FIELDS.find(f=>f.key===key)!.label,String(fieldValue(key)??''),key);}
    function full(label:string,value:Value){merged(row,1,3,label);input(row,4,12,value);sheet.getRow(row++).height=36;}

    merged(row,1,4,logo===null?'SUMMER FIT':'',C.white,true,20);
    const title=merged(row,5,12,'AVALIAÇÃO FÍSICA',C.red,true,20);title.font={...title.font,color:{argb:C.white}};sheet.getRow(row++).height=36;
    merged(row,1,4,'');merged(row,5,12,'ACOMPANHAMENTO DO ALUNO',C.white,true,11);sheet.getRow(row++).height=26;
    merged(row,1,4,'');merged(row,5,12,`${model} · ${!filled?'MODELO EM BRANCO':a.status==='published'?'AVALIAÇÃO PUBLICADA':'RASCUNHO — NÃO PUBLICADO'}`,C.white,false,10);sheet.getRow(row++).height=24;
    merged(row++,1,12,'',C.yellow);sheet.getRow(4).height=5;
    // Two-cell anchors avoid ExcelJS's invalid editAs attribute on one-cell anchors.
    // ExcelJS accepts fractional {col,row} anchors but its ImageRange types require constructed Anchors.
    if(logo!==null)sheet.addImage(logo,{tl:{col:.2,row:.25} as ExcelJS.Anchor,br:{col:3.6,row:1.8} as ExcelJS.Anchor,editAs:'oneCell'});
    gap();band('01  DADOS CADASTRAIS');
    full('Nome',record.student_name||null);
    pair(['Matrícula',record.registration||null],['Data da avaliação',record.assessed_on?displayDate(record.assessed_on):null]);
    pair(measure('birth_date','Nascimento'),['Reavaliação',record.reassess_on?displayDate(record.reassess_on):null]);
    full('Professor responsável',record.instructor||null);full('E-mail',null);
    gap();band('CARO(A) AVALIADO(A)');
    line('Esta avaliação acompanha seu condicionamento físico e ajuda o professor a orientar seu programa de exercícios.');
    line('A reavaliação permite comparar suas medidas e adequar o treinamento aos seus objetivos. Combine com seu professor a próxima data.');
    line('Leia as orientações e converse com o profissional responsável sobre os resultados.');
    gap();line('Como preencher: células amarelo-claro são editáveis. Campos não avaliados ficam em branco. Células cinza do resumo acompanham as medidas da ficha.',C.derived,10);
    gap();textBlock('Avaliador responsável / assinatura',record.instructor);

    band('02  ANAMNESE',true);
    block('injuries','Já teve fratura, entorse ou doença? Qual e em que data?');
    block('medication','Utiliza algum medicamento? Qual e há quanto tempo?');
    block('smoking','Tem ou teve o hábito de fumar?');pair(measure('sleep','Sono por noite'));gap();
    block('work_routine','Como é sua rotina de trabalho? Trabalha em pé?');
    block('diet','Está em dieta para ganhar ou perder peso? Há quanto tempo?');
    block('activity_history','Pratica ou já praticou atividade física? Qual e por quanto tempo?');
    block('inactive_time','Há quanto tempo está sem praticar atividade física?');
    block('goals','Qual é seu objetivo na academia?');block('frequency','Disponibilidade / frequência semanal');

    band('03  ANÁLISE POSTURAL',true);
    block('posture_front','VISÃO ANTERIOR');block('posture_side','VISÃO LATERAL');block('posture_back','VISÃO POSTERIOR');block('posture_notes','OBSERVAÇÕES');

    band('04  VALORES ANTROPOMÉTRICOS',true);
    merged(row,1,6,'MEDIDAS',C.derived,true);merged(row,7,12,'RESULTADOS / METAS',C.derived,true);sheet.getRow(row++).height=28;
    const folds=model==='HOMENS'?['skinfold_chest','skinfold_abdomen','skinfold_thigh']:['skinfold_triceps','skinfold_suprailiac','skinfold_thigh'];
    pair(measure('weight','Peso atual'),measure('target_fat','Gordura alvo'));
    pair(measure('height'),measure('body_fat','Gordura atual'));
    pair(measure(folds[0]),measure('fat_mass','Peso gordo'));pair(measure(folds[1]),measure('lean_mass','Peso magro'));pair(measure(folds[2]),measure('target_weight','Peso alvo'));
    const refs=folds.map(key=>sources.get(key)!.address);const values=folds.map(key=>fieldValue(key));
    merged(row,1,4,'Soma das 3 dobras (mm)');
    const total=merged(row,5,6,{formula:`IF(COUNT(${refs.join(',')})=3,SUM(${refs.join(',')}),"")`,result:values.every(v=>typeof v==='number')?(values as number[]).reduce((s,v)=>s+v,0):''},C.derived,true);total.numFmt='0.##';
    merged(row,7,12,'Resultados de composição corporal informados pelo professor.',C.white,false,10);sheet.getRow(row++).height=38;
    gap();line('Protocolo automático: três dobras, idade e modelo selecionado.',C.derived,10);
    merged(row,1,6,'CIRCUNFERÊNCIAS',C.derived,true);merged(row,7,12,'MEDIDAS DIREITA / ESQUERDA',C.derived,true);sheet.getRow(row++).height=28;
    pair(measure('chest','Tórax normal'),measure('abdomen'));pair(measure('hip'));
    const limbs=[['arm','Braço'],['forearm','Antebraço'],['upper_thigh','Coxa superior'],['mid_thigh','Coxa média'],['lower_thigh','Coxa inferior'],['calf','Perna']];
    for(const [key,label] of limbs)pair(measure(`${key}_right`,`${label} direito(a)`),measure(`${key}_left`,`${label} esquerdo(a)`));
    gap();block('training','Sugestão de treino');

    band('05  AVALIAÇÃO FUNCIONAL — RESUMO',true);
    full('Nome',record.student_name||null);
    pair(['Matrícula',record.registration||null],['Avaliação',record.assessed_on?displayDate(record.assessed_on):null]);
    full('Professor responsável',record.instructor||null);
    pair(measure('weight','Peso atual'),measure('height'));pair(measure('body_fat','Gordura atual'),measure('target_fat','Gordura alvo'));
    pair(measure('fat_mass','Peso gordo'),measure('lean_mass','Peso magro'));
    for(let i=0;i<folds.length;i++)pair(measure(folds[i]),i===0?measure('target_weight','Peso alvo'):undefined);
    pair(measure('chest','Tórax'),measure('abdomen'));pair(measure('hip'));
    for(const [key,label] of limbs)pair(measure(`${key}_right`,`${label} direito(a)`),measure(`${key}_left`,`${label} esquerdo(a)`));
    gap();line('Consulte a anamnese, a análise postural e as orientações anteriores. As medidas do lado direito e esquerdo ficam juntas para facilitar a comparação.',C.derived,10);
    const compositionChart=filled?bodyCompositionChartSvg(record):null;
    if(compositionChart){const chartImage=book.addImage({base64:compositionChart,extension:'svg' as unknown as 'png'});sheet.addImage(chartImage,{tl:{col:0,row:row-1} as ExcelJS.Anchor,ext:{width:320,height:190}});for(let i=0;i<9;i++)sheet.getRow(row++).height=24;}
    gap();band('ORIENTAÇÕES E OBSERVAÇÕES FINAIS');block('notes','Observações / recomendações do professor');
    const extra=ASSESSMENT_FIELDS.filter(f=>!written.has(f.key)&&record.data[f.key]);
    if(extra.length){band('INFORMAÇÕES COMPLEMENTARES');for(const f of extra)block(f.key);}
    gap();textBlock('Professor responsável / assinatura',record.instructor);
    sheet.pageSetup.printArea=`A1:L${row-1}`;
  }
  return book;
}
