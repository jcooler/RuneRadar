// Browser regression function accepting a Playwright page connected to the local map server.
async (page) => {
  const failures = [], passed = [];
  const check = async (name, action) => {
    try { await action(); passed.push(name); }
    catch (error) { failures.push(name + ': ' + error.message); }
  };
  const assert = (value, message) => { if (!value) throw new Error(message); };
  await page.goto('http://127.0.0.1:8000/');
  await page.evaluate(() => localStorage.removeItem('runeradar-follow'));
  await page.goto('http://127.0.0.1:8000/');
  await page.waitForSelector('#settingsFollow', {state: 'attached'});
  const settle = async () => {
    // Leaflet starts zoom transitions on the next animation frame.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.waitForFunction(() => !map._panAnim?._inProgress && !map._animatingZoom);
  };
  const position = async (x, y, plane = 0, account) => {
    await page.evaluate(data => { connectionState = 'connected'; updatePosition(data.x, data.y, data); }, {x, y, plane, account});
    await settle();
  };
  const center = () => page.evaluate(() => ({x: map.getCenter().lng, y: map.getCenter().lat, plane: currentPlane}));
  const near = (a, b) => Math.abs(a.x - b.x) <= 0.5 && Math.abs(a.y - b.y) <= 0.5 && a.plane === b.plane;
  await position(3222, 3218);
  await check('search keeps destination while marker moves', async () => {
    await page.locator('#search-input').fill('Varrock');
    await page.locator('.search-result').first().click();
    await settle();
    const before = await center();
    await position(3223, 3219);
    assert(near(before, await center()), 'player update snapped the map back');
    assert(await page.evaluate(() => playerMarker.getLatLng().lng === 3223), 'marker stopped updating');
  });
  await check('follow control recenters and follows subsequent movement', async () => {
    await page.getByRole('button', {name: 'Follow my location', exact: true}).click({timeout: 1500});
    await settle();
    assert(near(await center(), {x:3223,y:3219,plane:0}), 'did not recenter');
    await position(3224, 3220);
    assert(near(await center(), {x:3224,y:3220,plane:0}), 'did not continue following');
    assert(await page.locator('#locate-btn').getAttribute('aria-pressed') === 'true', 'following state missing');
  });
  await check('drag pauses follow across floor changes and temporary loss', async () => {
    const box = await page.locator('#map').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 170, box.y + box.height / 2 + 80, {steps:12});
    await page.mouse.up();
    await settle();
    const before = await center();
    await position(3250, 3230, 1);
    assert(near(before, await center()), 'movement or floor changed browsing viewport');
    assert(await page.evaluate(() => !map.hasLayer(playerMarker)), 'marker shown on wrong floor');
    await page.evaluate(() => clearPersonalPosition());
    await position(3251, 3231, 1);
    assert(near(before, await center()), 'recreated marker stole focus');
    await page.locator('#locate-btn').click(); await settle();
    assert(near(await center(), {x:3251,y:3231,plane:1}), 'follow did not restore player floor');
  });
  await check('zoom pauses follow', async () => {
    await page.locator('.leaflet-control-zoom-out').click();
    await settle();
    const before = await center();
    await position(3255, 3235, 1);
    assert(near(before, await center()), 'zoom did not pause following');
  });
  await check('raid search has three named entrances', async () => {
    await page.locator('#search-input').fill('raid');
    const names = await page.locator('.search-result .sr-name').allTextContents();
    assert(JSON.stringify(names.sort()) === JSON.stringify(['Chambers of Xeric','Theatre of Blood','Tombs of Amascut']), JSON.stringify(names));
    assert((await page.locator('.search-result .sr-type').allTextContents()).every(t => t.includes('Raid entrance')), 'raid type missing');
    for (const query of ['Chambers of Xeric','Theatre of Blood','Tombs of Amascut','cox','tob','toa']) {
      await page.locator('#search-input').fill(query);
      assert(await page.locator('.search-result').count() === 1, query + ' should resolve to one destination');
    }
  });
  await check('account details show by default and clear when unavailable', async () => {
    await position(3222,3218,0,{name:'Test <Player>',world:301,hitpoints:87,prayer:63,runEnergy:42});
    assert(await page.locator('#p-name').textContent() === 'Test <Player>', 'name not rendered as text');
    const panel = await page.locator('#player-info').textContent();
    assert(['301','87','63','42%'].every(value => panel.includes(value)), 'missing world or stats: '+panel);
    await page.evaluate(() => clearPersonalPosition());
    assert(await page.locator('#player-info').isHidden(), 'old account panel retained');
    assert(!(await page.locator('#player-info').textContent()).includes('Test <Player>'), 'old name retained');
    await position(3222,3218);
    assert(await page.locator('#p-name').textContent() === 'Your location', 'old client fallback missing');
  });
  if (failures.length) throw new Error(JSON.stringify({passed, failures}));
  return {passed};
}
