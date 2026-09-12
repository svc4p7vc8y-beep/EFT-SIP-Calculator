import { asset } from './data.js';

export default function HeroPhoto() {
  function moveCamera(event) {
    if (event.pointerType !== 'mouse' || !window.matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)').matches) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--camera-x', `${(0.5 - (event.clientX - bounds.left) / bounds.width) * 4}%`);
    event.currentTarget.style.setProperty('--camera-y', `${(0.5 - (event.clientY - bounds.top) / bounds.height) * 3}%`);
  }
  return <div className="hero-photo hero-camera" onPointerMove={moveCamera}>
    <img fetchPriority="high" src={asset('forest-roof-v2.png')} alt="Современный дом с террасой среди берёз — архитектурная визуализация" />
    <div className="photo-caption"><span>Ближе к природе.<br />Ближе к себе.</span><span>Коллекция ЭФТ / 01</span></div>
  </div>;
}
