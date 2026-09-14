import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUpRight, RotateCcw, SkipForward } from 'lucide-react';
import { asset } from './data.js';

const evening = asset('hero-evening-v1.webp');
const sketch = asset('hero-pencil-v1.webp');

export default function HeroIntro() {
  const [phase, setPhase] = useState('loading');
  const [run, setRun] = useState(0);
  const [canAnimate, setCanAnimate] = useState(false);
  const ready = useRef(false);

  useEffect(() => {
    let active = true;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const small = window.matchMedia('(max-width: 600px)');
    const updateMotion = () => {
      setCanAnimate(!motion.matches);
      if (motion.matches) setPhase('done');
    };
    updateMotion();
    motion.addEventListener('change', updateMotion);
    const images = [evening, sketch].map((src) => new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(true);
      image.onerror = () => resolve(false);
      image.src = src;
    }));
    // Navigation and copy never wait for media; a failed sketch cannot hide the photo.
    const fallback = window.setTimeout(() => { if (active) setPhase('done'); }, 8000);
    Promise.all(images).then((loaded) => {
      if (!active) return;
      window.clearTimeout(fallback);
      ready.current = loaded.every(Boolean);
      setPhase(ready.current && !motion.matches && !small.matches ? 'playing' : 'done');
    });
    return () => {
      active = false;
      window.clearTimeout(fallback);
      motion.removeEventListener('change', updateMotion);
    };
  }, []);

  useEffect(() => {
    if (phase !== 'playing') return undefined;
    const duration = window.matchMedia('(max-width: 600px)').matches ? 700 : 7000;
    const timer = window.setTimeout(() => setPhase('done'), duration);
    return () => window.clearTimeout(timer);
  }, [phase, run]);

  function moveCamera(event) {
    if (phase !== 'done' || !canAnimate || event.pointerType !== 'mouse') return;
    const box = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--intro-x', `${(0.5 - (event.clientX - box.left) / box.width) * 1.4}%`);
    event.currentTarget.style.setProperty('--intro-y', `${(0.5 - (event.clientY - box.top) / box.height) * 1}%`);
  }

  function resetCamera(event) {
    event.currentTarget.style.setProperty('--intro-x', '0%');
    event.currentTarget.style.setProperty('--intro-y', '0%');
  }

  return <section className="welcome-hero" aria-labelledby="welcome-title" data-phase={phase}
    onPointerMove={moveCamera} onPointerLeave={resetCamera}>
    <div className="intro-scene" key={run} aria-hidden="true">
      <img className="intro-evening" fetchPriority="high" src={evening} alt="" width="1536" height="1024" />
      <img className="intro-sketch" src={sketch} alt="" width="1536" height="1024" />
    </div>
    <div className="intro-shade" aria-hidden="true" />
    <div className="welcome-copy">
      <h1 id="welcome-title">Домой хочется<br />ещё до переезда.</h1>
      <p>Сначала — ваша идея. Затем — ваш дом.</p>
      <div className="welcome-actions">
        <a className="btn welcome-primary" href="#projects">Найти свой дом<ArrowUpRight size={20} /></a>
        <a className="btn welcome-secondary" href="#panels">СИП-панели и комплекты<ArrowUpRight size={20} /></a>
      </div>
    </div>
    <div className="welcome-bottom">
      <a className="welcome-scroll" href="#projects"><span><ArrowDown size={22} /></span>К проектам</a>
      {canAnimate && phase !== 'loading' && ready.current ? <button className="intro-replay" onClick={() => {
        if (phase === 'playing') setPhase('done');
        else { setRun((value) => value + 1); setPhase('playing'); }
      }}>{phase === 'playing' ? <SkipForward size={18} /> : <RotateCcw size={18} />}
        {phase === 'playing' ? 'Пропустить анимацию' : 'Повторить анимацию'}
      </button> : null}
    </div>
  </section>;
}
