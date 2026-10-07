async (page) => {
  const context = await page.context().browser().newContext({viewport:{width:1280,height:900},hasTouch:true});
  const p = await context.newPage(), passed = [], failures = [], errors = [];
  p.setDefaultTimeout(4000);
  p.on('pageerror',e=>errors.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  p.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
  const assert = (ok, message) => {if(!ok)throw new Error(message);};
  const check = async (name, test) => {try{await test();passed.push(name);}catch(e){failures.push(name+': '+e.message);await p.screenshot({path:'artifacts/browser/clue-map-failure-'+failures.length+'.png'});}};
  const instruction = "Search the chest on the east wall found upstairs of Wydin's Food Store in Port Sarim.";
  const chest = {x:3013,y:3209,plane:1};
  const update = (target=chest,playerPlane=0) => p.evaluate(({target,playerPlane,instruction})=>{
    connectionState='connected';setStatus('Connected to RuneLite','connected');
    updatePosition(3016,3232,{x:3016,y:3232,plane:playerPlane,account:{name:'Map preview',world:613,hitpoints:99,prayer:70,runEnergy:85},helpers:{clue:{state:'active',title:'Cryptic clue',text:instruction,targets:[target],totalTargets:1,approximate:false}}});
  },{target,playerPlane,instruction});
  const settle = ()=>p.waitForFunction(()=>!map._panAnim?._inProgress&&!map._animatingZoom);
  const show = async()=>{await p.locator('[data-helper=clue] .objective-targets button').click();await settle();};
  try {
    await p.goto('http://127.0.0.1:8000/');await p.waitForSelector('#settingsFollow',{state:'attached'});
    await update();await settle();
    await check('upstairs chest opens on the ground map with a visible clue and player',async()=>{
      await show();
      assert(await p.evaluate(()=>currentPlane===0&&!followPlayer&&map.hasLayer(playerMarker)),'clue switched away from the ground map');
      assert(await p.locator('.objective-marker.clue').count()===1,'upstairs clue disappeared from ground map');
      assert(await p.evaluate(target=>Math.abs(map.getCenter().lng-target.x)<.5&&Math.abs(map.getCenter().lat-target.y)<.5,chest),'wrong destination');
      assert(await p.locator('.objective-instruction').innerText()===instruction,'upstairs instruction changed');
      assert(await p.locator('.objective-targets button').innerText()==='Show on map','map action still implies switching floors');
      await p.waitForFunction(()=>Object.values(localTileLayer._tiles).some(t=>t.el.currentSrc.includes('/tiles/2/0_')&&t.el.complete&&t.el.naturalWidth>1));
      await p.screenshot({path:'artifacts/browser/clue-ground-map-desktop.png'});
    });
    await check('native clue artwork loads locally and retains hover context',async()=>{
      await p.waitForFunction(()=>{const img=document.querySelector('.objective-marker.clue img');return img?.complete&&img.naturalWidth===36;});
      const marker=p.locator('.objective-marker.clue');
      assert(await marker.locator('svg').count()===0,'drawn replacement remains');
      assert(await marker.locator('img').getAttribute('src')==='icons/clue/clue-scroll.png','sprite is not bundled locally');
      await marker.hover();
      await p.waitForFunction(()=>{const tip=document.querySelector('.objective-tooltip');return tip&&+getComputedStyle(tip).opacity>=.85;});
      assert((await p.locator('.objective-tooltip').innerText()).includes(instruction),'hover instruction missing');
      await p.screenshot({path:'artifacts/browser/clue-ground-map-context.png'});
    });
    await check('clue browsing stays on ground after player climbs and follow restores player floor',async()=>{
      await show();await update(chest,1);await settle();
      assert(await p.evaluate(()=>currentPlane===0&&!followPlayer&&!map.hasLayer(playerMarker)),'player update changed the clue map or showed player on wrong floor');
      assert(await p.locator('.objective-marker.clue').count()===1,'clue vanished while browsing');
      await p.getByRole('button',{name:'Follow my location',exact:true}).click();await settle();
      assert(await p.evaluate(()=>currentPlane===1&&followPlayer&&map.hasLayer(playerMarker)),'follow no longer restores player floor');
      await show();
      assert(await p.evaluate(()=>currentPlane===0&&!followPlayer),'show on map did not return from upstairs to ground');
    });
    await check('higher floors and underground coordinates preserve their map location',async()=>{
      await update({...chest,plane:2});await show();
      assert(await p.evaluate(()=>currentPlane===0),'higher upstairs floor opened sparse tiles');
      assert(await p.locator('.objective-marker.clue').count()===1,'higher floor clue missing');
      const underground={x:3200,y:9600,plane:0};await update(underground);await show();
      assert(await p.evaluate(target=>Math.abs(map.getCenter().lng-target.x)<.5&&Math.abs(map.getCenter().lat-target.y)<.5,underground),'underground target was moved to unrelated surface coordinates');
    });
    await check('upstairs clue remains usable on a narrow touch screen',async()=>{
      await p.setViewportSize({width:375,height:812});await p.evaluate(()=>map.invalidateSize());
      await update();await show();
      assert(await p.evaluate(()=>currentPlane===0),'mobile clue opened upstairs tiles');
      await p.locator('.objective-marker.clue').tap();
      await p.waitForFunction(()=>{const popup=document.querySelector('.objective-popup');return popup&&+getComputedStyle(popup).opacity>=.85;});
      const box=await p.locator('.objective-popup').boundingBox();
      assert(box&&box.x>=0&&box.x+box.width<=375,'popup clipped');
      const panel=await p.locator('#objectives').boundingBox();
      assert(box.y>=panel.y+panel.height,'objective card covers touch popup');
      assert(await p.locator('.objective-popup strong').evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),'popup heading is obscured');
      assert((await p.locator('.objective-popup').innerText()).includes(instruction),'touch context missing');
      assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow');
      await p.screenshot({path:'artifacts/browser/clue-ground-map-mobile.png'});
    });
    return {passed,failures,errors};
  } finally {await context.close();}
}
