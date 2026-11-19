// Older projects used the ceiling panel setting for roof slopes.
export function roofPanelThickness(project){
 const value=Number(project.settings.roof.sipPanelThickness);
 return [124,174,224].includes(value)?value:Number(project.settings.sip.ceilingThickness)||224;
}
