export const ALEXEY_EMAIL = 'polikarpov@eftsip.ru';

export function estimateMailContent(meta = {}) {
  const name = String(meta.projectName || '').trim() || `Проект № ${meta.projectNum || '—'}`;
  const description = String(meta.projectDescription || '').trim();
  return {
    subject: `Смета: ${name}`,
    body: [
      `Здравствуйте, Алексей!`,
      '',
      `Направляю смету по проекту «${name}» (№ ${meta.projectNum || '—'}).`,
      `Заказчик: ${meta.customer || 'не указан'}.`,
      description ? `Описание проекта: ${description}` : '',
      '',
      'Смета приложена в формате PDF.',
    ].filter((line, index, lines) => line || lines[index - 1] !== '').join('\n'),
  };
}
