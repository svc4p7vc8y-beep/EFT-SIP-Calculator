import { Cable, Droplets, Fan, Layers3, Waves } from 'lucide-react';
import { DEFAULT_ENGINEERING, ENGINEERING_STAGES, VENTILATION_SOLUTIONS } from '../calculations/engineering-model.js';
import { NumberField, SelectField, Stat, Toggle } from './ui.jsx';
import { formatMoney } from '../utils/format.js';

const WATER_SOURCES = [
  { value: 'well', label: 'Колодец с погружным насосом' },
  { value: 'central', label: 'Центральный ввод / готовая точка' },
];
const SEWER_SYSTEMS = [
  { value: 'rings', label: 'Септик из колец КС 10.9' },
  { value: 'bio', label: 'Бюджетная станция биоочистки до 5 человек' },
  { value: 'central', label: 'Подключение к готовой сети' },
];

function subsystemTotal(lines, prefix) {
  return (lines || []).filter(line => line.estimateGroup?.startsWith(prefix)).reduce((sum, line) => sum + line.qty * line.price, 0);
}

function StageNote({ stage, subject }) {
  if (stage === 'rough') return <p className="engineering-stage-note rough"><strong>Черновая:</strong> считаются трассы, закладные и подготовка. Оборудование и финальные {subject} не устанавливаются.</p>;
  if (stage === 'prefinish') return <p className="engineering-stage-note prefinish"><strong>Предчистовая:</strong> трассы и точки готовы к финишному монтажу, но в смету не входят: {subject}.</p>;
  return <p className="engineering-stage-note complete"><strong>Полная:</strong> добавлены {subject}, подключение и пусконаладка.</p>;
}

