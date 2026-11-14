// Bake the small board basis into positions on the CPU. Mobile WebGL receives
// final world-space vertices instead of applying a different basis per board.
export function bakeBeamWorldGeometry(geometry,matrix){
 geometry.applyMatrix4(matrix);
 const position=geometry.getAttribute('position');
 for(let i=0;i<position.array.length;i++)if(!Number.isFinite(position.array[i]))return false;
 geometry.computeBoundingBox();geometry.computeBoundingSphere();return true;
}
