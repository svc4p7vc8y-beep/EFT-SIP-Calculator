// Drawing geometry follows the saved estimate, not a structural design rule.
export function roofDrawingData(assembly, roof, roofSettings = {}, geometryMode='wallSlope') {
  const axis = assembly.axis === 'x' ? 0 : 1, across = 1 - axis;
  const origin = [assembly.bounds.x, assembly.bounds.y];
  const span = across === 0 ? assembly.bounds.width : assembly.bounds.height;
  const sections = [];
  const tier = roofSettings.tiered || {};
  for (const name of [...new Set(assembly.rafters.map(r => r.name))]) {
    const list = assembly.rafters.filter(r => r.name === name), r = list[0];
    const run = Math.abs(r.b[across] - r.a[across]);
    const rise = Math.sqrt(Math.max(0, r.length ** 2 - run ** 2));
    let z1 = 0, z2 = rise;
    if(roof.mainRoofShape==='gable'&&geometryMode!=='estimate'){
      z1=-Number(roof.geometry.eaveOverhang)*1000*Number(roofSettings.ridgeHeight)*1000/(span/2||1);
      z2=Number(roofSettings.ridgeHeight)*1000;
    }
    if (roof.mainRoofShape === 'flat' && ['back', 'right'].includes(roof.flatSlopeDirection)) [z1,z2] = [rise,0];
    if (roof.mainRoofShape === 'tiered') {
      const upper = name === 'Верхний уровень';
      const toward = (tier[upper ? 'upperSlopeDirection' : 'lowerSlopeDirection'] || (upper ? 'towardJunction' : 'awayJunction')) === 'towardJunction';
      const negative = upper ? toward : !toward;
      const slope = (negative ? -1 : 1) * rise / (run || 1);
      const lowerJoint = (tier.lowerSlopeDirection || 'awayJunction') === 'awayJunction' ? Number(roof.geometry.lowerRise) * 1000 : 0;
      const jointZ = upper ? lowerJoint + Number(roof.geometry.stepHeight) * 1000 : lowerJoint;
      const eave = Number(roof.geometry.eaveOverhang) * 1000;
      const jointDistance = upper ? Number(roof.geometry.upperSpan)*1000 + eave : 0;
      z1 = jointZ - slope * jointDistance; z2 = z1 + slope * run;
    }
    sections.push({name,profile:r.profile,length:r.length,qty:list.length,angle:Math.atan2(Math.abs(z2-z1),run)*180/Math.PI,
      a:[r.a[across]-origin[across],z1],b:[r.b[across]-origin[across],z2],ids:list.map(r=>r.id)});
  }
  const warnings=[];
  if(roof.mainRoofShape==='gable'&&sections.length&&Number(roof.geometry?.eaveOverhang)>0){
    const expected=Math.hypot(span/2,Number(roofSettings.ridgeHeight||0)*1000)*(1+Number(roof.geometry.eaveOverhang)*1000/(span/2||1));
    const actual=sections[0].length;
    if(Math.abs(expected-actual)>2)warnings.push(`Двускатная крыша: выбранная сметная длина стропила ${actual} мм; при продолжении уклона от стены через свес получается ${Math.ceil(expected)} мм. Переключите геометрию раскроя на непрерывный уклон или подтвердите индивидуальный узел.`);
  }
  if(roof.mainRoofShape==='flat'&&roof.flatSlopeMode==='tapered')warnings.push('Уклон плоской кровли выполнен разуклонкой. Наклон покрытия не подтверждает наклон несущих стропил; показана геометрия текущего расчёта, требуется отдельный конструктивный разрез.');
  const estimateLength=Number(roof.geometry?.slopeLength)*1000;
  const estimateDifference=roof.mainRoofShape==='gable'&&sections.length?sections[0].length-estimateLength:0;
  return {axis,across,span,sections,origin,warnings,geometryMode,estimateLength,estimateDifference};
}

export function roofAxonometricLines(assembly) {
  const d = assembly.roofDrawing;
  if (!d) return [];
  return assembly.rafters.map(r=>{
    const s=d.sections.find(s=>s.name===r.name);
    return {id:r.id,a:[...r.a,s.a[1]],b:[...r.b,s.b[1]],profile:r.profile};
  });
}

export function snapAssemblyPoint(assembly, x, y, tolerance = 100) {
  const points = [...assembly.floors.flatMap(f=>[...f.contour,...(f.bearing||[]).flatMap(e=>[e.a,e.b])]),
    ...assembly.rafters.flatMap(r=>[r.a,r.b]),...assembly.supports.flatMap(s=>[s.a,s.b]),...(assembly.piles||[])];
  let nearest, distance=tolerance;
  for (const p of points) { const d=Math.hypot(x-p[0],y-p[1]);if(d<distance){nearest=p;distance=d;} }
  return nearest ? nearest.slice(0,2) : [Math.round(x/10)*10,Math.round(y/10)*10];
}
