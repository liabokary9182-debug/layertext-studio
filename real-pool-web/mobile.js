(() => {
  const root = document.getElementById('mobile-pool-preview');
  const button = document.getElementById('landscapeBtn');
  let landscape = false;
  function syncLayout() {
    const height = Math.max(1, root.clientWidth || root.getBoundingClientRect().width);
    if(height>700)landscape=false;
    const width = Math.max(640, Math.min(960, height * 1.85));
    root.style.setProperty('--landscape-height', `${height}px`);
    root.style.setProperty('--landscape-width', `${width}px`);
    root.style.setProperty('--landscape-table-width', `${Math.max(1, height - 138) * 1400 / 790}px`);
    root.classList.toggle('is-landscape', landscape);
    root.style.setProperty('--preview-header-height', `${document.getElementById('previewTopbar').offsetHeight || 124}px`);
    button.textContent = landscape ? '竖屏 ↶' : '横屏 ↷';
    button.setAttribute('aria-pressed', String(landscape));
    button.setAttribute('aria-label', landscape ? '返回竖屏显示' : '切换横屏显示');
  }
  button.addEventListener('click', () => { landscape = !landscape; syncLayout(); });
  window.addEventListener('resize', syncLayout);
  if (typeof ResizeObserver !== 'undefined') {
    let lastWidth = -1;
    new ResizeObserver(() => {
      const width = root.clientWidth;
      if (width !== lastWidth) { lastWidth = width; syncLayout(); }
    }).observe(root);
  }
  syncLayout();
})();

(() => {
  const root = document.getElementById('mobile-pool-preview');
  const button = document.getElementById('fullBtn');
  const feedback = document.getElementById('fullscreenFeedback');
  let busy = false;
  function active() {
    return document.fullscreenElement === root || document.webkitFullscreenElement === root;
  }
  function sync() {
    const entered = active();
    root.classList.toggle('is-fullscreen', entered);
    button.textContent = entered ? '退出全屏' : '全屏 ⛶';
    button.setAttribute('aria-pressed', String(entered));
    button.setAttribute('aria-label', entered ? '退出全屏预览' : '全屏预览游戏');
    if (entered) { feedback.hidden = true; feedback.textContent = ''; }
    window.dispatchEvent(new Event('resize'));
  }
  async function toggle() {
    if (busy) return;
    busy = true;
    button.disabled = true;
    feedback.hidden = true;
    try {
      if (active()) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (!exit) throw new Error('Fullscreen unavailable');
        await exit.call(document);
      } else {
        const enter = root.requestFullscreen || root.webkitRequestFullscreen;
        if (!enter) throw new Error('Fullscreen unavailable');
        await enter.call(root);
      }
      sync();
    } catch {
      feedback.textContent = '当前预览环境不允许系统全屏，可使用预览的展开功能。';
      feedback.hidden = false;
    } finally {
      busy = false;
      button.disabled = false;
    }
  }
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
  window.PoolPreviewFullscreen = { toggle };
  button.textContent = '全屏 ⛶';
  button.setAttribute('aria-pressed', 'false');
})();
