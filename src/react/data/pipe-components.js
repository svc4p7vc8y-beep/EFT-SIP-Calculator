const fittings = [
 ['ball-valve','Кран шаровой металлический','ball-valve','metal'],
 ['pp-valve','Кран полипропиленовый','pp-valve','pp'],
 ['angle-valve','Кран угловой','angle-valve','metal'],
 ['union','Американка прямая','union','metal'],
 ['angle-union','Американка угловая','angle-union','metal'],
 ['pp-union','Американка ПП с разъёмом','pp-union','mixed'],
 ['mud-filter','Грязевик косой (Y-фильтр)','mud-filter','metal'],
 ['pp-elbow-90','Угол ПП 90°','elbow','pp'],
 ['pp-elbow-45','Угол ПП 45°','elbow-45','pp'],
 ['pp-tee','Тройник ПП','tee','pp'],
 ['pp-coupling','Муфта ПП','coupling','pp'],
 ['pp-reducer','Переходная муфта ПП','reducer','pp'],
 ['metal-pp-adapter','Переход металл–ПП','adapter','mixed'],
 ['thread-adapter','Переход резьбовой','adapter','metal'],
 ['pipe-cap','Заглушка трубы','cap',''],
 ['pressure-gauge','Манометр','pressure-gauge','metal'],
 ['air-vent','Автоматический воздухоотводчик','air-vent','metal'],
];
export const PIPE_COMPONENTS = ['plumbing','heating'].flatMap(layer => fittings.map(([id,label,icon,connectionMaterial])=>({
 id:layer==='heating'?(id==='union'?'heat-metal-union':'heat-'+id):id,label,layer,group:layer==='heating'?'heat-points':'water-points',width:.16,depth:.12,icon,connectionMaterial,inlineFitting:true,
})));
export const INLINE_FITTING_KINDS = new Set([...PIPE_COMPONENTS.map(p=>p.id),'water-valve','heat-valve','water-tee','heat-tee','sewer-tee','heat-pump-point','water-check-valve','water-pressure-reducer','water-meter','water-elbow','water-coupling','heat-filter','heat-drain-valve','heat-makeup-valve','heat-union','heat-elbow','sewer-elbow','sewer-coupling','sewer-cleanout','water-inlet-filter']);
