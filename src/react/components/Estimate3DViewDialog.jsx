import { useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import ProductionHouse3D from '../screens/ProductionHouse3D.jsx';
import { calculateProductionCutting } from '../calculations/production-cutting.js';
import '../styles/drawing-workbench.css';

const angles = [
  ['iso', 'Общий вид'], ['front', 'Спереди'], ['back', 'Сзади'],
  ['left', 'Слева'], ['right', 'Справа'], ['top', 'Сверху'],
];

export default function Estimate3DViewDialog({ project, calculation, onCreate, onClose }) {
  const report = useMemo(() => calculateProductionCutting(project, calculation), [project, calculation]);
  const captureRef = useRef(null);
  const [angle, setAngle] = useState('iso');
  const [caption, setCaption] = useState('3D-вид дома');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const data = captureRef.current?.capture();
      if (!data || data === 'data:,') throw new Error('3D-вид ещё не готов. Подождите загрузки модели.');
      const blob = await (await fetch(data)).blob();
      await onCreate(new File([blob], `${caption.trim() || '3D-вид'}.png`, { type: 'image/png' }), caption.trim());
      onClose();
    } catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="modal estimate-3d-dialog" role="dialog" aria-modal="true" aria-labelledby="estimate-3d-title" onMouseDown={event => event.stopPropagation()}>
      <header><div><h2 id="estimate-3d-title">Создать 3D-вид для сметы</h2><p>Выберите ракурс или поверните дом мышью, затем нажмите «Создать вид».</p></div><button className="icon-button" type="button" onClick={onClose} aria-label="Закрыть"><X /></button></header>
      <div className="estimate-3d-controls"><label>Ракурс<select aria-label="Ракурс 3D-вида" value={angle} onChange={event => { setAngle(event.target.value); captureRef.current?.setView(event.target.value); }}>{angles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Подпись в смете<input aria-label="Подпись 3D-вида" value={caption} maxLength={160} onChange={event => setCaption(event.target.value)} /></label></div>
      <ProductionHouse3D report={report} project={project} captureRef={captureRef} large initialZoom={.6} />
      {error ? <p role="alert" className="estimate-image-error">{error}</p> : null}
      <footer><button type="button" className="button secondary" onClick={onClose}>Отмена</button><button type="button" className="button primary" disabled={busy} onClick={create}>{busy ? 'Создаю…' : 'Создать вид'}</button></footer>
    </section>
  </div>;
}
