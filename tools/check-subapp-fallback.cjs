// A root PWA must not return its HTML under another app's nested URL.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {execFileSync}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'@playwright/test');
const root=path.resolve(__dirname,'..'),sanaRoot=process.env.SANA_LIVE_ROOT;
assert(sanaRoot,'Set SANA_LIVE_ROOT to the prepared SaNa Live checkout');
const priorWorker=execFileSync('git',['show','e744e445c21de6658859aa8d4a602fa2c1c02718:sw.js'],{cwd:root});
let browser,delayChild=false,legacyWorker=false;
const server=http.createServer((req,res)=>{try{
 const pathname=new URL(req.url,'http://local').pathname;
 if(pathname==='/__check.html'){res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><title>Worker check</title>');return;}
 const child=pathname.startsWith('/toddler-games-/'),directory=child?sanaRoot:root,relative=child?pathname.slice('/toddler-games-/'.length):pathname.slice(1);
 const file=path.resolve(directory,relative||'index.html');assert(file.startsWith(path.resolve(directory)+path.sep));const body=legacyWorker&&pathname==='/sw.js'?priorWorker:fs.readFileSync(file);
 const send=()=>{if(res.destroyed)return;res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.mp3':'audio/mpeg'})[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(body);};
 if(delayChild&&child&&pathname.endsWith('/play.html')&&req.url.includes('?v160'))setTimeout(send,3500);else send();
}catch{res.writeHead(404).end();}});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch();const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(15000);
 await page.goto(origin+'/__check.html');
 await page.evaluate(async()=>{const reg=await navigator.serviceWorker.register('/sw.js',{scope:'/'}),ready=await navigator.serviceWorker.ready,worker=reg.installing||reg.waiting||reg.active||ready.active;if(worker.state!=='activated')await new Promise(resolve=>worker.addEventListener('statechange',()=>{if(worker.state==='activated')resolve();}));});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));delayChild=true;
 await page.goto(origin+'/toddler-games-/play.html?v160&age=2',{waitUntil:'load'});
 const title=await page.title();
 if(!title.startsWith('SaNa Little Hands'))console.log(JSON.stringify({observedTitle:title,errors}));
 assert(title.startsWith('SaNa Little Hands'),'A slow toddler navigation must receive SaNa HTML, not MathMatrix fallback HTML');
 assert(!errors.some(error=>error.includes('createMathMatrixCategoryChooser')),'The screenshot startup error must not recur');
 console.log('PASS A slow toddler navigation receives only SaNa HTML, without the MathMatrix chooser error');
 await page.waitForFunction(()=>document.querySelector('[data-activity="puzzle"]'));
 await context.setOffline(true);await page.goto(origin+'/index.html');assert.match(await page.title(),/MathMatrix/);
 console.log('PASS The original MathMatrix shared URL still opens MathMatrix offline');
 await context.close();delayChild=false;legacyWorker=true;
 const previous=await browser.newContext(),oldPage=await previous.newPage();oldPage.setDefaultTimeout(20000);
 await oldPage.goto(origin+'/__check.html');
 await oldPage.evaluate(async()=>{localStorage.setItem('mm.recovery-preserve','keep');await caches.open('sana-little-hands-live-preservation-probe');const reg=await navigator.serviceWorker.register('/sw.js',{scope:'/'}),ready=await navigator.serviceWorker.ready,worker=reg.installing||reg.waiting||reg.active||ready.active;if(worker.state!=='activated')await new Promise(resolve=>worker.addEventListener('statechange',()=>{if(worker.state==='activated')resolve();}));});
 await oldPage.evaluate(async html=>{const cache=await caches.open('mathmatrix-live-v228-home-picker-update');await cache.put('/toddler-games-/play.html?v160&age=2',new Response(html,{headers:{'Content-Type':'text/html'}}));},fs.readFileSync(path.join(root,'index.html'),'utf8'));
 legacyWorker=false;await oldPage.goto(origin+'/mathmatrix-recover.html');await oldPage.waitForURL('**/index.html',{timeout:40000});
 await oldPage.waitForFunction(()=>typeof window.createMathMatrixCategoryChooser==='function');
 console.log('PASS The fresh recovery link upgrades an old MathMatrix worker and loads the chooser');
 const data=await oldPage.evaluate(async()=>({marker:localStorage.getItem('mm.recovery-preserve'),keys:await caches.keys()}));
 assert.equal(data.marker,'keep');assert(data.keys.includes('sana-little-hands-live-preservation-probe'));assert(!data.keys.includes('mathmatrix-live-v228-home-picker-update'));
 console.log('PASS Recovery preserves saved storage and the toddler cache while removing the old polluted MathMatrix cache');
 const client=await previous.newCDPSession(oldPage),manifest=(await client.send('Page.getAppManifest')).manifest;
 assert.equal(manifest.id,origin+'/');assert.equal(manifest.startUrl,origin+'/index.html');assert.match(manifest.name,/MathMatrix/);
 console.log('PASS Recovery exposes the original MathMatrix app ID, name and launch address');
 await previous.setOffline(true);await oldPage.goto(origin+'/tic-tac-toe.html?level=2');assert.match(await oldPage.title(),/Tic|Toe/i);
 console.log('PASS Existing MathMatrix puzzle links still open offline after recovery');
})().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(async()=>{await browser?.close();server.closeAllConnections();server.close();});
