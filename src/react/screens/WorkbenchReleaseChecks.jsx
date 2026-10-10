import { useMemo } from 'react';
import { releaseValidation } from '../calculations/project-release.js';

// The same release gate as documentation; no separate acceptance rules.
export default function WorkbenchReleaseChecks({project,calculation,report,onLocate,onDocumentation}) {
  const validation=useMemo(()=>releaseValidation(project,calculation,report),[project,calculation,report]);
  const groups=Map.groupBy ? Map.groupBy(validation.blocks,block=>block.code) : validation.blocks.reduce((map,block)=>map.set(block.code,[...(map.get(block.code)||[]),block]),new Map());
  return <section aria-label="Готовность полного выпуска"><h2>Готовность полного выпуска</h2><p>{validation.canRelease?'Проверки комплектности пройдены.':`Выпуск в производство / монтаж заблокирован: ${validation.blocks.length} причин.`} Статус не является инженерным расчётом или электронной подписью.</p>{[...groups].map(([code,blocks])=><details key={code}><summary>{blocks[0].path} · {blocks.length}</summary>{blocks.map((block,index)=><p key={index}><button onClick={()=>['ENGINEERING','NODE','AR_AXES','AR_VIEWS','CATALOG_MAPPING','RECONCILIATION'].includes(code)?onDocumentation():onLocate(block)}>{block.message}</button><small> · {block.path}</small></p>)}</details>)}</section>;
}
