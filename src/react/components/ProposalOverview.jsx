export function ProposalOverview({ scope, options }) {
  if (!scope.length) return null;
  return <section className="proposal-overview" aria-labelledby="proposal-overview-title">
    <h2 id="proposal-overview-title">Что включено в расчёт</h2>
    <p>Краткий состав выбранной комплектации проекта</p>
    <dl>{scope.map(item => <div key={item.key}><dt>{item.title}</dt><dd>{item.summary}</dd></div>)}</dl>
    <footer>
      {options.includeLabor === false ? 'Монтажные работы исключены; технологический раскрой сохраняется, если он рассчитан. ' : ''}
      {options.includeAccessories === false ? 'Крепёж и сопутствующие расходные материалы исключены. ' : ''}
      Подробный состав разделов приведён далее. Не выбранные в смете позиции в стоимость не входят.
    </footer>
  </section>;
}
