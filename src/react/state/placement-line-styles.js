export const CIRCUIT_LINE_STYLES = [
  { id: 'solid', label: 'Сплошная', dash: undefined },
  { id: 'dashed', label: 'Пунктирная', dash: '10 6' },
  { id: 'dash-dot', label: 'Штрих-пунктирная', dash: '12 5 2 5' },
  { id: 'dotted', label: 'Точечная', dash: '2 5' },
];

export const defaultCircuitLineStyle = index => CIRCUIT_LINE_STYLES[index % CIRCUIT_LINE_STYLES.length].id;
export const normalizeCircuitLineStyle = (value, index = 0) => CIRCUIT_LINE_STYLES.some(style => style.id === value) ? value : defaultCircuitLineStyle(index);
export const circuitLineDash = (circuitId, circuits = []) => {
  const index = circuits.findIndex(circuit => circuit.id === circuitId);
  const style = normalizeCircuitLineStyle(circuits[index]?.lineStyle, Math.max(0, index));
  return CIRCUIT_LINE_STYLES.find(entry => entry.id === style)?.dash;
};
