export function buildPlacementSheets(project) {
  const placement = project.placement || { items: [], routes: [], dimensions: [], circuits: [] };
  const floors = Math.max(1, Math.min(2, Number(project.meta?.floors) || 1));
  const sheets = [];
  for (let floor = 1; floor <= floors; floor += 1) {
    const plan = floor === 1 ? project.plan : project.upperFloors?.[floor - 2] || project.plan;
    for (const discipline of ['layout', 'electric']) {
      const list = (placement.items || []).filter(item => item.floor === floor && (discipline === 'electric' ? item.layer === 'electric' : item.layer !== 'electric'));
      const routes = discipline === 'electric' ? (placement.routes || []).filter(route => route.floor === floor) : [];
      const circuitIds = new Set([...list.map(item => item.circuitId), ...routes.map(route => route.circuitId)].filter(Boolean));
      const prefix = discipline === 'electric' ? 'Э' : 'Р';
      sheets.push({
        id: `${floor}-${discipline}`,
        floor,
        discipline,
        title: discipline === 'electric' ? 'План электроточек и освещения' : 'План мебели и оборудования',
        plan,
        items: list.map((item, index) => ({ item, mark: `${prefix}-${String(index + 1).padStart(2, '0')}` })),
        routes,
        dimensions: (placement.dimensions || []).filter(dimension => dimension.floor === floor),
        circuits: discipline === 'electric' ? (placement.circuits || []).filter(circuit => circuitIds.has(circuit.id)) : [],
      });
    }
  }
  return sheets;
}
