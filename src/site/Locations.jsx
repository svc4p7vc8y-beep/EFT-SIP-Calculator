import { ArrowUpRight, Mail, MapPin, Phone } from 'lucide-react';
import { contacts } from './data.js';

const phoneHref = (phone) => `tel:${phone.replace(/[^+\d]/g, '')}`;

export default function Locations() {
  return <section className="locations-section section" id="locations">
    <div className="locations-intro"><div><span className="section-number">07 / Контакты и локации</span><h2>Мы рядом — от первого<br />звонка до производства.</h2></div><p>Обсудите проект в офисе и посмотрите,<br />где создаются домокомплекты EFT.</p></div>
    <div className="contact-links">
      {contacts.phones.map((phone) => <a key={phone} href={phoneHref(phone)}><Phone size={19} />{phone}</a>)}
      <a href={`mailto:${contacts.email}`}><Mail size={19} />{contacts.email}</a>
    </div>
    <div className="locations-grid">{contacts.locations.map((location) => <article className="location-card" key={location.id}>
      <div className="map-frame"><iframe loading="lazy" src={location.map} title={`Карта: ${location.title}`} allowFullScreen referrerPolicy="no-referrer-when-downgrade" /></div>
      <div className="location-copy"><h3>{location.title}</h3><p><MapPin size={20} />{location.address}</p><a className="text-link" href={location.route} target="_blank" rel="noreferrer">Открыть на Яндекс Картах<ArrowUpRight size={18} /></a></div>
    </article>)}</div>
  </section>;
}
