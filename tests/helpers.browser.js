async (page) => {
  const context = await page.context().browser().newContext({viewport:{width:1280,height:900}});
  const p = await context.newPage(), errors = [], failures = [], passed = [];
  const assert = (ok, message) => { if(!ok) throw new Error(message); };
  const check = async (name, test) => { try { await test(); passed.push(name); } catch(e) { failures.push(name+': '+e.message); } };
  p.on('pageerror', e=>errors.push(e.message));
  const helper = (title, targets, extra={}) => ({state:'active',title,text:'Speak to the guide <img src=x onerror=alert(1)>.',targets,totalTargets:targets.length,approximate:false,...extra});
  const clues = helper('Cryptic clue',[{x:3254,y:3421,plane:0}]);
  const quest = helper('Example quest',[{x:3222,y:3218,plane:1}]);
  const update = (helpers,x=3222,y=3218,plane=0) => p.evaluate(data=>{connectionState='connected';setStatus('Connected to RuneLite','connected');updatePosition(data.x,data.y,data);},
    {x,y,plane,account:{name:'Example Player',world:613,hitpoints:87,prayer:63,runEnergy:42},helpers});
  const settle = async()=>{await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await p.waitForFunction(()=>!map._panAnim?._inProgress&&!map._animatingZoom);};
  try {
    await p.goto('http://127.0.0.1:8000/'); await p.waitForSelector('#settingsFollow',{state:'attached'});
    await check('objectives off by default',async()=>assert(await p.locator('#objectives').isHidden(),'panel visible without consent'));
    await update({clue:clues,quest}); await settle();
    await check('text is inert and floor filtering keeps player above targets',async()=>{
      assert(await p.locator('.objective-card').count()===2,'missing cards');
      assert(await p.locator('#objectives img').count()===0,'instruction parsed as HTML');
      assert(await p.locator('.objective-marker.clue').count()===1,'clue marker missing');
      assert(await p.locator('.objective-marker.quest').count()===0,'quest on wrong floor');
      assert(await p.evaluate(()=>+map.getPane('playerPane').style.zIndex > +map.getPane('objectivePane').style.zIndex),'player hidden by objectives');
    });
    await check('target navigation pauses follow and later movement does not steal focus',async()=>{
      await p.getByRole('button',{name:'Show Example quest on map, floor 1'}).click(); await settle();
      assert(await p.evaluate(()=>!followPlayer&&currentPlane===1&&!map.hasLayer(playerMarker)),'target did not change floor/pause');
      await update({clue:clues,quest},3225,3220); await settle();
      assert(await p.evaluate(()=>currentPlane===1&&Math.abs(map.getCenter().lng-3222)<.5),'movement stole focus');
      await p.getByRole('button',{name:'Follow my location',exact:true}).click(); await settle();
      assert(await p.evaluate(()=>currentPlane===0&&followPlayer&&Math.abs(map.getCenter().lng-3225)<.5),'follow did not restore player');
    });
    await check('unchanged snapshots retain collapsed state and keyboard focus',async()=>{
      const summary=p.locator('[data-helper=clue] summary');await summary.focus();await summary.press('Space');
      assert(await p.locator('[data-helper=clue]').getAttribute('open')===null,'Space did not collapse');
      await update({clue:clues,quest});await settle();
      assert(await p.locator('[data-helper=clue]').getAttribute('open')===null,'snapshot reopened panel');
      assert(await summary.evaluate(el=>el===document.activeElement),'snapshot stole keyboard focus');
      await summary.press('Space');
    });
    await check('independent opt-out and unsupported steps discard old targets',async()=>{
      await update({quest});assert(await p.locator('[data-helper=clue]').count()===0,'old clue retained');
      assert(await p.locator('.objective-marker.clue').count()===0,'old clue marker retained');
      await update({quest:helper('',[],{state:'unsupported',text:'No supported integration.'})});
      assert(await p.locator('.objective-marker').count()===0,'old quest marker retained');
    });
    await check('approximate and truncated results are labeled',async()=>{
      await update({clue:helper('Hot / cold clue',clues.targets,{approximate:true,totalTargets:80})});
      assert((await p.locator('#objectives').innerText()).includes('Showing 1 of 80'),'truncation not disclosed');
      assert((await p.locator('#objectives').innerText()).includes('not exact dig tiles'),'area marker implies exact point');
    });
    await check('desktop and narrow layouts fit and remain usable',async()=>{
      await update({clue:clues,quest});
      for(const width of [1280,768,375,320]) {
        await p.setViewportSize({width,height:900});await settle();
        assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow '+width);
        const box=await p.locator('#objectives').boundingBox(),search=await p.locator('#search-container').boundingBox(),player=await p.locator('#player-info').boundingBox();
        assert(box.x>=0&&box.x+box.width<=width&&box.y>=search.y+search.height,'objective panel collision '+width);
        assert(box.y+box.height<=player.y,'objective panel covers player info '+width);
        await p.screenshot({path:'artifacts/browser/helpers-'+width+'.png'});
      }
    });
    await check('connection clearing erases objectives without persistence',async()=>{
      await p.evaluate(()=>clearPersonalPosition());
      assert(await p.locator('#objectives').isHidden(),'panel retained');
      assert(await p.locator('.objective-marker').count()===0,'markers retained');
      assert(await p.evaluate(()=>![...Object.values(localStorage),...Object.values(sessionStorage)].some(v=>v.includes('Example quest')||v.includes('Speak to the guide'))),'objectives persisted');
    });
    assert(errors.length===0,'page errors: '+errors.join('; '));
    return {passed,failures,errors};
  } finally { await context.close(); }
}
