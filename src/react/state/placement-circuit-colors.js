export const CIRCUIT_COLORS = [
  '#b84b36', '#326fb4', '#16806c', '#9860a9', '#aa6a16', '#527b2d', '#b14d85', '#417f93',
  '#874c31', '#5857a8', '#3f7e43', '#a34b65', '#7a6a18', '#247992', '#874b83', '#596d32',
];

export const validCircuitColor = value => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value.toLowerCase() : '';

function hueColor(hue) {
  const lightness = .41;
  const spread = .64 * Math.min(lightness, 1 - lightness);
  const channel = offset => {
    const key = (offset + hue / 30) % 12;
    return Math.round(255 * (lightness - spread * Math.max(-1, Math.min(key - 3, 9 - key, 1)))).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

export function nextCircuitColor(circuits = []) {
  const used = new Set(circuits.map(circuit => validCircuitColor(circuit.color)).filter(Boolean));
  const free = CIRCUIT_COLORS.find(color => !used.has(color));
  if (free) return free;
  for (let offset = 0; offset < 360; offset++) {
    const color = hueColor((used.size * 137.508 + offset * 137.508) % 360);
    if (!used.has(color)) return color;
  }
  return '#000000';
}

export function uniqueCircuitColors(circuits = []) {
  const used = new Set();
  return circuits.map(circuit => {
    const requested = validCircuitColor(circuit.color);
    const color = requested && !used.has(requested) ? requested : nextCircuitColor([...used].map(value => ({ color: value })));
    used.add(color);
    return { ...circuit, color };
  });
}
