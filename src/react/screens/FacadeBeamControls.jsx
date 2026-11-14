import './structural-wall-editor.css';
import {useEffect,useMemo,useState} from 'react';
import {useProject} from '../state/ProjectContext.jsx';
import {facadeEnvelope,facadeLayout,applyFacade,moveFacadeTransom,appendFacadeTransom} from '../calculations/facade-design.js';

export default function FacadeBeamControls({report,picked,pickedId}){
 const {project,commit}=useProject(),facades=[project.plan,...project.upperFloors].flatMap(p=>p.facades||[]);
 const [facadeId,setFacadeId]=useState(''),[key,setKey]=useState('main'),[z,setZ]=useState(''),[notice,setNotice]=useState('');
 const config=facades.find(f=>f.id===facadeId)||facades[0],envelope=useMemo(()=>config&&report?facadeEnvelope(report,config.wallId):null,[report,config?.wallId]);
 const layout=useMemo(()=>config&&envelope?facadeLayout(config,envelope):null,[config,envelope]),beams=layout?.members.filter(m=>m.type==='beam'&&Math.abs(m.a[1]-m.b[1])<1)||[],member=beams.find(m=>m.key===key),height=key==='main'?config?.transomMm:member?.a[1];
 useEffect(()=>{setZ(String(height??''));},[height,key,config?.id]);
 useEffect(()=>{if(picked?.facadeId&&picked.facadeMemberKey?.startsWith('header-')||picked?.facadeTransomId){setFacadeId(picked.facadeId);setKey(picked.facadeMemberKey);}},[pickedId]);
 if(!config||!envelope)return null;
 const save=next=>{try{const result=applyFacade(project,next,envelope);commit(()=>result);setNotice('Перемычки и окна обновлены в 3D, развёртках и ведомости.');return true;}catch(e){setNotice(e.message);return false;}};
 return <details className="facade-3d-controls"><summary>Перемычки панорамного фасада</summary><label>Фасад<select value={config.id} onChange={e=>{setFacadeId(e.target.value);setKey('main');}}>{facades.map(f=><option key={f.id} value={f.id}>{f.name} · {f.wallId}</option>)}</select></label><label>Перемычка<select value={key} onChange={e=>setKey(e.target.value)}><option value="main">Основной горизонтальный ряд</option>{beams.map(m=><option key={m.key} value={m.key}>{m.name} · {Math.round(m.a[1])} мм</option>)}</select></label><label>Отметка от пола, мм<input aria-label="Отметка перемычки в 3D, мм" type="number" value={z} onChange={e=>setZ(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')save(moveFacadeTransom(config,key,Number(z)));}}/></label><div><button onClick={()=>save(moveFacadeTransom(config,key,Number(height)-50))}>Ниже 50 мм</button><button onClick={()=>save(moveFacadeTransom(config,key,Number(height)+50))}>Выше 50 мм</button><button onClick={()=>save(moveFacadeTransom(config,key,Number(z)))}>Применить отметку</button></div><div><button onClick={()=>{setKey('main');save({...moveFacadeTransom(config,'main',Math.round(envelope.mauerlatMm)),headInsetMm:Math.min(100,Number(config.headInsetMm)||100)});}}>На мауэрлат · {Math.round(envelope.mauerlatMm)} мм</button><button onClick={()=>save(appendFacadeTransom(config,Math.max(Number(config.sillMm)+350,Number(config.transomMm)-500)))}>Добавить горизонтальную перемычку</button></div>{notice?<p role="status">{notice}</p>:null}<small>Выберите перемычку в списке или на 3D. Размеры стёкол перестраиваются вместе с каркасом; прочность и узлы подтверждаются проектом.</small></details>;
}
