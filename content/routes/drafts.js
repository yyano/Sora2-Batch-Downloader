(() => {
  const Sora2dl = (window.Sora2dl = window.Sora2dl || {});
  Sora2dl.routes = Sora2dl.routes || {};

  const { getRunningFlag } = Sora2dl.core.storage;
  const { mountPanel, applyRunningState, updateStatus } = Sora2dl.core.ui;
  const { resetAutoDownForRoute, startAutoDown, stopAutoDown } = Sora2dl.core.downloader;

  function ensurePanel(showReset, onToggleChange) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        mountPanel({
          showReset,
          onToggleChange
        });
      }, { once: true });
    } else {
      mountPanel({
        showReset,
        onToggleChange
      });
    }
  }

  function handleListRoute(path) {
    ensurePanel(true, (next) => {
      if (!next) stopAutoDown();
    });
    getRunningFlag().then((running) => {
      applyRunningState(running);
      updateStatus('停止');
      if (running) {
        console.log('[sora2dl] route:', path, 'running=on');
      } else {
        console.log('[sora2dl] route:', path, 'running=off');
      }
    });
  }

  function handleDetailRoute(path) {
    ensurePanel(false, (next) => {
      if (!next) {
        stopAutoDown();
        return;
      }
      resetAutoDownForRoute();
      startAutoDown();
    });
    getRunningFlag().then((running) => {
      applyRunningState(running);
      if (!running) {
        console.log('[sora2dl] route:', path, 'running=off');
        return;
      }
      console.log('[sora2dl] route:', path, 'running=on -> start');
      resetAutoDownForRoute();
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => startAutoDown(), { once: true });
      } else {
        startAutoDown();
      }
    });
  }

  Sora2dl.routes.drafts = {
    handleListRoute,
    handleDetailRoute
  };
})();
