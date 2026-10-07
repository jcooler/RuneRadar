/* Live objectives stay in tab memory. Consent is owned by the RuneLite settings. */
window.RuneRadarObjectives = {
  create({map, container, getPlane, showTarget}) {
    map.createPane('objectivePane');
    map.getPane('objectivePane').style.zIndex = '620';
    const layer = L.layerGroup().addTo(map);
    const entries = new Map();
    let current = null, signature = '';
    const names = {clue: 'Clue assistance', quest: 'Quest assistance'};
    // Fixed local artwork. Helper text is always rendered through textContent.
    const clueSymbol = '<svg viewBox="0 0 28 28" aria-hidden="true" focusable="false"><path d="M7 5h15c-3 0-3 4-3 4v12H6V9H4V7c0-2 3-2 3-2Z" fill="#f1d8a1" stroke="#614421" stroke-width="1.5"/><path d="M7 5c-3 0-3 4 0 4h12m3-4c3 0 3 4 0 4h-3M6 21c0 4 4 4 4 0h12c0 4-4 4-6 4H9" fill="#c69a56" stroke="#614421" stroke-width="1.5" stroke-linejoin="round"/><path d="M9 12h7m-7 3h5m0 3 3 3m0-3-3 3" fill="none" stroke="#805d30" stroke-width="1.5" stroke-linecap="round"/></svg>';
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
          if (point.plane !== getPlane()) return;
          const label = `${names[kind]}: ${targetName(kind, objective, point, index)}`;
          const marker = L.marker([point.y, point.x], {pane:'objectivePane', alt:label, keyboard:true,
            icon:L.divIcon({className:`objective-marker ${kind}${objective.approximate ? ' approximate' : ''}`,
              html:kind === 'clue' ? clueSymbol : questSymbol, iconSize:[34,34], iconAnchor:[17,17]})});
          marker.bindTooltip(targetContext(kind, objective, point, index), {className:'objective-tooltip',direction:'top',offset:[0,-18]});
          marker.bindPopup(targetContext(kind, objective, point, index), {className:'objective-popup',minWidth:240,maxWidth:260,autoPan:false});
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
          button.setAttribute('aria-label', `Show ${targetName(kind, objective, point, index)} on map${point.plane > 0 ? ', floor ' + point.plane : ''}`);
          if (point.plane > 0) button.append(element('span', 'objective-floor', 'Floor ' + point.plane));
          button.addEventListener('click', () => showTarget(point));
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
