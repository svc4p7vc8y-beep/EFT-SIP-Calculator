import * as THREE from 'three';
export function createOsbTexture() {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#c6a574';ctx.fillRect(0,0,512,512);
  let seed=353;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const colors=['#b99461','#dec398','#c8a575','#ae8756','#d5b685','#bea071'];
  for(let i=0;i<2600;i++){
    const x=random()*512,y=random()*512,length=8+random()*35,width=2+random()*7,angle=random()*Math.PI,color=colors[Math.floor(random()*colors.length)];
    for(const dx of [-512,0,512])for(const dy of [-512,0,512]){ctx.save();ctx.translate(x+dx,y+dy);ctx.rotate(angle);ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(-length/2,0);ctx.lineTo(-length*.25,-width/2);ctx.lineTo(length/2,-width*.25);ctx.lineTo(length*.35,width/2);ctx.closePath();ctx.fill();ctx.restore();}
  }
  const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(1.5,1.5);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture;
}
