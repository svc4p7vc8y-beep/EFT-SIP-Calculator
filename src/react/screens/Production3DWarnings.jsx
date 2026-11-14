import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {CircleAlert,X} from 'lucide-react';

export default function Production3DWarnings({warnings,onFocus,onOpen}) {
 const id=useId(),button=useRef(null),panel=useRef(null),[open,setOpen]=useState(false),[position,setPosition]=useState({});
 useEffect(()=>{if(!warnings.length)setOpen(false);},[warnings.length]);
 useEffect(()=>{
  if(!open)return;
  const fit=()=>{
   const at=button.current?.getBoundingClientRect();if(!at)return;
   const width=Math.min(420,window.innerWidth-16),below=window.innerHeight-at.bottom-12,above=at.top-12;
   const bottom=below<160&&above>below;
   setPosition({width,left:Math.max(8,Math.min(at.left,window.innerWidth-width-8)),...(bottom?{bottom:window.innerHeight-at.top+5}:{top:at.bottom+5}),maxHeight:Math.max(100,Math.min(480,bottom?above:below))});
  };
  const outside=e=>{if(!button.current?.contains(e.target)&&!panel.current?.contains(e.target))setOpen(false);};
  const key=e=>{if(e.key==='Escape'){e.stopPropagation();setOpen(false);button.current?.focus();}};
  fit();window.addEventListener('resize',fit);window.addEventListener('scroll',fit,true);document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key,true);
  return()=>{window.removeEventListener('resize',fit);window.removeEventListener('scroll',fit,true);document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key,true);};
 },[open]);
 if(!warnings.length)return null;
 return <><button ref={button} type="button" className="production-3d-warning-button" aria-label={`Предупреждения 3D: ${warnings.length}`} title={`Предупреждения и ошибки: ${warnings.length}`} aria-expanded={open} aria-controls={open?id:undefined} onClick={()=>{if(!open)onOpen?.();setOpen(value=>!value);}}><CircleAlert size={18}/><span>{warnings.length}</span></button>
 {open&&createPortal(<section id={id} ref={panel} className="production-3d-warning-popover" style={position} role="region" aria-label="Предупреждения 3D"><header><strong>Предупреждения и ошибки · {warnings.length}</strong><button type="button" aria-label="Закрыть список предупреждений" onClick={()=>{setOpen(false);button.current?.focus();}}><X size={17}/></button></header><ol>{warnings.map(row=><li key={row.id}><p>{row.message}</p>{row.focusTargets.map(target=><button type="button" key={target.id} onClick={()=>{onFocus(target.id);setOpen(false);}}>Показать в 3D: {target.name}</button>)}</li>)}</ol></section>,document.body)}</>;
}
