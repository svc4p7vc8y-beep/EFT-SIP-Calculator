import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Minus, Plus, Trash2 } from 'lucide-react';
import { accessories, asset } from './data.js';

function PanelExploder() {
  function tilt(event) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--tilt-x', `${((event.clientY - box.top) / box.height - 0.5) * -3}deg`);
    event.currentTarget.style.setProperty('--tilt-y', `${((event.clientX - box.left) / box.width - 0.5) * 4}deg`);
  }
  function reset(event) { event.currentTarget.style.removeProperty('--tilt-x'); event.currentTarget.style.removeProperty('--tilt-y'); }
  return <div className="panel-photo panel-exploder" tabIndex="0" aria-label="Интерактивный разрез СИП-панели" onPointerMove={tilt} onPointerLeave={reset} data-reveal>
    <div className="panel-layers"><img className="panel-layer layer-top" src={asset('panel.webp')} alt="" /><img className="panel-layer layer-core" src={asset('panel.webp')} alt="" /><img className="panel-layer layer-bottom" src={asset('panel.webp')} alt="" /><img className="panel-layer layer-base" src={asset('panel.webp')} alt="СИП-панель: обшивки из OSB и утеплитель в разрезе" /></div>
    <span className="layer-label label-osb-top">OSB</span><span className="layer-label label-core">Утеплитель</span><span className="layer-label label-osb-bottom">OSB</span><small>Наведите, чтобы увидеть слои</small>
  </div>;
}

export default function Panels({ cart, setCart }) {
  const [thickness, setThickness] = useState(174);
  const [length, setLength] = useState('2500');
  const [width, setWidth] = useState('1250');
  const [quantity, setQuantity] = useState('1');
  const [notice, setNotice] = useState('');
  const [addedId, setAddedId] = useState('');
  const noticeTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);
  function markAdded(id, message) {
    window.clearTimeout(noticeTimer.current);
    setAddedId(id); setNotice(message);
    noticeTimer.current = window.setTimeout(() => setAddedId(''), 1900);
  }
  function add(e) {
    e.preventDefault();
    const item = { thickness, length: Number(length), width: Number(width), quantity: Number(quantity) };
    item.id = `${thickness}-${item.length}-${item.width}`;
    setCart((items) => { const exists = items.some((row) => row.id === item.id); return exists ? items.map((row) => row.id === item.id ? { ...row, quantity: row.quantity + item.quantity } : row) : [...items, item]; });
    markAdded('panel', 'Панели добавлены в заявку');
  }
  function addAccessory(product) {
    setCart((items) => items.some((row) => row.id === product.id)
      ? items.map((row) => row.id === product.id ? { ...row, quantity: row.quantity + 1 } : row)
      : [...items, { ...product, type: 'accessory', quantity: 1 }]);
    markAdded(product.id, `${product.title} добавлен в заявку`);
  }
  return <section id="panels" className="panels-section section" data-reveal><div className="section-heading"><div><span className="section-number">04 / СИП-панели и товары</span><h2>Основа вашего дома.</h2></div><p>СИП-панели и всё необходимое для монтажа.<br />Соберите предварительную заявку в одном месте.</p></div><div className="panels-grid"><PanelExploder /><form className="panel-config" onSubmit={add}><h3>СИП-панель</h3><p className="muted">Комплектация и стоимость — после уточнения заказа.</p><fieldset><legend>Толщина панели</legend><div className="segmented">{[124, 174, 224].map((n) => <button key={n} type="button" aria-pressed={thickness === n} onClick={() => setThickness(n)}>{n} мм</button>)}</div></fieldset><div className="form-row"><label className="field">Длина, мм<input type="number" required min="1" max="10000" step="1" value={length} onChange={(e) => setLength(e.target.value)} /></label><label className="field">Ширина, мм<input type="number" required min="1" max="10000" step="1" value={width} onChange={(e) => setWidth(e.target.value)} /></label></div><div className="panel-bottom"><label className="field">Количество, шт<div className="stepper"><button type="button" aria-label="Уменьшить количество" disabled={Number(quantity) <= 1} onClick={() => setQuantity(String(Math.max(1, Number(quantity) - 1)))}><Minus size={16} /></button><input aria-label="Количество панелей" type="number" min="1" max="10000" step="1" required value={quantity} onChange={(e) => setQuantity(e.target.value)} /><button type="button" aria-label="Увеличить количество" disabled={Number(quantity) >= 10000} onClick={() => setQuantity(String(Math.min(10000, Number(quantity) + 1)))}><Plus size={16} /></button></div></label><button className={addedId === 'panel' ? 'btn primary add-button added' : 'btn primary add-button'} type="submit">{addedId === 'panel' ? <>Добавлено<Check size={18} /></> : <>В заявку<Plus size={18} /></>}</button></div><span className="feedback" role="status">{notice && <><Check size={16} />{notice}</>}</span><small className="muted">Нестандартные размеры и возможность изготовления уточняются отдельно.</small></form></div>
    <div className="accessories-head"><div><span>Комплектующие</span><h3>Всё для монтажа</h3></div><p>Пара стартовых позиций. Позже здесь появится полный каталог.</p></div>
    <div className="accessories-grid">{accessories.map((product) => <article className="accessory-card" key={product.id}><img loading="lazy" src={asset(product.image)} alt={product.title} /><div><h3>{product.title}</h3><p>{product.description}</p><small>{product.details}</small><button className={addedId === product.id ? 'btn outline add-button added' : 'btn outline add-button'} onClick={() => addAccessory(product)}>{addedId === product.id ? <>Добавлено<Check size={17} /></> : <>В заявку<Plus size={17} /></>}</button></div></article>)}</div>
    {cart.length > 0 && <div className="cart"><div className="cart-heading"><h3>Ваша заявка</h3><a href="#contact" className="text-link">Подготовить заявку<ArrowRight size={18} /></a></div>{cart.map((item) => <div className="cart-row" key={item.id}><span>{item.type === 'accessory' ? item.title : `СИП-панель ${item.thickness} мм`}<small>{item.type === 'accessory' ? item.details : `${item.length} × ${item.width} мм`}</small></span><strong>{item.quantity} шт.</strong><button className="icon-btn" onClick={() => setCart((items) => items.filter((row) => row.id !== item.id))} aria-label={`Удалить ${item.title || `панель ${item.thickness} мм`}`}><Trash2 size={18} /></button></div>)}</div>}
  </section>;
}
