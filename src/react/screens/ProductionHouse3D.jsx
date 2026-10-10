import { memo, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { productionScene } from '../calculations/production-scene.js';

const layers={walls:'Стены',partitions:'Перегородки',gables:'Фронтоны',floor:'Пол',ceiling:'Потолок',roof:'Крыша',supports:'Опоры',binding:'Обвязка'};
const vector=([x,y,z])=>new THREE.Vector3(x/1000,z/1000,-y/1000);
const direction=([x,y,z])=>new THREE.Vector3(x,z,-y);
export default memo(function ProductionHouse3D({report,project,selected=[],onSelect,large=false,onExpand,controlsRef,pan=false}) {
  const host=useRef(null),api=useRef(null),selection=useRef(selected),callback=useRef(onSelect),view=useRef(null);
  const [error,setError]=useState(''),[showLayers,setShowLayers]=useState(false),[hidden,setHidden]=useState(['ceiling']);
  const [display,setDisplay]=useState('solid');
  const data=useMemo(()=>productionScene(report,project),[report,project]);
  selection.current=selected;callback.current=onSelect;
  useEffect(()=>{
    const el=host.current;if(!el)return;let renderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});}catch{setError('Браузер не поддерживает WebGL: интерактивный 3D недоступен. 2D-чертежи сохранены.');return;}
    setError('');renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setClearColor('#ffffff');el.appendChild(renderer.domElement);
    const scene=new THREE.Scene(),model=new THREE.Group();scene.add(model);const meshes=[];
    for(const item of data.panels){
      const shape=new THREE.Shape();item.shape[0].forEach(([x,y],i)=>i?shape.lineTo(x/1000,y/1000):shape.moveTo(x/1000,y/1000));shape.closePath();
      for(const ring of item.shape.slice(1)){const hole=new THREE.Path();ring.forEach(([x,y],i)=>i?hole.lineTo(x/1000,y/1000):hole.moveTo(x/1000,y/1000));hole.closePath();shape.holes.push(hole);}
      const geo=new THREE.ExtrudeGeometry(shape,{depth:item.thickness/1000,bevelEnabled:false});geo.translate(0,0,-item.thickness/2000);
      const color=item.timber?'#ba9562':item.layer==='roof'?'#91adbf':'#c3d8b6',material=new THREE.MeshStandardMaterial({color,side:THREE.DoubleSide,roughness:.85,metalness:0});
      const mesh=new THREE.Mesh(geo,material),p=item.placement;mesh.matrix.makeBasis(direction(p.u),direction(p.v),direction(p.normal));mesh.matrix.setPosition(vector(p.origin));mesh.matrixAutoUpdate=false;mesh.userData={id:item.id,layer:item.layer,color};
      mesh.userData.panel=!item.timber;
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo),new THREE.LineBasicMaterial({color:'#253229'})));model.add(mesh);meshes.push(mesh);
    }
    for(const item of data.beams){const a=vector(item.a),b=vector(item.b),delta=b.clone().sub(a),profile=String(item.profile).split(/[×xх]/).map(Number);if(!delta.length()||!profile.every(n=>n>0))continue;const mesh=new THREE.Mesh(new THREE.BoxGeometry(profile[0]/1000,delta.length(),(profile[1]||profile[0])/1000),new THREE.MeshStandardMaterial({color:'#ba9562'}));mesh.position.copy(a.add(b).multiplyScalar(.5));mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());mesh.userData={id:item.id,layer:item.layer,color:'#ba9562'};model.add(mesh);meshes.push(mesh);}
    for(const m of meshes.filter(m=>!m.userData.panel))if(!m.children.length)m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry),new THREE.LineBasicMaterial({color:'#493921'})));
    for(const p of report.assembly.piles){const d=report.assembly.blockDimensions,block=report.assembly.foundationType==='concreteBlock'&&d?.widthMm>0&&d?.lengthMm>0&&d?.heightMm>0;const marker=new THREE.Mesh(block?new THREE.BoxGeometry(d.widthMm/1000,d.heightMm/1000,d.lengthMm/1000):new THREE.SphereGeometry(.06,8,6),new THREE.MeshStandardMaterial({color:'#777',roughness:1}));marker.position.copy(vector([...p,block?-150-d.heightMm/2:-250]));marker.userData={layer:'supports',color:'#777'};marker.add(new THREE.LineSegments(new THREE.EdgesGeometry(marker.geometry),new THREE.LineBasicMaterial({color:'#333'})));model.add(marker);meshes.push(marker);}
    scene.add(new THREE.HemisphereLight(0xffffff,0x8a9c85,2));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(10,20,15);scene.add(light);
    const box=new THREE.Box3().setFromObject(model),center=box.isEmpty()?new THREE.Vector3():box.getCenter(new THREE.Vector3()),span=box.isEmpty()?5:Math.max(...box.getSize(new THREE.Vector3()).toArray(),1);
    const camera=new THREE.PerspectiveCamera(42,1,.01,span*30),controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=.15;controls.maxDistance=span*8;
    const reset=()=>{const distance=span/Math.max(.05,Math.min(1,camera.aspect));camera.position.copy(center).add(new THREE.Vector3(distance,distance*.85,distance));controls.target.copy(center);controls.update();};reset();if(view.current){camera.position.copy(view.current.position);controls.target.copy(view.current.target);controls.update();}
    const ray=new THREE.Raycaster(),mouse=new THREE.Vector2();let start;
    const down=e=>{start=[e.clientX,e.clientY];};const pick=e=>{if(!start||Math.hypot(e.clientX-start[0],e.clientY-start[1])>4)return;const b=renderer.domElement.getBoundingClientRect();mouse.set((e.clientX-b.left)/b.width*2-1,-(e.clientY-b.top)/b.height*2+1);ray.setFromCamera(mouse,camera);const hit=ray.intersectObjects(meshes.filter(m=>m.visible&&m.userData.id),false)[0];if(hit)callback.current?.(hit.object.userData.id);};renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointerup',pick);
    const resize=()=>{const {width,height}=el.getBoundingClientRect();if(width<1||height<1)return;renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();if(!view.current)reset();};const observer=new ResizeObserver(resize);observer.observe(el);resize();
    api.current={meshes,reset,controls,camera};if(controlsRef)controlsRef.current={reset,zoom:factor=>{camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target);controls.update();}};let frame;const animate=()=>{frame=requestAnimationFrame(animate);if(el.clientWidth<1||el.clientHeight<1)return;controls.update();view.current={position:camera.position.clone(),target:controls.target.clone()};for(const mesh of meshes)mesh.material.color.set(selection.current.includes(mesh.userData.id)?'#17734b':mesh.userData.color);renderer.render(scene,camera);};animate();
    return()=>{cancelAnimationFrame(frame);observer.disconnect();controls.dispose();renderer.domElement.removeEventListener('pointerdown',down);renderer.domElement.removeEventListener('pointerup',pick);scene.traverse(n=>{n.geometry?.dispose();if(n.material)(Array.isArray(n.material)?n.material:[n.material]).forEach(m=>m.dispose());});renderer.dispose();renderer.domElement.remove();api.current=null;};
  },[data,report.assembly.piles,controlsRef]);
  useEffect(()=>{for(const m of api.current?.meshes||[]){m.visible=!hidden.includes(m.userData.layer)&&!(display==='frame'&&m.userData.panel);if(m.userData.panel){m.material.transparent=display==='transparent';m.material.opacity=display==='transparent'?.28:1;m.material.depthWrite=display!=='transparent';m.material.needsUpdate=true;}}},[hidden,display,data]);
  useEffect(()=>{if(api.current)api.current.controls.mouseButtons.LEFT=pan?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE;},[pan,data]);
  return <section className={`production-3d ${large?'is-large':''}`} aria-label="Интерактивный 3D домокомплекта"><div className="production-3d-toolbar"><strong>3D · домокомплект</strong><select aria-label="Режим детализации 3D" value={display} onChange={e=>setDisplay(e.target.value)}><option value="solid">Панели и каркас</option><option value="frame">Только каркас</option><option value="transparent">Прозрачные панели</option></select><button aria-label="Сбросить 3D вид" onClick={()=>api.current?.reset()}>Сброс</button><button aria-expanded={showLayers} onClick={()=>setShowLayers(!showLayers)}>Слои 3D</button>{onExpand?<button onClick={onExpand}>Крупнее</button>:null}</div><div ref={host} className="production-3d-canvas" role="img" aria-label="Объёмный дом: вращайте мышью или пальцем, колесо приближает"/>{error?<p role="alert">{error}</p>:null}{showLayers?<div className="production-3d-layers">{Object.entries(layers).map(([key,name])=><label key={key}><input type="checkbox" checked={!hidden.includes(key)} onChange={e=>setHidden(old=>e.target.checked?old.filter(k=>k!==key):[...old,key])}/>{name}</label>)}</div>:null}<small>Реальные панели, вырезы, сечения и грани каркаса. Вращение · приближение · выбор детали. Опоры без полного размера — маркеры осей.</small>{data.missing.length?<small>Нет пространственной привязки: {data.missing.join(', ')}. Нужен рабочий узел.</small>:null}</section>;
});
