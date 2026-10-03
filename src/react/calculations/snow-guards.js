export const SNOW_GUARD_SOURCE = Object.freeze({
  material: 'https://volgograd.lemanapro.ru/catalogue/dobornye-elementy-dlya-krovli/?page=4',
  labor: 'https://stroyld.ru/montazh/ustanovka-snegozaderzhateley/',
  stockLength: 3,
  materialPrice: 4351,
  laborPrice: 550,
});

const nonnegative = (value, fallback) => value == null || !Number.isFinite(Number(value))
  ? fallback : Math.max(0, Number(value));

export function calculateSnowGuards(roof = {}, eaveLength = 0, catalog = []) {
  const settings = roof.snowGuards || {};
  const mode = roof.shape === 'hip' || roof.shape === 'flat'
    ? 'none' : ['first', 'second', 'both'].includes(settings.mode) ? settings.mode : 'none';
  const defaultLength = nonnegative(eaveLength, 0);
  const firstLength = mode === 'first' || mode === 'both'
    ? nonnegative(settings.firstLength, defaultLength) : 0;
  const secondLength = mode === 'second' || mode === 'both'
    ? nonnegative(settings.secondLength, defaultLength) : 0;
  const firstKits = Math.ceil(firstLength / SNOW_GUARD_SOURCE.stockLength);
  const secondKits = Math.ceil(secondLength / SNOW_GUARD_SOURCE.stockLength);
  return {
    mode, firstLength, secondLength, firstKits, secondKits,
    totalLength: firstLength + secondLength,
    kits: firstKits + secondKits,
    materialPrice: nonnegative(settings.materialPrice, nonnegative(catalog.find(item => item.id === 'MAT-246')?.price, SNOW_GUARD_SOURCE.materialPrice)),
    laborPrice: nonnegative(settings.laborPrice, nonnegative(catalog.find(item => item.id === 'LAB-037')?.price, SNOW_GUARD_SOURCE.laborPrice)),
  };
}
