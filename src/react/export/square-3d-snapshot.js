export function snapshotBounds(pixels,width,height) {
  let left=width,top=height,right=-1,bottom=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4;
    if(pixels[i+3]>20&&(pixels[i]<245||pixels[i+1]<245||pixels[i+2]<245)){
      left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);
    }
  }
  return right<left?null:{x:left,y:top,width:right-left+1,height:bottom-top+1};
}

export async function square3DSnapshot(data,size=1024) {
  if(!data||data==='data:,')throw new Error('3D-вид ещё загружается. Подождите готовности модели.');
  const image=new Image();image.src=data;await image.decode();
  const source=document.createElement('canvas');source.width=image.naturalWidth;source.height=image.naturalHeight;
  const context=source.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);
  const bounds=snapshotBounds(context.getImageData(0,0,source.width,source.height).data,source.width,source.height);
  if(!bounds)throw new Error('В 3D-виде нет видимых элементов. Включите нужные слои и повторите снимок.');
  const square=document.createElement('canvas');square.width=square.height=size;
  const output=square.getContext('2d');output.fillStyle='#fff';output.fillRect(0,0,size,size);output.imageSmoothingQuality='high';
  const scale=size*.88/Math.max(bounds.width,bounds.height),width=bounds.width*scale,height=bounds.height*scale;
  output.drawImage(source,bounds.x,bounds.y,bounds.width,bounds.height,(size-width)/2,(size-height)/2,width,height);
  return new Promise((resolve,reject)=>square.toBlob(blob=>blob?resolve(blob):reject(new Error('Не удалось создать PNG-снимок.')),'image/png'));
}

export function snapshotFilename(meta={},date=new Date()) {
  const project=String(meta.projectName||meta.customer||'Проект').replace(/[<>:"/\\|?*\x00-\x1f]/g,' ').trim().slice(0,70);
  const stamp=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(date).replace(/[ :]/g,'-');
  return `3D_${String(meta.projectNum||'').replace(/[^\p{L}\p{N}-]/gu,'')}_${project}_${stamp}.png`;
}
