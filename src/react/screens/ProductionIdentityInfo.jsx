export default function ProductionIdentityInfo({ report }) {
  const items = [...report.parts, ...report.members];
  const stable = items.filter(item => item.identityStatus === 'source-position').length;
  return <details className="cut-note no-print" aria-label="Реестр марок деталей">
    <summary>Марки деталей · сохранено {report.markRegistry?.entries.length || 0}</summary>
    <p>Одинаковые детали получают одну короткую марку. Добавление и перестановка групп не меняют сохранённые марки; удалённые номера не используются для других деталей. При изменении материала, размеров или обработки создаётся новая марка группы.</p>
    <p>Постоянная привязка к исходной проектной позиции: {stable}. Автоматические позиции раскладки: {items.length - stable}. После разделения или объединения автоматических деталей их прежняя идентичность не подтверждена; ручные переопределения не переносятся по совпадению марки.</p>
    <p>Реестр сохраняется в проекте и .eft.json. Марка группы, исходная позиция и технический ID — разные обозначения.</p>
    <p>Исходные конструкции: {report.surfaces.filter(s=>s.sourceIdentityStatus==='registered-source').length} с постоянной привязкой. Остальные участки требуют регистрации или проверки. ID конструкции не подтверждает идентичность её панелей после изменения раскладки.</p>
    {report.settings.constructionSources?.invalid ? <p role="alert">Реестр исходных стен содержит некорректные или повторяющиеся ID. Проверьте привязки перед выпуском листов.</p> : null}
    {report.markRegistry?.invalid ? <p role="alert">В сохранённом реестре обнаружены некорректные или повторяющиеся записи. Проверьте марки перед выпуском новых листов; старые листы могут содержать другие обозначения.</p> : null}
  </details>;
}

export function ConstructionSourceInfo({surface}) {
  if(!surface?.sourceIdentityStatus)return null;
  return <div className="cut-note no-print" aria-label="Исходная конструкция" style={{overflowWrap:'anywhere'}}>
    <p>Этаж {surface.floor}. Привязки разных этажей независимы.</p>
    <p>{surface.sourceRoleLabel ? `Сторона: ${surface.sourceRoleLabel}. ` : ''}{surface.sourceIdentityStatus==='registered-source' ? 'Исходная конструкция зарегистрирована.' : surface.sourceIdentityStatus==='needs-registration' ? 'Регистрация исходной стены…' : 'Привязка требует проверки.'}</p>
    {surface.constructionSourceId ? <small>ID: {surface.constructionSourceId}</small> : <small>{surface.sourceIdentityReason}</small>}
    {surface.sourceTopologyLabel ? <p>Текущее построение: {surface.sourceTopologyLabel}.</p> : null}
    {surface.sourceContributors?.length ? <ul>{surface.sourceContributors.map((r,i)=><li key={i}>{r.name} · {r.roleLabel||'линия'} · {r.complete?'целиком':'частично'} <small>({r.id||'ID отсутствует'})</small></li>)}</ul> : null}
    {surface.sourceContributors ? <small>Это диагностика текущих источников, не история изменений и не подтверждение идентичности отдельных панелей.</small> : null}
    <p>Ручные настройки применяются по прежнему геометрическому ключу, не по этому ID.</p>
  </div>;
}
