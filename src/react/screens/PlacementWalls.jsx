import { placementWallBands } from '../state/placement-walls.js';

const pathData = points => points.map((entry, index) => `${index ? 'L' : 'M'} ${entry.x * 100} ${entry.y * 100}`).join(' ') + ' Z';

export default function PlacementWalls({ plan, idPrefix }) {
  const { contour, partitions } = placementWallBands(plan);
  const clipId = `${idPrefix}-outer-wall-clip`;
  return <g className="placement-walls" pointerEvents="none">
    <defs><clipPath id={clipId}><path d={pathData(contour)}/></clipPath></defs>
    <path d={pathData(contour)} fill="none" stroke="#34464d" strokeWidth={(Number(plan.wallThickness) || .174) * 200 + 3} clipPath={`url(#${clipId})`}/>
    <path d={pathData(contour)} fill="none" stroke="#dce5e2" strokeWidth={(Number(plan.wallThickness) || .174) * 200 - 3} clipPath={`url(#${clipId})`}/>
    {partitions.map((band, index) => <g key={index}>
      <line x1={band.a.x * 100} y1={band.a.y * 100} x2={band.b.x * 100} y2={band.b.y * 100} stroke="#40545a" strokeWidth={band.thickness * 100 + 3} strokeLinecap="butt"/>
      <line x1={band.a.x * 100} y1={band.a.y * 100} x2={band.b.x * 100} y2={band.b.y * 100} stroke="#e5ece9" strokeWidth={Math.max(1, band.thickness * 100 - 3)} strokeLinecap="butt"/>
    </g>)}
    {(plan.openings || []).filter(opening => opening.include !== false).map(opening => {
      const horizontal = opening.orientation === 'h';
      const x1 = (opening.x - (horizontal ? opening.width / 2 : 0)) * 100;
      const y1 = (opening.y - (horizontal ? 0 : opening.width / 2)) * 100;
      const x2 = (opening.x + (horizontal ? opening.width / 2 : 0)) * 100;
      const y2 = (opening.y + (horizontal ? 0 : opening.width / 2)) * 100;
      return <g key={opening.id}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#f9fbf9" strokeWidth="30"/>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={opening.type === 'window' ? '#468fba' : '#b77d52'} strokeWidth="4"/>
      </g>;
    })}
  </g>;
}
