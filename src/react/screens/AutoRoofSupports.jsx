import { useEffect,useMemo,useState } from 'react';
import { generateRoofSupportLayout,mergeRoofSupportLayout,ROOF_SUPPORT_VARIANTS,AUTO_ROOF_LAYOUT } from '../calculations/auto-roof-supports.js';
import { normalizeAutoRoofSupports } from '../state/auto-roof-supports.js';

export default function AutoRoofSupports({project,report,settings,update,NumberInput,onApplied}) {
  const savedKey=JSON.stringify(settings.autoRoofSupports);
  const [config,setConfig]=useState(()=>normalizeAutoRoofSupports(settings.autoRoofSupports)),[error,setError]=useState('');
  useEffect(()=>{setConfig(normalizeAutoRoofSupports(settings.autoRoofSupports));},[savedKey]);
  const preview=useMemo(()=>generateRoofSupportLayout(project,report,config),[project,report,config]);
  const set=patch=>{setConfig(old=>({...old,...patch}));setError('');};
  const materials=project.priceMat.filter(row=>['м³','м3','м.п.','м'].includes(row.unit));
  const apply=()=>{try{const roofSupports=mergeRoofSupportLayout(settings.roofSupports,preview.items);update({autoRoofSupports:config,roofSupports});setError('');onApplied?.(roofSupports.find(item=>item.id===preview.items[0]?.id)?.id??roofSupports.find(item=>item.type==='purlin')?.id);}catch(e){setError(e.message);}};
  const current=settings.roofSupports.filter(item=>item.autoLayout===AUTO_ROOF_LAYOUT);
  return <details className="cut-layout-settings auto-roof-supports" open><summary>Авторасстановка прогонов и стоек</summary>
    <div className="cut-fields">
      <label>Вариант расстановки<select aria-label="Вариант расстановки прогонов" value={config.variant} onChange={e=>set({variant:e.target.value})}>{ROOF_SUPPORT_VARIANTS.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
      <label>Расположение стоек<select aria-label="Расположение стоек" value={config.distribution} onChange={e=>set({distribution:e.target.value})}><option value="uniform">Равномерно</option><option value="bearing">На пересечениях с несущими стенами и по краям</option></select></label>
      {config.distribution==='uniform'?<NumberInput label="Стоек на каждый прогон" value={config.postCount} min={2} max={30} suffix="шт." onChange={postCount=>set({postCount:Number(postCount)})}/>:null}
      <label>Сечение прогона, мм<input aria-label="Сечение автоматических прогонов" value={config.purlinProfile} onChange={e=>set({purlinProfile:e.target.value.replace(/[xх]/g,'×')})}/></label>
      <label>Сечение стойки, мм<input aria-label="Сечение автоматических стоек" value={config.postProfile} onChange={e=>set({postProfile:e.target.value.replace(/[xх]/g,'×')})}/></label>
      <NumberInput label="Нижняя отметка автостоек Z" value={config.baseZ} min={-100000} onChange={baseZ=>set({baseZ:baseZ===''?'':Number(baseZ)})}/>
      <button onClick={()=>set({baseZ:''})}>Низ по уровню верха стен</button>
      <label>Рабочий узел автоэлементов<input aria-label="Рабочий узел автоэлементов" value={config.nodeRef} onChange={e=>set({nodeRef:e.target.value})}/></label>
    </div>
    <p>Предпросмотр: <b>{preview.counts.purlins} прогонов · {preview.counts.posts} стоек</b>. Нижняя отметка: {preview.baseZ??'—'} мм. Только основная кровля; террасы и сложные контуры — вручную. Сечения 100×150 и три стойки — редактируемые заготовки ввода, не расчёт прочности.</p>
    {preview.items.length?<div className="cut-table-wrap"><table><thead><tr><th>Элемент</th><th>Количество</th><th>Длина, мм</th><th>Сечение, мм</th></tr></thead><tbody>{(()=>{const groups=new Map();for(const item of preview.items){const length=Math.ceil(Math.hypot(item.x2-item.x1,item.y2-item.y1,item.z2-item.z1)),key=[item.type,length,item.profile].join(':');const g=groups.get(key)||{name:item.type==='post'?'Стойка':'Прогон',length,profile:item.profile,qty:0};g.qty++;groups.set(key,g);}return [...groups].map(([key,g])=><tr key={key}><td>{g.name}</td><td>×{g.qty}</td><td>{g.length}</td><td>{g.profile}</td></tr>);})()}</tbody></table></div>:null}
    <details><summary>Добавление автоэлементов в смету</summary><div className="cut-fields">{[['purlinCatalogId','Материал прогонов'],['postCatalogId','Материал стоек']].map(([key,name])=><label key={key}>{name}<select aria-label={name} value={config[key]} onChange={e=>set({[key]:e.target.value})}><option value="">Выберите соответствующее сечение из прайса</option>{materials.map(row=><option key={row.id} value={row.id}>{row.name} · {row.price} ₽/{row.unit}</option>)}</select></label>)}<label><input type="checkbox" checked={config.estimateEnabled} disabled={!config.purlinCatalogId||!config.postCatalogId} onChange={e=>set({estimateEnabled:e.target.checked})}/>Добавлять материал в смету по чистому объёму</label></div><p>Существующий расчёт проектных элементов. Без нового коэффициента, запаса, монтажа и крепежа. Уже посчитанные коньковые доски не заменяются; прогон — дополнительный проектный элемент. Без выбора материала добавление в смету отключено.</p></details>
    {preview.errors.map(message=><p role="alert" key={message}>{message}</p>)}{preview.warnings.map(message=><p key={message}>{message}</p>)}{error?<p role="alert">{error}</p>:null}
    <p>Высоты взяты из существующего профиля стропил или плоскостей SIP-кровли. Повторное применение заменяет только автоэлементы без ручных переопределений. Изменённые вручную и обычные ручные элементы сохраняются.</p>
    <button disabled={!!preview.errors.length||!preview.items.length} onClick={apply}>Применить авторасстановку</button>
    {current.length?<button onClick={()=>update({roofSupports:settings.roofSupports.filter(item=>item.autoLayout!==AUTO_ROOF_LAYOUT||item.autoLocked)})}>Убрать авторасстановку без ручных правок</button>:null}
  </details>;
}
