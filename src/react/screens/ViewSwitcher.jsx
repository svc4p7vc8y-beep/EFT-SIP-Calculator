import { ChevronLeft, ChevronRight } from 'lucide-react';
import '../styles/view-switcher.css';

export default function ViewSwitcher({items, selected, onChange, label='Вид'}) {
  if (!items?.length) return null;
  const index = Math.max(0, items.findIndex(item => item.id === selected));
  const move = step => onChange(items[(index + step + items.length) % items.length].id);
  return <div className="view-switcher" role="group" aria-label={`Переключение: ${label}`}>
    <button type="button" aria-label={`Предыдущий ${label.toLowerCase()}`} onClick={() => move(-1)}><ChevronLeft size={16}/></button>
    <output aria-live="polite" title={items[index].description || items[index].label}>
      <strong>{items[index].label}</strong><small>{items[index].description || `${index + 1} из ${items.length}`}</small>
    </output>
    <button type="button" aria-label={`Следующий ${label.toLowerCase()}`} onClick={() => move(1)}><ChevronRight size={16}/></button>
  </div>;
}
