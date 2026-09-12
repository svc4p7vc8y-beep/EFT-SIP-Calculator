import { useEffect } from 'react';
import { ArrowUp } from 'lucide-react';
import { asset } from './data.js';

export function AnimatedLogo({ compact = false }) {
  return <span className={compact ? 'logo-motion compact' : 'logo-motion'}>
    <svg className="logo-sketch" viewBox="0 0 240 118" aria-hidden="true">
      <g className="sketch-guides"><path d="M8 94H230M22 17V108M78 9V108M132 9V108M186 9V108" /><path d="M12 72L99 22L224 73M31 67L100 32L205 78" /><circle cx="100" cy="32" r="5" /><path d="M94 7V57M75 32H125" /></g>
      <g className="sketch-strokes"><path d="M22 63L100 20L226 66" /><path className="sketch-accent" d="M34 66L100 31L207 76" /><path d="M112 14L225 60" /><text x="18" y="105">ЭФТ</text></g>
    </svg>
    <img className="logo-final" src={asset('eft-logo.webp')} alt="ЭФТ" />
  </span>;
}

export function ScrollProgress({ expandedCategory, onCollapse }) {
  return <aside className={expandedCategory ? 'site-progress has-collapse' : 'site-progress'} aria-label="Прогресс страницы">
    {expandedCategory ? <button className="progress-collapse" onClick={onCollapse}><ArrowUp size={17} /><span>Свернуть проекты</span></button> : null}
    <div className="build-progress" aria-hidden="true"><svg viewBox="0 0 42 56"><path className="build-foundation" d="M5 50H37" /><path className="build-walls" d="M9 48V27H33V48" /><path className="build-roof" d="M5 29L21 13L37 29" /></svg><span /></div>
  </aside>;
}

export function useSiteMotion() {
  useEffect(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const revealItems = [...document.querySelectorAll('[data-reveal]')];
    if (reduced) {
      revealItems.forEach((item) => { item.dataset.inView = 'true'; });
      return undefined;
    }
    root.classList.add('motion-ready');
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.dataset.inView = 'true';
    }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealItems.forEach((item) => observer.observe(item));
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = Math.max(1, root.scrollHeight - window.innerHeight);
      const progress = Math.min(1, Math.max(0, window.scrollY / max));
      root.style.setProperty('--page-progress', String(progress));
      root.dataset.buildStage = String(Math.min(3, Math.floor(progress * 4)));
      revealItems.forEach((item) => {
        const rect = item.getBoundingClientRect();
        if (rect.top < window.innerHeight * 0.94 && rect.bottom > 0) item.dataset.inView = 'true';
      });
      document.querySelectorAll('[data-parallax]').forEach((item) => {
        const rect = item.getBoundingClientRect();
        const local = (rect.top + rect.height / 2 - window.innerHeight / 2) / window.innerHeight;
        item.style.setProperty('--parallax-y', `${Math.max(-18, Math.min(18, local * -16)).toFixed(1)}px`);
      });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    return () => { observer.disconnect(); root.classList.remove('motion-ready'); root.style.removeProperty('--page-progress'); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); if (frame) cancelAnimationFrame(frame); };
  }, []);
}
