'use strict';
// node --test tools/check-main-cave.cjs. Requires Playwright and a Chromium browser.
// MAIN_APP_URL selects a deployed app; MAIN_BASELINE_DIR enables a V181 upgrade check.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const {before, after, test} = require('node:test');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const output = process.env.MAIN_ARTIFACT_DIR;
const cacheName = 'mathmatrix-v182-cave-watch-reset';
let browser, server, base = process.env.MAIN_APP_URL, oldMode = false;
const mime = {'.html':'text/html; charset=utf-8','.js':'application/javascript',
  '.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.mp3':'audio/mpeg'};

before(async () => {
  if (output) await fs.mkdir(output, {recursive:true});
  if (!base) {
    server = http.createServer(async (request, response) => {
      const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html';
      const source = oldMode && ['index.html','KidsMathsMatrixPuzzle.html','sw.js'].includes(name)
        ? process.env.MAIN_BASELINE_DIR : root;
      const file = path.resolve(source, name);
      if (!file.startsWith(path.resolve(source) + path.sep) || name.startsWith('.git')) {
        response.writeHead(403); response.end(); return;
      }
      try {
        const data = await fs.readFile(file);
        response.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store'});
        response.end(data);
      } catch {
        response.writeHead(404); response.end();
      }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}/`;
  }
  browser = await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'msedge', headless:true});
});
after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function session(t, width = 390, height = 844) {
  const context = await browser.newContext({viewport:{width,height},hasTouch:width<500,isMobile:width<500});
  await context.addInitScript(() => {
    localStorage.setItem('mmSound','off'); localStorage.setItem('mmMusic','off');
  });
  await context.tracing.start({screenshots:true,snapshots:true});
  const page = await context.newPage(), errors = [], dialogs = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', async dialog => {dialogs.push(dialog.message()); await dialog.dismiss();});
  t.after(async () => {
    if (output) {
      const name = t.name.replace(/\W+/g,'-');
      await fs.writeFile(path.join(output,name+'.json'),JSON.stringify({errors,dialogs},null,2));
      await page.screenshot({path:path.join(output,name+'-final.png')}).catch(()=>{});
      await context.tracing.stop({path:path.join(output,name+'.zip')});
    }
    await context.close();
    assert.deepEqual(errors,[], 'no browser script errors');
    assert.deepEqual(dialogs,[], 'no native confirmation dialogs');
  });
  return {context,page};
}

async function list(page, entry = 'index.html') {
  await page.goto(base + entry);
  const splash = page.locator('.splashPlay');
  if (await splash.count()) {await splash.click({force:true}); await splash.waitFor({state:'detached'});}
  await page.locator('#tab-scHome').click();
}
async function ready(page) {
  await page.evaluate(async () => {await navigator.serviceWorker.ready;});
  await page.waitForFunction(async cache => {
    const registration = await navigator.serviceWorker.getRegistration();
    return navigator.serviceWorker.controller?.state === 'activated' &&
      registration.active === navigator.serviceWorker.controller &&
      !registration.installing && !registration.waiting && (await caches.keys()).includes(cache);
  }, cacheName);
}
async function screenshot(page, name) {
  if (output) await page.screenshot({path:path.join(output,name+'.png')});
}
async function play(page) {
  await page.locator('#ball circle').waitFor();
  await page.getByRole('radio',{name:'Red player',exact:true}).click();
  await page.locator('#newRun').click();
  await page.getByRole('button',{name:'Move down',exact:true}).click();
  assert.ok(Number(await page.locator('#ball circle').getAttribute('cy'))>18);
  await page.locator('#newRun').click();
  assert.equal(Number(await page.locator('#ball circle').getAttribute('cy')),18);
  await page.locator('#watchButton').click();
  assert.equal(await page.locator('#clearTrail').isEnabled(),true);
  await page.locator('#clearTrail').click();
  assert.equal(await page.locator('#watchButton').getAttribute('aria-pressed'),'false');
  assert.equal(await page.locator('#progress').textContent(),'1 / 10 stages');
  assert.equal(await page.locator('#ball circle').getAttribute('fill'),'#e32b2b');
}

for (const [entry,width,height] of [['index.html',390,844],['KidsMathsMatrixPuzzle.html',1100,1000],
  ['index.html',360,800],['KidsMathsMatrixPuzzle.html',320,568]]) {
  test(`Main ${entry} ${width}px opens Cave and retains SaNa Maze`, async t => {
    const {page} = await session(t,width,height);
    await list(page,entry);
    assert.equal(await page.locator('#caveTreasureHuntTab').count(),1, 'Cave must be available in Main');
    assert.equal(await page.locator('#tunnelsOfMetaTab').count(),1);
    assert.equal(await page.evaluate(()=>window.BETA_VER),'v182');
    await page.locator('#caveTreasureHuntTab').scrollIntoViewIfNeeded();
    const cave = await page.locator('#caveTreasureHuntTab').boundingBox();
    const tunnel = await page.locator('#tunnelsOfMetaTab').boundingBox();
    assert.ok(cave.width>100 && cave.x>=0 && cave.x+cave.width<=width+1);
    if (width>=360) {
      assert.ok(cave.x>tunnel.x+tunnel.width && Math.abs(cave.y-tunnel.y)<=2, 'both maze cards share a row');
      assert.ok(Math.abs(cave.width-tunnel.width)<=2);
    } else assert.ok(cave.y>tunnel.y, 'narrow phones retain the stacked layout');
    await screenshot(page,`puzzles-${width}`);
    await page.locator('#caveTreasureHuntTab').click();
    await page.waitForURL('**/cave-treasure-hunt.html');
    await play(page); await ready(page); await screenshot(page,`cave-${width}`);
    await page.locator('#logicButton').click();
    await page.locator('#logicDialog').waitFor({state:'visible'});
    await page.locator('#closeLogic').click();
    await page.getByRole('button',{name:'Back to puzzles'}).click();
    await page.waitForURL('**/'+entry);
    await page.locator('#tab-scHome').click();
    await page.locator('#tunnelsOfMetaTab').click();
    await page.waitForURL('**/tunnels-of-sana-maze.html');
    assert.match(await page.title(),/SaNa|Maze/i);
  });
}

test('Direct Main Cave entry rotates, returns to Main, and works offline', async t => {
  const {context,page} = await session(t);
  await page.setViewportSize({width:844,height:390});
  await page.addInitScript(()=>Object.defineProperty(screen.orientation,'angle',{configurable:true,get:()=>90}));
  await page.goto(base+'cave-treasure-hunt.html'); await ready(page);
  assert.equal(await page.locator('html').evaluate(e=>e.classList.contains('lockRotateCCW')),true);
  await screenshot(page,'portrait-rotation');
  await page.getByRole('button',{name:'Back to puzzles'}).click();
  await page.waitForURL('**/KidsMathsMatrixPuzzle.html');
  await page.setViewportSize({width:390,height:844});
  await context.setOffline(true);
  await list(page); await page.locator('#caveTreasureHuntTab').click();
  await page.waitForURL('**/cave-treasure-hunt.html'); await play(page);
  await screenshot(page,'offline-cave');
});

test('Installed V181 updates to Main V182 and retains saved data and Beta cache', {
  skip: !!process.env.MAIN_APP_URL || !process.env.MAIN_BASELINE_DIR,
}, async t => {
  oldMode = true;
  t.after(()=>{oldMode=false;});
  const {context,page} = await session(t);
  await list(page);
  assert.equal(await page.evaluate(()=>window.BETA_VER),'v181');
  await page.evaluate(async()=>{
    await navigator.serviceWorker.ready;
    const beta=await caches.open('mathmatrix-beta-preservation-probe');
    await beta.put('/beta-preserved',new Response('kept'));
    localStorage.setItem('release-preservation','kept');
  });
  await page.waitForFunction(async()=>{
    const r=await navigator.serviceWorker.getRegistration();
    const c=await caches.open('mathmatrix-v181');
    return navigator.serviceWorker.controller?.state==='activated' && !r.installing &&
      !!(await c.match(new URL('index.html',location.href).href)) &&
      !!(await c.match(new URL('tunnels-of-sana-maze.html',location.href).href));
  });
  oldMode = false;
  await page.locator('#tab-scApp').click();
  await page.getByRole('button',{name:'Online Update',exact:false}).click();
  await page.waitForFunction(()=>window.BETA_VER==='v182'); await ready(page);
  await page.waitForLoadState('load');
  await page.waitForFunction(async()=>!(await caches.keys()).includes('mathmatrix-v181'));
  assert.equal(await page.evaluate(()=>localStorage.getItem('release-preservation')),'kept');
  assert.equal(await page.evaluate(async()=>{
    const c=await caches.open('mathmatrix-beta-preservation-probe');
    return (await c.match('/beta-preserved')).text();
  }),'kept');
  await context.setOffline(true);
  await list(page); await page.locator('#caveTreasureHuntTab').click();
  await page.waitForURL('**/cave-treasure-hunt.html'); await play(page);
});
