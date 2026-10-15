import {roofAt} from './roof-project.js';

const finite=value=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=100000;

export function roofFramingPoint(model,xy,{faceId='',mode='surface',offsetMm=0,fixedZ=''}={}){
 if(!Array.isArray(xy)||xy.length!==2||!xy.every(finite))throw new Error('Укажите точку в пределах плана кровли.');
 if(mode==='fixed'){
  if(!finite(fixedZ))throw new Error('Задайте отметку Z в мм.');
  return {point:[...xy,fixedZ],faceId:''};
 }
 if(!finite(offsetMm))throw new Error('Задайте смещение от плоскости ската в мм.');
 const hit=roofAt(model,...xy).find(item=>!faceId||item.face.id===faceId);
 if(!hit)throw new Error(faceId?'Вторая точка должна находиться на том же скате.':'Точка вне ската.');
 return {point:[...xy,Math.round(hit.z+offsetMm)],faceId:hit.face.id};
}

export function roofFramingMember({id,type,profile,start,end,nodeRef='',name='',roofSourceKey=''}){
 if(!['rafter','purlin','beam','brace','tie','post'].includes(type))throw new Error('Неизвестный тип элемента каркаса.');
 if(!/^\d+[×xх]\d+$/.test(profile)||profile.split(/[×xх]/).some(value=>Number(value)<=0))throw new Error('Задайте положительное сечение, например 50×150.');
 if(!start?.point?.every(finite)||!end?.point?.every(finite)||start.point.length!==3||end.point.length!==3)throw new Error('Задайте оба конца элемента XYZ.');
 const length=Math.hypot(...start.point.map((value,index)=>end.point[index]-value));
 if(length<10)throw new Error('Длина элемента должна быть не менее 10 мм.');
 if(type==='post'&&(Math.hypot(start.point[0]-end.point[0],start.point[1]-end.point[1])>.01||end.point[2]<=start.point[2]))throw new Error('Стойка должна быть вертикальной, её верх — выше низа.');
 const [x1,y1,z1]=start.point,[x2,y2,z2]=end.point;
 return {id,type,name,profile:profile.replace(/[xх]/g,'×'),nodeRef,x1,y1,z1,x2,y2,z2,faceId:start.faceId&&start.faceId===end.faceId?start.faceId:'',roofSourceKey,startSupport:'',endSupport:'',foundationRef:'',estimateEnabled:false};
}
