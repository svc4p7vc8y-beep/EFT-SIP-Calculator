import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { asset } from './data.js';

function traceLogo(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const width = canvas.width;
  const height = canvas.height;
  const inside = (x, y) => x >= 0 && y >= 0 && x < width && y < height && Math.min(data[(y * width + x) * 4], data[(y * width + x) * 4 + 1], data[(y * width + x) * 4 + 2]) < 175;
  const edges = new Map();
  const add = (x, y, nextX, nextY) => {
    const key = `${x},${y}`;
    if (!edges.has(key)) edges.set(key, []);
    edges.get(key).push([nextX, nextY]);
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!inside(x, y)) continue;
      if (!inside(x, y - 1)) add(x, y, x + 1, y);
      if (!inside(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!inside(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!inside(x - 1, y)) add(x, y + 1, x, y);
    }
  }
  const contours = [];
  while (edges.size) {
    let key = edges.keys().next().value;
    const first = key;
    const points = [key.split(',').map(Number)];
    let guard = 0;
    do {
      const links = edges.get(key);
      if (!links) break;
      const next = links.pop();
      if (!links.length) edges.delete(key);
      points.push(next);
      key = next.join(',');
      guard += 1;
    } while (key !== first && guard < 10000);
    if (points.length > 18) contours.push(points);
  }
  return contours.sort((a, b) => {
    const topA = Math.min(...a.map((point) => point[1]));
    const topB = Math.min(...b.map((point) => point[1]));
    const groupA = topA < 65 ? 0 : 1;
    const groupB = topB < 65 ? 0 : 1;
    return groupA - groupB || Math.min(...a.map((point) => point[0])) - Math.min(...b.map((point) => point[0]));
  }).map((points) => ({
    d: `M${points.map((point) => point.join(',')).join('L')}Z`,
    length: points.length,
  }));
}

export function AnimatedLogo({ compact = false }) {
  const [contours, setContours] = useState([]);
  const logoSrc = asset('eft-logo.webp');
  useEffect(() => {
    let active = true;
    const image = new Image();
    image.onload = () => { if (active) setContours(traceLogo(image)); };
    image.src = logoSrc;
    return () => { active = false; };
  }, [logoSrc]);
  const className = `${compact ? 'logo-motion compact' : 'logo-motion'}${contours.length ? ' is-ready' : ''}`;
  return <span className={className}>
    <svg className="logo-sketch" viewBox="-15 -16 350 158" aria-hidden="true">
      <g className="sketch-guides"><path d="M-10 0H335M-10 70H335M-10 124H335M0-12V139M148-12V139M185-12V139M320-12V139M140 62L185 28L325 110" /><circle cx="185" cy="28" r="5" /></g>
      <g className="sketch-contours">{contours.map((contour, index) => <path key={contour.d} d={contour.d} style={{ '--path-index': index, '--path-length': contour.length }} />)}</g>
    </svg>
    <img className="logo-final" src={logoSrc} alt="ЭФТ" />
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
