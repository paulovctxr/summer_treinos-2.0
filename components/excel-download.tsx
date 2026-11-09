'use client';
import { useEffect, useRef, useState } from 'react';
import styles from './assessments.module.css';

export type ExcelFile = { blob: Blob; filename: string };

export function ExcelDownload({createFile,disabled=false,onBusyChange}:{createFile:()=>Promise<ExcelFile>;disabled?:boolean;onBusyChange?:(busy:boolean)=>void}) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [file,setFile]=useState<{url:string;filename:string}|null>(null);
  const url=useRef<string|null>(null);
  const running=useRef(false);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;if(url.current)URL.revokeObjectURL(url.current);};},[]);

  async function download(){
    if(running.current||disabled)return;
    running.current=true;setBusy(true);setError('');setFile(null);onBusyChange?.(true);
    if(url.current){URL.revokeObjectURL(url.current);url.current=null;}
    try{
      const result=await createFile();
      if(!mounted.current)return;
      url.current=URL.createObjectURL(result.blob);
      setFile({url:url.current,filename:result.filename});
      const link=document.createElement('a');link.href=url.current;link.download=result.filename;
      document.body.append(link);link.click();link.remove();
    }catch(e){
      if(mounted.current)setError(e instanceof Error?e.message:'Não foi possível gerar o Excel. Tente novamente.');
    }finally{
      running.current=false;
      if(mounted.current){setBusy(false);onBusyChange?.(false);}
    }
  }
  return <div className={styles.excelDownload}>
    <button type="button" className={styles.secondary} disabled={disabled||busy} onClick={()=>void download()}>{busy?'Gerando Excel…':'Baixar Excel (.xlsx)'}</button>
    {busy&&<span role="status" className={styles.note}>Preparando seu arquivo…</span>}
    {error&&<p role="alert" className={styles.notice}>{error}</p>}
    {file&&<div className={styles.downloadReady}><p role="status">Arquivo pronto. Se o download não iniciou, use o link abaixo.</p><a className={styles.secondary} href={file.url} download={file.filename}>Salvar arquivo Excel</a></div>}
  </div>;
}
