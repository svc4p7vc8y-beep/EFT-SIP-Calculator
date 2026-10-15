import { memo, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { productionScene } from '../calculations/production-scene.js';
import { beamFrame } from '../calculations/beam-frame.js';
import {assemblyPlatformView} from '../calculations/platform-assembly.js';
import {planPointToThree,planDirectionToThree} from '../calculations/plan-3d-orientation.js';
import { Box,Frame,Scan,Layers,RotateCcw } from 'lucide-react';

const layers={existingBuilding:'Существующее здание · справочно',foundation:'Фундамент',walls:'Стены',partitions:'Перегородки',gables:'Фронтоны',floor:'Пол',ceiling:'Потолок',roof:'SIP-крыша',roofSurface:'Плоскости холодных скатов',rafters:'Стропила',roofTimbers:'Мауэрлат и конёк',laths:'Обрешётка',counterLaths:'Контробрешётка',supports:'Опоры',trussTemplates:'Фермы · эскиз',binding:'Обвязка',platforms:'Настил, ступени и стойки площадок',platformRoof:'Крыши площадок · схема'};
const roofCoverLayers=['roofSurface','laths','counterLaths'];
const vector=point=>new THREE.Vector3(...planPointToThree(point));
const direction=point=>new THREE.Vector3(...planDirectionToThree(point));
function beamGeometry(item,width,depth,length){
 if(!item.endCutOutline)return new THREE.BoxGeometry(width/1000,length/1000,depth/1000);
 const vertices=[-width/2,width/2].flatMap(x=>item.endCutOutline.flatMap(([y,z])=>[x/1000,y/1000,z/1000]));
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
 geometry.setIndex([0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]);geometry.computeVertexNormals();return geometry;
}
export default memo(function ProductionHouse3D({report,project,selected=[],onSelect,large=false,onExpand,controlsRef,pan=false,initialZoom=1,showRoofStructureByDefault=false}) {
  const host=useRef(null),api=useRef(null),selection=useRef(selected),callback=useRef(onSelect),view=useRef(null);
  const [error,setError]=useState(''),[showLayers,setShowLayers]=useState(false),[hidden,setHidden]=useState(()=>['ceiling',...(showRoofStructureByDefault?roofCoverLayers:[])]);
  const [display,setDisplay]=useState('solid');
  const data=useMemo(()=>productionScene(report,project),[report,project]);
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
      const color=item.layer==='existingBuilding'?'#94a3b8':item.layer==='foundation'?'#999':item.preview?'#e08c75':item.timber?'#ba9562':item.layer==='roof'?'#91adbf':'#c3d8b6',material=new THREE.MeshStandardMaterial({color,side:THREE.DoubleSide,roughness:.85,metalness:0});
      const mesh=new THREE.Mesh(geo,material),p=item.placement;mesh.matrix.makeBasis(direction(p.u),direction(p.v),direction(p.normal));mesh.matrix.setPosition(vector(p.origin));mesh.matrixAutoUpdate=false;mesh.userData={id:item.preview?item.surfaceId:item.id,layer:item.layer,color};
      mesh.userData.panel=!item.timber;mesh.userData.preview=!!item.preview;
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo),new THREE.LineBasicMaterial({color:'#253229'})));model.add(mesh);meshes.push(mesh);
      if(item.notchContours?.length){const vertices=[];for(const ring of item.notchContours)for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],z=item.notchFaceOffsetMm/1000+.001;vertices.push(a[0]/1000,a[1]/1000,z,b[0]/1000,b[1]/1000,z);}const contours=new THREE.BufferGeometry();contours.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));mesh.add(new THREE.LineSegments(contours,new THREE.LineBasicMaterial({color:'#666666'})));}
      if(item.id.endsWith(':deck')){const ring=item.shape[0],xs=ring.map(p=>p[0]),ys=ring.map(p=>p[1]),vertices=[],minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);for(let x=minX+145;x<maxX&&vertices.length<12000;x+=145)vertices.push(x/1000,minY/1000,item.thickness/2000+.001,x/1000,maxY/1000,item.thickness/2000+.001);const lines=new THREE.BufferGeometry();lines.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));mesh.add(new THREE.LineSegments(lines,new THREE.LineBasicMaterial({color:'#735838'})));}
    }
    for(const item of data.beams){const frame=beamFrame(item.a,item.b,item.normal),profile=String(item.profile).split(/[×xх]/).map(Number);if(!frame||!profile.every(n=>n>0))continue;const [width,depth]=item.flat?[profile[1],profile[0]]:profile,mesh=new THREE.Mesh(beamGeometry(item,width,depth||width,frame.length),new THREE.MeshStandardMaterial({color:'#ba9562'}));mesh.matrix.makeBasis(direction(frame.across),direction(frame.along),direction(frame.depth));mesh.matrix.setPosition(vector(item.a.map((n,i)=>(n+item.b[i])/2)));mesh.matrixAutoUpdate=false;mesh.userData={id:item.id,layer:item.layer,color:'#ba9562'};model.add(mesh);meshes.push(mesh);}
    for(const m of meshes.filter(m=>!m.userData.panel))if(!m.children.length)m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry),new THREE.LineBasicMaterial({color:'#493921'})));
    for(const p of data.foundation.filter(p=>!p.known)){const marker=new THREE.Mesh(new THREE.SphereGeometry(.06,8,6),new THREE.MeshStandardMaterial({color:'#777',roughness:1}));marker.position.copy(vector(p.axis));marker.userData={id:p.id,layer:'foundation',color:'#777'};model.add(marker);meshes.push(marker);}
    scene.add(new THREE.HemisphereLight(0xffffff,0x8a9c85,2));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(10,20,15);scene.add(light);
    const box=new THREE.Box3().setFromObject(model),center=box.isEmpty()?new THREE.Vector3():box.getCenter(new THREE.Vector3()),span=box.isEmpty()?5:Math.max(...box.getSize(new THREE.Vector3()).toArray(),1);
    const camera=new THREE.PerspectiveCamera(42,1,.01,span*30),controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=.15;controls.maxDistance=span*8;
    const reset=()=>{const distance=span*initialZoom/Math.max(.05,Math.min(1,camera.aspect));camera.position.copy(center).add(new THREE.Vector3(distance,distance*.85,distance));controls.target.copy(center);controls.update();};reset();if(view.current){camera.position.copy(view.current.position);controls.target.copy(view.current.target);controls.update();}
    const ray=new THREE.Raycaster(),mouse=new THREE.Vector2();let start;
    const down=e=>{start=e.button===0?[e.clientX,e.clientY]:null;};const pick=e=>{if(e.button!==0||!start||Math.hypot(e.clientX-start[0],e.clientY-start[1])>4)return;const b=renderer.domElement.getBoundingClientRect();mouse.set((e.clientX-b.left)/b.width*2-1,-(e.clientY-b.top)/b.height*2+1);ray.setFromCamera(mouse,camera);const hit=ray.intersectObjects(meshes.filter(m=>m.visible&&m.userData.id),false)[0];if(hit)callback.current?.(hit.object.userData.id);};renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointerup',pick);
    const resize=()=>{const {width,height}=el.getBoundingClientRect();if(width<1||height<1)return;renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();if(!view.current)reset();};const observer=new ResizeObserver(resize);observer.observe(el);resize();
    api.current={meshes,reset,controls,camera};if(controlsRef)controlsRef.current={reset,zoom:factor=>{camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target);controls.update();}};let frame;const animate=()=>{frame=requestAnimationFrame(animate);if(el.clientWidth<1||el.clientHeight<1)return;controls.update();view.current={position:camera.position.clone(),target:controls.target.clone()};for(const mesh of meshes)mesh.material.color.set(selection.current.includes(mesh.userData.id)?'#17734b':mesh.userData.color);renderer.render(scene,camera);};animate();
    return()=>{cancelAnimationFrame(frame);observer.disconnect();controls.dispose();renderer.domElement.removeEventListener('pointerdown',down);renderer.domElement.removeEventListener('pointerup',pick);scene.traverse(n=>{n.geometry?.dispose();if(n.material)(Array.isArray(n.material)?n.material:[n.material]).forEach(m=>m.dispose());});renderer.dispose();renderer.domElement.remove();api.current=null;};
  },[data,foundation,controlsRef,initialZoom]);
  useEffect(()=>{for(const m of api.current?.meshes||[]){m.visible=!hidden.includes(m.userData.layer)&&!(display==='frame'&&m.userData.panel);if(m.userData.panel){m.material.transparent=display==='transparent';m.material.opacity=display==='transparent'?.28:1;m.material.depthWrite=display!=='transparent';m.material.needsUpdate=true;}}},[hidden,display,data]);
  useEffect(()=>{if(api.current){api.current.controls.mouseButtons.LEFT=THREE.MOUSE.ROTATE;api.current.controls.mouseButtons.MIDDLE=THREE.MOUSE.PAN;api.current.controls.mouseButtons.RIGHT=THREE.MOUSE.PAN;}},[data]);
  return <section className={`production-3d ${large?'is-large':''}`} aria-label="Интерактивный 3D домокомплекта">
    <div className="production-3d-toolbar"><strong>3D · домокомплект</strong><div role="group" aria-label="Режим детализации 3D">
      {[['solid','Панели и каркас',Box],['frame','Только каркас',Frame],['transparent','Прозрачные панели',Scan]].map(([id,label,Icon])=><button key={id} title={label} aria-label={label} aria-pressed={display===id} onClick={()=>setDisplay(id)}><Icon size={18}/></button>)}
    </div>{hasColdRoofSurface?<button type="button" className="production-3d-roof-structure" aria-label="Показать стропила без покрытия и обрешётки" title="Показать стропила без покрытия и обрешётки" aria-pressed={hidden.includes('roofSurface')} onClick={()=>setHidden(old=>old.includes('roofSurface')?old.filter(layer=>!roofCoverLayers.includes(layer)):[...new Set([...old,...roofCoverLayers])])}>Стропила</button>:null}<button aria-label="Сбросить 3D вид" title="Сбросить 3D вид" onClick={()=>api.current?.reset()}><RotateCcw size={18}/></button><button aria-expanded={showLayers} onClick={()=>setShowLayers(!showLayers)}><Layers size={18}/>Слои 3D</button>{onExpand?<button onClick={onExpand}>Крупнее</button>:null}</div>
    {showLayers?<div className="production-3d-layers" role="group" aria-label="Слои модели">{Object.entries(layers).map(([key,name])=><button key={key} aria-pressed={!hidden.includes(key)} onClick={()=>setHidden(old=>old.includes(key)?old.filter(k=>k!==key):[...old,key])}>{name}</button>)}</div>:null}
    <div ref={host} className="production-3d-canvas" role="img" aria-label="Объёмный дом: левая кнопка вращает, средняя и правая перемещают, колесо приближает"/>{error?<p role="alert">{error}</p>:null}
    <small>Левая кнопка — вращение · нажатое колесо или правая кнопка — перемещение · колесо — масштаб. Пальцем — вращение, двумя — масштаб и перемещение. Опоры без полного размера — маркеры осей.</small>{data.missing.length?<small>Нет пространственной привязки: {data.missing.join(', ')}. Нужен рабочий узел.</small>:null}
    {data.panels.some(p=>p.notchContours?.length)?<small>Контуры врезок с неуказанной глубиной показаны линиями на доске. Вырез в 3D строится по заданной проектной глубине.</small>:null}
    {data.previews.length?<small role="alert">Красным показаны конструкции с ошибкой раскроя. Это контуры для проверки, не изготовленные панели; они не входят в производственную ведомость.</small>:null}
    {report.issues.filter(i=>['PARTITION_ROOF_INTERSECTION','SUPPORT_ROOF_INTERSECTION','GABLE_OPENING'].includes(i.code)).map(i=><small role="alert" key={`${i.code}:${i.target}`}>{i.message}</small>)}
    {data.platforms.length?<small>Терраса и крыльцо: настил 45×145, ступени и стойки — схема по плану. Отметка настила по умолчанию — уровень пола дома; лаги, косоуры, опирание и узлы требуют проекта. Схематические элементы не создают повторный заказ.</small>:null}
    {project.plan?.existingBuilding?<small>Серым показан справочный контур существующего здания. При неизвестной высоте стены показаны низким контуром. В материалы и смету существующее здание не входит.</small>:null}
    {!project.services.terrace&&foundation.binding.some(m=>m.group==='platform')?<small>В основании учтены сохранённые площадки, хотя раздел «Терраса» отключён. Их обвязка показана без настила; состав основания настраивается в «Сваи» → «Учитывать террасы и крыльца».</small>:null}
  </section>;
});
