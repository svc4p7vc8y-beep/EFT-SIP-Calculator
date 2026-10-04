import { useEffect, useState } from 'react';
import { productionMark } from '../calculations/production-assembly.js';

export const approvalLabels = { draft: 'Черновик', geometry: 'Геометрия проверена', nodes: 'Узлы согласованы', released: 'Разрешено в производство' };

export function DraftText({ label, value = '', onChange, multiline = false, placeholder = '' }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const Tag = multiline ? 'textarea' : 'input';
  return <label>{label}<Tag value={draft} placeholder={placeholder} onChange={e=>setDraft(e.target.value)} onBlur={()=>{ if (draft !== value) onChange(draft); }} /></label>;
}

export function CuttingControls({ settings, report, update, NumberInput }) {
  const approval = settings.approval;
  const setApproval = patch => update({ approval: { ...approval, ...patch } });
  return <>
    <h2>Проверка и выпуск</h2>
    <p>Ревизия: {report?.revision || 'расчёт…'} · {approvalLabels[report?.approvalStatus || 'draft']}. Любое изменение исходных данных требует повторного согласования. Это проектная отметка, не электронная подпись.</p>
    <DraftText label="Проверил (ФИО)" value={approval.reviewer || ''} onChange={reviewer=>setApproval({reviewer})} placeholder="Ответственный технолог" />
    <DraftText label="Альбом рабочих узлов" value={approval.nodeRef || ''} onChange={nodeRef=>setApproval({nodeRef})} placeholder="Номер, ревизия и листы; пазы, углы, Т-стыки, перемычки, опоры" />
    <p>Перед выпуском сверить опоры и сетки всех конструкций, подрезки соединителей, состав пакетов, остатки и закупку. Автоматический расчёт несущей способности не выполняется.</p>
    <div className="cut-tabs">{['draft','geometry','nodes','released'].map(status=><button key={status} disabled={status !== 'draft' && (!report || report.issues.length > 0 || !approval.reviewer?.trim() || !approval.nodeRef?.trim())} onClick={()=>setApproval({status,revision:report?.revision || '',at:new Date().toISOString()})}>{approvalLabels[status]}</button>)}</div>
    <h2>Профили и соединения</h2>
    <label>Источник сечений<select value={settings.profileMode} onChange={e=>update({profileMode:e.target.value})}><option value="saved">Сохранённые размеры раскроя (ручные)</option><option value="estimate">Профили действующей сметы</option></select></label>
    <p>Для SIP 174: сохранённый профиль обычно 145×90; смета — 145×95 для термобруса/пакета, 150×100 для цельного бруса. Выбор меняет только ведомость производства, не цены и закупку.</p>
    <label className="cut-check"><input type="checkbox" checked={settings.continuousMembers} onChange={e=>update({continuousMembers:e.target.checked})} />Объединять непрерывные соосные соединители (по рабочему узлу)</label>
    <p>По умолчанию сохранено разбиение по рёбрам. Объединение не назначает места стыковки и не проверяет несущую способность. Подрезки, состав пакетов и исключения задаются в карточке соединителя.</p>
    <label className="cut-check"><input type="checkbox" checked={settings.allowRotation} onChange={e=>update({allowRotation:e.target.checked})} />Разрешён поворот заготовок на 90° (подтверждён технологом)</label>
    <button onClick={()=>update({layouts:{}})}>Сбросить индивидуальные сетки</button> <button onClick={()=>update({memberOverrides:{}})}>Сбросить правки соединителей</button>
    <h2>Ручные SIP-панели</h2>
    <p>Для пристроек и специальных деталей по рабочему проекту. Контуры в мм: внешний многоугольник, затем вырезы. Панель добавляется как готовая деталь, без автоматического деления; задайте размеры в пределах заготовки. Автоматически рассчитанные панели не заменяются.</p>
    {settings.manualPanels.map((item,index)=>{
      const change = patch=>update({manualPanels:settings.manualPanels.map((p,i)=>i===index?{...p,...patch}:p)});
      return <fieldset key={item.id}><legend>Панель {index+1}</legend><div className="cut-fields">
        <DraftText label="Название панели" value={item.name} onChange={name=>change({name})} placeholder="Панель пристройки по листу КР-5" />
        <label>Семейство<select value={item.family} onChange={e=>change({family:e.target.value})}><option value="pps">ППС</option><option value="mineral-wool">Минвата</option><option value="csp-pps">ЦСП / ППС</option></select></label>
        <label>Толщина панели<select value={item.thickness} onChange={e=>change({thickness:Number(e.target.value)})}>{[124,174,224].map(t=><option key={t}>{t}</option>)}</select></label>
        <NumberInput label="Количество панелей" value={item.quantity} min={1} max={100} suffix="шт." onChange={quantity=>change({quantity})} />
      </div><DraftText label="Контуры панели (JSON, мм)" multiline value={item.contour} placeholder="[[[0,0],[625,0],[625,2500],[0,2500]]]" onChange={contour=>change({contour})} /><button onClick={()=>update({manualPanels:settings.manualPanels.filter((_,i)=>i!==index)})}>Удалить панель {index+1}</button></fieldset>;
    })}
    <button disabled={settings.manualPanels.length>=100} onClick={()=>update({manualPanels:[...settings.manualPanels,{id:crypto.randomUUID(),name:'',family:'pps',thickness:174,quantity:1,contour:''}]})}>Добавить SIP-панель</button>
  </>;
}

