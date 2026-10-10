import { labelLeader } from '../planner/label-leader.js';
export default function PlanLabelLeader({label,ring,p}){
  const leader=labelLeader(label,ring);if(!leader)return null;
  const start=p(label.x,label.y),end=p(leader.target.x,leader.target.y);
  return <g className="plan-label-leader" pointerEvents="none"><line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#000" strokeWidth=".8" vectorEffect="non-scaling-stroke"/><polygon points={leader.head.map(q=>{const s=p(q.x,q.y);return `${s.x},${s.y}`;}).join(' ')} fill="#000" stroke="none"/></g>;
}
