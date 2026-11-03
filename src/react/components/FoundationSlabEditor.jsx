import { useMemo, useState } from 'react';
import { NumberField, Toggle } from './ui.jsx';
import { formatNumber } from '../utils/format.js';

const TABS = [
  ['contour', 'Контур'],
  ['slab', 'Плита'],
  ['base', 'Основание'],
  ['blind', 'Отмостка'],
  ['reinforcement', 'Армирование'],
  ['estimate', 'Цены и смета'],
];

function polygonPoints(points = []) {
  return points.map(point => `${point.x},${point.y}`).join(' ');
}

function FoundationPreview({ result }) {
  const box = useMemo(() => {
    const points = [...(result?.blindOuterPolygon || []), ...(result?.slabPolygon || []), ...(result?.housePolygon || [])];
    if (!points.length) return { x: 0, y: 0, w: 10, h: 8 };
    const xs = points.map(point => point.x); const ys = points.map(point => point.y);
    const x = Math.min(...xs); const y = Math.min(...ys); const w = Math.max(...xs) - x; const h = Math.max(...ys) - y;
    const pad = Math.max(0.3, Math.max(w, h) * 0.06);
    return { x: x - pad, y: y - pad, w: w + pad * 2, h: h + pad * 2 };
  }, [result]);
  if (!result?.active) return <p className="assembly-warning">{result?.errors?.join(' ') || 'Контур плиты пока не рассчитан.'}</p>;
  return <svg className="foundation-slab-preview" viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} role="img" aria-label="Контур дома, плиты и отмостки">
    {result.blindOuterPolygon?.length ? <polygon points={polygonPoints(result.blindOuterPolygon)} className="blind-outline" /> : null}
    <polygon points={polygonPoints(result.slabPolygon)} className="slab-outline" />
    <polygon points={polygonPoints(result.housePolygon)} className="house-outline" />
  </svg>;
}

