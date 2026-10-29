import React from 'react';
import { NumberField, SelectField } from './ui.jsx';

export default function FlatRoofAssemblyFields({ roof, onChange }) {
  if (roof.shape !== 'flat') return null;
  const parapet = roof.flatParapetMode || 'none';
  const bitumen = roof.flatCoverSystem === 'bitumen';
  return <div className="flat-roof-assembly">
    <h4>Парапет и покрытие плоской кровли</h4>
    <SelectField label="Ограждение кровли" value={parapet} onChange={value => onChange('flatParapetMode', value)} options={[
      { value: 'none', label: 'Без парапета · прежний расчёт' },
      { value: 'flashing', label: 'Низкий парапет · листы и примыкание' },
      { value: 'closed', label: 'Закрытый парапет · водоотвод через стенку' },
      { value: 'open', label: 'Открыт со стороны ската' },
    ]}/>
    {parapet !== 'none' ? <>
      <NumberField label="Высота парапета от потолка" value={roof.flatParapetHeightMm ?? 900} suffix="мм" min={150} max={3000} step={50} onChange={value => onChange('flatParapetHeightMm', value)}/>
      {parapet === 'open' ? <>
        <SelectField label="Открытая сторона" value={roof.flatOpenSide || 'back'} onChange={value => { onChange('flatOpenSide', value); onChange('flatSlopeDirection', value); }} options={[
          {value:'front',label:'Фасад'}, {value:'back',label:'Задняя'}, {value:'left',label:'Левая'}, {value:'right',label:'Правая'},
        ]}/>
        <NumberField label="Вынос кровли за открытую стену" value={roof.flatOpenOverhangMm ?? 500} suffix="мм" min={0} max={3000} step={50} onChange={value => onChange('flatOpenOverhangMm', value)}/>
        <p>Направление уклона должно совпадать с открытой стороной.</p>
      </> : null}
      {parapet === 'closed' ? <NumberField label="Воронки через парапет" value={roof.flatDrainCount ?? 2} suffix="шт" min={1} max={20} step={1} onChange={value => onChange('flatDrainCount', value)}/> : null}
    </> : null}
    <SelectField label="Настил и гидроизоляция" value={roof.flatCoverSystem || 'sheet'} onChange={value => onChange('flatCoverSystem', value)} options={[
      {value:'sheet',label:'Листы по обрешётке · прежний расчёт'},
      {value:'bitumen',label:'ОСБ + 2 слоя ЦСП + рулонная гидроизоляция'},
    ]}/>
    {bitumen ? <>
      <SelectField label="Лист ОСБ" value={String(roof.flatOsbThicknessMm ?? 12)} onChange={value => onChange('flatOsbThicknessMm', Number(value))} options={[
        {value:'12',label:'12 мм · 1250 × 2500 мм'},
        {value:'9',label:'9 мм · 1250 × 2500 мм'},
      ]}/>
      <SelectField label="Слоёв ОСБ" value={String(roof.flatOsbLayers ?? 2)} onChange={value => onChange('flatOsbLayers', Number(value))} options={[{value:'1',label:'1 слой'},{value:'2',label:'2 слоя'}]}/>
      <NumberField label="Крепёж ОСБ на слой" value={roof.flatOsbFastenersKgPerM2 ?? 0.1} suffix="кг/м²" min={0} max={1} step={0.01} onChange={value => onChange('flatOsbFastenersKgPerM2', value)}/>
      <p>Поверх ОСБ смета учитывает два слоя ЦСП 12 мм со смещением швов, крепёж и праймер. Только по сухому загрунтованному ЦСП укладываются нижний ХПП и верхний ХКП. Нахлёсты, подъём на парапет и спуск на наружную стену входят в расход. Цена монтажа ЦСП предварительная; проверьте её в проектной смете.</p>
      {parapet !== 'none' ? <>
        <NumberField label="Подъём гидроизоляции на парапет" value={roof.flatWaterproofUpstandMm ?? 900} suffix="мм" min={0} max={3000} step={50} onChange={value => onChange('flatWaterproofUpstandMm', value)}/>
        <NumberField label="Спуск на наружную стену" value={roof.flatWaterproofOutsideMm ?? 100} suffix="мм" min={0} max={500} step={25} onChange={value => onChange('flatWaterproofOutsideMm', value)}/>
      </> : null}
    </> : null}
  </div>;
}
