import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Minus, Plus, Trash2 } from 'lucide-react';
import { asset } from './data.js';
import { productGroups, productsByGroup } from './productCatalog.js';

const money = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const standard = { length: 2500, width: 1250 };
const panelFamilies = ['ОСП / PPS', 'ОСП / Минвата', 'ЦСП / PPS'];
const panelThicknesses = [124, 174, 224];

export default function Panels({ cart, setCart }) {
  const [groupId, setGroupId] = useState('panels');
  const [index, setIndex] = useState(0);
  const [length, setLength] = useState('2500');
  const [width, setWidth] = useState('1250');
  const [quantity, setQuantity] = useState('1');
  const [notice, setNotice] = useState('');
  const [addedId, setAddedId] = useState('');
  const noticeTimer = useRef(0);
  const touchStart = useRef(null);
  const filmstripRef = useRef(null);
  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);
  useEffect(() => {
    const strip = filmstripRef.current;
    const active = strip?.querySelector('[aria-pressed="true"]');
    if (!active) return;
    const left = active.offsetLeft - strip.offsetLeft - (strip.clientWidth - active.clientWidth) / 2;
    strip.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [groupId, index]);

  const group = productGroups.find((item) => item.id === groupId);
  const products = productsByGroup[groupId];
  const selected = products[index];
  const isPanel = groupId === 'panels';
  const isStandard = !isPanel || (Number(length) === standard.length && Number(width) === standard.width);
  const quantityStep = ['м.п.', 'кг'].includes(selected.unit) ? 0.1 : 1;
  const selectedId = isPanel ? `${selected.catalogId}-${length}-${width}` : selected.catalogId;
  const displayTitle = isPanel && !isStandard
    ? selected.title.replace('2500×1250', `${length}×${width}`)
    : selected.title;

  function chooseGroup(id) {
    setGroupId(id); setIndex(0); setQuantity('1'); setNotice('');
  }
  function chooseProduct(nextIndex) {
    setIndex((nextIndex + products.length) % products.length); setQuantity('1'); setNotice('');
  }
  function choosePanelFamily(familyIndex) {
    chooseProduct(familyIndex * panelThicknesses.length + index % panelThicknesses.length);
  }
  function choosePanelThickness(thicknessIndex) {
    chooseProduct(Math.floor(index / panelThicknesses.length) * panelThicknesses.length + thicknessIndex);
  }
  function finishSwipe(event) {
    if (!touchStart.current) return;
    const deltaX = event.changedTouches[0].clientX - touchStart.current.x;
    const deltaY = event.changedTouches[0].clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(deltaX) > 55 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) {
      chooseProduct(index + (deltaX < 0 ? 1 : -1));
    }
  }
  function changeQuantity(delta) {
    setQuantity(String(Math.max(quantityStep, Math.min(10000, Math.round((Number(quantity) + delta * quantityStep) * 10) / 10))));
  }
  function add(event) {
    event.preventDefault();
    const count = Number(quantity);
    if (!Number.isFinite(count) || count <= 0 || count > 10000) return;
    const dimensions = isPanel ? { length: Number(length), width: Number(width) } : {};
    const id = isPanel ? `${selected.catalogId}-${dimensions.length}-${dimensions.width}` : selected.catalogId;
    const item = {
      id, catalogId: selected.catalogId, type: isPanel ? 'panel' : 'accessory',
      title: displayTitle, details: isPanel ? `${dimensions.length} × ${dimensions.width} мм` : selected.family,
      unit: selected.unit, quantity: count, price: isStandard ? selected.price : null, ...dimensions,
    };
    setCart((items) => items.some((row) => row.id === id)
      ? items.map((row) => row.id === id ? { ...row, quantity: Math.round((Number(row.quantity) + count) * 10) / 10 } : row)
      : [...items, item]);
    window.clearTimeout(noticeTimer.current);
    setAddedId(id); setNotice(`${displayTitle} добавлен в заявку`);
    noticeTimer.current = window.setTimeout(() => setAddedId(''), 1900);
  }

  return <section id="panels" className="panels-section section" aria-labelledby="materials-title" data-reveal>
    <div className="section-heading materials-heading"><div><span className="section-number">04 / СИП-панели и товары</span><h2 id="materials-title">Материалы для вашего проекта.</h2></div><p>От панелей до последнего крепежа.<br />Выберите нужное и отправьте одну заявку.</p></div>
    <div className="material-tabs" role="group" aria-label="Категории материалов">{productGroups.map((item) => <button key={item.id} type="button" aria-pressed={groupId === item.id} onClick={() => chooseGroup(item.id)}>{item.label}<span>{productsByGroup[item.id].length}</span></button>)}</div>
    {isPanel && <div className="panel-selector" aria-label="Выбор СИП-панели">
      <div className="panel-selector-row"><span>Состав панели</span><div className="panel-choice-group" role="group" aria-label="Обшивка и сердцевина">{panelFamilies.map((family, familyIndex) => <button key={family} type="button" aria-pressed={Math.floor(index / panelThicknesses.length) === familyIndex} onClick={() => choosePanelFamily(familyIndex)}>{family}</button>)}</div></div>
      <div className="panel-selector-row"><span>Толщина</span><div className="panel-choice-group" role="group" aria-label="Толщина панели">{panelThicknesses.map((thickness, thicknessIndex) => <button key={thickness} type="button" aria-pressed={index % panelThicknesses.length === thicknessIndex} onClick={() => choosePanelThickness(thicknessIndex)}>{thickness} мм</button>)}</div></div>
    </div>}
    <div className="material-stage" aria-live="polite">
      <div className={`material-image material-image-${groupId}`} onTouchStart={(event) => { touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }} onTouchEnd={finishSwipe}><img key={selected.id} src={asset(selected.image)} alt={isPanel ? `СИП-панель ${selected.family}, ${panelThicknesses[index % panelThicknesses.length]} мм: иллюстрация состава` : `Иллюстрация: ${selected.title}`} loading="lazy" /><span className="material-image-index">{String(index + 1).padStart(2, '0')} / {String(products.length).padStart(2, '0')}</span>{isPanel && <span className="material-image-spec">{selected.family} · {panelThicknesses[index % panelThicknesses.length]} мм</span>}</div>
      <div className="material-info"><div className="material-info-top"><span className="material-family">{selected.family}</span><span className="material-code">{selected.catalogId}</span></div><h3>{displayTitle}</h3><p className="material-description">{selected.description}</p><div className="material-price"><small>Ориентир по прайсу</small><strong>{isStandard ? `${money.format(selected.price)} ₽` : 'По запросу'}</strong><span>{isStandard ? `за ${selected.unit}` : 'для нестандартного размера'}</span></div>
        <form className="material-order" onSubmit={add}>{isPanel && <div className="material-dimensions"><label className="field">Длина, мм<input type="number" min="1" max="10000" step="1" required value={length} onChange={(event) => setLength(event.target.value)} /></label><label className="field">Ширина, мм<input type="number" min="1" max="10000" step="1" required value={width} onChange={(event) => setWidth(event.target.value)} /></label></div>}
          <div className="material-actions"><label className="field">Количество, {selected.unit}<span className="stepper"><button type="button" aria-label="Уменьшить количество" disabled={Number(quantity) <= quantityStep} onClick={() => changeQuantity(-1)}><Minus size={16} /></button><input type="number" aria-label={`Количество, ${selected.unit}`} min={quantityStep} max="10000" step={quantityStep} required value={quantity} onChange={(event) => setQuantity(event.target.value)} /><button type="button" aria-label="Увеличить количество" disabled={Number(quantity) >= 10000} onClick={() => changeQuantity(1)}><Plus size={16} /></button></span></label><button className={addedId === selectedId ? 'btn primary add-button added' : 'btn primary add-button'} type="submit">{addedId === selectedId ? <>Добавлено<Check size={18} /></> : <>В заявку<Plus size={18} /></>}</button></div></form>
        <span className="feedback" role="status">{notice && <><Check size={16} />{notice}</>}</span><div className="material-navigation"><button type="button" className="material-arrow" aria-label="Предыдущий товар" onClick={() => chooseProduct(index - 1)}><ArrowLeft size={19} /></button><span>{group.intro}</span><button type="button" className="material-arrow" aria-label="Следующий товар" onClick={() => chooseProduct(index + 1)}><ArrowRight size={19} /></button></div>
      </div>
    </div>
    <div ref={filmstripRef} className="material-filmstrip" role="group" aria-label={`Товары категории ${group.label}`}>{products.map((item, itemIndex) => <button key={item.id} type="button" aria-pressed={itemIndex === index} onClick={() => chooseProduct(itemIndex)}>{isPanel && <img src={asset(item.image)} alt="" loading="lazy" />}<span>{String(itemIndex + 1).padStart(2, '0')}</span><strong>{item.title}</strong><small>{money.format(item.price)} ₽ / {item.unit}</small></button>)}</div>
    <p className="material-disclaimer">Цены указаны за единицу по встроенному прайсу калькулятора. Наличие, комплектацию и итоговую стоимость подтвердим перед заказом. Фото товаров иллюстративные.</p>
    {cart.length > 0 && <div className="cart"><div className="cart-heading"><h3>Ваша заявка</h3><a href="#contact" className="text-link">Подготовить заявку<ArrowRight size={18} /></a></div>{cart.map((item) => <div className="cart-row" key={item.id}><span>{item.title || `СИП-панель ${item.thickness} мм`}<small>{item.details || `${item.length} × ${item.width} мм`}{item.price == null ? ' · цена по запросу' : ` · ${money.format(item.price)} ₽ / ${item.unit}`}</small></span><strong>{money.format(item.quantity)} {item.unit || 'шт'}</strong><button type="button" className="icon-btn" onClick={() => setCart((items) => items.filter((row) => row.id !== item.id))} aria-label={`Удалить ${item.title || `панель ${item.thickness} мм`}`}><Trash2 size={18} /></button></div>)}</div>}
  </section>;
}
