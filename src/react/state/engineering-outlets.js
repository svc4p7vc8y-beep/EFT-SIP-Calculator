import {INLINE_FITTING_KINDS,PIPE_COMPONENTS} from '../data/pipe-components.js';
// Symbol connection coordinates (0..1), not manufacturer installation dimensions.
const at=(x,y,side)=>({x,y,side});
export function outletAnchor(item,index,total,definition={}) {
 const aliases={'heat-pump-point':'pump','water-heater-point':'water-heater','heat-source':'boiler','heating-hydro-tank':'expansion-tank','heat-expansion-tank':'expansion-tank','radiator-point':'radiator','heat-safety-group':'safety-group','water-inlet-filter':'water-filter','heat-filter':'water-filter','water-elbow':'elbow','heat-elbow':'elbow','sewer-elbow':'elbow','water-tee':'tee','heat-tee':'tee','sewer-tee':'tee','bathroom-sink':'basin','kitchen-sink':'sink','double-sink':'double-basin','washer-dryer':'washer','wall-toilet':'toilet','walk-in-shower':'shower'};
 const icon=PIPE_COMPONENTS.find(p=>p.id===item.kind)?.icon||aliases[item.kind]||item.kind;
 const pair=[at(.37,.96,'bottom'),at(.63,.96,'bottom')];
 let anchors;
 if(['boiler','water-heater'].includes(icon))anchors=total===2?pair:[at(.3,.96,'bottom'),at(.44,.96,'bottom'),at(.58,.96,'bottom'),at(.72,.96,'bottom')];
 else if(icon==='electric-boiler')anchors=[at(.5,.96,'bottom'),at(.5,.04,'top')];
 else if(['hydro-tank','expansion-tank'].includes(icon))anchors=[at(.5,.98,'bottom')];
 else if(['washer','dishwasher'].includes(icon))anchors=[at(.78,.82,'bottom'),at(.65,.9,'bottom')];
 else if(['basin','sink','double-basin','vanity','bathtub','corner-bathtub','shower','toilet','bidet'].includes(icon))anchors=[at(.38,.32,'bottom'),at(.62,.32,'bottom'),at(.5,.65,'bottom')];
 else if(icon==='radiator')anchors=[at(.01,.29,'left'),at(.99,.71,'right')];
 else if(['pump','heat-pump-point'].includes(icon))anchors=[at(.08,.5,'left'),at(.92,.5,'right')];
 else if(icon==='water-source')anchors=[at(.95,.5,'right')];
 else if(icon==='water-filter')anchors=[at(.05,.25,'left'),at(.95,.25,'right')];
 else if(icon==='mud-filter')anchors=[at(.02,.405,'left'),at(.98,.405,'right')];
 else if(icon==='angle-valve')anchors=[at(.06,.48,'left'),at(.52,.95,'bottom')];
 else if(icon==='angle-union')anchors=[at(.52,.305,'right'),at(.135,.9,'bottom')];
 else if(icon==='elbow')anchors=[at(.21,.88,'bottom'),at(.88,.21,'right')];
 else if(icon==='elbow-45')anchors=[at(.21,.88,'bottom'),at(.59,.08,'top')];
 else if(['tee','cross'].includes(icon))anchors=[at(.04,.5,'left'),at(.96,.5,'right'),at(.5,.04,'top'),at(.5,.96,'bottom')];
 else if(['pressure-gauge','air-vent','pressure-switch','safety-group'].includes(icon))anchors=[at(.5,.95,'bottom')];
 if(!anchors&&INLINE_FITTING_KINDS.has(item.kind))anchors=[at(0,.5,'left'),at(1,.5,'right'),at(.5,0,'top')];
 const base=anchors?.[index]||at(definition.side==='left'?0:definition.side==='right'?1:.5,definition.side==='top'?0:definition.side==='bottom'?1:.5,definition.side||'bottom');
 const saved=item.portLayout?.[index];
 const override=INLINE_FITTING_KINDS.has(item.kind)&&saved?Object.fromEntries(Object.entries(saved).filter(([key])=>!['x','y','side'].includes(key))):saved;
 return override?{...base,...override,x:Number.isFinite(Number(override.x))?Number(override.x):base.x,y:Number.isFinite(Number(override.y))?Number(override.y):base.y}:base;
}

export const movableDeviceOutlet=(port,items)=>port?.kind==='connection-port'&&Boolean(items.find(i=>i.id===port.linkedApplianceId&&!INLINE_FITTING_KINDS.has(i.kind)));
export const portHandleRadius=port=>Math.max(.5,Math.min(1.2,(Number(port.connectionDiameterMm)||20)/20));

export function engineeringHistoryAction(event) {
 if(!(event.ctrlKey||event.metaKey)||event.altKey)return null;
 if(event.code==='KeyZ'||['z','я'].includes(event.key?.toLowerCase()))return event.shiftKey?'redo':'undo';
 if(event.code==='KeyY'||['y','н'].includes(event.key?.toLowerCase()))return 'redo';
 return null;
}
