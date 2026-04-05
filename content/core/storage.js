(() => {
  const Sora2dl = (window.Sora2dl = window.Sora2dl || {});
  Sora2dl.core = Sora2dl.core || {};

  const RUN_KEY = 'sora2dl_running';
  const DOWNLOADED_KEY = 'sora2dl_downloaded';
  let downloadedCache = null;

  function setRunningFlag(isRunning) {
    if (!chrome?.storage?.local) return;
    try {
      chrome.storage.local.set({ [RUN_KEY]: isRunning });
    } catch {
      // ignore
    }
  }

  function getRunningFlag() {
    return new Promise((resolve) => {
      if (!chrome?.storage?.local) {
        resolve(false);
        return;
      }
      try {
        chrome.storage.local.get([RUN_KEY], (res) => {
          resolve(Boolean(res[RUN_KEY]));
        });
      } catch {
        resolve(false);
      }
    });
  }

  function getDownloadedSet() {
    return new Promise((resolve) => {
      if (!chrome?.storage?.local) {
        resolve(new Set());
        return;
      }
      try {
        chrome.storage.local.get([DOWNLOADED_KEY], (res) => {
          const list = Array.isArray(res[DOWNLOADED_KEY]) ? res[DOWNLOADED_KEY] : [];
          resolve(new Set(list));
        });
      } catch {
        resolve(new Set());
      }
    });
  }

  async function getDownloadedCache() {
    if (downloadedCache) return downloadedCache;
    downloadedCache = await getDownloadedSet();
    return downloadedCache;
  }

  function addDownloadedKey(key) {
    if (!key) return;
    if (!chrome?.storage?.local) return;
    try {
      chrome.storage.local.get([DOWNLOADED_KEY], (res) => {
        const list = Array.isArray(res[DOWNLOADED_KEY]) ? res[DOWNLOADED_KEY] : [];
        if (!list.includes(key)) {
          list.push(key);
          chrome.storage.local.set({ [DOWNLOADED_KEY]: list });
        }
      });
      if (downloadedCache) downloadedCache.add(key);
    } catch {
      // ignore
    }
  }

  function clearDownloadedSet() {
    if (!chrome?.storage?.local) return;
    try {
      chrome.storage.local.remove([DOWNLOADED_KEY]);
      downloadedCache = new Set();
      console.log('[sora2dl] downloaded list cleared');
    } catch {
      // ignore
    }
  }

  Sora2dl.core.storage = {
    RUN_KEY,
    DOWNLOADED_KEY,
    setRunningFlag,
    getRunningFlag,
    getDownloadedSet,
    getDownloadedCache,
    addDownloadedKey,
    clearDownloadedSet
  };
})();
