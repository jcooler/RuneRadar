async (page) => {
  const context = await page.context().browser().newContext({viewport:{width:1280,height:900},hasTouch:true});
  const p=await context.newPage(), passed=[], failures=[], errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  p.setDefaultTimeout(4000);
  const overlay=async selector=>{await p.waitForFunction(selector=>{const nodes=document.querySelectorAll(selector);return nodes.length===1&&+getComputedStyle(nodes[0]).opacity>=.85;},selector);return p.locator(selector);};
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
  const check=async(name,fn)=>{try{await fn();passed.push(name);}catch(e){failures.push(name+': '+e.message);}};
  const instruction='Talk to The Face located by the manhole just north of the Port Sarim fishing shop.';
  const point={x:3018,y:3250,plane:0};
  const clue=(extra={})=>({state:'active',title:'Cryptic clue',text:instruction,targets:[point],totalTargets:1,approximate:false,...extra});
  const update=async(value)=>{
    await p.evaluate(clue=>{connectionState='connected';setStatus('Connected to RuneLite','connected');updatePosition(3010,3240,{x:3010,y:3240,plane:0,account:{name:'Map preview',world:613,hitpoints:99,prayer:70,runEnergy:85},helpers:{clue}});},value);
    await p.evaluate(()=>{pauseFollowing();map.setView(gameToLatLng(3018,3250),4,{animate:false});});
    await p.waitForFunction(()=>!map._panAnim?._inProgress&&!map._animatingZoom);
  };
  try {
    await p.goto('http://127.0.0.1:8000/');await p.waitForSelector('#settingsFollow',{state:'attached'});
    await update(clue());
    await check('older clients get a clear map action without guessed step counts',async()=>{
      const text=await p.locator('[data-helper=clue] .objective-targets').innerText();
      assert(text==='Show on map','Unclear action: '+text);
      assert(await p.locator('.objective-progress').count()===0,'invented progress');
    });
    await check('native clue marker exposes full context on hover and keyboard focus',async()=>{
      const marker=p.locator('.objective-marker.clue');
      assert(await marker.locator('img').getAttribute('src')==='icons/clue/clue-scroll.png','missing native clue sprite');
      assert((await marker.innerText()).trim()==='','letter placeholder remains');
      await marker.hover();
      assert((await (await overlay('.objective-tooltip')).innerText()).includes(instruction),'missing hover instruction');
      await p.mouse.move(1100,750);await marker.focus();
      assert((await (await overlay('.objective-tooltip')).innerText()).includes(instruction),'missing focus instruction');
    });
    await check('tapping a marker opens readable context without moving the map',async()=>{
      const before=await p.evaluate(()=>({x:map.getCenter().lng,y:map.getCenter().lat}));
      await p.locator('.objective-marker.clue').tap();
      assert((await (await overlay('.objective-popup')).innerText()).includes(instruction),'missing touch instruction');
      assert(await p.evaluate(before=>map.getCenter().lng===before.x&&map.getCenter().lat===before.y,before),'inspection moved map');
      await p.locator('.leaflet-popup-close-button').click();
    });
    await update(clue({targets:[{...point,label:'The Face',description:instruction}]}));
    await check('destination labels and context remain plain text',async()=>{
      await p.locator('.objective-marker.clue').hover();
      assert((await (await overlay('.objective-tooltip')).innerText()).includes('The Face'),'NPC missing');
      await update(clue({targets:[{...point,label:'<img src=x onerror=alert(1)>',description:'<script>alert(1)</script>'}]}));
      await p.locator('.objective-marker.clue').hover();
      assert(await p.locator('.objective-tooltip img,.objective-tooltip script').count()===0,'context became HTML');
    });
    await check('three-part progress is separate from location actions',async()=>{
      await update(clue({title:'Three-step cryptic clue',progress:'1 of 3 parts complete',targets:[{...point,label:'The Face',description:instruction},{x:3020,y:3252,plane:1,label:'A guide',description:'Speak to the guide upstairs.'}],totalTargets:2}));
      assert(await p.locator('.objective-progress').innerText({timeout:1500})==='1 of 3 parts complete','part progress missing');
      const buttons=await p.locator('.objective-targets').innerText();
      assert(!buttons.includes('Target')&&!buttons.includes('Ground'),'internal target labels remain');
      assert(!buttons.includes('Floor'),'clue action implies changing map floors');
      assert(await p.locator('.objective-marker.clue').count()===2,'upstairs clue part missing from ground map');
    });
    await check('search areas remain approximate and clearing removes context',async()=>{
      await update(clue({title:'Hot / cold clue',approximate:true}));
      assert((await p.locator('.objective-targets').innerText()).includes('Show search area'),'search area action unclear');
      await p.locator('.objective-marker.clue').tap();
      assert((await (await overlay('.objective-popup')).innerText()).includes('not an exact dig tile'),'uncertainty missing from context');
      await p.evaluate(()=>clearPersonalPosition());
      await p.waitForFunction(()=>!document.querySelector('.objective-tooltip,.objective-popup,.objective-marker'));
      assert(await p.locator('.objective-tooltip,.objective-popup,.objective-marker').count()===0,'stale context remains');
    });
    await update(clue({targets:[{...point,label:'The Face',description:instruction}]}));
    await p.locator('.objective-marker.clue').hover();
    await overlay('.objective-tooltip');
    await p.screenshot({path:'artifacts/browser/clue-polish-desktop.png'});
    await check('narrow viewport keeps card and touch popup readable',async()=>{
      await p.setViewportSize({width:375,height:812});await p.evaluate(()=>map.invalidateSize());
      await p.locator('[data-helper=clue] .objective-targets button').click();
      await p.waitForFunction(()=>!map._panAnim?._inProgress&&!map._animatingZoom);
      await p.locator('.objective-marker.clue').tap();
      const box=await (await overlay('.objective-popup')).boundingBox();
      assert(box&&box.x>=0&&box.x+box.width<=375,'popup clipped');
      assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflow');
      await p.screenshot({path:'artifacts/browser/clue-polish-mobile.png'});
    });
    assert(errors.length===0,'page errors: '+errors.join('; '));
    return {passed,failures,errors};
  } finally {await context.close();}
}
