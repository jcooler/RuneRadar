// Run in Playwright against the local map server. All account data is synthetic.
async (page) => {
  const browser = page.context().browser(), results = [];
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  for (const mobile of [false, true]) {
    const context = await browser.newContext({viewport: mobile ? {width:375,height:812} : {width:1280,height:800}, hasTouch:mobile, isMobile:mobile});
    try {
      const p = await context.newPage(), errors = [], badResponses = [];
      p.on('pageerror', e => errors.push(e.message));
      p.on('response', r => { if (r.status() >= 400) badResponses.push(r.url()); });
      await p.goto('http://127.0.0.1:8000/');
      await p.waitForSelector('#settingsFollow', {state:'attached'});
      const checks = await p.evaluate(() => {
        connectionState = 'connected';
        updatePosition(3496,3488,{x:3496,y:3488,plane:0,account:{name:'Map preview',world:613,hitpoints:99,prayer:77,runEnergy:82}});
        setStatus(connectionMessages.connected, 'connected');
        const above = marker => +getComputedStyle(marker.getPane()).zIndex > +getComputedStyle(map.getPane('markerPane')).zIndex;
        const first = {closeView:map.getZoom()===3,playerAboveLabels:above(playerMarker)&&above(playerLabelMarker),world:document.querySelector('#p-world').textContent,status:document.querySelector('#status').textContent};
        const label = document.querySelector('#settingsLabel');
        label.click(); label.click();
        first.labelStillAbove = above(playerLabelMarker);
        const group = new ViewportLayer();
        const near = L.marker(gameToLatLng(3496,3488)), far = L.marker(gameToLatLng(3222,3218));
        group.addLayer(near).addLayer(far).addTo(map);
        first.culling = map.hasLayer(near) && !map.hasLayer(far) && group.getLayers().length === 2;
        map.removeLayer(group);
        first.removal = !map.hasLayer(near) && !map.hasLayer(far);
        group.addTo(map);
        first.restored = map.hasLayer(near) && !map.hasLayer(far);
        pauseFollowing(); map.setView(gameToLatLng(3222,3218),3,{animate:false});
        first.browsing = map.hasLayer(far) && !map.hasLayer(near);
        group.removeLayer(far);
        first.removedMarker = !map.hasLayer(far) && group.getLayers().length===1;
        map.removeLayer(group);
        return first;
      });
      for (const [key,value] of Object.entries(checks)) if (typeof value==='boolean') assert(value,key+' failed');
      assert(checks.world === 'W613 · Canifis', 'Area lookup failed: '+checks.world);
      assert(checks.status === 'Connected to RuneLite', 'Unexpected status');
      if (mobile) await p.locator('#locate-btn').tap(); else await p.locator('#locate-btn').click();
      await p.waitForFunction(()=>followPlayer && map.getZoom()>=3);
      await p.waitForTimeout(500);
      assert(await p.evaluate(()=>Math.abs(map.getCenter().lat-playerMarker.getLatLng().lat)<=0.125 && Math.abs(map.getCenter().lng-playerMarker.getLatLng().lng)<=0.125), 'Overview undid follow after rapid navigation');
      if (!mobile) {
        assert(await p.evaluate(()=>{
          for(let i=0;i<3;i++) {
            const old=minimap._miniMap;
            document.querySelector('#settingsMinimap').click();
            if(minimap || old.getContainer()._leaflet_id !== undefined) return false;
            document.querySelector('#settingsMinimap').click();
            if(!minimap) return false;
          }
          return true;
        }), 'Overview toggle retained a nested map');
        await p.setViewportSize({width:375,height:812});
        await p.waitForFunction(()=>minimap===null);
        await p.setViewportSize({width:1280,height:800});
        await p.waitForFunction(()=>minimap!==null);
      }
      const metrics = await p.evaluate(()=>({images:document.images.length,overflow:document.documentElement.scrollWidth>innerWidth,minimap:!!minimap,button:document.querySelector('#locate-btn').getBoundingClientRect().toJSON(),status:document.querySelector('#status').getBoundingClientRect().toJSON()}));
      assert(metrics.images<1000,'Excessive off-screen images');
      assert(!metrics.overflow,'Horizontal overflow');
      assert(metrics.minimap === !mobile,'Hidden minimap was instantiated');
      assert(metrics.button.width>=44 && metrics.button.height>=44,'Follow button too small');
      if (mobile) assert(metrics.button.bottom<=metrics.status.top,'Follow button overlaps status');
      assert(!errors.length, JSON.stringify(errors));
      assert(!badResponses.length, 'Asset failures: '+JSON.stringify(badResponses));
      await p.screenshot({path:'artifacts/browser/map-refined-'+(mobile?'mobile':'desktop')+'.png'});
      results.push({viewport:mobile?'mobile':'desktop',checks,metrics,errors,badResponses});
    } finally { await context.close(); }
  }
  // A first location/floor can arrive before the manifest. Canceled tiles must
  // not start downloading when that delayed manifest finally resolves.
  const context = await browser.newContext({viewport:{width:1280,height:800}});
  try {
    const p=await context.newPage(), detailRequests=[];
    let release, seen;
    const gate=new Promise(resolve=>{release=resolve;});
    const manifestRequested=new Promise(resolve=>{seen=resolve;});
    await p.route('**/tile-manifest.json',async route=>{seen();await gate;await route.continue();});
    p.on('request',r=>{if(r.url().includes('/tiles/2/'))detailRequests.push(r.url());});
    await p.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});
    await manifestRequested;
    await p.evaluate(()=>{connectionState='connected';updatePosition(3496,3488,{x:3496,y:3488,plane:1});});
    release();
    await p.waitForSelector('#settingsFollow',{state:'attached'});
    await p.waitForTimeout(300);
    assert(detailRequests.length>0,'No current floor tiles requested');
    assert(detailRequests.every(url=>url.includes('/tiles/2/1_')),'Canceled floor tiles restarted: '+JSON.stringify(detailRequests));
    results.push({delayedManifest:'passed',detailRequests:detailRequests.length});
  } finally { await context.close(); }
  return results;
}
