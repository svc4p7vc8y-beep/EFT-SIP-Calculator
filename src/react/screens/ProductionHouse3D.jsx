import { memo, useEffect, useMemo, useRef, useState, useId } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { productionScene } from '../calculations/production-scene.js';
import { blockedSurfaceReasons, blockedSurfaceSummary, missingMainRoofReason } from '../calculations/production-diagnostics.js';
import { beamFrame } from '../calculations/beam-frame.js';
import {assemblyPlatformView} from '../calculations/platform-assembly.js';
import {planPointToThree,planDirectionToThree} from '../calculations/plan-3d-orientation.js';
import { Box,Frame,Scan,Layers,RotateCcw } from 'lucide-react';

const layers={existingBuilding:'Существующее здание · справочно',foundation:'Фундамент',walls:'Стены',windows:'Окна',partitions:'Перегородки',gables:'Фронтоны',floor:'Пол',interfloor:'Межэтажное перекрытие',ceiling:'Потолок',roof:'SIP-крыша',roofSurface:'Плоскости холодных скатов',sheetCover:'Листовое покрытие плоской кровли',flatOsb:'Настил ОСБ',flatCsp:'Основание ЦСП',waterproofing:'Рулонная гидроизоляция',flashing:'Примыкание листовой кровли',parapet:'Парапет',drains:'Парапетные воронки · схема',rafters:'Стропила',roofTimbers:'Мауэрлат, конёк и ригели',laths:'Обрешётка',counterLaths:'Контробрешётка',supports:'Опоры',trussTemplates:'Фермы · эскиз',binding:'Обвязка',platforms:'Настил, ступени и стойки площадок',platformRoof:'Крыши площадок · схема'};
const sortedLayers=Object.entries(layers).sort((a,b)=>a[1].localeCompare(b[1],'ru'));
const roofCoverLayers=['roofSurface','sheetCover','flatOsb','flatCsp','waterproofing','flashing','drains','laths','counterLaths'];
const vector=point=>new THREE.Vector3(...planPointToThree(point));
const direction=point=>new THREE.Vector3(...planDirectionToThree(point));
function beamGeometry(item,width,depth,length){
 if(item.layer==='rafters'&&item.bearingStatus==='geometry-only'&&item.bearingPoint&&item.bearingNotchMm>0){
  const frame=beamFrame(item.a,item.b,item.normal),delta=item.bearingPoint.map((value,index)=>value-item.a[index]);
  const seat=delta.reduce((sum,value,index)=>sum+value*frame.along[index],0)-length/2;
  const halfSeat=25,lo=Math.max(-length/2+1,seat-halfSeat),hi=Math.min(length/2-1,seat+halfSeat);
  if(hi>lo&&item.bearingNotchMm<=50){
   const base=item.endCutOutline||[[-length/2,-depth/2],[length/2,-depth/2],[length/2,depth/2],[-length/2,depth/2]];
   const shape=new THREE.Shape(),points=[base[0],base[1],base[2],[hi,depth/2],[hi,depth/2-item.bearingNotchMm],[lo,depth/2-item.bearingNotchMm],[lo,depth/2],base[3]];
   points.forEach(([y,z],index)=>index?shape.lineTo(y/1000,z/1000):shape.moveTo(y/1000,z/1000));shape.closePath();
   const geometry=new THREE.ExtrudeGeometry(shape,{depth:width/1000,bevelEnabled:false});
   geometry.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1),new THREE.Vector3(1,0,0)));
   geometry.translate(-width/2000,0,0);return geometry;
  }
 }
 if(!item.endCutOutline)return new THREE.BoxGeometry(width/1000,length/1000,depth/1000);
 const vertices=[-width/2,width/2].flatMap(x=>item.endCutOutline.flatMap(([y,z])=>[x/1000,y/1000,z/1000]));
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
 geometry.setIndex([0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]);geometry.computeVertexNormals();return geometry;
}
export default memo(function ProductionHouse3D({report,project,selected=[],onSelect,large=false,onExpand,controlsRef,captureRef,pan=false,initialZoom=1,showRoofStructureByDefault=false,showBearingPoints=false,viewerPreferences,onViewerPreferencesChange,savedViewRef}) {
  const displayGroup=useId(),menuRef=useRef(null),host=useRef(null),api=useRef(null),selection=useRef(selected),callback=useRef(onSelect),internalView=useRef(null),view=savedViewRef||internalView;
  const [error,setError]=useState(''),[showLayers,setShowLayers]=useState(viewerPreferences?.showLayers||false),[hidden,setHidden]=useState(()=>viewerPreferences?.hidden||['ceiling','platformRoof',...roofCoverLayers.filter(layer=>layer!=='drains')]);
  const [display,setDisplay]=useState(viewerPreferences?.display||'solid');
  const [bearingsVisible,setBearingsVisible]=useState(viewerPreferences?.bearingsVisible??showBearingPoints);
  useEffect(()=>{onViewerPreferencesChange?.({showLayers,hidden,display,bearingsVisible});},[showLayers,hidden,display,bearingsVisible,onViewerPreferencesChange]);
  const data=useMemo(()=>productionScene(report,project),[report,project]);
  const blockedPreviews=useMemo(()=>[...new Set(data.previews.map(item=>item.surfaceId))].map(id=>({id,reasons:blockedSurfaceReasons(report,id),summary:blockedSurfaceSummary(report,id)})),[data,report]);
  const roofWarning=useMemo(()=>missingMainRoofReason(report,project,data),[report,project,data]);
  const hasColdRoofSurface=data.panels.some(item=>item.layer==='roofSurface');
  const foundation=useMemo(()=>assemblyPlatformView(report.assembly,report.settings.showPlatforms!==false),[report]);
  selection.current=selected;callback.current=onSelect;
  useEffect(()=>{
    const el=host.current;if(!el)return;let renderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});}catch{setError('Браузер не поддерживает WebGL: интерактивный 3D недоступен. 2D-чертежи сохранены.');return;}
    setError('');renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setClearColor('#ffffff');el.appendChild(renderer.domElement);
    const scene=new THREE.Scene(),model=new THREE.Group();scene.add(model);const meshes=[];
    for(const item of [...data.panels,...data.previews]){
      const shape=new THREE.Shape();item.shape[0].forEach(([x,y],i)=>i?shape.lineTo(x/1000,y/1000):shape.moveTo(x/1000,y/1000));shape.closePath();
      for(const ring of item.shape.slice(1)){const hole=new THREE.Path();ring.forEach(([x,y],i)=>i?hole.lineTo(x/1000,y/1000):hole.moveTo(x/1000,y/1000));hole.closePath();shape.holes.push(hole);}
      const geo=new THREE.ExtrudeGeometry(shape,{depth:item.thickness/1000,bevelEnabled:false});geo.translate(0,0,-item.thickness/2000);
      const referencePlane=item.referenceOnly&&['roofSurface','platformRoof'].includes(item.layer);
      const color=item.windowGlass?'#81c8d3':item.windowFrame?'#e5ece9':item.layer==='existingBuilding'?'#94a3b8':item.layer==='foundation'?'#999':item.preview?'#e08c75':item.timber?'#ba9562':item.layer==='roof'?'#91adbf':item.layer==='sheetCover'?'#9aa8ad':item.layer==='waterproofing'?'#484c50':item.layer==='flashing'?'#87949a':item.layer==='flatCsp'?'#bab5a9':item.layer==='flatOsb'?'#b89668':item.layer==='parapet'?'#b8cfb2':'#c3d8b6',material=new THREE.MeshStandardMaterial({color,side:THREE.DoubleSide,roughness:.85,metalness:0,transparent:referencePlane||!!item.windowGlass,opacity:referencePlane?0:item.windowGlass?.62:1,depthWrite:!referencePlane&&!item.windowGlass});
      const mesh=new THREE.Mesh(geo,material),p=item.placement;mesh.matrix.makeBasis(direction(p.u),direction(p.v),direction(p.normal));mesh.matrix.setPosition(vector(p.origin));mesh.matrixAutoUpdate=false;mesh.userData={id:item.preview?item.surfaceId:item.id,layer:item.layer,color};
      mesh.userData.panel=!item.timber;mesh.userData.preview=!!item.preview;mesh.userData.referencePlane=referencePlane;mesh.userData.windowGlass=!!item.windowGlass;
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo),new THREE.LineBasicMaterial({color:referencePlane?'#7d8790':'#253229'})));model.add(mesh);meshes.push(mesh);
      if(item.notchContours?.length){const vertices=[];for(const ring of item.notchContours)for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],z=item.notchFaceOffsetMm/1000+.001;vertices.push(a[0]/1000,a[1]/1000,z,b[0]/1000,b[1]/1000,z);}const contours=new THREE.BufferGeometry();contours.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));mesh.add(new THREE.LineSegments(contours,new THREE.LineBasicMaterial({color:'#666666'})));}
      if(item.id.endsWith(':deck')){const ring=item.shape[0],xs=ring.map(p=>p[0]),ys=ring.map(p=>p[1]),vertices=[],minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);for(let x=minX+145;x<maxX&&vertices.length<12000;x+=145)vertices.push(x/1000,minY/1000,item.thickness/2000+.001,x/1000,maxY/1000,item.thickness/2000+.001);const lines=new THREE.BufferGeometry();lines.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));mesh.add(new THREE.LineSegments(lines,new THREE.LineBasicMaterial({color:'#735838'})));}
    }
    for(const item of data.beams){const frame=beamFrame(item.a,item.b,item.normal),profile=String(item.profile).split(/[×xх]/).map(Number);if(!frame||!profile.every(n=>n>0))continue;const mauerlat=item.name==='Мауэрлат'||item.material?.startsWith('Мауэрлат'),[width,depth]=item.flat?[profile[1],profile[0]]:profile,color=mauerlat?'#267248':item.layer==='drains'?'#667781':'#ba9562',mesh=new THREE.Mesh(beamGeometry(item,width,depth||width,frame.length),new THREE.MeshStandardMaterial({color}));mesh.matrix.makeBasis(direction(frame.across),direction(frame.along),direction(frame.depth));mesh.matrix.setPosition(vector(item.a.map((n,i)=>(n+item.b[i])/2)));mesh.matrixAutoUpdate=false;mesh.userData={id:item.id,layer:item.layer,color};model.add(mesh);meshes.push(mesh);
      if(mauerlat){const guide=new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(vector(item.a),vector(item.b)),1,.05,6,false),new THREE.MeshBasicMaterial({color:'#0d7a3c',depthTest:false}));guide.renderOrder=11;guide.userData={id:item.id,layer:item.layer,color:'#0d7a3c',bearing:true};model.add(guide);meshes.push(guide);}
    }
    for(const bearing of data.bearingPoints){const mesh=new THREE.Mesh(new THREE.SphereGeometry(.075,10,8),new THREE.MeshBasicMaterial({color:'#c46b10',depthTest:false}));mesh.position.copy(vector(bearing.point));mesh.renderOrder=12;mesh.userData={id:bearing.id,layer:'bearing',color:'#c46b10',bearing:true};model.add(mesh);meshes.push(mesh);}
    for(const m of meshes.filter(m=>!m.userData.panel&&!m.userData.bearing))if(!m.children.length)m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry),new THREE.LineBasicMaterial({color:'#493921'})));
    for(const p of data.foundation.filter(p=>!p.known)){const marker=new THREE.Mesh(new THREE.SphereGeometry(.06,8,6),new THREE.MeshStandardMaterial({color:'#777',roughness:1}));marker.position.copy(vector(p.axis));marker.userData={id:p.id,layer:'foundation',color:'#777'};model.add(marker);meshes.push(marker);}
    scene.add(new THREE.HemisphereLight(0xffffff,0x8a9c85,2));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(10,20,15);scene.add(light);
    const box=new THREE.Box3().setFromObject(model),center=box.isEmpty()?new THREE.Vector3():box.getCenter(new THREE.Vector3()),span=box.isEmpty()?5:Math.max(...box.getSize(new THREE.Vector3()).toArray(),1);
    const camera=new THREE.PerspectiveCamera(42,1,.01,span*30),controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=.15;controls.maxDistance=span*8;
    const reset=()=>{const distance=span*initialZoom/Math.max(.05,Math.min(1,camera.aspect));camera.position.copy(center).add(new THREE.Vector3(distance,distance*.85,distance));controls.target.copy(center);controls.update();};reset();if(view.current){camera.position.copy(view.current.position);controls.target.copy(view.current.target);controls.update();}
    const ray=new THREE.Raycaster(),mouse=new THREE.Vector2();let start;
    const down=e=>{start=e.button===0?[e.clientX,e.clientY]:null;};const pick=e=>{if(e.button!==0||!start||Math.hypot(e.clientX-start[0],e.clientY-start[1])>4)return;const b=renderer.domElement.getBoundingClientRect();mouse.set((e.clientX-b.left)/b.width*2-1,-(e.clientY-b.top)/b.height*2+1);ray.setFromCamera(mouse,camera);const hit=ray.intersectObjects(meshes.filter(m=>m.visible&&m.userData.id),false)[0];if(hit)callback.current?.(hit.object.userData.id);};renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointerup',pick);
    let canvasWidth=0,canvasHeight=0;
    const resize=()=>{if(el.closest('.plan-3d-preview.is-resizing'))return;const nextWidth=el.clientWidth,nextHeight=el.clientHeight;if(nextWidth<1||nextHeight<1||(nextWidth===canvasWidth&&nextHeight===canvasHeight))return;canvasWidth=nextWidth;canvasHeight=nextHeight;renderer.setSize(nextWidth,nextHeight,false);camera.aspect=nextWidth/nextHeight;camera.updateProjectionMatrix();if(!view.current)reset();};
    const observer=new ResizeObserver(resize);observer.observe(el);el.addEventListener('eft-3d-resize-end',resize);resize();
    api.current={meshes,reset,controls,camera};if(controlsRef)controlsRef.current={reset,zoom:factor=>{camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target);controls.update();}};
    if(captureRef)captureRef.current={
      setView:angle=>{const positions={iso:[1,.85,1],front:[0,.55,1],back:[0,.55,-1],left:[-1,.55,0],right:[1,.55,0],top:[0,1,.001]};const direction=positions[angle]||positions.iso;const distance=span*initialZoom/Math.max(.05,Math.min(1,camera.aspect));camera.position.copy(center).add(new THREE.Vector3(...direction).normalize().multiplyScalar(distance*1.7));controls.target.copy(center);controls.update();},
      capture:()=>{controls.update();renderer.render(scene,camera);return renderer.domElement.toDataURL('image/png');},
    };
    let frame;const animate=()=>{frame=requestAnimationFrame(animate);if(el.clientWidth<1||el.clientHeight<1)return;controls.update();view.current={position:camera.position.clone(),target:controls.target.clone()};for(const mesh of meshes)mesh.material.color.set(selection.current.includes(mesh.userData.id)?'#17734b':mesh.userData.color);renderer.render(scene,camera);};animate();
    return()=>{cancelAnimationFrame(frame);observer.disconnect();el.removeEventListener('eft-3d-resize-end',resize);controls.dispose();renderer.domElement.removeEventListener('pointerdown',down);renderer.domElement.removeEventListener('pointerup',pick);scene.traverse(n=>{n.geometry?.dispose();if(n.material)(Array.isArray(n.material)?n.material:[n.material]).forEach(m=>m.dispose());});renderer.dispose();renderer.domElement.remove();api.current=null;if(captureRef)captureRef.current=null;};
  },[data,foundation,controlsRef,captureRef,initialZoom]);
  useEffect(()=>{for(const m of api.current?.meshes||[]){m.visible=!hidden.includes(m.userData.layer)&&!(display==='frame'&&m.userData.panel&&m.userData.layer!=='windows')&&(!m.userData.bearing||bearingsVisible);if(m.userData.panel){m.material.transparent=m.userData.referencePlane||m.userData.windowGlass||display==='transparent';m.material.opacity=m.userData.referencePlane?0:m.userData.windowGlass?.62:display==='transparent'?.28:1;m.material.depthWrite=!m.userData.referencePlane&&!m.userData.windowGlass&&display!=='transparent';m.material.needsUpdate=true;}}},[hidden,display,data,bearingsVisible]);
  useEffect(()=>{if(api.current){api.current.controls.mouseButtons.LEFT=THREE.MOUSE.ROTATE;api.current.controls.mouseButtons.MIDDLE=THREE.MOUSE.PAN;api.current.controls.mouseButtons.RIGHT=THREE.MOUSE.PAN;}},[data]);
  useEffect(()=>{
    if(!showLayers)return;
    const close=event=>{if(!menuRef.current?.contains(event.target))setShowLayers(false);};
    const key=event=>{if(event.key==='Escape'){setShowLayers(false);menuRef.current?.querySelector('button')?.focus();}};
    document.addEventListener('pointerdown',close);document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',key);};
  },[showLayers]);
  return <section className={`production-3d ${large?'is-large':''}`} aria-label="Интерактивный 3D домокомплекта">
    <div className="production-3d-toolbar"><div className="production-3d-layer-menu" ref={menuRef}><button type="button" aria-label="Слои 3D" aria-expanded={showLayers} onClick={()=>setShowLayers(!showLayers)}><Layers size={18}/>Слои 3D <span aria-hidden="true">{showLayers?'▴':'▾'}</span></button>{showLayers?<div className="production-3d-layers" role="group" aria-label="Слои модели"><strong className="production-layer-heading">Слои</strong>{sortedLayers.map(([key,name])=><label key={key} title={name}><input type="checkbox" checked={!hidden.includes(key)} onChange={()=>setHidden(old=>old.includes(key)?old.filter(k=>k!==key):[...old,key])}/><span>{name}</span></label>)}<strong className="production-layer-heading">Отображение</strong>{[['solid','Панели и каркас'],['frame','Только каркас'],['transparent','Прозрачные панели']].map(([id,label])=><label key={id}><input type="radio" name={displayGroup} checked={display===id} onChange={()=>setDisplay(id)}/><span>{label}</span></label>)}{hasColdRoofSurface?<label title="Показать стропила без покрытия и обрешётки"><input type="checkbox" checked={hidden.includes('roofSurface')} onChange={()=>setHidden(old=>old.includes('roofSurface')?old.filter(layer=>!roofCoverLayers.includes(layer)):[...new Set([...old,...roofCoverLayers])])}/><span>Стропильный каркас без покрытия</span></label>:null}{data.bearingPoints.length?<label><input type="checkbox" checked={bearingsVisible} onChange={()=>setBearingsVisible(value=>!value)}/><span>Точки опирания стропил</span></label>:null}</div>:null}</div><button aria-label="Сбросить 3D вид" title="Сбросить 3D вид" onClick={()=>api.current?.reset()}><RotateCcw size={18}/></button>{onExpand?<button onClick={onExpand}>Крупнее</button>:null}</div>
    {blockedPreviews.length?<details className="production-3d-issue-banner"><summary role="alert">{blockedPreviews.map(item=>item.summary).join('; ')}</summary><div>{blockedPreviews.map(item=><p key={item.id}>{item.reasons[0]||'Проверьте ошибки раскроя в ведомости.'}</p>)}<p>Красные контуры не входят в производственную ведомость.</p></div></details>:null}
    <div ref={host} className="production-3d-canvas" role="img" aria-label="Объёмный дом: левая кнопка вращает, средняя и правая перемещают, колесо приближает"/>{error?<p role="alert">{error}</p>:null}
    <small>Левая кнопка — вращение · нажатое колесо или правая кнопка — перемещение · колесо — масштаб. Пальцем — вращение, двумя — масштаб и перемещение. Опоры без полного размера — маркеры осей.</small>{data.missing.length?<small>Нет пространственной привязки: {data.missing.join(', ')}. Нужен рабочий узел.</small>:null}
    {data.panels.some(p=>p.notchContours?.length)?<small>Контуры врезок с неуказанной глубиной показаны линиями на доске. Вырез в 3D строится по заданной проектной глубине.</small>:null}
    {roofWarning?<small role="alert">Основная крыша: {roofWarning}</small>:null}
    {data.parapetRequirement?.shortfall>0?<small role="alert">Парапет высотой {data.parapetRequirement.provided} мм не скрывает кровлю. Для выбранного уклона и слоёв требуется не менее {data.parapetRequirement.required} мм от потолка. Измените высоту в параметрах; 3D и смета не повышают её автоматически.</small>:null}
    {report.issues.filter(i=>['PARTITION_ROOF_INTERSECTION','SUPPORT_ROOF_INTERSECTION','GABLE_OPENING'].includes(i.code)).map(i=><small role="alert" key={`${i.code}:${i.target}`}>{i.message}</small>)}
    {data.platforms.length?<small>Терраса и крыльцо: настил 45×145, ступени и стойки — схема по плану. Отметка настила по умолчанию — уровень пола дома; лаги, косоуры, опирание и узлы требуют проекта. Схематические элементы не создают повторный заказ.</small>:null}
    {project.plan?.existingBuilding?<small>Серым показан справочный контур существующего здания. При неизвестной высоте стены показаны низким контуром. В материалы и смету существующее здание не входит.</small>:null}
    {!project.services.terrace&&foundation.binding.some(m=>m.group==='platform')?<small>В основании учтены сохранённые площадки, хотя раздел «Терраса» отключён. Их обвязка показана без настила; состав основания настраивается в «Сваи» → «Учитывать террасы и крыльца».</small>:null}
  </section>;
});
