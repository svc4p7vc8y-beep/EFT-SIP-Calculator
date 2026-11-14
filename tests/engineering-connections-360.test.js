import test from 'node:test';
import assert from 'node:assert/strict';
import {connectionPortsFor,refreshDeviceOutlets} from '../src/react/state/placement-connections.js';
import {engineeringHistoryAction} from '../src/react/state/engineering-outlets.js';
import {compatiblePorts,moveAndJoinWallItem} from '../src/react/state/engineering-snap.js';
import {wallAlignment} from '../src/react/state/engineering-alignment.js';
import {createPlacement,normalizePlacement} from '../src/react/state/placement-model.js';
import {createDefaultProject} from '../src/react/state/project-model.js';
import {createProjectWorkspace,projectWorkspaceReducer} from '../src/react/state/project-tabs.js';
const wall={ref:'w',a:{x:0,y:0},b:{x:5,y:0},length:5,normal:{x:0,y:1}};
const device=(id,kind,x=2)=>({id,kind,label:kind,x,y:.03,height:1,heightKnown:true,floor:1,layer:'plumbing',width:.4,depth:.3,wallRef:'w',displayPlane:'wall',rotation:0,connectionMedium:'cold'});
const add=(data,item)=>data.items.push(item,...connectionPortsFor(item,wall));
test('undo and redo recognize physical shortcuts in Russian and English layouts',()=>{
 for(const key of ['z','Z','я','Я'])assert.equal(engineeringHistoryAction({ctrlKey:true,key}),'undo');
 assert.equal(engineeringHistoryAction({metaKey:true,code:'KeyZ',key:'я',shiftKey:true}),'redo');
 assert.equal(engineeringHistoryAction({ctrlKey:true,code:'KeyY',key:'н'}),'redo');
 assert.equal(engineeringHistoryAction({key:'я'}),null);
});
test('one equipment history entry removes the appliance, attached ports and supply together; redo restores them',()=>{
 let state=createProjectWorkspace(createDefaultProject());
 state=projectWorkspaceReducer(state,{type:'commit',tabId:state.activeId,update:p=>{add(p.placement,device('a','water-heater'));p.placement.items.push({...device('s','power'),layer:'electric',linkedApplianceId:'a'});p.placement.visibleLayers.electric=true;return p;}});
 const count=state.tabs[0].history.present.placement.items.length;
 state=projectWorkspaceReducer(state,{type:'undo',tabId:state.activeId});assert.equal(state.tabs[0].history.present.placement.items.length,0);
 state=projectWorkspaceReducer(state,{type:'redo',tabId:state.activeId});assert.equal(state.tabs[0].history.present.placement.items.length,count);
});
test('tank outlet is centered below its symbol; boiler outlets coincide with drawn nozzles',()=>{
 const tank=device('t','hydro-tank'),port=connectionPortsFor(tank,wall)[0];assert.equal(port.x,tank.x);assert.ok(port.height<tank.height);
 const heater=device('h','water-heater'),ports=connectionPortsFor(heater,wall);assert.equal(ports.length,2);assert.ok(ports[0].x<heater.x&&ports[1].x>heater.x);assert.equal(ports[0].height,ports[1].height);
});
test('outlet settings remain attached after resize and survive project serialization',()=>{
 const d=createPlacement(),owner={...device('a','water-heater'),portLayout:{0:{x:.2,y:.9,side:'left',thread:'3/4"',gender:'male',diameterMm:25}}};add(d,owner);
 owner.width=.8;refreshDeviceOutlets(d.items,'a',wall);const port=d.items.find(i=>i.id==='port-a-0');assert.equal(port.x,1.76);assert.equal(port.connectionThread,'3/4"');assert.equal(port.connectorU,-1);
 const copy=normalizePlacement(JSON.parse(JSON.stringify(d)));assert.deepEqual(copy.items.find(i=>i.id==='a').portLayout,owner.portLayout);assert.equal(copy.items.find(i=>i.id===port.id).connectionThread,'3/4"');
});
test('joining a fitting adopts missing thread and opposite gender while explicit mismatches are refused',()=>{
 const d=createPlacement();add(d,{...device('a','ball-valve',1),connectionThread:'3/4"',connectionGender:'male',connectionMaterial:'metal'});add(d,device('b','ball-valve',2));
 assert.ok(moveAndJoinWallItem(d,'b',{x:1.4,y:.03,height:1},wall));const b=d.items.find(i=>i.id==='port-b-0');assert.equal(b.connectionThread,'3/4"');assert.equal(b.connectionGender,'female');
 const a=d.items.find(i=>i.id==='port-a-1');assert.equal(compatiblePorts(a,{...b,connectionThread:'1/2"'},d.items),false);assert.equal(compatiblePorts(a,{...b,connectionGender:'male'},d.items),false);
});
test('wall guides align to nearby outlet heights and existing routes without moving source data',()=>{
 const items=[{...device('a','connection-port'),height:1.2}],routes=[{points:[{x:3,y:.03,z:.7},{x:4,y:.03,z:.7}]}];const before=JSON.stringify({items,routes});
 const result=wallAlignment({x:3.03,y:0,z:1.22,station:3.03},wall,items,routes,.06);assert.equal(result.point.station,3);assert.equal(result.point.z,1.2);assert.equal(result.guides.length,2);assert.equal(JSON.stringify({items,routes}),before);
 const miss=wallAlignment({x:4.6,y:0,z:2,station:4.6},wall,items,routes,.06);assert.equal(miss.guides.length,0);
});
