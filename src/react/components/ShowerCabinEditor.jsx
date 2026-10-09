import { NumberField, Toggle } from './ui.jsx';
import { resolveShowerCabin, SHOWER_CABIN_OFFER } from '../calculations/shower-cabin.js';

export function ShowerCabinEditor({room,values,updateRoom,project}) {
  const raw=values.showerCabin||{};
  const cabin=resolveShowerCabin({...room,settings:values},[...project.priceMat,...project.priceLab]);
  if (project.sharedPriceCatalog) { cabin.materialPrice=Number(project.priceMat.find(row=>row.id==='MAT-234')?.price)||0; cabin.workPrice=Number(project.priceLab.find(row=>row.id==='LAB-130')?.price)||0; }
  const update=patch=>updateRoom({showerCabin:{...raw,...patch}});
  const total=cabin.quantity*(cabin.materialPrice*(1+cabin.markup/100)+cabin.workPrice);
  return <section className="shower-cabin-editor" aria-label="Душевая кабина">
    <h3>Душевая кабина</h3>
    <Toggle label="Включить душевую кабину Luxmare Sea Black 90×90 см" checked={cabin.quantity>0} onChange={enabled=>update({quantity:enabled?1:0})}/>
    {cabin.quantity>0?<>
      <div className="form-grid two"><NumberField label="Количество кабин" suffix="шт" min={0} step={1} value={cabin.quantity} onChange={quantity=>update({quantity})}/><div className="stat"><span>Кабина и сборка с монтажом</span><strong>{total.toLocaleString('ru-RU',{maximumFractionDigits:2})} ₽</strong></div></div>
      {!project.services.internalFinish||values.enabled===false?<p className="assembly-warning">Чтобы позиции попали в смету, включите внутреннюю отделку и отделку этого помещения.</p>:null}
    </>:null}
    <p>Кабина с низким поддоном: <a href={SHOWER_CABIN_OFFER.productUrl} target="_blank" rel="noreferrer">29 900 ₽ в Лемана ПРО</a>. Работа по <a href={SHOWER_CABIN_OFFER.workUrl} target="_blank" rel="noreferrer">ориентиру Лемана ПРО</a> — от 6 600 ₽/шт. Цены и наличие зависят от региона.</p>
    <p>Сборка и монтаж на готовые выводы не добавляют повторно точки водоснабжения и канализации. Их количество и подключение проверьте в «Инженерии». Трап, гидроизоляция и подготовка основания — отдельные позиции.</p>
    <details><summary>Цена, наценка и ручная настройка</summary>
      <div className="form-grid three">
        <NumberField label="Закупочная цена кабины" suffix="₽/шт" min={0} disabled={Boolean(project.sharedPriceCatalog)} value={cabin.materialPrice} onChange={materialPrice=>update({materialPrice})}/>
        <NumberField label="Наценка материала" suffix="%" min={0} value={cabin.markup} onChange={markup=>update({markup})}/>
        <NumberField label="Сборка и монтаж" suffix="₽/шт" min={0} disabled={Boolean(project.sharedPriceCatalog)} value={cabin.workPrice} onChange={workPrice=>update({workPrice})}/>
      </div>
      <button type="button" className="button secondary" onClick={()=>update({materialPrice:null,workPrice:null,markup:SHOWER_CABIN_OFFER.markup})}>Вернуть цены из прайса</button>
      <p>{project.sharedPriceCatalog ? 'Цены кабины и монтажа берутся из общего прайса. Изменить их можно в разделе «Прайс-лист».' : 'Ручные цены сохраняются только в этом помещении; общий прайс-лист не меняется.'} Наценка применяется один раз к материалу, к работе — нет.</p>
    </details>
  </section>;
}