export function EngineeringEditor({ project, calculation, commit }) {
  const detailed = project.settings.engineering?.assemblyVersion === 1;
  const effective = calculation.engineering?.settings || { ...DEFAULT_ENGINEERING, ...project.settings.engineering };
  const lines = calculation.sections.find(section => section.key === 'engineering')?.lines || [];
  const set = (key, value, manualGroup) => commit(next => {
    next.settings.engineering = { ...DEFAULT_ENGINEERING, ...next.settings.engineering, [key]: value };
    if (manualGroup) next.settings.engineering[`${manualGroup}Auto`] = false;
    return next;
  });
  const service = (key, value) => commit(next => { next.services[key] = value; return next; });
  if (!detailed) return <div className="internal-upgrade engineering-upgrade"><Layers3/><div><strong>Сохранён прежний расчёт инженерии</strong><p>Он оставлен без изменений, чтобы старая смета не подорожала. Подробный режим добавит стадии, щит, колодец с насосом, канализацию и три схемы вентиляции.</p></div><button className="button primary" onClick={() => commit(next => { next.settings.engineering = { ...DEFAULT_ENGINEERING, ...next.settings.engineering, assemblyVersion: 1 }; return next; })}>Перейти на подробный расчёт</button></div>;

  return <div className="engineering-editor">
    <section className="engineering-overview">
      <Stat label="Электрика" value={project.services.engineeringElectric ? formatMoney(subsystemTotal(lines, 'Электрика')) : 'не включена'}/>
      <Stat label="Водоснабжение" value={project.services.engineeringPlumbing ? formatMoney(subsystemTotal(lines, 'Водоснабжение')) : 'не включено'}/>
      <Stat label="Канализация" value={project.services.engineeringSewerage ? formatMoney(subsystemTotal(lines, 'Канализация')) : 'не включена'}/>
      <Stat label="Вентиляция" value={project.services.engineeringVentilation ? formatMoney(subsystemTotal(lines, 'Вентиляция')) : 'не включена'}/>
    </section>
    <details className="internal-global" open><summary>Общие параметры</summary><div className="form-grid"><NumberField label="Запас линейных материалов" value={Math.round((effective.reserve - 1) * 100)} suffix="%" step={1} onChange={value => set('reserve', 1 + value / 100)}/><Toggle label="Схемы и разметка" checked={effective.includeDesign !== false} onChange={value => set('includeDesign', value)}/></div><p>Каждая система имеет свою стадию. Предчистовая комплектация оставляет готовые точки, но не добавляет финальные приборы.</p></details>

    <section className={`engineering-block ${project.services.engineeringElectric ? 'enabled' : ''}`}>
      <header><div><Cable/><span><strong>Электрика</strong><small>Розетки, свет, силовые линии, щит и защита</small></span></div><Toggle label="Включить" checked={project.services.engineeringElectric} onChange={value => service('engineeringElectric', value)}/></header>
      {project.services.engineeringElectric ? <><SelectField label="Стадия готовности" value={effective.electricStage} options={ENGINEERING_STAGES} onChange={value => set('electricStage', value)}/><StageNote stage={effective.electricStage} subject="розетки, выключатели и светильники"/><Toggle label="Количества из площади плана" checked={effective.electricAuto} onChange={value => set('electricAuto', value)}/><div className="form-grid four"><NumberField label="Кабельные трассы" value={effective.cableRoute} suffix="м" onChange={value => set('cableRoute', value, 'electric')}/><NumberField label="Подготовка розеток" value={effective.socketPoints} suffix="шт" step={1} onChange={value => set('socketPoints', value, 'electric')}/><NumberField label="Выключатели" value={effective.switchPoints} suffix="шт" step={1} onChange={value => set('switchPoints', value, 'electric')}/><NumberField label="Точки света" value={effective.lightPoints} suffix="шт" step={1} onChange={value => set('lightPoints', value, 'electric')}/><NumberField label="Силовые точки" value={effective.powerPoints} suffix="шт" step={1} onChange={value => set('powerPoints', value, 'electric')}/><NumberField label="Группы в щите" value={effective.electricCircuits} suffix="шт" step={1} onChange={value => set('electricCircuits', value, 'electric')}/></div><div className="engineering-toggles"><Toggle label="Щит и защита" checked={effective.electricPanel} onChange={value => set('electricPanel', value)}/><Toggle label="Контур заземления" checked={effective.electricGrounding} onChange={value => set('electricGrounding', value)}/></div></> : null}
    </section>

    <section className={`engineering-block ${project.services.engineeringPlumbing ? 'enabled' : ''}`}>
      <header><div><Droplets/><span><strong>Водоснабжение</strong><small>Колодец, насос, автоматика, зимний ввод и разводка</small></span></div><Toggle label="Включить" checked={project.services.engineeringPlumbing} onChange={value => service('engineeringPlumbing', value)}/></header>
      {project.services.engineeringPlumbing ? <><div className="form-grid"><SelectField label="Стадия готовности" value={effective.waterStage} options={ENGINEERING_STAGES} onChange={value => set('waterStage', value)}/><SelectField label="Источник воды" value={effective.waterSource} options={WATER_SOURCES} onChange={value => set('waterSource', value)}/></div><StageNote stage={effective.waterStage} subject="сантехприборы"/><Toggle label="Трассы и точки из плана" checked={effective.waterAuto} onChange={value => set('waterAuto', value)}/><div className="form-grid four"><NumberField label="Внутренняя разводка" value={effective.waterPipe} suffix="м" onChange={value => set('waterPipe', value, 'water')}/><NumberField label="Точки воды" value={effective.waterPoints} suffix="шт" step={1} onChange={value => set('waterPoints', value, 'water')}/>{effective.waterSource === 'well' ? <><NumberField label="Кольца КС 10.9" value={effective.wellRings} suffix="шт" step={1} onChange={value => set('wellRings', value)}/><NumberField label="Колодец — дом" value={effective.wellRoute} suffix="м" onChange={value => set('wellRoute', value)}/></> : null}</div>{effective.waterSource === 'well' ? <><div className="well-ring-price"><span>Одно кольцо с работой</span><strong>5 000 ₽ материал + 5 500 ₽ работа = 10 500 ₽</strong></div><div className="engineering-toggles"><Toggle label="Погружной насос 55/50" checked={effective.wellPump} onChange={value => set('wellPump', value)}/><Toggle label="Автоматика БРА" checked={effective.wellAutomation} onChange={value => set('wellAutomation', value)}/><Toggle label="Утепление и греющий кабель" checked={effective.frostProtection} onChange={value => set('frostProtection', value)}/><Toggle label="Магистральный фильтр" checked={effective.waterFilter} onChange={value => set('waterFilter', value)}/></div></> : null}</> : null}
    </section>

    <section className={`engineering-block ${project.services.engineeringSewerage ? 'enabled' : ''}`}>
      <header><div><Waves/><span><strong>Канализация</strong><small>Внутренние выводы, наружная трасса, фановый стояк и очистка</small></span></div><Toggle label="Включить" checked={project.services.engineeringSewerage} onChange={value => service('engineeringSewerage', value)}/></header>
      {project.services.engineeringSewerage ? <><div className="form-grid"><SelectField label="Стадия готовности" value={effective.sewerStage} options={ENGINEERING_STAGES} onChange={value => set('sewerStage', value)}/><SelectField label="Точка сброса" value={effective.sewerSystem} options={SEWER_SYSTEMS} onChange={value => set('sewerSystem', value)}/></div><StageNote stage={effective.sewerStage} subject="сантехприборы"/><Toggle label="Внутренние трассы из плана" checked={effective.sewerAuto} onChange={value => set('sewerAuto', value)}/><div className="form-grid four"><NumberField label="Внутренняя канализация" value={effective.sewerLength} suffix="м" onChange={value => set('sewerLength', value, 'sewer')}/><NumberField label="Точки слива" value={effective.sewerPoints} suffix="шт" step={1} onChange={value => set('sewerPoints', value, 'sewer')}/><NumberField label="Наружная трасса" value={effective.externalSewerLength} suffix="м" onChange={value => set('externalSewerLength', value)}/>{effective.sewerSystem === 'rings' ? <NumberField label="Кольца септика" value={effective.septicRings} suffix="шт" step={1} onChange={value => set('septicRings', value)}/> : null}</div>{effective.sewerSystem === 'rings' ? <div className="well-ring-price"><span>Одно кольцо септика с работой</span><strong>5 000 ₽ материал + 5 500 ₽ работа = 10 500 ₽</strong></div> : null}<Toggle label="Фановый стояк через кровлю" checked={effective.fanStack} onChange={value => set('fanStack', value)}/></> : null}
    </section>

    <section className={`engineering-block ${project.services.engineeringVentilation ? 'enabled' : ''}`}>
      <header><div><Fan/><span><strong>Вентиляция SIP-дома</strong><small>Постоянный приток, вытяжка мокрых зон и переток между комнатами</small></span></div><Toggle label="Включить" checked={project.services.engineeringVentilation} onChange={value => service('engineeringVentilation', value)}/></header>
      {project.services.engineeringVentilation ? <><div className="form-grid"><SelectField label="Стадия готовности" value={effective.ventilationStage} options={ENGINEERING_STAGES} onChange={value => set('ventilationStage', value)}/><SelectField label="Решение" value={effective.ventilationSolution} options={VENTILATION_SOLUTIONS} onChange={value => set('ventilationSolution', value)}/></div><StageNote stage={effective.ventilationStage} subject="клапаны, вентиляторы или рекуператоры"/><Toggle label="Количества из площади и мокрых комнат" checked={effective.ventilationAuto} onChange={value => set('ventilationAuto', value)}/><div className="form-grid four"><NumberField label="Воздуховоды" value={effective.ventDuct} suffix="м" onChange={value => set('ventDuct', value, 'ventilation')}/><NumberField label="Приточные точки" value={effective.supplyDevices} suffix="шт" step={1} onChange={value => set('supplyDevices', value, 'ventilation')}/><NumberField label="Вытяжные вентиляторы" value={effective.extractFans} suffix="шт" step={1} onChange={value => set('extractFans', value, 'ventilation')}/><NumberField label="Обычные решётки" value={effective.ventGrilles} suffix="шт" step={1} onChange={value => set('ventGrilles', value, 'ventilation')}/><NumberField label="Проходки на кровле" value={effective.roofPassages} suffix="шт" step={1} onChange={value => set('roofPassages', value, 'ventilation')}/><NumberField label="Переточные решётки" value={effective.transferGrilles} suffix="шт" step={1} onChange={value => set('transferGrilles', value, 'ventilation')}/></div><div className="ventilation-options"><article><strong>КИВ + вытяжка</strong><span>Самый доступный вариант. Даёт приток в жилые комнаты и принудительную вытяжку из санузлов.</span></article><article><strong>Комнатные рекуператоры</strong><span>Меньше теплопотерь, нет большой сети воздуховодов. Вытяжка мокрых зон остаётся.</span></article><article><strong>Общий приток</strong><span>Одна установка с фильтром и подогревом, разводка по комнатам и отдельная вытяжка.</span></article></div></> : null}
    </section>
    {calculation.engineering?.warnings?.length ? <aside className="engineering-warnings">{calculation.engineering.warnings.map(item => <p key={item}>{item}</p>)}</aside> : null}
    <p className="internal-source-note">Бюджетные цены помечены в прайс-листе как ориентировочные. Конкретные модели, трассы, расходы воздуха и защита подтверждаются проектом.</p>
  </div>;
}
