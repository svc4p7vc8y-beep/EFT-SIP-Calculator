import { useEffect, useRef, useState } from 'react';

const SIZES = { small: [280, 300], medium: [380, 390], large: [520, 500] };
const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

export default function FloatingPlan3D({ containerRef, size, onSizeChange, children }) {
  const [bounds, setBounds] = useState({ width: 800, height: 600 });
  const [rect, setRect] = useState(null);
  const [resizing, setResizing] = useState(false);
  const gesture = useRef(null);
  const windowRef = useRef(null);
  const completedResize = useRef(false);
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const update = () => {
      const { width, height } = element.getBoundingClientRect();
      setBounds({ width, height });
      setRect((current) => {
        const w = Math.min(current?.w || SIZES[size][0], Math.max(240, width - 16));
        const h = Math.min(current?.h || SIZES[size][1], Math.max(240, height - 16));
        return { x: clamp(current?.x ?? width - w - 12, 8, Math.max(8, width - w - 8)), y: clamp(current?.y ?? 125, 8, Math.max(8, height - h - 8)), w, h };
      });
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => observer.disconnect();
  }, [containerRef]);
  useEffect(() => {
    if (resizing || !completedResize.current) return undefined;
    completedResize.current = false;
    const frame = requestAnimationFrame(() => {
      windowRef.current?.querySelector('.production-3d-canvas')?.dispatchEvent(new Event('eft-3d-resize-end'));
    });
    return () => cancelAnimationFrame(frame);
  }, [resizing]);
  const start = (event, type) => {
    if (event.button !== 0 || event.target.closest('button, select')) return;
    event.preventDefault();
    gesture.current = { type, x: event.clientX, y: event.clientY, rect };
    if (type === 'resize') setResizing(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const finish = () => {
    if (gesture.current?.type === 'resize') {
      completedResize.current = true;
      setResizing(false);
    }
    gesture.current = null;
  };
  const move = (event) => {
    if (!gesture.current) return;
    const { type, x, y, rect: origin } = gesture.current;
    const dx = event.clientX - x, dy = event.clientY - y;
    setRect(type === 'move'
      ? { ...origin, x: clamp(origin.x + dx, 8, Math.max(8, bounds.width - origin.w - 8)), y: clamp(origin.y + dy, 8, Math.max(8, bounds.height - origin.h - 8)) }
      : { ...origin, w: clamp(origin.w + dx, Math.min(240, bounds.width - origin.x - 8), Math.max(240, bounds.width - origin.x - 8)), h: clamp(origin.h + dy, Math.min(240, bounds.height - origin.y - 8), Math.max(240, bounds.height - origin.y - 8)) });
  };
  const chooseSize = (next) => {
    const [wantedWidth, wantedHeight] = SIZES[next];
    setRect((current) => {
      const w = Math.min(wantedWidth, Math.max(240, bounds.width - 16));
      const h = Math.min(wantedHeight, Math.max(240, bounds.height - 16));
      return { x: clamp(current?.x ?? 8, 8, Math.max(8, bounds.width - w - 8)), y: clamp(current?.y ?? 8, 8, Math.max(8, bounds.height - h - 8)), w, h };
    });
    onSizeChange(next);
  };
  if (!rect) return null;
  return <aside ref={windowRef} className={`plan-3d-preview${resizing ? ' is-resizing' : ''}`} aria-label="3D модель рядом с планом" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, '--window-height': `${rect.h}px` }}>
    <div className="plan-3d-preview-heading" onPointerDown={(event) => start(event, 'move')} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} aria-label="Переместить окно 3D">
      <strong>3D · текущий проект</strong><div role="group" aria-label="Размер окна 3D">
        {Object.entries({ small: 'Малое', medium: 'Среднее', large: 'Большое' }).map(([key, label]) => <button key={key} type="button" aria-label={`${label} окно 3D`} aria-pressed={size === key} onClick={() => chooseSize(key)}>{label}</button>)}
      </div>
    </div>
    <div className="plan-3d-preview-body">{children}</div>
    <div className="plan-3d-resize" role="separator" aria-label="Изменить размер окна 3D" onPointerDown={(event) => start(event, 'resize')} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} />
  </aside>;
}
