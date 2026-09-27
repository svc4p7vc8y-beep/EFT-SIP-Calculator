import { layerForNode } from './node-house-layers.js';

export default function NodeJointSketch({ node }) {
  const layer = layerForNode(node);
  const label = { foundation: 'Свая и обвязка', floor: 'Панель пола и шпонка', walls: 'Панели стены и соединительный брус', ceiling: 'Панель потолка и опорная доска', roof: 'Стропило и опора' }[layer];
  return <figure className="node-joint-sketch">
    <svg viewBox="0 0 280 132" role="img" aria-label={`Условная схема: ${label}`}>
      {layer === 'foundation' ? <>
        <rect x="25" y="38" width="226" height="35" rx="2" fill="#ba936a" stroke="#806344" strokeWidth="2" />
        <path d="M102 74v50m76-50v50" stroke="#688286" strokeWidth="18" />
        <path d="M83 75h38m38 0h38" stroke="#526c70" strokeWidth="7" strokeLinecap="round" />
        <circle cx="102" cy="73" r="6" fill="#e0e8e5" /><circle cx="178" cy="73" r="6" fill="#e0e8e5" />
      </> : null}
      {layer === 'floor' ? <>
        <rect x="28" y="31" width="224" height="47" fill="#b9cfb7" stroke="#739b80" strokeWidth="2" />
        <path d="M28 43h224M28 68h224" stroke="#698b70" strokeWidth="5" />
        <rect x="43" y="80" width="194" height="25" fill="#b78b61" stroke="#806344" strokeWidth="2" />
        <path d="M140 43v51" stroke="#5d7578" strokeWidth="7" strokeLinecap="round" /><circle cx="140" cy="43" r="5" fill="#5d7578" />
      </> : null}
      {layer === 'walls' ? <>
        <path d="M25 27l99 18v62L25 88z" fill="#b9cfb7" stroke="#739b80" strokeWidth="2" />
        <path d="M124 45l129-19v62l-129 19z" fill="#d9c3a6" stroke="#8e6d4e" strokeWidth="2" />
        <rect x="118" y="45" width="18" height="62" fill="#a7794e" stroke="#705137" />
        <path d="M53 67l106-1" stroke="#5d7578" strokeWidth="7" strokeLinecap="round" /><path d="M159 60l15 6-15 6" fill="#5d7578" /><circle cx="53" cy="67" r="6" fill="#5d7578" />
      </> : null}
      {layer === 'ceiling' ? <>
        <rect x="25" y="30" width="230" height="36" fill="#bfd6c0" stroke="#739b80" strokeWidth="2" />
        <rect x="127" y="37" width="18" height="22" fill="#ae8156" stroke="#765537" />
        <path d="M25 77h230M48 78v39M232 78v39" stroke="#a7794e" strokeWidth="10" />
        <path d="M136 42v47" stroke="#5d7578" strokeWidth="6" /><circle cx="136" cy="42" r="5" fill="#5d7578" />
      </> : null}
      {layer === 'roof' ? <>
        <rect x="27" y="85" width="225" height="29" fill="#ba936a" stroke="#806344" strokeWidth="2" />
        <path d="M41 82L169 18l19 19L97 85" fill="#b78b61" stroke="#806344" strokeWidth="2" />
        <path d="M147 49l23 55" stroke="#5d7578" strokeWidth="7" strokeLinecap="round" /><circle cx="147" cy="49" r="5" fill="#5d7578" />
      </> : null}
    </svg>
    <figcaption>Условная схема для осмотра; не задаёт размер и количество крепежа.</figcaption>
  </figure>;
}
