export function rafterEndOutline(a,b,depth) {
 const run=Math.hypot(b[0]-a[0],b[1]-a[1]),length=Math.hypot(run,b[2]-a[2]);
 if(!(run>0&&depth>0&&length>0))return null;
 const shift=-(b[2]-a[2])/run*depth/2,upperAtEnd=b[2]>=a[2];
 const outline=[[-length/2+(upperAtEnd?0:-shift),-depth/2],[length/2+(upperAtEnd?-shift:0),-depth/2],[length/2+(upperAtEnd?shift:0),depth/2],[-length/2+(upperAtEnd?0:shift),depth/2]];
 return {outline,blankLength:Math.ceil(length+Math.abs(shift))};
}
