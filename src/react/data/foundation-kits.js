export const SCREW_PILE_KITS = Object.freeze([
  { value: '108-2500', label: '108 мм × 2,5 м · комплект', catalogId: 'MAT-PILE-KIT-108-2500' },
  { value: '89-3000', label: '89 мм × 3 м · комплект', catalogId: 'MAT-PILE-KIT-89-3000' },
  { value: '89-2500', label: '89 мм × 2,5 м · комплект', catalogId: 'MAT-PILE-KIT-89-2500' },
  { value: '76-2500', label: '76 мм × 2,5 м · комплект', catalogId: 'MAT-PILE-KIT-76-2500' },
]);

export function screwPileKit(value) {
  return SCREW_PILE_KITS.find((kit) => kit.value === value) || null;
}
