const DOWNLOAD_DIR = 'sora2';
const INTERVAL_MS = 250;
const downloadTabMap = new Map();
const downloadNotified = new Set();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startDownload(url, filename) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      {
        url,
        filename: `${DOWNLOAD_DIR}/${filename}`,
        conflictAction: 'uniquify'
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(downloadId);
      }
    );
  });
}

function notifyDownloadStarted(downloadId) {
  const tabId = downloadTabMap.get(downloadId);
  if (tabId == null) return;
  chrome.tabs.sendMessage(tabId, { type: 'SORA2_DOWNLOAD_STARTED', downloadId }, () => {
    // Ignore errors when the tab is gone or no content script is active.
    void chrome.runtime.lastError;
  });
}

function startExportDownload(payload) {
  return new Promise((resolve, reject) => {
    const mime = payload.mime || 'application/octet-stream';
    const dataUrl = `data:${mime};charset=utf-8,${encodeURIComponent(payload.content || '')}`;
    chrome.downloads.download(
      {
        url: dataUrl,
        filename: `${DOWNLOAD_DIR}/${payload.filename}`,
        conflictAction: 'uniquify'
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(downloadId);
      }
    );
  });
}

async function downloadAll(items) {
  let started = 0;
  for (const item of items) {
    try {
      await startDownload(item.url, item.filename);
      started += 1;
    } catch (err) {
      console.error('Download failed:', item.url, err);
    }
    await sleep(INTERVAL_MS);
  }
  return started;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;

  if (msg.type === 'SORA2_DOWNLOAD_ALL') {
    const items = Array.isArray(msg.items) ? msg.items : [];

    (async () => {
      const started = await downloadAll(items);
      sendResponse({ ok: true, started });
    })();

    return true;
  }

  if (msg.type === 'SORA2_DOWNLOAD_ONE') {
    const item = msg.item || {};
    const tabId = sender?.tab?.id;

    (async () => {
      try {
        const downloadId = await startDownload(item.url, item.filename);
        if (tabId != null) downloadTabMap.set(downloadId, tabId);
        sendResponse({ ok: true, downloadId });
      } catch (err) {
        console.error('Download failed:', item.url, err);
        sendResponse({ ok: false });
      }
    })();

    return true;
  }

  if (msg.type === 'SORA2_EXPORT') {
    const payload = msg.payload || {};
    (async () => {
      try {
        await startExportDownload(payload);
        sendResponse({ ok: true });
      } catch (err) {
        console.error('Export failed:', err);
        sendResponse({ ok: false });
      }
    })();
    return true;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ sora2dl_running: false });
});

chrome.downloads.onChanged.addListener((delta) => {
  const downloadId = delta.id;
  if (!downloadTabMap.has(downloadId)) return;

  if (delta.state && (delta.state.current === 'complete' || delta.state.current === 'interrupted')) {
    downloadTabMap.delete(downloadId);
    downloadNotified.delete(downloadId);
    return;
  }

  const started =
    (delta.state && delta.state.current === 'in_progress') ||
    (delta.bytesReceived && delta.bytesReceived.current > 0);

  if (started && !downloadNotified.has(downloadId)) {
    downloadNotified.add(downloadId);
    notifyDownloadStarted(downloadId);
  }
});
