import { NumberField, SelectField, Toggle } from './ui.jsx';

export default function UpperFloorControls({ plan, onChange, onWarmRoof }) {
  const attic = plan.floorType === 'attic';
  return <div role="region" aria-label="Второй этаж и мансарда">
    <div className="form-grid">
      <SelectField label="Тип второго этажа" value={attic ? 'attic' : 'regular'} options={[
        { value: 'regular', label: 'Обычный этаж' }, { value: 'attic', label: 'Мансарда под крышей' },
      ]} onChange={floorType => onChange({ floorType, ...(floorType === 'attic' && plan.partitionHeight == null ? { partitionHeight: 2.5 } : {}) })} />
      <NumberField label={attic ? 'Высота наружных стен мансарды' : 'Высота стен второго этажа'} value={plan.wallHeight} min={0} suffix="м" onChange={wallHeight => onChange({ wallHeight })} hint="0 м — крыша над межэтажным перекрытием. Высота первого этажа не меняется." />
      {attic ? <NumberField label="Расчётная высота перегородок мансарды" value={plan.partitionHeight ?? 2.5} min={0} suffix="м" onChange={partitionHeight => onChange({ partitionHeight })} hint="Отдельная высота заготовок; подрезка под скаты — по рабочему проекту." /> : null}
    </div>
    {attic ? <>
      <Toggle label="Горизонтальный SIP-потолок над мансардой" checked={plan.atticHorizontalCeiling === true} onChange={atticHorizontalCeiling => onChange({ atticHorizontalCeiling })} hint="Без него отдельно рассчитывается кровля, а не ещё одно полное перекрытие." />
      <p className="inspector-note">Межэтажное перекрытие считается с лестничным проёмом. Фронтоны, подъём конька и утеплённые скаты задаются в «Кровле». Площадь этажа — проекция пола, не нормативная жилая площадь по высоте. Прогоны, опоры и несущую способность проверяют по проекту; высота перегородок здесь задаёт прямоугольные заготовки. Для простого прямоугольного дома отделка скатов без свесов = площадь плана × коэффициент уклона; распределение по помещениям предварительное, площади можно изменить в отделке. Для сложной крыши площади отделки скатов и фронтонов вводятся вручную.</p>
      {onWarmRoof ? <button className="button secondary" type="button" onClick={onWarmRoof}>Применить SIP-кровлю и SIP-фронтоны для мансарды</button> : null}
    </> : null}
  </div>;
}
