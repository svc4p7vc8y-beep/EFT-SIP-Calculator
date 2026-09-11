import { useEffect, useRef } from 'react';
import { ArrowUpRight, X } from 'lucide-react';
import { asset } from './data.js';

export default function CatalogDialog({ category, onClose, onSelect }) {
  const dialog = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    dialog.current.showModal();
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = oldOverflow; previous?.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialog} className="catalog-dialog" aria-labelledby="catalog-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <header className="catalog-dialog-head"><div><span className="section-number">{category.eyebrow}</span><h2 id="catalog-title">{category.title}</h2></div><button className="icon-btn" aria-label="Закрыть коллекцию" onClick={onClose}><X /></button></header>
    <div className="catalog-dialog-list">{category.projects.map((project) => <button className="catalog-list-card" key={project.id} onClick={() => onSelect({ ...project, category: category.title })}>
      <img src={asset(project.image)} alt={`Проект ${project.name}`} />
      <span><small>{project.tag}</small><strong>{project.name}</strong><em>{project.meta.join(' · ')}</em></span><ArrowUpRight aria-hidden="true" />
    </button>)}</div>
    <p className="catalog-dialog-note">Коллекция будет пополняться. Сейчас представлены демонстрационные направления — каждый проект адаптируется под задачу и участок.</p>
  </dialog>;
}
