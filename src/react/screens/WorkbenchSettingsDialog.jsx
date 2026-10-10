import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function WorkbenchSettingsDialog({children,onClose,pending}) {
  const dialog=useRef(null);
  const close=useRef(onClose);close.current=onClose;
  useEffect(()=>{
    const previous=document.activeElement;
    dialog.current?.querySelector('button')?.focus();
    const key=e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close.current();}
      if(e.key==='Tab'){
        const fields=[...dialog.current.querySelectorAll('button,input,select,textarea,[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length);
        const first=fields[0],last=fields.at(-1);
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
      }
    };
    document.addEventListener('keydown',key,true);
    return()=>{document.removeEventListener('keydown',key,true);previous?.focus();};
  },[]);
  return createPortal(<div className="workbench-dialog-backdrop"><section ref={dialog} className="screen cutting-screen workbench-settings-dialog" role="dialog" aria-modal="true" aria-label="Настройки производства"><header><h2>Настройки производства</h2><button onClick={onClose}>Закрыть настройки</button></header><p>Общие параметры проекта. Индивидуальные настройки — в карточке выбранного элемента.</p><fieldset disabled={pending}>{children}</fieldset></section></div>,document.body);
}
