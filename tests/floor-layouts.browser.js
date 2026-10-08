async (page) => {
  const context=await page.context().browser().newContext({viewport:{width:1280,height:900},hasTouch:true});
  let p=await context.newPage(),touchContext;
  const passed=[],failures=[],errors=[];
  p.setDefaultTimeout(4000);p.on('pageerror',e=>errors.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const assert=(ok,message)=>{if(!ok)throw new Error(message);};
  const check=async(name,test)=>{try{await test();passed.push(name);}catch(e){failures.push(name+': '+e.message);await p.screenshot({path:'artifacts/browser/floor-layout-failure-'+failures.length+'.png'});}};
  const settle=()=>p.waitForFunction(()=>!map._panAnim?._inProgress&&!map._animatingZoom);
  const helpers={quest:{state:'active',title:'Upstairs quest',text:'Speak to the guide upstairs.',targets:[{x:3013,y:3209,plane:1}],totalTargets:1,approximate:false}};
  const position=async(plane,x=3016,y=3220)=>{
    await p.evaluate(data=>{connectionState='connected';setStatus('Connected to RuneLite','connected');updatePosition(data.x,data.y,data);},
      {x,y,plane,account:{name:'Map preview',world:613,hitpoints:99,prayer:70,runEnergy:85},helpers});await settle();
  };
  const toggle=async enabled=>{
    const cb=p.locator('#settingsFloorLayouts');assert(await cb.count()===1,'missing optional floor-layout setting');
    if (!(await p.locator('.leaflet-control-layers').getAttribute('class')).includes('expanded')) {
      const box=await p.locator('.leaflet-control-layers-toggle').boundingBox();
      if(p.viewportSize().width<600)await p.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
      else await p.mouse.move(box.x+box.width/2,box.y+box.height/2);
    }
    await cb.scrollIntoViewIfNeeded();
    if(p.viewportSize().width<600){if(await cb.isChecked()!==enabled)await cb.tap();}
    else await cb.setChecked(enabled);
    assert(await p.evaluate(()=>{
      const bounds=document.querySelector('.leaflet-control-layers').getBoundingClientRect();
      return bounds.left>=0&&bounds.right<=innerWidth;
    }),'settings panel extends beyond the viewport');
    await p.screenshot({path:'artifacts/browser/floor-settings-'+p.viewportSize().width+'.png'});
    if(p.viewportSize().width<600)await p.touchscreen.tap(30,550);
    else await p.mouse.move(30,500);
    await settle();
  };
  try {
    await p.goto('http://127.0.0.1:8000/');await p.waitForSelector('#settingsFollow',{state:'attached'});
    await check('upstairs player stays on the ground map by default with an honest floor label',async()=>{
      await position(1);
      assert(await p.evaluate(()=>currentPlane===0&&playerPlane===1&&map.hasLayer(playerMarker)),'upstairs forced sparse tiles or hid player');
      assert((await p.locator('.player-label').innerText()).includes('Upstairs'),'projected player lacks upstairs label');
      assert((await p.locator('#p-coords').innerText()).includes('1st Floor'),'account panel lost real floor');
      assert(await p.locator('.objective-marker.quest').count()===1,'upstairs quest hidden on ground map');
      await p.waitForFunction(()=>Object.values(localTileLayer._tiles).every(t=>t.el.complete&&+getComputedStyle(t.el).opacity>=.95));
      await p.screenshot({path:'artifacts/browser/floor-layout-default.png'});
    });
    await check('climbing multiple storeys keeps the map readable and descending removes the label',async()=>{
      await position(2);assert(await p.evaluate(()=>currentPlane===0&&map.hasLayer(playerMarker)),'second floor changed map');
      assert((await p.locator('.player-label').innerText()).includes('Upstairs'),'upper-floor label disappeared');
      await position(0);assert(!(await p.locator('.player-label').innerText()).includes('Upstairs'),'upstairs label remained on ground');
    });
    await check('quest navigation uses ground geography and does not pull the map back',async()=>{
      await p.getByRole('button',{name:'Show Upstairs quest on map, floor 1'}).click();await settle();
      await position(1);
      assert(await p.evaluate(()=>!followPlayer&&currentPlane===0&&Math.abs(map.getCenter().lng-3013)<.5),'quest browse view changed');
      assert(await p.evaluate(()=>map.hasLayer(playerMarker)),'upstairs player was hidden in ground view');
    });
    await check('floor details opt-in immediately restores selected floor and precise marker filtering',async()=>{
      const center=await p.evaluate(()=>map.getCenter());await toggle(true);
      assert(await p.evaluate(()=>currentPlane===1&&map.hasLayer(playerMarker)),'selected quest floor was forgotten');
      assert(await p.evaluate(center=>map.getCenter().equals(center),center),'setting moved map');
      assert(!(await p.locator('.player-label').innerText()).includes('Upstairs'),'ground projection label remained in detailed view');
      await position(2);assert(await p.evaluate(()=>currentPlane===1&&!map.hasLayer(playerMarker)),'detailed view showed player on wrong floor');
      await p.getByRole('button',{name:'Follow my location',exact:true}).click();await settle();
      assert(await p.evaluate(()=>currentPlane===2&&map.hasLayer(playerMarker)),'follow ignored selected detailed mode');
      assert(await p.locator('.objective-marker.quest').count()===0,'quest appeared on wrong detailed floor');
      await toggle(false);
      assert(await p.evaluate(()=>currentPlane===0&&map.hasLayer(playerMarker)),'turning off details did not restore ground view');
      assert(await p.locator('.objective-marker.quest').count()===1,'quest did not return to ground view');
    });
    await check('floor preference survives reload and remains off until explicitly enabled',async()=>{
      await toggle(true);await p.reload();await p.waitForSelector('#settingsFloorLayouts',{state:'attached'});
      assert(await p.locator('#settingsFloorLayouts').isChecked(),'preference did not persist');await position(1);
      assert(await p.evaluate(()=>currentPlane===1),'saved detailed preference ignored');await toggle(false);
      await p.reload();await p.waitForSelector('#settingsFloorLayouts',{state:'attached'});await position(1);
      assert(await p.evaluate(()=>currentPlane===0),'saved ground preference ignored');
    });
    await check('underground coordinate areas remain underground in either mode',async()=>{
      await p.evaluate(()=>setFollowing(true));await position(0,3200,9600);
      assert(await p.evaluate(()=>Math.abs(map.getCenter().lat-9600)<.5&&map.hasLayer(playerMarker)),'ground mode projected a dungeon onto an unrelated surface location');
      await toggle(true);assert(await p.evaluate(()=>Math.abs(map.getCenter().lat-9600)<.5),'floor details moved dungeon coordinates');await toggle(false);
    });
    await check('settings toggle remains usable on a narrow screen',async()=>{
      touchContext=await page.context().browser().newContext({viewport:{width:375,height:812},hasTouch:true,isMobile:true});
      p=await touchContext.newPage();p.setDefaultTimeout(4000);
      p.on('pageerror',e=>errors.push(e.message));
      p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
      await p.goto('http://127.0.0.1:8000/');await p.waitForSelector('#settingsFloorLayouts',{state:'attached'});await position(1);
      await toggle(true);await toggle(false);
      assert(await p.evaluate(()=>currentPlane===0&&map.hasLayer(playerMarker)),'mobile toggle failed');
      assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow');
      await p.locator('[data-helper=quest] summary').click();
      await p.waitForFunction(()=>Object.values(localTileLayer._tiles).every(t=>t.el.complete&&+getComputedStyle(t.el).opacity>=.95));
      await p.screenshot({path:'artifacts/browser/floor-layout-mobile.png'});
    });
    return {passed,failures,errors};
  } finally {if(touchContext)await touchContext.close();await context.close();}
}
