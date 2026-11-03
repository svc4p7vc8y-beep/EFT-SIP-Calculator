import { useMemo } from 'react';
import { calculateStructuralEngineReport } from '../calculations/structural-engine-adapter.js';
import { Field, NumberField, SelectField, Toggle } from './ui.jsx';
import { formatNumber } from '../utils/format.js';

const STATUS_LABELS = {
  PRELIMINARY_UNVERIFIED: 'Предварительно · не проверено инженером',
};

const REQUIREMENT_LABELS = {
  TALL_WALL_ENGINEERING_REQUIRED: item => `${item.target}: высота стены ${formatNumber(item.measuredMM / 1000, 3)} м требует отдельной инженерной проверки.`,
  OPENING_LOAD_PATH_UNVERIFIED: item => `${item.target}: путь нагрузки над проёмом шириной ${formatNumber(item.measuredMM / 1000, 3)} м не подтверждён.`,
  PARTITION_SEAM_UNVERIFIED: item => `${item.target}: стык перегородки требует проверки соединения и опирания.`,
};

const ratioLabel = value => `${formatNumber(Number(value) || 0, 3)} ×`;

export default function StructuralEnginePanel({ project, calculation, onChange }) {
  const report = useMemo(() => calculateStructuralEngineReport(project, calculation), [project, calculation]);
  const settings = report.settings;
  const changeLoad = (path, value) => onChange(path, value, true);
  const headerProfile = project.settings.productionCutting?.windowSupportHeaders || {};
  const screening = report.headerScreen;
  return <details className="structural-engine-panel">
    <summary><span>Предварительный расчёт нагрузок</span><small>{settings.enabled ? STATUS_LABELS[report.status] : 'выключен'}</small></summary>
    <div className="structural-engine-body">
      <div className="structural-engine-warning"><strong>Не является расчётом КР</strong><span>Движок v{report.engineVersion} проверяет только простую односкатную схему на двух параллельных опорах. Он не выбирает снеговой/ветровой район и не подтверждает сечения.</span></div>
      <Toggle label="Включить предварительную проверку" checked={settings.enabled} onChange={value => onChange('enabled', value)} />
      {settings.enabled ? <>
        <Field label="Название расчётного случая" hint="Например: пользовательское сочетание УЛС-1"><input value={settings.loadCaseName} maxLength={120} onChange={event => changeLoad('loadCaseName', event.target.value)} /></Field>
        <div className="structural-engine-grid">
          <NumberField label="Постоянная нагрузка" value={settings.deadLoadKPa} suffix="кПа" min={0} step={0.01} onChange={value => changeLoad('deadLoadKPa', value)} />
          <NumberField label="Снеговая нагрузка" value={settings.snowLoadKPa} suffix="кПа" min={0} step={0.01} onChange={value => changeLoad('snowLoadKPa', value)} />
          <NumberField label="Ветер вертикально" value={settings.windVerticalKPa} suffix="кПа" min={-20} step={0.01} onChange={value => changeLoad('windVerticalKPa', value)} />
          <NumberField label="γ постоянной" value={settings.gammaDead} suffix="×" min={0} step={0.01} onChange={value => changeLoad('gammaDead', value)} />
          <NumberField label="γ снеговой" value={settings.gammaSnow} suffix="×" min={0} step={0.01} onChange={value => changeLoad('gammaSnow', value)} />
          <NumberField label="γ ветровой" value={settings.gammaWind} suffix="×" min={0} step={0.01} onChange={value => changeLoad('gammaWind', value)} />
        </div>
        <SelectField label="Постоянная нагрузка задана" value={settings.deadLoadBasis} options={[
          { value: 'horizontal', label: 'На горизонтальную проекцию' },
          { value: 'slope', label: 'На фактическую площадь ската' },
        ]} onChange={value => changeLoad('deadLoadBasis', value)} />
        <div className="structural-engine-toggles"><Toggle label="Учитывать снег" checked={settings.snowOn} onChange={value => changeLoad('snowOn', value)} /><Toggle label="Учитывать вертикальный ветер" checked={settings.windOn} onChange={value => changeLoad('windOn', value)} /></div>
        <Toggle label="Нагрузки и коэффициенты взяты из проверенного расчётного задания" checked={settings.inputsConfirmed} onChange={value => onChange('inputsConfirmed', value)} />
        {report.issues.length ? <div className="structural-engine-issues" role="status">{report.issues.map((item, index) => <p key={`${item.code}-${item.target}-${index}`}><strong>{item.code}</strong>{item.message}</p>)}</div> : null}
        {report.reaction ? <>
          <div className="parameter-readouts structural-engine-results">
            <div className="readout"><span>Проекция</span><strong>{formatNumber(report.reaction.projectedAreaM2, 2)} м²</strong></div>
            <div className="readout"><span>Результирующая</span><strong>{formatNumber(report.reaction.resultantKPa, 3)} кПа</strong></div>
            <div className="readout"><span>Общая сила</span><strong>{formatNumber(report.reaction.checks.overallLoadKN, 2)} кН</strong></div>
          </div>
          <div className="structural-support-list">{report.reaction.supports.map(support => <article key={support.id}><strong>{support.wallName} · {support.wallId}</strong><span>{formatNumber(support.reactionKN, 2)} кН</span><small>{formatNumber(support.lineLoadKNperM, 3)} кН/м · проёмов: {support.openings.length}</small></article>)}</div>
          {report.requirements?.issues?.length ? <div className="structural-engine-issues structural-requirement-issues"><strong>Что требует отдельной проверки</strong>{report.requirements.issues.map((item, index) => <p key={`${item.code}-${item.target}-${index}`}>{REQUIREMENT_LABELS[item.code]?.(item) || `${item.target || 'Элемент'}: ${item.code}`}</p>)}</div> : null}
          <p className="inspector-note">Баланс реакций: {formatNumber(report.reaction.checks.reactionSumKN, 2)} кН. Совпадение баланса не подтверждает стены, перемычки, соединения или фундамент.</p>
          <div className="parameter-subgroup structural-header-screen"><strong>Проверочный экран перемычки опорной стены</strong>
            <Toggle label="Проверить выбранный проём" checked={settings.header.enabled} onChange={value => onChange('header.enabled', value)} />
            {settings.header.enabled ? <>
              <SelectField label="Проём" value={settings.header.openingId} options={[{ value: '', label: 'Выберите проём' }, ...report.supportOpenings.map(opening => ({ value: opening.id, label: `${opening.id} · ${formatNumber(opening.width / 1000, 3)} м · ${opening.wallId}` }))]} onChange={value => onChange('header.openingId', value)} />
              <p className="inspector-note">Проектный пакет: {headerProfile.boards || 3} × {headerProfile.profile || '50×150'} мм; опирание по {headerProfile.bearingMm || 150} мм. Геометрия и смета существующего усиления не меняются.</p>
              <div className="structural-engine-grid">
                <NumberField label="Расчётное сопротивление изгибу" value={settings.header.designBendingMPa} suffix="МПа" min={0.001} step={0.1} onChange={value => onChange('header.designBendingMPa', value)} />
                <NumberField label="Расчётное сопротивление срезу" value={settings.header.designShearMPa} suffix="МПа" min={0.001} step={0.1} onChange={value => onChange('header.designShearMPa', value)} />
                <NumberField label="Модуль упругости" value={settings.header.elasticModulusMPa} suffix="МПа" min={0.001} step={100} onChange={value => onChange('header.elasticModulusMPa', value)} />
                <NumberField label="Предел прогиба L/" value={settings.header.deflectionLimitRatio} min={1} step={10} onChange={value => onChange('header.deflectionLimitRatio', value)} />
              </div>
              {screening ? <div className={`structural-screen-result ${screening.preliminarySectionScreen === 'WITHIN_INPUT_LIMITS' ? 'within' : 'exceeds'}`}><strong>{screening.preliminarySectionScreen === 'WITHIN_INPUT_LIMITS' ? 'В пределах введённых ограничений' : 'Превышает введённые ограничения'}</strong><span>Изгиб: {ratioLabel(screening.ratios.bending)} · срез: {ratioLabel(screening.ratios.shear)} · прогиб: {ratioLabel(screening.ratios.deflection)}</span><small>structuralVerified = false. Не проверены опорное смятие, совместная работа досок, крепёж, устойчивость и путь нагрузки до фундамента.</small></div> : null}
            </> : null}
          </div>
        </> : null}
      </> : null}
    </div>
  </details>;
}