export default function FoundationSlabEditor({ settings, result, estimateLines = [], onChange }) {
  const [tab, setTab] = useState('contour');
  const set = (path, value) => onChange(path, value);
  const unpriced = estimateLines.filter(line => line.pricePending || !(Number(line.price) > 0));
  return <div className="foundation-slab-editor">
    <div className="foundation-slab-warning"><strong>Предварительный расчёт объёмов</strong><span>Толщина, грунты, армирование и узлы требуют проверки конструктора.</span></div>
    <div className="foundation-slab-tabs" role="tablist" aria-label="Разделы фундаментной плиты">
      {TABS.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
    </div>
    {tab === 'contour' ? <div className="foundation-slab-pane">
      <NumberField label="Выпуск плиты от стен" value={settings.extensionMm} suffix="мм" min={0} max={3000} step={10} onChange={value => set('extensionMm', value)} />
      <p className="inspector-note">Контур берётся по наружной границе дома. Г- и П-образная форма сохраняется; габаритный прямоугольник не подставляется.</p>
      <FoundationPreview result={result} />
      <div className="foundation-slab-legend"><span><i className="house"/>Дом</span><span><i className="slab"/>Плита</span><span><i className="blind"/>Отмостка</span></div>
    </div> : null}
    {tab === 'slab' ? <div className="foundation-slab-pane">
      <label className="field">Быстрая толщина<select value={String(settings.thicknessMm)} onChange={event => set('thicknessMm', Number(event.target.value))}>{[150,180,200,250,300,350,400].map(value => <option key={value} value={value}>{value} мм</option>)}</select></label>
      <NumberField label="Толщина вручную" value={settings.thicknessMm} suffix="мм" min={50} max={2000} step={10} onChange={value => set('thicknessMm', value)} />
      <NumberField label="Запас бетона" value={settings.concreteReservePercent} suffix="%" min={0} max={50} step={1} onChange={value => set('concreteReservePercent', value)} />
      <div className="parameter-readouts"><div className="readout"><span>Площадь</span><strong>{formatNumber(result?.areaM2 || 0)} м²</strong></div><div className="readout"><span>Бетон нетто</span><strong>{formatNumber(result?.concreteNetM3 || 0, 3)} м³</strong></div><div className="readout"><span>Заказ с запасом</span><strong>{formatNumber(result?.concreteOrderM3 || 0, 3)} м³</strong></div></div>
    </div> : null}
    {tab === 'base' ? <div className="foundation-slab-pane">
      <NumberField label="Песок · уплотнённый слой" value={settings.sandThicknessMm} suffix="мм" min={0} max={1000} step={10} onChange={value => set('sandThicknessMm', value)} />
      <NumberField label="Коэффициент закупки песка" value={settings.sandPurchaseFactor} suffix="×" min={1} max={3} step={0.01} onChange={value => set('sandPurchaseFactor', value)} />
      <NumberField label="Щебень · уплотнённый слой" value={settings.stoneThicknessMm} suffix="мм" min={0} max={1000} step={10} onChange={value => set('stoneThicknessMm', value)} />
      <NumberField label="Коэффициент закупки щебня" value={settings.stonePurchaseFactor} suffix="×" min={1} max={3} step={0.01} onChange={value => set('stonePurchaseFactor', value)} />
      <NumberField label="Запас геотекстиля" value={settings.geotextileReservePercent} suffix="%" min={0} max={100} step={1} onChange={value => set('geotextileReservePercent', value)} />
      <NumberField label="Запас плёнки" value={settings.filmReservePercent} suffix="%" min={0} max={100} step={1} onChange={value => set('filmReservePercent', value)} />
      <Toggle label="XPS под всей плитой" checked={settings.xpsEnabled === true} onChange={value => set('xpsEnabled', value)} />
      {settings.xpsEnabled ? <NumberField label="Толщина XPS" value={settings.xpsThicknessMm} suffix="мм" min={10} max={500} step={10} onChange={value => set('xpsThicknessMm', value)} /> : null}
      <p className="inspector-note">Уплотнённый и закупочный объёмы показываются отдельно. Коэффициенты остаются проектными переопределениями.</p>
    </div> : null}
    {tab === 'blind' ? <div className="foundation-slab-pane">
      <Toggle label="Добавить бетонную отмостку по всему периметру" checked={settings.blind.enabled === true} onChange={value => set('blind.enabled', value)} />
      {settings.blind.enabled ? <><NumberField label="Ширина от края плиты" value={settings.blind.widthMm} suffix="мм" min={0} max={5000} step={50} onChange={value => set('blind.widthMm', value)} /><NumberField label="Толщина отмостки" value={settings.blind.thicknessMm} suffix="мм" min={50} max={500} step={10} onChange={value => set('blind.thicknessMm', value)} /><div className="parameter-readouts"><div className="readout"><span>Площадь</span><strong>{formatNumber(result?.blindAreaM2 || 0)} м²</strong></div><div className="readout"><span>Бетон нетто</span><strong>{formatNumber(result?.blindConcreteNetM3 || 0, 3)} м³</strong></div></div></> : null}
      <p className="inspector-note">Отмостка строится от наружной границы плиты. Выборочные стороны, въезды и исключаемые площадки будут отдельными проектными зонами.</p>
    </div> : null}
    {tab === 'reinforcement' ? <div className="foundation-slab-pane"><p className="assembly-warning">Автоматическое армирование и раскрой арматуры не включены: в пакете нет утверждённых правил по нагрузкам, защитному слою, анкеровке и нахлёстам.</p><p className="inspector-note">После утверждения конструктивной схемы здесь появятся слои X/Y, швы, заготовки, нахлёсты и карты раскроя.</p></div> : null}
    {tab === 'estimate' ? <div className="foundation-slab-pane"><div className="parameter-readouts"><div className="readout"><span>Материалы плиты</span><strong>{estimateLines.filter(line => line.kind !== 'labor').length} поз.</strong></div><div className="readout"><span>Работы</span><strong>{estimateLines.filter(line => line.kind === 'labor').length} поз.</strong></div><div className="readout"><span>Без цены</span><strong>{unpriced.length} поз.</strong></div></div>{unpriced.length ? <p className="assembly-warning">Неоценённые позиции: {unpriced.map(line => line.name).join(', ')}. Они остаются видимыми и не превращаются в достоверную полную стоимость.</p> : <p className="inspector-note">Все активные позиции имеют цену в текущем проектном прайсе.</p>}</div> : null}
  </div>;
}
