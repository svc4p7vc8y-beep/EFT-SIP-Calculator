import { electricalBill, resolvedElectricalRoutes } from '../state/placement-electrical.js';
import { NETWORK_SYSTEMS, networkBill, resolvedNetworkRoutes } from '../state/placement-networks.js';
import { placementWallFaces } from '../state/placement-walls.js';

export function buildPlacementSheets(project) {
  const placement = project.placement || { items: [], routes: [], dimensions: [], circuits: [] };
  const floors = Math.max(1, Math.min(2, Number(project.meta?.floors) || 1));
  const sheets = [];
  for (let floor = 1; floor <= floors; floor += 1) {
    const plan = floor === 1 ? project.plan : project.upperFloors?.[floor - 2] || project.plan;
    for (const discipline of ['layout', 'electric', ...Object.keys(NETWORK_SYSTEMS)]) {
      const list = (placement.items || []).filter(item => item.floor === floor && (discipline === 'electric' ? item.layer === 'electric' : discipline === 'layout' ? !['electric', ...Object.keys(NETWORK_SYSTEMS)].includes(item.layer) : item.layer === discipline));
      const routes = discipline === 'electric' ? resolvedElectricalRoutes(placement, floor, plan) : NETWORK_SYSTEMS[discipline] ? resolvedNetworkRoutes(placement, discipline, floor) : [];
      if (NETWORK_SYSTEMS[discipline] && !list.length && !routes.length) continue;
      const circuitIds = new Set([...list.map(item => item.circuitId), ...routes.map(route => route.circuitId)].filter(Boolean));
      const prefix = discipline === 'electric' ? 'Э' : NETWORK_SYSTEMS[discipline]?.prefix || 'Р';
      sheets.push({
        id: `${floor}-${discipline}`,
        floor,
        discipline,
        title: discipline === 'electric' ? 'План электроточек и освещения' : NETWORK_SYSTEMS[discipline] ? `План сети · ${NETWORK_SYSTEMS[discipline].label}` : 'План мебели и оборудования',
        plan,
        items: list.map((item, index) => ({ item, mark: `${prefix}-${String(index + 1).padStart(2, '0')}` })),
        routes,
        electricalBill: discipline === 'electric' ? electricalBill(placement, floor, plan) : null,
        networkBill: NETWORK_SYSTEMS[discipline] ? networkBill(placement, discipline, floor) : null,
        dimensions: ['layout', 'electric'].includes(discipline) ? (placement.dimensions || []).filter(dimension => dimension.floor === floor) : [],
        circuits: discipline === 'electric' ? (placement.circuits || []).filter(circuit => circuitIds.has(circuit.id)) : [],
      });
      if (discipline === 'electric') {
        const refs = new Set([...list.map(item => item.wallRef), ...routes.flatMap(route => route.points?.map(point => point.wallRef) || [])].filter(Boolean));
        for (const wall of placementWallFaces(plan).filter(face => refs.has(face.ref))) {
          const wallItems = list.map((item, index) => ({ item, mark: `${prefix}-${String(index + 1).padStart(2, '0')}` })).filter(entry => entry.item.wallRef === wall.ref);
          const wallRoutes = routes.filter(route => route.points?.some(point => point.wallRef === wall.ref) || [route.fromItemId, route.targetItemId].some(id => wallItems.some(entry => entry.item.id === id)));
          sheets.push({ id: `${floor}-electric-${wall.ref}`, floor, discipline, title: `Электрика · ${wall.label} · развёртка`, plan, wall, items: wallItems, routes: wallRoutes, dimensions: [], circuits: (placement.circuits || []).filter(circuit => circuitIds.has(circuit.id)), electricalBill: null, networkBill: null });
        }
      }
      if (NETWORK_SYSTEMS[discipline]) {
        const refs = new Set([...list.map(item => item.wallRef), ...routes.map(route => route.wallRef)].filter(Boolean));
        for (const wall of placementWallFaces(plan).filter(face => refs.has(face.ref))) {
          sheets.push({
            id: `${floor}-${discipline}-${wall.ref}`, floor, discipline,
            title: `${NETWORK_SYSTEMS[discipline].label} · развёртка стены`, plan, wall,
            items: list.map((item, index) => ({ item, mark: `${prefix}-${String(index + 1).padStart(2, '0')}` })).filter(entry => entry.item.wallRef === wall.ref),
            routes: routes.filter(route => route.wallRef === wall.ref),
            dimensions: [], circuits: [], networkBill: null,
          });
        }
      }
    }
  }
  return sheets;
}
