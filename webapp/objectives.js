/* Live objectives stay in tab memory. Consent is owned by the RuneLite settings. */
window.RuneRadarObjectives = {
  create({map, container, getPlane, showTarget, getDisplayPlane = plane => plane}) {
    map.createPane('objectivePane');
    map.getPane('objectivePane').style.zIndex = '620';
    const layer = L.layerGroup().addTo(map);
    const entries = new Map();
    let current = null, signature = '';
    const names = {clue: 'Clue assistance', quest: 'Quest assistance'};
    // Fixed local artwork. Helper text is always rendered through textContent.
    const clueSymbol = '<img src="icons/clue/clue-scroll.png" width="36" height="32" alt="" aria-hidden="true" draggable="false">';
    const questSymbol = '<svg viewBox="0 0 28 28" aria-hidden="true" focusable="false"><path d="m7 4 17 17-3 3L4 7V4Zm14 0L4 21l3 3L24 7V4Z" fill="#dcecff" stroke="#36658c" stroke-width="1.5"/><path d="m4 17 7 7m6-20 7 7" stroke="#dba758" stroke-width="3"/></svg>';
    const element = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    };
    const targetName = (kind, objective, point, index) => {
      if (objective.approximate) return `Possible search area${objective.targets.length > 1 ? ' ' + (index + 1) : ''}`;
      return point.label || objective.title || (kind === 'clue' ? 'Clue location' : 'Quest location');
    };
    // Upstairs clues mark the building on the ground map. Keep their real floor
    // for instructions and retain underground x/y coordinates without projection.
    const displayPlane = (kind, point) => kind === 'clue' ? 0 : point.plane;
    function targetContext(kind, objective, point, index) {
      const content = element('div', 'objective-context');
      content.append(element('strong', '', targetName(kind, objective, point, index)));
      const description = point.description || objective.text;
      if (description) content.append(element('p', '', description));
      if (objective.approximate) content.append(element('p', 'objective-note', 'Possible area, not an exact dig tile.'));
      if (point.plane > 0) content.append(element('span', 'objective-floor', 'Floor ' + point.plane));
      return content;
    }
    function renderMarkers() {
      layer.clearLayers();
      for (const kind of ['clue', 'quest']) {
        const objective = current?.[kind];
        if (!objective || objective.state !== 'active') continue;
        objective.targets.forEach((point, index) => {
          if (getDisplayPlane(displayPlane(kind, point)) !== getPlane()) return;
          const label = `${names[kind]}: ${targetName(kind, objective, point, index)}`;
          const marker = L.marker([point.y, point.x], {pane:'objectivePane', alt:label, keyboard:true,
            icon:L.divIcon({className:`objective-marker ${kind}${objective.approximate ? ' approximate' : ''}`,
              html:kind === 'clue' ? clueSymbol : questSymbol,
              iconSize:kind === 'clue' ? [32,39] : [34,34],
              iconAnchor:kind === 'clue' ? [16,39] : [17,17],
              tooltipAnchor:kind === 'clue' ? [0,-20] : [0,0],
              popupAnchor:kind === 'clue' ? [0,-36] : [0,0]})});
          marker.bindTooltip(targetContext(kind, objective, point, index), {className:'objective-tooltip',direction:'top',offset:[0,-18]});
          marker.bindPopup(targetContext(kind, objective, point, index), {className:'objective-popup',minWidth:240,maxWidth:260,autoPan:false});
          marker.on('popupopen', ({popup}) => {
            const node = popup.getElement();
            node.classList.remove('below-marker');
            popup.options.offset = L.point(0, 7);
            popup.update();
            const bounds = node.getBoundingClientRect(), panel = container.getBoundingClientRect();
            const below = marker.getElement().getBoundingClientRect().bottom + 12;
            // Keep touch context clear of the objective card without moving the map.
            if (bounds.left < panel.right && bounds.right > panel.left &&
                bounds.top < panel.bottom && bounds.bottom > panel.top &&
                below + bounds.height < map.getContainer().getBoundingClientRect().bottom) {
              popup.options.offset = L.point(0, 7 + below - bounds.top);
              node.classList.add('below-marker');
              popup.update();
            }
          });
          marker.on('add', () => marker.getElement()?.setAttribute('aria-label', label));
          marker.addTo(layer);
        });
      }
    }
    function renderCard(kind, objective) {
      let entry = entries.get(kind);
      const serialized = JSON.stringify(objective);
      if (entry?.signature === serialized) return;
      const opened = entry ? entry.node.open : true;
      const card = element('details', `objective-card ${kind}`);
      card.dataset.helper = kind;
      card.open = opened;
      const summary = element('summary');
      summary.append(element('span', 'objective-kind', names[kind]));
      summary.append(element('span', 'objective-title', objective.title || (objective.state === 'idle' ? 'Waiting for an objective' : 'Setup needed')));
      card.append(summary);
      const body = element('div', 'objective-body');
      if (objective.progress) body.append(element('p', 'objective-progress', objective.progress));
      body.append(element('p', 'objective-instruction', objective.text));
      if (objective.state === 'active') {
        if (!objective.targets.length) body.append(element('p', 'objective-note', 'No supported map location for this step.'));
        if (objective.approximate) body.append(element('p', 'objective-note', 'Markers show possible areas, not exact dig tiles.'));
        if (objective.totalTargets > objective.targets.length) body.append(element('p', 'objective-note',
          `Showing ${objective.targets.length} of ${objective.totalTargets} possible locations. Narrow the search in game to see the remaining locations.`));
        const targets = element('div', 'objective-targets');
        objective.targets.forEach((point, index) => {
          const multiple = objective.targets.length > 1;
          const action = objective.approximate ? `Show search area${multiple ? ' ' + (index + 1) : ''}`
            : multiple ? `Show ${point.label || 'location ' + (index + 1)}` : 'Show on map';
          const button = element('button', '', action);
          button.type = 'button';
          button.setAttribute('aria-label', `Show ${targetName(kind, objective, point, index)} on map${kind === 'quest' && point.plane > 0 ? ', floor ' + point.plane : ''}`);
          if (kind === 'quest' && point.plane > 0) button.append(element('span', 'objective-floor', 'Floor ' + point.plane));
          button.addEventListener('click', () => showTarget(point, displayPlane(kind, point)));
          targets.append(button);
        });
        body.append(targets);
      }
      card.append(body);
      if (entry) entry.node.replaceWith(card); else container.append(card);
      entries.set(kind, {node:card, signature:serialized});
    }
    return {
      update(helpers) {
        current = helpers || null;
        const next = JSON.stringify(current);
        if (next === signature) return;
        signature = next;
        for (const kind of ['clue', 'quest']) {
          const objective = current?.[kind];
          if (objective) renderCard(kind, objective);
          else { entries.get(kind)?.node.remove(); entries.delete(kind); }
        }
        container.hidden = entries.size === 0;
        renderMarkers();
      },
      refreshPlane:renderMarkers,
      clear() { this.update(null); }
    };
  }
};
