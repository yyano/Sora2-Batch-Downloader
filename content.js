(() => {
  const Sora2dl = (window.Sora2dl = window.Sora2dl || {});
  let lastPathname = '';

  function handleRoute() {
    const path = location.pathname;
    if (path === lastPathname) return;
    lastPathname = path;

    const isDetail = path.startsWith('/p/s_') || path.startsWith('/d/gen_');
    if (!isDetail) {
      Sora2dl.core.downloader.stopAutoDown();
      Sora2dl.core.downloader.resetAutoDownForRoute();
    }

    if (path.startsWith('/profile')) {
      Sora2dl.routes.profile.handleListRoute(path);
      return;
    }

    if (path.startsWith('/drafts')) {
      Sora2dl.routes.drafts.handleListRoute(path);
      return;
    }

    if (path.startsWith('/p/s_')) {
      Sora2dl.routes.profile.handleDetailRoute(path);
      return;
    }

    if (path.startsWith('/d/gen_')) {
      Sora2dl.routes.drafts.handleDetailRoute(path);
    }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg) return;
    if (msg.type === 'SORA2_DOWNLOAD_STARTED') {
      Sora2dl.core.downloader.handleDownloadStarted();
    }
  });

  handleRoute();
  setInterval(handleRoute, 500);

  Sora2dl.core.net.hookAuthCapture();
})();
