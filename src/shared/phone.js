export function russianPhoneDigits(value) {
  const raw = String(value ?? '');
  let digits = raw.replace(/\D/g, '');
  if ((/^\s*\+?7/.test(raw) || digits.length > 10) && /^[78]/.test(digits)) {
    digits = digits.slice(1);
  }
  return digits.slice(0, 10);
}

export function formatRussianPhone(value) {
  const digits = russianPhoneDigits(value);
  if (!digits && !String(value ?? '').trim()) return '';
  let result = '+7';
  if (digits.length) result += ` (${digits.slice(0, 3)}`;
  if (digits.length >= 3) result += ')';
  if (digits.length > 3) result += ` ${digits.slice(3, 6)}`;
  if (digits.length > 6) result += `-${digits.slice(6, 8)}`;
  if (digits.length > 8) result += `-${digits.slice(8, 10)}`;
  return result;
}

export function isValidRussianPhone(value) {
  return /^[3-9]\d{9}$/.test(russianPhoneDigits(value));
}
