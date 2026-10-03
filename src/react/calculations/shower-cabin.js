export const SHOWER_CABIN_OFFER = Object.freeze({
  materialPrice: 29900,
  workPrice: 6600,
  markup: 25,
  productUrl: 'https://voronezh.lemanapro.ru/product/dushevaya-kabina-luxmare-sea-black-nizkiy-poddon-90x90sm-91745645/',
  workUrl: 'https://voronezh.lemanapro.ru/uslugi/ustanovka-dushevoy-kabiny/',
});

const nonnegative=(value,fallback)=>value!=null&&Number.isFinite(Number(value))?Math.max(0,Number(value)):fallback;

export function resolveShowerCabin(room,catalog=[]) {
  const saved=room.settings?.showerCabin||{};
  const catalogPrice=id=>catalog.find(item=>item.id===id)?.price;
  return {
    quantity:Math.ceil(nonnegative(saved.quantity,0)),
    materialPrice:nonnegative(saved.materialPrice,nonnegative(catalogPrice('MAT-234'),SHOWER_CABIN_OFFER.materialPrice)),
    workPrice:nonnegative(saved.workPrice,nonnegative(catalogPrice('LAB-130'),SHOWER_CABIN_OFFER.workPrice)),
    markup:nonnegative(saved.markup,SHOWER_CABIN_OFFER.markup),
  };
}

export function showerCabinLines(room,catalog=[]) {
  if(room.settings?.enabled===false)return [];
  const cabin=resolveShowerCabin(room,catalog);
  if(!cabin.quantity)return [];
  const key=`${room.floor}-${room.id}-shower-cabin`;
  const group=`${room.floor} этаж · ${room.name} · Душевая кабина`;
  return [
    {catalogId:'MAT-234',key:`${key}-material`,qty:cabin.quantity,group,
      description:'Душевая кабина Luxmare Sea Black 90×90 см · низкий поддон',
      projectPrice:cabin.materialPrice,priceMultiplier:1+cabin.markup/100},
    {catalogId:'LAB-130',key:`${key}-work`,qty:cabin.quantity,group,
      description:'Сборка и монтаж душевой кабины на готовые выводы',
      projectPrice:cabin.workPrice},
  ];
}