export function SurfaceLayoutControls({ surface, settings, update, NumberInput }) {
  if (!surface || surface.manual) return null;
  const layout = settings.layouts[surface.layoutKey] || {};
  const change = patch=>update({layouts:{...settings.layouts,[surface.layoutKey]:{...layout,...patch}}});
  return <details className="cut-layout-settings"><summary>Сетка конструкции · шаг {surface.effectiveStep} мм</summary><p>Пустое поле — настройки конструкции. Начало сетки задаётся в её координатах; для перекрытий это координаты плана. Согласование с реальными опорами выполняет технолог.</p><div className="cut-fields">
    <label>Направление раскладки<select value={layout.direction || 'auto'} onChange={e=>change({direction:e.target.value})}><option value="auto">Автоматически, смешанная ориентация</option><option value="x">Вертикальные стены / вдоль первой оси ската</option><option value="y">Горизонтальные стены / поворот на 90°</option></select></label>
    <NumberInput label="Шаг этой конструкции" value={layout.step ?? ''} min={100} max={2500} onChange={step=>change({step})} />
    <NumberInput label="Начало сетки X" value={layout.originX ?? ''} min={-100000} onChange={originX=>change({originX})} />
    <NumberInput label="Начало сетки Y" value={layout.originY ?? ''} min={-100000} onChange={originY=>change({originY})} />
  </div>{surface.stockWall?(surface.openings||[]).filter(o=>!o.gap).map((opening,index)=><label key={opening.key}>Панели над и под {opening.type==='window'?'окном':'дверью'} {index+1}<select value={layout.openingDirections?.[opening.key]||'auto'} onChange={e=>change({openingDirections:{...layout.openingDirections,[opening.key]:e.target.value}})}><option value="auto">Автоматически</option><option value="x">Вертикально</option><option value="y">Горизонтально</option></select></label>):null}</details>;
}

export function MemberEditor({ member, settings, update, NumberInput }) {
  if (!member?.key) return <p>Выберите автоматическую деталь в таблице или на развёртке. Ручные опоры редактируются инструментом «Разместить опоры».</p>;
  const value = settings.memberOverrides[member.key] || {};
  const change = patch=>update({memberOverrides:{...settings.memberOverrides,[member.key]:{...value,...patch}}});
  return <fieldset><legend>Карточка {productionMark(member.id)}</legend><p>{member.surface} · геометрия {member.geometricLength} мм · сметный профиль {member.estimateProfile}. Исключение убирает элемент из карт хлыстов; при разложении пакета на доски сначала исключите сборочный элемент и добавьте его состав вручную.</p><div className="cut-fields">
    <NumberInput label="Проектная чистая длина" value={value.length ?? ''} min={1} onChange={length=>change({length})} placeholder={`${member.geometricLength} — по геометрии`} />
    <DraftText label="Проектное сечение" value={value.profile || ''} onChange={profile=>change({profile})} placeholder={member.profile} />
    <DraftText label="Рабочий узел соединителя" value={value.nodeRef || ''} onChange={nodeRef=>change({nodeRef})} placeholder="Шифр / лист / узел" />
    <DraftText label="Обработка и состав" multiline value={value.processing || ''} onChange={processing=>change({processing})} placeholder="Подрезки, углы торцов, пазы, выборки; марки досок пакета" />
  </div><label className="cut-check"><input type="checkbox" checked={value.exclude === true} onChange={e=>change({exclude:e.target.checked})} />Исключить из сырьевого раскроя (заменён ручной спецификацией)</label></fieldset>;
}

export function Reconciliation({ report }) {
  return <><h2>Сверка с закупкой</h2><p>Смета не изменяется. Положительная разница — дефицит относительно текущих карт заготовок, отрицательная — запас. При неполной геометрии сверка предварительная; нестандартные названия материалов требуют ручной проверки.</p><div className="cut-table-wrap"><table><thead><tr><th>Материал</th><th>Ед.</th><th>Требуется</th><th>В смете</th><th>Разница</th></tr></thead><tbody>{report.reconciliation.map(r=><tr key={r.key}><td>{r.name}</td><td>{r.unit}</td><td>{r.required.toFixed(2)}</td><td>{r.purchased.toFixed(2)}</td><td>{r.difference.toFixed(2)}</td></tr>)}</tbody></table></div></>;
}
