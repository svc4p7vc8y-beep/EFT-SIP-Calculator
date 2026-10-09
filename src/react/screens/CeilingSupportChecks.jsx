export default function CeilingSupportChecks({report,settings,update,NumberInput}){
  const checks=report?.ceilingSupportChecks||[];
  return <details className="no-print"><summary>Опирание потолка и межэтажного перекрытия · {checks.reduce((sum,c)=>sum+c.endSupports.filter(s=>!s).length,0)} концов соединителей вне опор</summary>
    <label className="cut-check"><input type="checkbox" checked={settings.ceilingBearingAlignment} onChange={e=>update({ceilingBearingAlignment:e.target.checked})}/>Привязывать раскладку к фактическим несущим стенам</label>
    <NumberInput label="Допустимый пролёт соединителя по проекту, мм" value={settings.ceilingMaxSpanMm} onChange={v=>update({ceilingMaxSpanMm:v})}/>
    <p>Проверяется положение концов всех соединителей. Не каждый поперечный шов является несущим: назначение, допустимый пролёт, длина опирания и перемычки должны быть подтверждены проектом. Это не расчёт несущей способности. Короткие перегородки не продлеваются на весь дом.</p>
    {checks.length?<div className="cut-table-wrap"><table><thead><tr><th>Соединитель</th><th>Длина, мм</th><th>Начало</th><th>Конец</th><th>Проверка</th></tr></thead><tbody>{checks.map(c=><tr key={c.memberId}><td>{c.memberId}</td><td>{Math.round(c.lengthMm)}</td><td>{c.endSupports[0]?'На опоре':'Вне опоры'}</td><td>{c.endSupports[1]?'На опоре':'Вне опоры'}</td><td>{({'unsupported-end':'Нужна опора или проверка назначения шва','needs-project-span':'Пролёт не подтверждён','span-exceeded':'Превышен заданный пролёт','geometry-checked':'Положение совпало; узел не подтверждён'})[c.status]}</td></tr>)}</tbody></table></div>:<p>Нет соединителей для проверки или привязка отключена.</p>}
  </details>;
}
