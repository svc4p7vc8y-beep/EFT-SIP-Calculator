export const ROOF_FORM_OPTIONS = [
  {value:'gable',label:'Двускатная'},
  {value:'tiered',label:'Два односкатных уровня'},
  {value:'hip',label:'Вальмовая'},
  {value:'flat',label:'Плоская'},
  {value:'flat-parapet',label:'Плоская с парапетом'},
];

const parapetModes=new Set(['flashing','closed','open']);

export function roofFormValue(roof={}) {
  return roof.shape==='flat'&&parapetModes.has(roof.flatParapetMode)?'flat-parapet':roof.shape||'gable';
}

export function roofFormPatch(roof={},value) {
  if(value==='flat-parapet')return {shape:'flat',flatParapetMode:parapetModes.has(roof.flatParapetMode)?roof.flatParapetMode:'flashing'};
  if(value==='flat')return {shape:'flat',flatParapetMode:'none'};
  if(['gable','tiered','hip'].includes(value))return {shape:value};
  return {};
}
