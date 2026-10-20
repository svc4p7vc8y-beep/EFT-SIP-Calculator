import { useMemo } from 'react';
import { electricalSettingOutDimension, placementWallBands } from '../state/placement-walls.js';
import { boundsOf } from '../planner/geometry.js';

const label = distance => `${distance.toFixed(2).replace('.', ',')} м`;

export default function PlacementWallDimensions({ plan, items }) {
  const bands = useMemo(() => placementWallBands(plan), [plan]);
  const box = boundsOf(bands.contour);
  return <g className="placement-wall-dimensions" pointerEvents="none" aria-hidden="true">
    {items.filter(item => item.layer === 'electric').map((item, index) => {
      const dimension = electricalSettingOutDimension(plan, item, bands);
      if (!dimension || dimension.distance < .015) return null;
      const { from, to, distance } = dimension;
      const x1 = from.x * 100, y1 = from.y * 100, x2 = to.x * 100, y2 = to.y * 100;
      const horizontal = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
      const outside = (box.y - .52 - index * .22) * 100;
      const side = dimension.side === 'right' ? -1 : 1;
      const outerX = (dimension.side === 'right' ? box.x - .55 - index * .19 : box.x + box.w + .55 + index * .19) * 100;
      const endX = horizontal ? x2 : outerX;
      const startX = horizontal ? x1 : outerX;
      return <g key={item.id}>
        {horizontal ? <><line className="wall-dimension-extension" x1={x1} y1={y1} x2={x1} y2={outside}/><line className="wall-dimension-extension" x1={x2} y1={y2} x2={x2} y2={outside}/><line className="wall-dimension-line" x1={startX} y1={outside} x2={endX} y2={outside}/><text x={(x1 + x2) / 2} y={outside - 8} textAnchor="middle">{label(distance)}</text></> : <><line className="wall-dimension-extension" x1={x1} y1={y1} x2={outerX} y2={y1}/><line className="wall-dimension-extension" x1={x2} y1={y2} x2={outerX} y2={y2}/><line className="wall-dimension-line" x1={outerX} y1={y1} x2={outerX} y2={y2}/><text x={outerX + side * 8} y={(y1 + y2) / 2} textAnchor={side > 0 ? 'start' : 'end'}>{label(distance)}</text></>}
      </g>;
    })}
  </g>;
}
