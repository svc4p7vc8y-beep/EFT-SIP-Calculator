import assert from 'node:assert/strict';
import test from 'node:test';
import { formatRussianPhone, isValidRussianPhone, russianPhoneDigits } from '../src/shared/phone.js';

test('Russian phone mask keeps exactly ten national digits', () => {
  assert.equal(formatRussianPhone('9123456789'), '+7 (912) 345-67-89');
  assert.equal(formatRussianPhone('+7 912 345 67 89'), '+7 (912) 345-67-89');
  assert.equal(formatRussianPhone('8 912 345 67 89'), '+7 (912) 345-67-89');
  assert.equal(formatRussianPhone('912abc3456789123'), '+7 (912) 345-67-89');
  assert.equal(russianPhoneDigits('+7 (912) 345-67-89'), '9123456789');
});

test('Russian phone validation rejects incomplete and placeholder numbers', () => {
  assert.equal(isValidRussianPhone('+7 (912) 345-67-89'), true);
  assert.equal(isValidRussianPhone('+7 (912) 345-67'), false);
  assert.equal(isValidRussianPhone('+7 (000) 000-00-00'), false);
  assert.equal(isValidRussianPhone('произвольный текст'), false);
});
