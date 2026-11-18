import test from 'node:test';
import assert from 'node:assert/strict';
import {groupedWorkbenchPages,workbenchDocumentGroup,clampDrawingZoom,pinchDrawingView,selectedPanelMap,panelMapHighlight} from '../src/react/screens/workbench-navigation.js';
test('document groups retain each original page exactly once without leaking cutting maps into assembly',()=>{
 const pages=['Стена Э1-С1','Свайное поле · оси','Карты раскроя SIP · 2500','1 этаж · Пол','Состав монтажного альбома','Стропила · Первый скат'].map((title,i)=>({id:String(i),title}));
 const before=structuredClone(pages),groups=groupedWorkbenchPages(pages),flat=groups.flatMap(g=>g.pages);
 assert.equal(flat.length,pages.length);assert.deepEqual(new Set(flat.map(p=>p.id)),new Set(pages.map(p=>p.id)));assert.deepEqual(pages,before);
 assert.equal(groups[0].name,'Общие данные');assert.equal(workbenchDocumentGroup(pages[2].title),'Карты раскроя');assert.equal(workbenchDocumentGroup('Стена Э1-С2 · ведомость 2'),'Стены и фронтоны');
});
test('grouped map locates and highlights a nonrepresentative physical blank without changing IDs or quantities',()=>{
 const sheets=[{id:'Л1',parts:[{id:'A'},{id:'B'}]},{id:'Л2',parts:[{id:'C'},{id:'D'}]}],maps=[{id:'map',ids:['Л1','Л2'],qty:2,sheet:sheets[0]}],before=structuredClone({maps,sheets});
 const map=selectedPanelMap(maps,sheets,['D']);assert.equal(map,maps[0]);assert.deepEqual(panelMapHighlight(map,sheets,['D']),['D','B']);assert.equal(selectedPanelMap(maps,sheets,['missing']),undefined);assert.deepEqual({maps,sheets},before);
});
test('pinch changes zoom and translates with the midpoint while preserving finite bounded scale',()=>{
 const start={zoom:1,offset:[20,30],distance:100,center:[50,0]};
 assert.deepEqual(pinchDrawingView(start,[10,20],[210,20]),{zoom:2,offset:[80,50]});
 assert.equal(pinchDrawingView(start,[0,0],[10000,0]).zoom,4);assert.equal(pinchDrawingView(start,[0,0],[0,0]).zoom,.5);assert.equal(clampDrawingZoom(NaN),1);
});
