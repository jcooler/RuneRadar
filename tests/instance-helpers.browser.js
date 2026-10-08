async (page) => {
  const context=await page.context().browser().newContext({viewport:{width:1280,height:900},hasTouch:true});
  const p=await context.newPage(),passed=[],failures=[],errors=[];
  p.setDefaultTimeout(4000);
  p.on('pageerror',e=>errors.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const assert=(ok,message)=>{if(!ok)throw new Error(message);};
  const check=async(name,test)=>{try{await test();passed.push(name);}catch(e){failures.push(name+': '+e.message);await p.screenshot({path:'artifacts/browser/instance-failure-'+failures.length+'.png'});}};
  await p.addInitScript(()=>{
    let sequence=0;
    window.WebSocket=class {
      constructor(){window.testSocket=this;this.readyState=1;setTimeout(()=>this.onopen(),0);}
      send(message){if(JSON.parse(message).type==='authenticate')this.onmessage({data:JSON.stringify({type:'authenticated',version:1,credential:'b'.repeat(43)})});this.authenticated=true;}
      close(){this.readyState=3;}
    };
    window.sendMapSnapshot=data=>window.testSocket.onmessage({data:JSON.stringify({type:'snapshot',version:1,session:'test-session',sequence:++sequence,timestamp:1000,...data})});
  });
  const account={name:'Map preview',world:613,hitpoints:99,prayer:70,runEnergy:85};
  const helper=(title,x,y)=>({state:'active',title,text:'Speak to the guide at the marked location.',targets:[{x,y,plane:0}],totalTargets:1,approximate:false});
  const helpers={clue:helper('Cryptic clue',3013,3209),quest:helper('Quest step',3025,3214)};
  const send=async(availability,extra={})=>{await p.evaluate(data=>window.sendMapSnapshot(data),{availability,...extra});await p.waitForFunction(()=>!map._panAnim?._inProgress&&!map._animatingZoom);};
  const outside=()=>send('available',{position:{x:3016,y:3232,plane:0},account,helpers});
  const inside=(extra={})=>send('instanced',{account,helpers,...extra});
  try {
    await p.goto('http://127.0.0.1:8000/#pair='+'a'.repeat(43)+'&port=37780');
    await p.waitForSelector('#settingsFollow',{state:'attached'});
    await outside();
    await check('entering an instance preserves helper destinations and removes only the player position',async()=>{
      const center=await p.evaluate(()=>map.getCenter());await inside();
      assert(await p.locator('.objective-card').count()===2,'helper cards disappeared');
      assert(await p.locator('.objective-marker').count()===2,'helper markers disappeared');
      assert(await p.evaluate(()=>!playerMarker&&!playerLabelMarker&&playerPlane===null),'old player position remained');
      assert(await p.evaluate(center=>map.getCenter().equals(center),center),'instance moved the map');
      assert(await p.locator('#status').innerText()==='Connected · Position unavailable','instance status unclear');
      assert(await p.locator('#p-world').innerText()==='W613 · Instanced area','stale outside region shown');
      assert(await p.locator('#p-coords').innerText()==='Position unavailable','stale coordinates shown');
      assert(await p.locator('#p-name').innerText()==='Map preview','account details missing');
      assert(await p.locator('#locate-btn').isHidden(),'locate action offered without a position');
    });
    await check('following resumes after leaving if the map was not browsed',async()=>{
      await send('available',{position:{x:3020,y:3240,plane:0},account,helpers});
      assert(await p.evaluate(()=>followPlayer&&Math.abs(map.getCenter().lng-3020)<.5&&map.hasLayer(playerMarker)),'follow did not resume');
      assert(await p.locator('#locate-btn').isVisible(),'locate did not return');
    });
    await check('Show on map works inside and browsing survives the return outside',async()=>{
      await inside();await p.getByRole('button',{name:'Show Cryptic clue on map',exact:true}).click();
      await p.waitForFunction(()=>!map._panAnim?._inProgress&&!map._animatingZoom);
      assert(await p.evaluate(()=>!followPlayer&&Math.abs(map.getCenter().lng-3013)<.5),'clue navigation failed');
      await inside({account:{...account,runEnergy:100}});
      assert(await p.locator('#p-run').innerText()==='Run 100%','account stats stopped updating');
      await outside();
      assert(await p.evaluate(()=>!followPlayer&&Math.abs(map.getCenter().lng-3013)<.5),'return outside stole focus');
    });
    await check('changed steps and independent opt-out replace previous objectives inside',async()=>{
      await inside({helpers:{quest:helper('Next quest step',3030,3220)}});
      assert(await p.locator('[data-helper=clue],.objective-marker.clue').count()===0,'old clue persisted');
      assert(await p.locator('[data-helper=quest]').innerText().then(t=>t.includes('Next quest step')),'quest did not update');
      await p.getByRole('button',{name:'Show Next quest step on map',exact:true}).click();
      await p.waitForFunction(()=>!map._panAnim?._inProgress&&!map._animatingZoom);
      assert(await p.evaluate(()=>Math.abs(map.getCenter().lng-3030)<.5),'quest action used old target');
      await inside({helpers:{}});assert(await p.locator('#objectives').isHidden(),'opt-out left helper data');
    });
    await check('pairing while already inside works without a cached outside position',async()=>{
      await p.reload();await p.evaluate(()=>{location.hash='pair='+'a'.repeat(43)+'&port=37780';});
      await p.waitForFunction(()=>connectionState==='pairing');
      await p.waitForFunction(()=>window.testSocket?.authenticated);await inside();
      assert(await p.locator('.objective-card').count()===2,'instance requires previously cached objectives');
      assert(await p.evaluate(()=>!playerMarker),'invented player position');
      await p.getByRole('button',{name:'Show Cryptic clue on map',exact:true}).click();
      await p.waitForFunction(()=>!map._panAnim?._inProgress&&!map._animatingZoom);
      await p.waitForFunction(()=>Object.values(localTileLayer._tiles).every(t=>t.el.complete&&+getComputedStyle(t.el).opacity>=.95));
      await p.screenshot({path:'artifacts/browser/instance-helpers-desktop.png'});
    });
    await check('instance panels fit a narrow viewport',async()=>{
      await p.setViewportSize({width:375,height:812});await p.evaluate(()=>map.invalidateSize());
      assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow');
      const panel=await p.locator('#objectives').boundingBox(),info=await p.locator('#player-info').boundingBox();
      assert(panel.y+panel.height<=info.y,'helper cards overlap account details');
      await p.screenshot({path:'artifacts/browser/instance-helpers-mobile.png'});
    });
    await check('loading and logout clear data and fresh instance snapshots restore it',async()=>{
      for(const state of ['loading','logged_out']) {
        await send(state);
        assert(await p.locator('#objectives').isHidden(),'old helper data after '+state);
        assert(await p.locator('#player-info').isHidden(),'old account data after '+state);
        await inside();assert(await p.locator('.objective-card').count()===2,'fresh instance did not restore helpers');
      }
    });
    await check('connection loss clears instance data without saving it',async()=>{
      await p.evaluate(()=>window.testSocket.onclose({code:1006}));
      assert(await p.locator('#objectives').isHidden(),'helpers survived disconnect');
      assert(await p.locator('#player-info').isHidden(),'account survived disconnect');
      assert(await p.locator('.objective-marker').count()===0,'markers survived disconnect');
      assert(await p.evaluate(()=>![...Object.values(localStorage),...Object.values(sessionStorage)].some(v=>v.includes('Map preview')||v.includes('Cryptic clue'))),'personal details saved');
    });
    return {passed,failures,errors};
  } finally {await context.close();}
}
