import {useEffect,useRef} from 'react';

export default function AllLayersCheckbox({count,total,onChange,label,compact=false}){
 const input=useRef(null),all=total>0&&count===total;
 useEffect(()=>{if(input.current)input.current.indeterminate=count>0&&!all;},[count,all]);
 return <label className={`all-layers-checkbox${compact?' is-compact':''}`} title={`${all?'Выключить':'Включить'} все слои`}>
  <input ref={input} type="checkbox" aria-label={label} aria-checked={count>0&&!all?'mixed':all} checked={all} onChange={e=>onChange(e.target.checked)}/><span>{compact?'Все':'Все слои'}</span>
 </label>;
}
