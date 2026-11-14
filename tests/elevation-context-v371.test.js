import test from 'node:test';
import assert from 'node:assert/strict';
import {elevationContext} from '../src/react/calculations/elevation-context.js';
import {createDefaultProject} from '../src/react/state/project-model.js';
const wall={id:'w',floor:1,planStart:[0,0],planEnd:[6000,0],width:6000,height:2500,thickness:174,exterior:true};
function fixture(){const p=createDefaultProject();Object.assign(p.plan.house,{w:6,h:4,points:[],contourDefined:true});p.settings.productionCutting.roofSupports=[{id:'manual',type:'purlin',name:'Прогон',profile:'100×150',nodeRef:'У-1',x1:500,y1:0,z1:2700,x2:5500,y2:0,z2:2700}];return p;}
test('frame elevation includes actual roof, binding, piles and nodes only in its plane; crossing beams are sections',()=>{
 const p=fixture(),report={assembly:{roofTimbers:[{id:'plate',material:'Мауэрлат',worldA:[0,0,2774],worldB:[6000,0,2774]},{id:'far',worldA:[0,4000,2774],worldB:[6000,4000,2774]},{id:'cross',worldA:[3000,-2000,3500],worldB:[3000,2000,3500]}],supports:[{id:'auto',a:[1000,0,3200],b:[5000,0,3200],type:'purlin'}],binding:[{id:'b',a:[0,0],b:[6000,0],profile:'50×150',layers:3}],piles:[[0,0],[3000,0],[6000,4000]],nodes:[{id:'n',floor:1,x:2000,y:0,nodeRef:'У-2'},{id:'other-floor',floor:2,x:2000,y:0}]}};
 const before=JSON.stringify({p,report}),c=elevationContext(p,report,wall);
 assert.ok(c.roof.some(r=>r.id==='manual'&&!r.readOnly));assert.ok(c.roof.some(r=>r.id==='auto'&&r.readOnly));assert.ok(!c.roof.some(r=>r.id==='far'));assert.ok(c.roof.find(r=>r.id==='cross').section);assert.equal(c.binding.length,1);assert.equal(c.piles.length,2);assert.ok(c.nodes.find(n=>n.id==='n').heightUnknown);assert.equal(c.nodes.find(n=>n.label==='У-1').heightUnknown,false);assert.ok(!c.nodes.some(n=>n.id==='other-floor'));assert.ok(c.minZ<0);assert.equal(JSON.stringify({p,report}),before);
});
test('guide datum uses the exterior house corner rather than a trimmed inside wall endpoint',()=>{
 const p=fixture(),w={...wall,planStart:[6000,174],planEnd:[6000,3826],width:3652};const c=elevationContext(p,{assembly:{roofTimbers:[],binding:[],piles:[],nodes:[]}},w);assert.equal(c.originStation,-174);assert.equal(1000-c.originStation,1174);
});
test('roof objects beyond the wall extent cannot create infinite projected lines',()=>{
 const p=fixture(),r={assembly:{roofTimbers:[{id:'outside',worldA:[8000,0,3000],worldB:[12000,0,3000]},{id:'long',worldA:[-10000,0,3000],worldB:[20000,0,3000]}],binding:[],piles:[],nodes:[]}},c=elevationContext(p,r,wall);assert.ok(!c.roof.some(s=>s.id==='outside'));const long=c.roof.find(s=>s.id==='long');assert.deepEqual(long.a,[-200,3000]);assert.ok(Math.abs(long.b[0]-6200)<.001);assert.equal(long.b[1],3000);
});

