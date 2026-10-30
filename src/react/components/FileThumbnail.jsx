import {useEffect,useRef,useState} from 'react';
import {FileText} from 'lucide-react';
export default function FileThumbnail({url,mime='',name=''}) {
  const host=useRef(null),[image,setImage]=useState('');
  useEffect(()=>{
    let active=true,document;
    if(mime.startsWith('image/')){setImage(url);return;}
    setImage('');
    if(mime!=='application/pdf')return;
    const observer=new IntersectionObserver(entries=>{
      if(!entries.some(entry=>entry.isIntersecting))return;
      observer.disconnect();
      import('../utils/pdf-preview.js').then(async({openPreviewPdf,renderPdfPage})=>{document=await openPreviewPdf(url);const preview=await renderPdfPage(document);if(active)setImage(preview);}).catch(()=>{}).finally(()=>document?.destroy());
    });
    observer.observe(host.current);
    return ()=>{active=false;observer.disconnect();};
  },[url,mime]);
  return <span className="file-thumbnail" ref={host}>{image?<img src={image} alt={`Миниатюра: ${name}`} onError={()=>setImage('')}/>:<><FileText/><small>{mime==='application/pdf'?'PDF':name.split('.').at(-1)?.toUpperCase()||'ФАЙЛ'}</small></>}</span>;
}
