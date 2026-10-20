import { useMemo } from 'react';
import { nearestPlacementDimension, placementWallBands } from '../state/placement-walls.js';

const label = distance => `${distance.toFixed(2).replace('.', ',')} м`;

export default function PlacementWallDimensions({ plan, items }) {
  const bands = useMemo(() => placementWallBands(plan), [plan]);
  return <g className="placement-wall-dimensions" pointerEvents="none" aria-hidden="true">
    {items.map(item => {
      const dimension = nearestPlacementDimension(plan, item, bands);
      if (!dimension || dimension.distance < .015) return null;
      const { from, to, distance } = dimension;
      const x1 = from.x * 100, y1 = from.y * 100, x2 = to.x * 100, y2 = to.y * 100;
      const horizontal = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
      const short = distance < .35;
      return <g key={item.id}>
        <line className="wall-dimension-line" x1={x1} y1={y1} x2={x2} y2={y2}/>
        <circle cx={x1} cy={y1} r="3"/>
        <circle cx={x2} cy={y2} r="3"/>
        <text x={short ? x2 + 30 : (x1 + x2) / 2 + (horizontal ? 0 : 13)} y={short ? y2 - 28 : (y1 + y2) / 2 + (horizontal ? -9 : 0)} textAnchor={short ? 'start' : 'middle'}>{label(distance)}</text>
      </g>;
    })}
  </g>;
}
