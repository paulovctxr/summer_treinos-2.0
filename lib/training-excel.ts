import ExcelJS from 'exceljs';
import type { TrainingPlan } from './training-plans.ts';
import { TRAINING_COLUMNS, trainingPaperIdentity, trainingExerciseCells } from './training-paper.ts';

const PT_PER_MM=72/25.4;
const HALF_HEIGHT=148.5*PT_PER_MM;
const BORDER:Partial<ExcelJS.Borders>={top:{style:'thin',color:{argb:'FF777777'}},bottom:{style:'thin',color:{argb:'FF777777'}},left:{style:'thin',color:{argb:'FF777777'}},right:{style:'thin',color:{argb:'FF777777'}}};
const COLUMN_MM=[22,23,43,15.7,23.5,15.6,4,18,31];
const TABLE_RANGES=[[1,3],[4,4],[5,5],[6,7],[8,9]];
type PaperRow={values:string[];height:number};

function lines(value:string,widthMm:number,font=8){
  const capacity=Math.max(1,Math.floor((widthMm*PT_PER_MM-6)/(font*.57)));
  return value.split('\n').flatMap(line=>line?Array.from({length:Math.ceil(line.length/capacity)},(_,i)=>line.slice(i*capacity,(i+1)*capacity)):['']);
}

function writeTrainingSheet(book:ExcelJS.Workbook,plan:TrainingPlan,workoutName:string,rows:PaperRow[],logo:number|undefined,name:string){
  const sheet=book.addWorksheet(name,{views:[{state:'normal',showGridLines:false,zoomScale:90}],pageSetup:{paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:1,horizontalCentered:true,margins:{left:7/25.4,right:7/25.4,top:6/25.4,bottom:6/25.4,header:0,footer:0}}});
  sheet.columns=COLUMN_MM.map(mm=>({width:Math.max(4,Math.round((mm*PT_PER_MM-5)/5.4*10)/10)}));
  const identity=trainingPaperIdentity(plan);let row=1;let used=0;
  const bodyBudget=HALF_HEIGHT-18;
  const height=(value:number)=>{sheet.getRow(row).height=value;used+=value;row++;};
  const cell=(from:number,to:number,value:string,size=8,bold=false,fill='FFFFFFFF',align:'left'|'center'='left',border=true)=>{
    if(to>from)sheet.mergeCells(row,from,row,to);
    const target=sheet.getCell(row,from);target.value=value;target.font={name:'Arial',size,bold,color:{argb:'FF111111'}};target.alignment={vertical:'middle',horizontal:align,wrapText:true,indent:align==='left'?1:0};target.fill={type:'pattern',pattern:'solid',fgColor:{argb:fill}};if(border)target.border=BORDER;return target;
  };
  cell(1,2,logo?'':'SUMMER FIT',12,true);cell(3,9,'PROGRAMA SUMMER FIT'+(plan.status==='draft'?' · RASCUNHO':''),12,true,'FFFFFFFF','center');height(34);
  if(logo)sheet.addImage(logo,{tl:{col:.12,row:.12} as ExcelJS.Anchor,br:{col:1.85,row:.94} as ExcelJS.Anchor,editAs:'oneCell'});
  for(const [i,values] of identity.entries()){
    cell(1,1,values[0],7,true,'FFEEEEEE');cell(2,6,values[1]);cell(7,8,values[2],7,true,'FFEEEEEE');cell(9,9,values[3]);
    height(Math.max(15,...values.map((v,index)=>lines(v,[22,121,22,31][index],index%2?8:7).length*10+4)));
  }
  cell(1,9,workoutName,8,true,'FFEEEEEE');height(19);height(6);
  TRAINING_COLUMNS.forEach((title,index)=>cell(TABLE_RANGES[index][0],TABLE_RANGES[index][1],title,7,true,'FFEEEEEE','center'));height(20);
  for(const item of rows){item.values.forEach((value,index)=>cell(TABLE_RANGES[index][0],TABLE_RANGES[index][1],value,8,false,'FFFFFFFF',index>0&&index<4?'center':'left'));height(item.height);}
  while(used+18<bodyBudget){for(let index=0;index<5;index++)cell(TABLE_RANGES[index][0],TABLE_RANGES[index][1],' ',8,false);height(Math.min(18,bodyBudget-used-10));if(bodyBudget-used<18)break;}
  cell(1,7,'Siga as orientações do professor · Summer Fit',6.5,false,'FFFFFFFF','left',false);cell(8,9,'1 / 1',6.5,false,'FFFFFFFF','center',false);height(10);
  sheet.pageSetup.printArea='A1:I'+(row-1);sheet.getCell('A1').note='Uma ficha por aba. Edite as células da primeira via e imprima em A4 retrato, escala 100%. Não há uma segunda ficha duplicada.';
}

export function trainingWorkbook(plan:TrainingPlan,options:{logoBase64?:string}={}){
  const book=new ExcelJS.Workbook();book.creator='Summer Fit';book.title='Ficha de treino · meia folha A4';book.calcProperties.fullCalcOnLoad=true;
  const logo=options.logoBase64?book.addImage({base64:options.logoBase64,extension:'jpeg'}):undefined;
  const source=plan.workouts.length?plan.workouts:[{id:'blank',title:'Treino',focus:'',minutes:0,exercises:[]}];
  for(const [index,workout] of source.entries()){
    const workoutName=workout.title+(workout.focus?' · '+workout.focus:'');
    const values:PaperRow[]=[];
    for(const exercise of workout.exercises){
      const cells=trainingExerciseCells(exercise);const wrapped=cells.map((value,i)=>lines(value,[88.2,15.7,23.5,19.6,49][i]));const count=Math.max(...wrapped.map(part=>part.length));
      values.push({values:cells,height:Math.max(18,count*10+4)});
    }
    if(!values.length)for(let i=0;i<12;i++)values.push({values:['','','','',''],height:18});
    const sheets=Math.max(1,Math.ceil(values.reduce((sum,item)=>sum+item.height,0)/(HALF_HEIGHT-130)));
    let offset=0;
    for(let page=0;page<sheets;page++){
      const pageRows:PaperRow[]=[];let total=0;const budget=HALF_HEIGHT-130;
      while(offset<values.length&&(page===sheets-1||total+values[offset].height<=budget||!pageRows.length)){pageRows.push(values[offset]);total+=values[offset].height;offset++;}
      writeTrainingSheet(book,plan,workoutName+(page?' · continuação '+(page+1):''),pageRows,logo,'Treino '+(index+1)+(page?' - '+(page+1):''));
    }
  }
  return book;
}

export async function createTrainingExcelFile(plan:TrainingPlan){
  let logoBase64:string|undefined;
  try{const response=await fetch('/summer-fit-brand.jpeg',{signal:AbortSignal.timeout(5000)});if(response.ok){const blob=await response.blob();logoBase64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(blob);});}}catch{/* The academy name remains available without the logo. */}
  const bytes=await trainingWorkbook(plan,{logoBase64}).xlsx.writeBuffer();return {blob:new Blob([new Uint8Array(bytes)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),filename:'Treino_'+(plan.registration||'rascunho')+'.xlsx'};
}
