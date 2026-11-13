'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {before,after,test}=require('node:test'),playwright=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),artifacts=process.env.MM_GAME_ARTIFACT_DIR;
let browser,server,base;
before(async()=>{
 if(artifacts)fs.mkdirSync(artifacts,{recursive:true});
 server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.json':'application/json'})[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base=process.env.MM_LAYOUT_BASE_URL||`http://127.0.0.1:${server.address().port}/`;browser=await playwright[process.env.MM_BROWSER||'chromium'].launch();
});
after(async()=>{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));});
for(const [file,alias] of [['cave-treasure-hunt.html','cave'],['treasure-hunt-landscape-prototype/index.html','interactive-cave']])for(const [width,height,touch] of [[393,844,true],[844,393,true],[1024,768,true],[1366,768,false]]){
 test(`${alias} retains Main gameplay and fits at ${width}x${height}`,async t=>{
  const context=await browser.newContext({viewport:{width,height},isMobile:touch,hasTouch:touch,deviceScaleFactor:2,serviceWorkers:'block',reducedMotion:'reduce'});t.after(()=>context.close());await context.addInitScript(()=>{localStorage.setItem('mmSound','off');localStorage.setItem('mmMusic','off');});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+file);await page.locator('#ball circle').waitFor();await page.evaluate(()=>document.fonts.ready);
  const g=await page.evaluate(()=>{const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};};return {transform:getComputedStyle(document.documentElement).transform,board:box(document.querySelector('.board-wrap')),pads:[...document.querySelectorAll('.pad')].map(box),overlaps:[...document.querySelectorAll('#stageTracker .stage-row')].filter(row=>{const text=row.querySelector('text'),circle=row.querySelector('circle'),b=text.getBBox();return b.x+b.width+2>circle.cx.baseVal.value-circle.r.baseVal.value-1.3;}).map(row=>row.getAttribute('aria-label'))};});
  if(artifacts){const name=alias+'-'+width+'x'+height;fs.writeFileSync(path.join(artifacts,name+'.json'),JSON.stringify(g,null,2));await page.screenshot({path:path.join(artifacts,name+'.png')});await page.screenshot({path:path.join(artifacts,name+'-bottom.png'),clip:{x:0,y:Math.max(0,height-180),width,height:Math.min(180,height)}});}
  assert.equal(g.transform,'none');assert.ok(g.board.x>=-1&&g.board.y>=0&&g.board.right<=width+1&&g.board.bottom<=height+1,JSON.stringify(g));assert.equal(g.pads.length,4);assert.ok(g.pads.every(b=>b.hit&&b.x>=0&&b.y>=0&&b.right<=width+1&&b.bottom<=height+1),JSON.stringify(g));assert.deepEqual(g.overlaps,[],'checkpoint labels must fit before their completion circles');
  if(width>height)assert.ok(g.board.x>=width*.35,'landscape maze must keep its own column');
  await page.getByRole('radio',{name:'Red player',exact:true}).click();await page.locator('#newRun').click();await page.getByRole('button',{name:'Move down',exact:true}).click();assert.ok(Number(await page.locator('#ball circle').getAttribute('cy'))>18);await page.locator('#newRun').click();assert.equal(Number(await page.locator('#ball circle').getAttribute('cy')),18);
  await page.locator('#watchButton').click();assert.equal(await page.locator('#clearTrail').isEnabled(),true);await page.locator('#clearTrail').click();assert.equal(await page.locator('#watchButton').getAttribute('aria-pressed'),'false');assert.equal(await page.locator('#progress').textContent(),alias==='cave'?'1 / 10 stages':'0 / 10 stages');assert.equal(await page.locator('#ball circle').getAttribute('fill'),'#e32b2b');assert.deepEqual(errors,[]);
 });
}
