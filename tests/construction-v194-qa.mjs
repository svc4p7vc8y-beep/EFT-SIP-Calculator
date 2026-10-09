// Explicit visual QA; not included in node --test. Run against npm run preview.
import {chromium,expect} from '@playwright/test';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createDefaultProject} from '../src/react/state/project-model.js';
import {bearingWallKey} from '../src/react/calculations/bearing-walls.js';
const p=createDefaultProject();p.meta.projectName='Альбом контроль194';
Object.assign(p.plan,{house:{w:8,h:6,contourDefined:true},wallHeight:2.7,rooms:[{id:'r',name:'Парная',x:1,y:1,w:6,h:3,bearingWalls:{[bearingWallKey({x:1,y:1},{x:7,y:1})]:{enabled:true,profile:'50x150'}}}],walls:[],openings:[{id:'d',type:'door',outer:false,x:2,y:1,width:.9,height:2.1,orientation:'h'}],wallGaps:[],platforms:[],piles:[{id:'a',x:0,y:0},{id:'b',x:8,y:0},{id:'c',x:8,y:6},{id:'d',x:0,y:6}],pileRows:[],bindingLines:[]});
Object.assign(p.settings.productionCutting,{kerfMm:3,endAllowanceMm:0});
Object.assign(p.settings.piles,{pileType:'concreteBlock',blockDimensions:{widthMm:200,lengthMm:400,heightMm:200}});
Object.assign(p.settings.roof,{shape:'flat',flatSlopeMode:'structural',flatSlopePercent:5,flatSlopeDirection:'back',gableType:'sip',type:'cold'});
const browser=await chromium.launch();
try{for(const width of [1600,1024,768,390]){
 const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(['error','warning'].includes(m.type()))errors.push(m.text());});
 await page.addInitScript(p=>{localStorage.setItem('eft-react-project-v46',JSON.stringify(p));window.print=()=>{};},p);
 await page.goto(process.env.QA_URL||'http://127.0.0.1:5185/react.html',{waitUntil:'networkidle'});
 const menu=page.getByRole('button',{name:'Открыть меню'});if(await menu.isVisible())await menu.click();
 await page.locator('.sidebar').getByText('Раскрой',{exact:true}).click();const root=page.locator('.drawing-workbench');
 await expect(root.locator('.drawing-header')).toContainText('РК2-');await expect(root.locator('.drawing-pending')).toHaveCount(0);
 await root.getByLabel('Раздел чертежей').selectOption('partitions');await expect(root.locator('.drawing-stage')).toContainText('Вид сверху');
 await page.screenshot({path:join(tmpdir(),`eft-v194-bearing-${width}.png`)});
 await root.getByLabel('Раздел чертежей').selectOption('piles');await expect(root.locator('.drawing-stage svg')).toContainText('БЛ1');await expect(root.locator('.drawing-stage svg')).toContainText('Д1:');
 if(width===1600){await root.getByLabel('Раздел чертежей').selectOption('sheets');
  for(const format of ['A3','A4']){
   await root.getByLabel('Формат',{exact:true}).selectOption(format);await root.getByRole('button',{name:'Весь альбом',exact:true}).click();await page.emulateMedia({media:'print'});
   const sheets=page.locator('.production-print .mounting-sheet');
   if(!(await sheets.count())){console.log((await root.innerText()).slice(-6000));console.log(await root.locator('[aria-invalid="true"]').evaluateAll(list=>list.map(n=>({html:n.outerHTML,value:n.value}))));}
   const sheetCount=await sheets.count();expect(sheetCount).toBeGreaterThan(0);
   const overflow=await sheets.evaluateAll(list=>list.flatMap((n,i)=>{const c=n.querySelector('.mounting-content');return c.scrollHeight>c.clientHeight+2?[i+1]:[];}));
   expect(overflow).toEqual([]);await expect(sheets.first()).toHaveCSS('border-top-width','0px');
   await page.pdf({path:join(tmpdir(),`eft-v194-assembly-${format}.pdf`),preferCSSPageSize:true});
   console.log(JSON.stringify({format,sheets:sheetCount,overflow}));await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));await page.emulateMedia({media:'screen'});
  }
 }
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);expect(overflow).toBeLessThanOrEqual(1);expect(errors).toEqual([]);console.log(JSON.stringify({width,errors,overflow}));await page.close();
}}finally{await browser.close();}
