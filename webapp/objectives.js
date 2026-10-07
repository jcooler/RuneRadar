/* Live objectives stay in tab memory. Consent is owned by the RuneLite settings. */
window.RuneRadarObjectives = {
  create({map, container, getPlane, showTarget}) {
    map.createPane('objectivePane');
    map.getPane('objectivePane').style.zIndex = '620';
    const layer = L.layerGroup().addTo(map);
    const entries = new Map();
    let current = null, signature = '';
    const names = {clue: 'Clue assistance', quest: 'Quest assistance'};
    const element = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    };
    function renderMarkers() {
      layer.clearLayers();
      for (const kind of ['clue', 'quest']) {
        const objective = current?.[kind];
        if (!objective || objective.state !== 'active') continue;
        objective.targets.forEach((point, index) => {
          if (point.plane !== getPlane()) return;
          const label = `${kind === 'clue' ? 'Clue' : 'Quest'} ${objective.approximate ? 'search area' : 'target'} ${index + 1}`;
          const marker = L.marker([point.y, point.x], {pane: 'objectivePane',
            title: label, alt: label, icon: L.divIcon({className: `objective-marker ${kind}${objective.approximate ? ' approximate' : ''}`,
              html: kind === 'clue' ? 'C' : 'Q', iconSize: [24, 24], iconAnchor: [12, 12]})});
          marker.bindTooltip(element('span', '', label));
          marker.on('click', () => showTarget(point));
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
      body.append(element('p', 'objective-instruction', objective.text));
      if (objective.state === 'active') {
        if (!objective.targets.length) body.append(element('p', 'objective-note', 'No supported map target for this step.'));
        if (objective.approximate) body.append(element('p', 'objective-note', 'Markers show possible areas, not exact dig tiles.'));
        if (objective.totalTargets > objective.targets.length) body.append(element('p', 'objective-note',
          `Showing ${objective.targets.length} of ${objective.totalTargets} possible locations. Narrow the search in game to see the remaining locations.`));
        const targets = element('div', 'objective-targets');
        objective.targets.forEach((point, index) => {
          const button = element('button', '', `${objective.approximate ? 'Area' : 'Target'} ${index + 1} · ${point.plane === 0 ? 'Ground' : 'Floor ' + point.plane}`);
          button.type = 'button';
          button.setAttribute('aria-label', `Show ${kind} ${objective.approximate ? 'area' : 'target'} ${index + 1} on map`);
          button.addEventListener('click', () => showTarget(point));
          targets.append(button);
        });
        body.append(targets);
      }
      card.append(body);
      if (entry) entry.node.replaceWith(card); else container.append(card);
      entries.set(kind, {node: card, signature: serialized});
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
      refreshPlane: renderMarkers,
      clear() { this.update(null); }
    };
  }
};
