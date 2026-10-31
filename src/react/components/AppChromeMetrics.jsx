import {useLayoutEffect} from 'react';

export default function AppChromeMetrics() {
  useLayoutEffect(()=>{
    const header=document.querySelector('.app-header'),tabs=document.querySelector('.project-tabbar');
    const measure=()=>{
      const height=header?.getBoundingClientRect().height||0,tabHeight=tabs?.getBoundingClientRect().height||0;
      document.documentElement.style.setProperty('--app-header-height',`${height}px`);
      document.documentElement.style.setProperty('--app-chrome-height',`${height+tabHeight}px`);
    };
    const observer=new ResizeObserver(measure);
    if(header)observer.observe(header);if(tabs)observer.observe(tabs);measure();
    return ()=>observer.disconnect();
  },[]);
  return null;
}
