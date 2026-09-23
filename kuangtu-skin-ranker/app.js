(() => {
  'use strict';
  const TIERS = [
    { id: 'hang', label: '夯', color: '#ff665d' },
    { id: 'top', label: '顶级', color: '#ffb951' },
    { id: 'great', label: '人上人', color: '#f1e86e' },
    { id: 'npc', label: 'NPC', color: '#dedac1' },
    { id: 'last', label: '拉完了', color: '#aab5c8' },
  ];
  const ZONES = [...TIERS.map(t => t.id), 'pool'];
  const STORAGE = 'vandal-tier-list-v1';
  const $ = id => document.getElementById(id);
  let catalog = [];
  let byId = new Map();
  let zones = Object.fromEntries(ZONES.map(z => [z, []]));
  let selectedId = null;
  let pointer = null;
  let ghost = null;
  let target = null;
  let scrollFrame = null;

  function reconcile() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(STORAGE)); } catch (_) { /* corrupted local data */ }
    const seen = new Set();
    if (saved && typeof saved === 'object') {
      for (const zone of ZONES) {
        if (!Array.isArray(saved[zone])) continue;
        for (const id of saved[zone]) {
          if (typeof id === 'string' && byId.has(id) && !seen.has(id)) {
            zones[zone].push(id);
            seen.add(id);
          }
        }
      }
    }
    for (const skin of catalog) if (!seen.has(skin.id)) zones.pool.push(skin.id);
  }

  function save() {
    try { localStorage.setItem(STORAGE, JSON.stringify(zones)); } catch (_) { /* browser storage unavailable */ }
  }

  function makeCard(skin) {
    const card = document.createElement('div');
    card.className = 'skin-card' + (skin.image ? '' : ' no-image');
    card.dataset.id = skin.id;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `${skin.name} 狂徒，按回车选择等级，也可以拖动`);
    if (skin.image) {
      const img = document.createElement('img');
      img.src = skin.image;
      img.alt = '';
      img.loading = 'lazy';
      img.draggable = false;
      card.append(img);
    } else {
      const fallback = document.createElement('div');
      fallback.className = 'card-image';
      fallback.textContent = 'VANDAL';
      card.append(fallback);
    }
    const name = document.createElement('div');
    name.className = 'card-name';
    name.textContent = skin.name;
    card.append(name);
    card.addEventListener('pointerdown', beginPointer);
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(skin.id); }
    });
    return card;
  }

  function render() {
    const query = $('search').value.trim().toLocaleLowerCase();
    for (const zone of ZONES) {
      const container = zone === 'pool' ? $('pool') : document.querySelector(`.tier-drop[data-zone="${zone}"]`);
      const ids = zone === 'pool' && query ? zones.pool.filter(id => byId.get(id).name.toLocaleLowerCase().includes(query)) : zones[zone];
      container.querySelectorAll('.skin-card').forEach(el => el.remove());
      const fragment = document.createDocumentFragment();
      ids.forEach(id => fragment.append(makeCard(byId.get(id))));
      container.append(fragment);
    }
    const ranked = catalog.length - zones.pool.length;
    $('ranked-count').textContent = ranked;
    $('skin-count').textContent = catalog.length;
    $('pool-count').textContent = `(${zones.pool.length})`;
    $('no-results').hidden = !query || !!$('pool').querySelector('.skin-card');
  }

  function move(id, to, beforeId = null) {
    if (!byId.has(id) || !ZONES.includes(to)) return;
    for (const zone of ZONES) zones[zone] = zones[zone].filter(x => x !== id);
    let index = beforeId ? zones[to].indexOf(beforeId) : -1;
    if (index < 0) index = zones[to].length;
    zones[to].splice(index, 0, id);
    save();
    render();
  }

  function choose(id) {
    const skin = byId.get(id);
    if (!skin) return;
    selectedId = id;
    const chosen = $('chosen-skin');
    chosen.replaceChildren();
    if (skin.image) {
      const img = document.createElement('img');
      img.src = skin.image;
      img.alt = '';
      chosen.append(img);
    }
    const name = document.createElement('span');
    name.textContent = `${skin.name} 狂徒`;
    chosen.append(name);
    $('choose-dialog').showModal();
  }

  function setupChoices() {
    const wrap = $('tier-choices');
    for (const tier of [...TIERS, { id: 'pool', label: '移回待排行', color: '#9ca6b7' }]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.zone = tier.id;
      const chip = document.createElement('span');
      chip.className = 'choice-chip';
      chip.style.background = tier.color;
      button.append(chip, document.createTextNode(tier.label));
      button.addEventListener('click', () => {
        if (selectedId) move(selectedId, tier.id);
        $('choose-dialog').close();
      });
      wrap.append(button);
    }
  }

  function registerAgentTools() {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const register = spec => {
      try { Promise.resolve(context.registerTool(spec)).catch(() => {}); } catch (_) { /* unsupported browser */ }
    };
    register({
      name: 'get_vandal_tier_list',
      title: '读取狂徒皮肤排行',
      description: '读取当前浏览器里的狂徒皮肤等级和各等级内的顺序。',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: () => ({ tiers: TIERS.map(t => ({ tier: t.label, skins: zones[t.id].map(id => ({ id, name: byId.get(id).name })) })), unrankedCount: zones.pool.length })
    });
    register({
      name: 'place_vandal_skin',
      title: '为狂徒皮肤定级',
      description: '通过皮肤 UUID 将一款狂徒皮肤放到指定等级末尾，或移回待排行。',
      inputSchema: { type: 'object', properties: { skinId: { type: 'string' }, tier: { type: 'string', enum: ZONES } }, required: ['skinId', 'tier'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: input => {
        if (!input || !byId.has(input.skinId) || !ZONES.includes(input.tier)) throw new Error('皮肤或等级无效');
        move(input.skinId, input.tier);
        return { skin: byId.get(input.skinId).name, tier: TIERS.find(t => t.id === input.tier)?.label || '待排行', saved: true };
      }
    });
  }

  function beginPointer(e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const card = e.currentTarget;
    pointer = { id: card.dataset.id, el: card, startX: e.clientX, startY: e.clientY, offsetX: e.clientX - card.getBoundingClientRect().left, offsetY: e.clientY - card.getBoundingClientRect().top, dragging: false, pointerId: e.pointerId };
    card.setPointerCapture(e.pointerId);
    card.addEventListener('pointermove', pointerMove);
    card.addEventListener('pointerup', pointerUp, { once: true });
    card.addEventListener('pointercancel', pointerCancel, { once: true });
  }

  function pointerMove(e) {
    if (!pointer || e.pointerId !== pointer.pointerId) return;
    const distance = Math.hypot(e.clientX - pointer.startX, e.clientY - pointer.startY);
    if (!pointer.dragging && distance < 7) return;
    if (!pointer.dragging) {
      pointer.dragging = true;
      ghost = pointer.el.cloneNode(true);
      ghost.classList.add('drag-ghost');
      ghost.style.width = `${pointer.el.offsetWidth}px`;
      ghost.style.height = `${pointer.el.offsetHeight}px`;
      document.body.append(ghost);
      pointer.el.classList.add('drag-source');
      scrollFrame = requestAnimationFrame(autoScroll);
    }
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    ghost.style.left = `${e.clientX - pointer.offsetX}px`;
    ghost.style.top = `${e.clientY - pointer.offsetY}px`;
    updateTarget(e.clientX, e.clientY);
  }

  function updateTarget(x, y) {
    const underneath = document.elementFromPoint(x, y);
    const area = underneath?.closest('.tier-drop') || underneath?.closest('.tier-row')?.querySelector('.tier-drop');
    if (target && target !== area) target.classList.remove('is-target');
    target = area;
    if (target) target.classList.add('is-target');
  }

  function autoScroll() {
    if (!pointer?.dragging) return;
    const edge = 80;
    let speed = 0;
    if (pointer.y < edge) speed = -Math.min(18, (edge - pointer.y) / 4);
    if (pointer.y > innerHeight - edge) speed = Math.min(18, (pointer.y - innerHeight + edge) / 4);
    if (speed) {
      window.scrollBy(0, speed);
      updateTarget(pointer.x, pointer.y);
    }
    scrollFrame = requestAnimationFrame(autoScroll);
  }

  function pointerUp(e) {
    if (!pointer || e.pointerId !== pointer.pointerId) return;
    const wasDragging = pointer.dragging;
    const id = pointer.id;
    const area = target;
    let beforeId = null;
    if (area) {
      const beneath = document.elementFromPoint(e.clientX, e.clientY);
      const other = beneath?.closest('.skin-card');
      if (other && other.dataset.id !== id && area.contains(other)) {
        const rect = other.getBoundingClientRect();
        if (e.clientX < rect.left + rect.width / 2) beforeId = other.dataset.id;
        else {
          const cards = [...area.querySelectorAll('.skin-card')].filter(c => c.dataset.id !== id);
          const next = cards[cards.indexOf(other) + 1];
          beforeId = next?.dataset.id || null;
        }
      }
    }
    cleanupPointer();
    if (wasDragging && area) move(id, area.dataset.zone, beforeId);
    else if (!wasDragging) choose(id);
  }

  function pointerCancel() { cleanupPointer(); }
  function cleanupPointer() {
    if (!pointer) return;
    pointer.el.classList.remove('drag-source');
    pointer.el.removeEventListener('pointermove', pointerMove);
    if (pointer.el.hasPointerCapture(pointer.pointerId)) pointer.el.releasePointerCapture(pointer.pointerId);
    if (target) target.classList.remove('is-target');
    if (ghost) ghost.remove();
    if (scrollFrame) cancelAnimationFrame(scrollFrame);
    scrollFrame = null;
    ghost = target = pointer = null;
  }

  async function init() {
    setupChoices();
    $('search').addEventListener('input', render);
    $('reset').addEventListener('click', () => {
      if (!confirm('确定清空你的排行，把全部皮肤移回待排行吗？')) return;
      zones = Object.fromEntries(ZONES.map(z => [z, []]));
      zones.pool = catalog.map(s => s.id);
      save(); render();
    });
    try {
      const response = await fetch('skins.json');
      if (!response.ok) throw new Error('catalog request failed');
      catalog = await response.json();
      byId = new Map(catalog.map(s => [s.id, s]));
      reconcile();
      render();
      registerAgentTools();
      setTimeout(() => $('loading').classList.add('hidden'), 550);
    } catch (_) {
      $('loading').querySelector('p').textContent = '皮肤库加载失败，请刷新页面重试。';
      $('loading').querySelector('.loading-track').style.display = 'none';
    }
  }
  init();
})();

