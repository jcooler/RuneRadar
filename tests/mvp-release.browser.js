// Real-browser release checks. Uses synthetic player data and never drives RuneLite.
async (page) => {
  const browser = page.context().browser(), results = [];
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  for (const width of [320, 375, 768, 1024, 1280]) {
    const context = await browser.newContext({viewport:{width,height:812}});
    try {
      const p = await context.newPage(), external = [], errors = [];
      p.on('request', r => { if (new URL(r.url()).origin !== 'http://127.0.0.1:8000') external.push(r.url()); });
      p.on('pageerror', error => errors.push(error.message));
      await p.goto('http://127.0.0.1:8000/');
      await p.waitForSelector('#settingsFollow', {state:'attached'});
      await p.evaluate(() => {
        connectionState = 'connected';
        updatePosition(3496,3488,{x:3496,y:3488,plane:0,account:{name:'Release preview',world:613,hitpoints:99,prayer:77,runEnergy:82}});
        setStatus(connectionMessages.connected,'connected');
      });
      await p.waitForTimeout(350);
      const layout = await p.evaluate(() => {
        const ids = ['search-input','fullscreen-btn','measure-btn','pin-btn','path-btn','export-btn','import-btn','clear-drawings-btn','locate-btn','status','player-info'];
        const boxes = ids.map(id => ({id,...document.getElementById(id).getBoundingClientRect().toJSON()}));
        const outside = boxes.filter(b => b.left<0 || b.right>innerWidth || b.top<0 || b.bottom>innerHeight);
        const overlap = [];
        for(let i=0;i<boxes.length;i++) for(let j=i+1;j<boxes.length;j++) {
          const a=boxes[i], b=boxes[j];
          if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1) overlap.push([a.id,b.id]);
        }
        return {outside,overlap,accountVisible:getComputedStyle(document.querySelector('#player-info')).display!=='none'};
      });
      assert(!layout.outside.length && !layout.overlap.length && layout.accountVisible, JSON.stringify({width,layout}));
      assert(!external.length && !errors.length, JSON.stringify({external,errors}));
      results.push({width,layout,externalRequests:external.length,errors});
    } finally { await context.close(); }
  }
  for (const mode of ['denied','corrupt']) {
    const context = await browser.newContext({viewport:{width:1280,height:800}});
    try {
      await context.addInitScript(mode => {
        if(mode === 'denied') Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Blocked','SecurityError');}});
        else {
          localStorage.setItem('runeradar-pins','not json');
          localStorage.setItem('runeradar-paths','{"wrong":"shape"}');
          localStorage.setItem('runeradar-fontscale','NaN');
        }
      },mode);
      const p=await context.newPage(), errors=[];
      p.on('pageerror',e=>errors.push(e.message));
      await p.goto('http://127.0.0.1:8000/');
      await p.waitForSelector('#settingsFollow',{state:'attached'});
      await p.evaluate(()=>{connectionState='connected';updatePosition(3222,3218,{x:3222,y:3218,plane:0});});
      await p.locator('#search-input').fill('Varrock');
      assert(await p.locator('.search-result').count()>0,'Search failed with '+mode+' storage');
      await p.evaluate(()=>document.querySelector('.leaflet-control-layers-toggle').click());
      await p.locator('#settingsTheme').selectOption('light');
      assert(await p.evaluate(()=>document.body.classList.contains('theme-light')),'Theme failed');
      if(mode==='denied') assert(await p.locator('#storage-note').isVisible(),'Tab-only storage explanation missing');
      const downloadPromise=p.waitForEvent('download');
      await p.evaluate(()=>exportPinsAndPaths());
      const download=await downloadPromise;
      assert(download.suggestedFilename().endsWith('.json'),'Export failed');
      assert(!errors.length,JSON.stringify(errors));
      results.push({storage:mode,search:true,theme:true,export:true,errors});
    } finally { await context.close(); }
  }
  const context=await browser.newContext();
  try {
    const p=await context.newPage();
    for(const name of ['help','privacy','credits']) {
      const response=await p.goto('http://127.0.0.1:8000/'+name+'.html');
      assert(response.ok(),name+' failed');
      results.push({page:name,heading:await p.locator('h1').textContent()});
    }
  } finally { await context.close(); }
  return results;
}
