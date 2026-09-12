import { useState } from 'react';
import { ArrowUpRight, ChevronDown, Mail, MapPin, Phone } from 'lucide-react';
import { contacts } from './data.js';

const phoneHref = (phone) => `tel:${phone.replace(/[^+\d]/g, '')}`;

function LocationCard({ location }) {
  const [isOpen, setIsOpen] = useState(true);

  return <details className="location-card" open={isOpen} onToggle={(event) => setIsOpen(event.currentTarget.open)} data-reveal>
    <summary><h3>{location.title}</h3><ChevronDown size={20} aria-hidden="true" /></summary>
    <div className="location-details"><div className="map-frame"><iframe loading="lazy" src={location.map} title={`Карта: ${location.title}`} allowFullScreen referrerPolicy="no-referrer-when-downgrade" /><svg className="map-route-overlay" viewBox="0 0 500 260" aria-hidden="true"><path d="M52 207C104 155 149 210 205 151S310 130 359 81 420 72 453 39" /><circle cx="52" cy="207" r="7" /><circle cx="453" cy="39" r="8" /></svg></div>
    <div className="location-copy"><p><MapPin size={20} />{location.address}</p><a className="text-link" href={location.route} target="_blank" rel="noreferrer">Открыть на Яндекс Картах<ArrowUpRight size={18} /></a></div></div>
  </details>;
}

export default function Locations() {
  return <section className="locations-section section" id="locations" data-reveal>
    <div className="locations-intro"><div><span className="section-number">07 / Контакты и локации</span><h2>Мы рядом — от первого<br />звонка до производства.</h2></div><p>Обсудите проект в офисе и посмотрите,<br />где создаются домокомплекты EFT.</p></div>
    <div className="contact-links">
      {contacts.phones.map((phone) => <a key={phone} href={phoneHref(phone)}><Phone size={19} />{phone}</a>)}
      <a href={`mailto:${contacts.email}`}><Mail size={19} />{contacts.email}</a>
    </div>
    <div className="locations-grid">{contacts.locations.map((location) => <LocationCard location={location} key={location.id} />)}</div>
  </section>;
}
