// Explicit board-count overrides preserve every physical piece in the cutting list.
export function expandMemberPackages(members,settings){
 const result=[];
 for(const original of members){const count=Math.max(1,Math.min(3,Math.floor(Number(settings.memberOverrides?.[original.key]?.packageCount)||1)));
 if(count===1||!original.a||!original.b||original.worldA||original.source==='Проектная опора'){result.push(original);continue;}
 const horizontal=Math.abs(original.a[1]-original.b[1])<1,vertical=Math.abs(original.a[0]-original.b[0])<1;if(!horizontal&&!vertical){result.push(original);continue;}
 const pitch=Number(original.faceWidth)||Number(original.profile.split(/[×xх]/)[1])||45;
 for(let i=0;i<count;i++){const delta=[horizontal?0:pitch*i,horizontal?pitch*i:0];result.push({...original,id:i?`${original.id}-Д${i+1}`:original.id,key:i?`${original.key}:ply:${i+1}`:original.key,packageParentKey:original.key,packageCount:count,packageIndex:i,a:original.a.map((v,j)=>v+delta[j]),b:original.b.map((v,j)=>v+delta[j]),...(original.outline?{outline:original.outline.map(p=>p.map((v,j)=>v+delta[j]))}:{})});}
 }
 return result;
}
