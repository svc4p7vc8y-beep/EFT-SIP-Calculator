export const elevationWallKey=wall=>JSON.stringify([wall.floor||1,wall.planStart,wall.planEnd]);
export function elevationAnchors({width,height,openings=[],members=[],guides=[]},excludeId){
 const result=[{axis:'x',value:0,label:'Левая стена'},{axis:'x',value:width,label:'Правая стена'},{axis:'z',value:0,label:'Пол'},{axis:'z',value:height,label:'Верх стены'}];
 for(const o of openings.filter(o=>o.id!==excludeId))for(const [axis,value,label] of [['x',o.x,'Левая грань'],['x',o.x+o.width/2,'Центр окна'],['x',o.x+o.width,'Правая грань'],['z',o.sill,'Низ проёма'],['z',o.sill+o.height,'Верх проёма']])result.push({axis,value:Number(value),label});
 for(const m of members.filter(m=>m.id!==excludeId&&m.a&&m.b)){
  if(Math.abs(m.a[0]-m.b[0])<1)result.push({axis:'x',value:m.a[0],label:'Центр стойки'});
  result.push({axis:'z',value:m.a[1],label:'Низ элемента'},{axis:'z',value:m.b[1],label:'Верх элемента'});
 }
 return [...result,...guides.filter(g=>['x','z','slope'].includes(g.axis))];
}
export function alignElevation(box,anchors,tolerance=30,snap=true){
 const aligned=[],change={x:0,z:0};
 for(const axis of ['x','z']){
  const values=axis==='x'?(box.xValues??[box.x,box.x+(box.width||0)/2,box.x+(box.width||0)]):(box.zValues??[box.z,box.z+(box.height||0)]),candidates=[];
  const choices=anchors.filter(g=>g.axis===axis);if(axis==='z')for(const g of anchors.filter(g=>g.axis==='slope'&&g.a&&g.b)){const x=box.x+(box.width||0)/2,dx=g.b[0]-g.a[0];if(Math.abs(dx)>1&&x>=Math.min(g.a[0],g.b[0])&&x<=Math.max(g.a[0],g.b[0]))choices.push({...g,value:g.a[1]+(g.b[1]-g.a[1])*(x-g.a[0])/dx});}
  for(const guide of choices)for(const value of values){const delta=guide.value-value;if(Math.abs(delta)<=tolerance)candidates.push({guide,delta});}
  candidates.sort((a,b)=>Math.abs(a.delta)-Math.abs(b.delta));if(candidates[0]){if(snap)change[axis]=candidates[0].delta;aligned.push(candidates[0].guide);}
 }
 return {x:box.x+change.x,z:box.z+change.z,guides:aligned};
}
