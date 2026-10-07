async(page)=>{
const context=await page.context().browser().newContext({viewport:{width:1280,height:800}});
const p=await context.newPage(); const cdp=await context.newCDPSession(p);
await cdp.send('Performance.enable');await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
let bytes=0,requests=0,tiles=0,errors=0;cdp.on('Network.loadingFinished',e=>bytes+=e.encodedDataLength);cdp.on('Network.requestWillBeSent',e=>{requests++;if(e.request.url.includes('/tiles/'))tiles++;});cdp.on('Network.responseReceived',e=>{if(e.response.status>=400)errors++;});
await p.addInitScript(()=>{window.longTasks=[];new PerformanceObserver(l=>window.longTasks.push(...l.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});});
const start=Date.now(); await p.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});
await p.waitForSelector('#settingsFollow',{state:'attached',timeout:20000});const ready=Date.now()-start;
await p.evaluate(()=>{connectionState='connected';updatePosition(3496,3488,{x:3496,y:3488,plane:0,account:{name:'Map preview',world:613,hitpoints:99,prayer:77,runEnergy:82}});});
await p.waitForTimeout(3000);
const perf=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
const ui=await p.evaluate(()=>({zoom:map.getZoom(),nodes:document.querySelectorAll('*').length,images:document.images.length,longTasks:window.longTasks,resources:performance.getEntriesByType('resource').length,paint:performance.getEntriesByType('paint').map(e=>({name:e.name,ms:e.startTime}))}));
await context.close();return {readyMs:ready,bytes,requests,tiles,httpErrors:errors,taskSeconds:perf.TaskDuration,scriptSeconds:perf.ScriptDuration,jsHeapMB:perf.JSHeapUsedSize/1048576,...ui};}
