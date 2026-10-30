const ACCESSORY_ID_PARTS = [':foam-',':fasteners-',':seam-screws-',':edge-screws-',':spiral-'];
const ACCESSORY_NAME = /(саморез|гвозд|глухар|анкер|болт|гайк|шайб|дюбел|(?:^|[^\p{L}])скоб(?:а|ы|у|ой|ами|ок)(?:$|[^\p{L}])|уголок|пластин|креп[её]ж|пеноклей|монтажн(?:ая|ой) пен|герметик|уплотнител|уплотнительн.*лент)/iu;

export function isEstimateAccessory(line = {}) {
  if (line.kind !== 'material') return false;
  const id = String(line.id || '');
  return ACCESSORY_ID_PARTS.some(part => id.includes(part)) || ACCESSORY_NAME.test(String(line.name || ''));
}

export function isEstimateCutting(line = {}) {
  return /раскрой/iu.test(String(line.name || '')) || /(?:^|:)cut-|sip-cut/.test(String(line.id || ''));
}
