import { perimeterPlacementDimensions } from '../state/placement-dimensions.js';

const label = distance => distance.toFixed(2).replace('.', ',');

export default function PlacementPerimeterDimensions({ contour, items }) {
  const dimensions = perimeterPlacementDimensions(contour, items);
  if (!dimensions) return null;
  const { x, y, right, bottom, horizontal, vertical } = dimensions;
  const top = y * 100 - 72, left = x * 100 - 78;
  return <g className="placement-perimeter-dimensions" pointerEvents="none" aria-hidden="true">
    <line x1={x * 100} y1={top} x2={right * 100} y2={top}/>
    <line x1={left} y1={y * 100} x2={left} y2={bottom * 100}/>
    {horizontal.map(({ distance, level }) => {
      const px = x * 100 + distance * 100;
      return <g key={`x-${distance}`}>
        <line className="extension" x1={px} y1={y * 100 - 8} x2={px} y2={top - 6}/>
        <line x1={px - 5} y1={top + 5} x2={px + 5} y2={top - 5}/>
        <text x={px} y={top - 12 - level * 16} textAnchor="middle">{label(distance)} м</text>
      </g>;
    })}
    {vertical.map(({ distance, level }) => {
      const py = y * 100 + distance * 100;
      return <g key={`y-${distance}`}>
        <line className="extension" x1={x * 100 - 8} y1={py} x2={left - 6} y2={py}/>
        <line x1={left - 5} y1={py + 5} x2={left + 5} y2={py - 5}/>
        <text x={left - 12 - level * 19} y={py + 4} textAnchor="end">{label(distance)} м</text>
      </g>;
    })}
  </g>;
}
