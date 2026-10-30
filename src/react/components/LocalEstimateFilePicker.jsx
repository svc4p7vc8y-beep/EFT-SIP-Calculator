import {useEffect,useState} from 'react';
import FileThumbnail from './FileThumbnail.jsx';
export default function LocalEstimateFilePicker({files,onClose,onAdd}) {
  const [selected,setSelected]=useState(()=>new Set(files.map((_,index)=>index))),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [urls,setUrls]=useState([]);
  useEffect(()=>{const next=files.map(file=>URL.createObjectURL(file));setUrls(next);return ()=>next.forEach(url=>URL.revokeObjectURL(url));},[files]);
  return <div className="modal-backdrop"><section className="modal local-estimate-picker" role="dialog" aria-label="Выбранные файлы"><header><h2>Добавить в смету</h2><button onClick={onClose} disabled={busy}>Закрыть</button></header><p>Выберите изображения. PDF добавляется страницами в печатную смету.</p><div className="local-file-preview-grid">{files.map((file,index)=><label key={index}><FileThumbnail url={urls[index]} mime={file.type} name={file.name}/><input type="checkbox" checked={selected.has(index)} onChange={event=>setSelected(previous=>{const next=new Set(previous);event.target.checked?next.add(index):next.delete(index);return next;})}/><span>{file.name}</span></label>)}</div>{error?<p role="alert">{error}</p>:null}<footer><button className="button primary" disabled={busy||!selected.size} onClick={async()=>{setBusy(true);try{await onAdd(files.filter((_,index)=>selected.has(index)));onClose();}catch(reason){setError(reason.message);}finally{setBusy(false);}}}>{busy?'Добавляю…':`Добавить (${selected.size})`}</button></footer></section></div>;
}
