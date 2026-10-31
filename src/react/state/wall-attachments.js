import {houseContourPoints,roomPoints} from '../planner/geometry.js';

// Reattach only coordinates already lying on the previous inner wall face.
export function reattachWallFaces(plan,previous,next) {
  if(!(previous>0&&next>0)||Math.abs(previous-next)<1e-7)return;
  const contour=houseContourPoints(plan),sign=Math.sign(contour.reduce((sum,a,i)=>{const b=contour[(i+1)%contour.length];return sum+a.x*b.y-b.x*a.y;},0))||1;
  const move=point=>{
    const constraints=[];
    contour.forEach((a,i)=>{const b=contour[(i+1)%contour.length],dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy);if(!L)return;
      const nx=-dy/L*sign,ny=dx/L*sign,along=((point.x-a.x)*dx+(point.y-a.y)*dy)/L,depth=(point.x-a.x)*nx+(point.y-a.y)*ny;
      if(along>=-.001&&along<=L+.001&&Math.abs(depth-previous)<=.0011)constraints.push({nx,ny});
    });
    if(!constraints.length)return {...point};
    const delta=next-previous,a=constraints[0],b=constraints.find(c=>Math.abs(a.nx*c.ny-a.ny*c.nx)>.001);
    let dx=a.nx*delta,dy=a.ny*delta;
    if(b){const det=a.nx*b.ny-a.ny*b.nx;dx=delta*(b.ny-a.ny)/det;dy=delta*(a.nx-b.nx)/det;}
    return {...point,x:Math.round((point.x+dx)*1e6)/1e6,y:Math.round((point.y+dy)*1e6)/1e6};
  };
  for(const room of plan.rooms||[]){
    if(room.extension)continue;
    if(room.points?.length>=3)room.points=room.points.map(move);
    else {const points=roomPoints(room).map(move),xs=points.map(p=>p.x),ys=points.map(p=>p.y);Object.assign(room,{x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)});}
  }
  for(const wall of plan.walls||[]){const a=move({x:wall.x1,y:wall.y1}),b=move({x:wall.x2,y:wall.y2});Object.assign(wall,{x1:a.x,y1:a.y,x2:b.x,y2:b.y});}
}
