import { AUTO_ROOF_LAYOUT } from '../state/auto-roof-supports.js';
import { mauerlatProfile } from './roof-wall-plate.js';

export function supportCatalog(project, profile, id) {
  const rows = (project.priceMat || []).filter(row => ['м³', 'м3', 'м.п.', 'м'].includes(row.unit));
  const exact = rows.find(row => row.id === id);
  if (exact) return exact;
  const section = profile.replace(/[×хx*]/g, '×');
  return rows.find(row => ['м³', 'м3'].includes(row.unit)
    && row.name.match(/(\d+)\s*[×хx*]\s*(\d+)/)?.slice(1).join('×') === section);
}

// Old plan groups are extended at calculation time, so moving or deleting the
// saved group also moves or deletes its sleeper without a second stored copy.
export function planSupportMaterials(project, supports = project.settings?.productionCutting?.roofSupports || []) {
  const plate = mauerlatProfile(project.settings.roof);
  const postsByBeam = new Map();
  for (const item of supports) {
    if (item.type !== 'post' || !item.upperSupport || item.referenceOnly || item.startSupport) continue;
    const posts = postsByBeam.get(item.upperSupport) || [];
    posts.push(item);
    postsByBeam.set(item.upperSupport, posts);
  }
  const replacements = new Map(), sleepers = [];
  for (const beam of supports) {
    if (beam.type !== 'purlin' || beam.autoLayout !== AUTO_ROOF_LAYOUT || !beam.planGroupId || beam.referenceOnly) continue;
    const posts = postsByBeam.get(beam.id) || [];
    if (posts.length < 2 || posts.some(post => ![post.x1, post.y1, post.z1, post.z2].every(v => v !== '' && v != null && Number.isFinite(Number(v))))) continue;
    const base = Number(posts[0].z1), depth = plate.heightMm;
    if (posts.some(post => Math.abs(Number(post.z1) - base) > 1 || Number(post.z2) <= base + depth)) continue;
    const dx = Number(beam.x2) - Number(beam.x1), dy = Number(beam.y2) - Number(beam.y1);
    const station = post => (Number(post.x1) - Number(beam.x1)) * dx + (Number(post.y1) - Number(beam.y1)) * dy;
    const ordered = [...posts].sort((a, b) => station(a) - station(b));
    const first = ordered[0], last = ordered.at(-1);
    if (Math.hypot(last.x1 - first.x1, last.y1 - first.y1) < 1) continue;
    const id = beam.id + '-sleeper';
    const catalog = supportCatalog(project, plate.profile, (project.priceMat || []).find(row => row.name === plate.catalogName)?.id);
    sleepers.push({
      ...beam, id, type: 'sleeper', name: 'Лежень · ' + beam.name, flat: true, profile: plate.profile,
      x1: Number(first.x1), y1: Number(first.y1), x2: Number(last.x1), y2: Number(last.y1),
      z1: base + depth / 2, z2: base + depth / 2, startSupport: '', endSupport: '',
      estimateEnabled: true, estimateCatalogId: catalog?.id || '',
    });
    for (const post of posts) replacements.set(post.id, { ...post, z1: base + depth, startSupport: id });
  }
  return [...supports.map(item => {
    if (item.type === 'beam' && item.frameGroup && item.flat && item.name.includes('нижний пояс')) {
      return { ...item, type: 'sleeper', name: item.name.replace('нижний пояс', 'лежень (нижний пояс)') };
    }
    return replacements.get(item.id) || item;
  }), ...sleepers];
}
