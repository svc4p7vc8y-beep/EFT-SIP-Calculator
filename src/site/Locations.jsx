import { useState } from 'react';
import { ArrowUpRight, ChevronDown, Mail, MapPin, Phone } from 'lucide-react';
import { contacts } from './data.js';

const phoneHref = (phone) => `tel:${phone.replace(/[^+\d]/g, '')}`;

function LocationCard({ location }) {
  const [isOpen, setIsOpen] = useState(true);

  return <details className="location-card" open={isOpen} onToggle={(event) => setIsOpen(event.currentTarget.open)} data-reveal>
    <summary><h3>{location.title}</h3><ChevronDown size={20} aria-hidden="true" /></summary>
    <div className="location-details"><div className="map-frame"><iframe loading="lazy" src={location.map} title={`Карта: ${location.title}`} allowFullScreen referrerPolicy="no-referrer-when-downgrade" /></div>
    <div className="location-copy"><p><MapPin size={20} />{location.address}</p><a className="text-link" href={location.route} target="_blank" rel="noreferrer">Открыть на Яндекс Картах<ArrowUpRight size={18} /></a></div></div>
  </details>;
}

function LocationPrelude() {
  return <div className="location-prelude" data-reveal role="img" aria-label="Дом собирается из СИП-панелей: от замысла до производства">
    <div className="prelude-copy"><span>От замысла</span><strong>Дом обретает форму</strong><span>До производства</span></div>
    <svg viewBox="0 0 1000 250" aria-hidden="true">
      <g className="prelude-grid"><path d="M0 55H1000M0 125H1000M0 195H1000M145 0V250M500 0V250M855 0V250" /></g>
      <g className="prelude-foundation"><path d="M350 205H650" /><path d="M390 195H610" /></g>
      <g className="prelude-panels prelude-left"><rect x="397" y="112" width="55" height="82" rx="2" /><path d="M409 112V194M440 112V194" /></g>
      <g className="prelude-panels prelude-center"><rect x="456" y="112" width="88" height="82" rx="2" /><path d="M471 112V194M529 112V194" /><rect x="482" y="144" width="36" height="50" rx="1" /></g>
      <g className="prelude-panels prelude-right"><rect x="548" y="112" width="55" height="82" rx="2" /><path d="M560 112V194M591 112V194" /></g>
      <g className="prelude-roof"><path d="M370 115L500 38L630 115" /><path d="M401 113L500 55L599 113" /></g>
      <g className="prelude-window"><rect x="408" y="133" width="34" height="36" rx="2" /><path d="M425 133V169M408 151H442" /><rect x="558" y="133" width="34" height="36" rx="2" /><path d="M575 133V169M558 151H592" /></g>
      <g className="prelude-spark"><circle cx="500" cy="38" r="12" /><circle cx="500" cy="38" r="3" /></g>
    </svg>
    <div className="prelude-labels"><span>01 · Проект</span><span>СИП · ЭФТ</span><span>02 · Комплект</span></div>
  </div>;
}

export default function Locations() {
  return <section className="locations-section section" id="locations" data-reveal>
    <div className="locations-intro"><div><span className="section-number">07 / Контакты и локации</span><h2>Мы рядом — от первого<br />звонка до производства.</h2></div><p>Обсудите проект в офисе и посмотрите,<br />где создаются домокомплекты ЭФТ.</p></div>
    <div className="contact-links">
      {contacts.phones.map((phone) => <a key={phone} href={phoneHref(phone)}><Phone size={19} />{phone}</a>)}
      <a href={`mailto:${contacts.email}`}><Mail size={19} />{contacts.email}</a>
    </div>
    <LocationPrelude />
    <div className="locations-grid">{contacts.locations.map((location) => <LocationCard location={location} key={location.id} />)}</div>
  </section>;
}
