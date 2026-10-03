import { NumberField, SelectField } from './ui.jsx';
import { TIERED_GABLE_LABELS, normalizeTieredRoof } from '../calculations/tiered-roof.js';
import { formatNumber } from '../utils/format.js';

const GABLE_TYPES = [
  { value: 'auto', label: 'По типу кровли' },
  { value: 'sip', label: 'SIP-панели' },
  { value: 'frame', label: 'Каркас 50×150 мм + ОСБ' },
  { value: 'none', label: 'Не учитывать' },
];

export function TieredRoofEditor({ project, calculation, setSetting }) {
  const settings = normalizeTieredRoof(project.settings.roof.tiered);
  const geometry = calculation.roof.geometry;
  const gables = calculation.roof.tieredGables;
  const update = patch => setSetting('roof', 'tiered', { ...settings, ...patch });
  const updateGableType = (key, type) => update({ gableTypes: { ...settings.gableTypes, [key]: type } });
  const updateGableArea = (key, area) => update({ gableAreas: { ...settings.gableAreas, [key]: area } });
  const verticalSpan = project.settings.roof.ridgeAxis === 'y';
  return <div className="tiered-roof-editor">
    <h3>Два односкатных уровня</h3>
    <p>План делится по ширине на два ската без наложения площади. Верхняя часть может быть слева/сверху или справа/снизу; направления уклонов показываются на плане. Площади и материалы пересчитываются сразу.</p>
    <div className="form-grid four">
      <NumberField label="Ширина верхнего уровня" value={settings.upperShare} suffix="% ширины дома" min={10} max={90} step={5} onChange={upperShare => update({ upperShare })} />
      <SelectField label="Верхний уровень на плане" value={settings.upperSide} onChange={upperSide => update({ upperSide })} options={[
        { value: 'first', label: verticalSpan ? 'Слева' : 'Сверху' },
        { value: 'second', label: verticalSpan ? 'Справа' : 'Снизу' },
      ]} />
      <NumberField label="Подъём верхнего ската" value={settings.upperRise} suffix="м" min={0} step={0.05} onChange={upperRise => update({ upperRise })} />
      <NumberField label="Подъём нижнего ската" value={settings.lowerRise} suffix="м" min={0} step={0.05} onChange={lowerRise => update({ lowerRise })} />
      <NumberField label="Высота перепада у стыка" value={settings.stepHeight} suffix="м" min={0} step={0.05} onChange={stepHeight => update({ stepHeight })} />
      <NumberField label="Свес верхнего ската у стыка" value={settings.jointOverhang} suffix="м" min={0} step={0.05} onChange={jointOverhang => update({ jointOverhang })} />
      <SelectField label="Уклон верхнего ската" value={settings.upperSlopeDirection} onChange={upperSlopeDirection => update({ upperSlopeDirection })} options={[
        { value: 'towardJunction', label: 'К стыку' }, { value: 'awayJunction', label: 'От стыка' },
      ]} />
      <SelectField label="Уклон нижнего ската" value={settings.lowerSlopeDirection} onChange={lowerSlopeDirection => update({ lowerSlopeDirection })} options={[
        { value: 'awayJunction', label: 'От стыка' }, { value: 'towardJunction', label: 'К стыку' },
      ]} />
      {project.settings.roof.type === 'combo' ? <SelectField label="Тёплые SIP-скаты" value={settings.warmLevel} onChange={warmLevel => update({ warmLevel })} options={[
        { value: 'upper', label: 'Только верхний' }, { value: 'lower', label: 'Только нижний' }, { value: 'both', label: 'Оба ската' },
      ]} /> : null}
    </div>
    {geometry?.shape === 'tiered' ? <div className="tiered-roof-metrics">
      <div><span>Верхний скат</span><strong>{formatNumber(geometry.upperArea)} м² · длина {formatNumber(geometry.upperSlopeLength)} м</strong></div>
      <div><span>Нижний скат</span><strong>{formatNumber(geometry.lowerArea)} м² · длина {formatNumber(geometry.lowerSlopeLength)} м</strong></div>
      <div><span>Примыкание уровней</span><strong>{formatNumber(geometry.junctionLength)} м · {calculation.roof.tieredJoinPieces} планок</strong></div>
      <div><span>Внутренняя опорная линия</span><strong>{formatNumber(calculation.roof.tieredStepSupportLength)} м · сечение и опоры по проекту</strong></div>
    </div> : null}
    <h4>Фронтоны и стенка перепада</h4>
    <p>Можно включить третий и четвёртый наружные фронтоны и внутреннюю стенку. Для каждого выбирается SIP или каркас; площадь можно заменить проектной. В режиме «По типу кровли» комбинированная кровля использует каркас.</p>
    <div className="tiered-gable-list">
      {Object.entries(TIERED_GABLE_LABELS).map(([key, label]) => {
        const zone = gables?.zones.find(item => item.key === key);
        return <div className="tiered-gable-row" key={key}>
          <strong>{label}</strong>
          <SelectField label={`Конструкция · ${label}`} value={settings.gableTypes[key]} options={GABLE_TYPES} onChange={value => updateGableType(key, value)} />
          <NumberField label={`Площадь · ${label}`} value={settings.gableAreas[key] ?? zone?.calculatedArea ?? 0} suffix="м²" min={0} step={0.1} onChange={value => updateGableArea(key, value)} />
          {settings.gableAreas[key] != null ? <button type="button" className="button secondary" onClick={() => updateGableArea(key, null)}>По геометрии</button> : null}
        </div>;
      })}
    </div>
    <p className="assembly-warning">Смета учитывает две плоскости, торцевые фронтоны, внутреннюю стенку, опорную линию и планку примыкания. Несущую способность стропил, внутренней опоры, высотные отметки, узел примыкания и герметизацию подтвердите конструктивным проектом. Расчёт не заменяет рабочие чертежи.</p>
    <p className="roof-section-note">Ориентиры для новых позиций: <a href="https://ufa.lemanapro.ru/catalogue/profnastil/metallicheskaya-krovlya/?page=22" target="_blank" rel="noreferrer">планка примыкания 1,25 м — 708 ₽/шт</a> (цена набора пересчитана за штуку), <a href="https://www.oriongroupspb.ru/ceni.html" target="_blank" rel="noreferrer">монтаж — от 900 ₽/м</a>. Цены и наличие уточняются для региона и узла; существующие позиции прайса не изменены.</p>
  </div>;
}
