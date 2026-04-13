(() => {
  const Sora2dl = (window.Sora2dl = window.Sora2dl || {});
  Sora2dl.core = Sora2dl.core || {};

  const { buildAutoFilename, getPostLike } = Sora2dl.core.utils;
  const { getDownloadedCache, addDownloadedKey } = Sora2dl.core.storage;
  const { extractFromOpenView, waitForNextVideoUrl } = Sora2dl.core.extract;
  const { updateStatus } = Sora2dl.core.ui;

  let autoDownRunning = false;
  let autoDownCancel = false;
  let autoDownIndex = 0;
  let autoDownLastUrl = '';
  let autoDownLastPageUrl = '';
  let waitingForUserDown = false;
  let waitingForNextPage = false;
  let pageWatchTimer = null;
  let autoDownKeyTimer = null;
  let autoDownRepeatTimer = null;
  let autoDownLastKind = '';

  function pickPromptFromPostJson(postJson) {
    const post = getPostLike(postJson);
    const text =
      post?.text ??
      post?.prompt ??
      post?.creation_config?.prompt ??
      postJson?.text ??
      postJson?.prompt ??
      '';
    return text ? String(text) : '';
  }

  function postJsonHasPrompt(postJson) {
    if (!postJson) return false;
    const post = getPostLike(postJson);
    return Boolean(
      post?.text ||
        post?.prompt ||
        post?.creation_config?.prompt ||
        postJson?.text ||
        postJson?.prompt
    );
  }

  function stopPageWatch() {
    if (pageWatchTimer != null) {
      clearInterval(pageWatchTimer);
      pageWatchTimer = null;
    }
  }

  function stopAutoDownKeyPress() {
    if (autoDownKeyTimer != null) {
      clearTimeout(autoDownKeyTimer);
      autoDownKeyTimer = null;
    }
  }

  function stopAutoDownRepeat() {
    if (autoDownRepeatTimer != null) {
      clearInterval(autoDownRepeatTimer);
      autoDownRepeatTimer = null;
    }
  }

  function startAutoDownRepeat(intervalMs) {
    if (autoDownRepeatTimer != null) return;
    autoDownRepeatTimer = setInterval(() => {
      if (!autoDownRunning || autoDownCancel) {
        stopAutoDownRepeat();
        return;
      }
      sendArrowDown();
    }, intervalMs);
  }

  function shouldSendArrowDown() {
    if (!waitingForUserDown) return false;
    const active = document.activeElement;
    if (!active) return true;
    const tag = active.tagName ? active.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return false;
    if (active.isContentEditable) return false;
    return true;
  }

  function sendArrowDown() {
    if (!shouldSendArrowDown()) return;
    console.log('[sora2dl] auto key: ArrowDown');
    const opts = {
      key: 'ArrowDown',
      code: 'ArrowDown',
      keyCode: 40,
      which: 40,
      bubbles: true,
      cancelable: true
    };
    document.dispatchEvent(new KeyboardEvent('keydown', opts));
    document.dispatchEvent(new KeyboardEvent('keyup', opts));
  }

  function scheduleArrowDownAfterDelay(delayMs) {
    if (autoDownKeyTimer != null) return;
    autoDownKeyTimer = setTimeout(() => {
      autoDownKeyTimer = null;
      if (!autoDownRunning || autoDownCancel) return;
      sendArrowDown();
    }, delayMs);
  }

  async function downloadAll() {
    await startAutoDown();
  }

  async function startAutoDown() {
    if (autoDownRunning) return;
    autoDownRunning = true;
    autoDownCancel = false;
    autoDownIndex = 0;
    autoDownLastUrl = '';
    autoDownLastPageUrl = location.href;
    autoDownLastKind = '';
    waitingForUserDown = false;
    waitingForNextPage = false;
    stopPageWatch();
    stopAutoDownKeyPress();
    stopAutoDownRepeat();
    updateStatus('準備中...');
    const maxRetries = 5;
    for (let i = 0; i < maxRetries; i++) {
      if (autoDownCancel) break;
      const ok = await downloadCurrentAndWait();
      if (ok) return;
      updateStatus('動画URL待機中... 再生してください');
      await Sora2dl.core.utils.sleep(1000);
    }
    autoDownRunning = false;
    updateStatus('動画URLが見つかりません');
  }

  function resetAutoDownForRoute() {
    autoDownRunning = false;
    autoDownCancel = false;
    waitingForUserDown = false;
    waitingForNextPage = false;
    stopPageWatch();
    stopAutoDownKeyPress();
    stopAutoDownRepeat();
  }

  function stopAutoDown() {
    if (!autoDownRunning) return;
    autoDownCancel = true;
    stopPageWatch();
    stopAutoDownKeyPress();
    stopAutoDownRepeat();
    updateStatus('連続DL停止: 処理中...');
  }

  async function downloadCurrentAndWait() {
    if (autoDownCancel) {
      autoDownRunning = false;
      updateStatus('連続DL停止');
      return false;
    }

    let info = await extractFromOpenView();
    if (autoDownLastUrl && info.url && info.url === autoDownLastUrl) {
      const nextUrl = await waitForNextVideoUrl(autoDownLastUrl, 2500);
      if (nextUrl) {
        await Sora2dl.core.utils.sleep(150);
        info = await extractFromOpenView();
      }
    }
    if (!info.url) {
      if (info.reason === 'blob') {
        updateStatus('blob形式のため直接DLできません。動画を再生してから再試行してください。');
      } else {
        updateStatus('動画URLが見つかりません。再生してから再試行してください。');
      }
      return false;
    }

    const filename = buildAutoFilename(info, info.url, info.postJson);
    autoDownIndex += 1;
    autoDownLastUrl = info.url;
    autoDownLastPageUrl = location.href;
    autoDownLastKind = info.kind || '';
    const baseName = filename.replace(/\.mp4$/i, '');
    const post = getPostLike(info.postJson);
    const downloadKey = post?.id || info.postId || baseName || info.url;

    const downloaded = await getDownloadedCache();
    if (downloaded.has(downloadKey)) {
      updateStatus(`DL済み: ${filename}`);
      const base = filename.replace(/\.mp4$/i, '');
      logSkipFiles(info, base);
      beginWaitForNextPage();
      scheduleArrowDownAfterDelay(2400);
      return true;
    }

    chrome.runtime.sendMessage(
      { type: 'SORA2_DOWNLOAD_ONE', item: { url: info.url, filename } },
      (resp) => {
        if (chrome.runtime.lastError) {
          updateStatus(`エラー: ${chrome.runtime.lastError.message}`);
          autoDownRunning = false;
          return;
        }
        if (!resp || !resp.ok) {
          updateStatus('エラー: ダウンロード開始に失敗');
          autoDownRunning = false;
          return;
        }
        addDownloadedKey(downloadKey);
        const base = filename.replace(/\.mp4$/i, '');
        const promptText = info.prompt || pickPromptFromPostJson(info.postJson) || '';
        const jsonData = info.postJson
          ? promptText && !postJsonHasPrompt(info.postJson)
            ? { ...info.postJson, prompt: promptText }
            : info.postJson
          : {
              url: info.url,
              prompt: promptText,
              createdAt: info.kind === 'draft' ? '' : info.createdAt || '',
              postId: info.postId || ''
            };
        if (info.kind === 'draft' && jsonData && typeof jsonData === 'object') {
          delete jsonData.createdAt;
        }
        const payload = {
          filename: `${base}.json`,
          content: JSON.stringify(jsonData, null, 2),
          mime: 'application/json'
        };
        chrome.runtime.sendMessage({ type: 'SORA2_EXPORT', payload }, () => {
          void chrome.runtime.lastError;
        });
        startExtraDownloads(info, base);
        saveLinkFileIfRateLimited(info, base);
        updateStatus(`DL開始: ${filename}`);
        if (info.kind === 'draft') {
          beginWaitForNextPage();
          startAutoDownRepeat(2300);
        } else {
          beginWaitForNextPage();
          startAutoDownRepeat(2800);
        }
      }
    );
    return true;
  }

  function collectExtraUrls(postJson) {
    const urls = [];
    const post = getPostLike(postJson);
    if (post?.srt_url) urls.push({ url: post.srt_url, ext: 'srt' });
    if (post?.vtt_url) urls.push({ url: post.vtt_url, ext: 'vtt' });

    const attachments = Array.isArray(post?.attachments) ? post.attachments : [];
    for (const att of attachments) {
      const gifUrl = att?.encodings?.gif?.path;
      if (gifUrl) urls.push({ url: gifUrl, ext: 'gif' });
    }
    const draftGif = post?.encodings?.gif?.path;
    if (draftGif) urls.push({ url: draftGif, ext: 'gif' });

    const seen = new Set();
    return urls.filter((u) => {
      if (!u.url) return false;
      if (seen.has(u.url)) return false;
      seen.add(u.url);
      return true;
    });
  }

  function startExtraDownloads(info, base) {
    if (!info.postJson) return;
    const extras = collectExtraUrls(info.postJson);
    for (const item of extras) {
      chrome.runtime.sendMessage(
        { type: 'SORA2_DOWNLOAD_ONE', item: { url: item.url, filename: `${base}.${item.ext}` } },
        () => {
          void chrome.runtime.lastError;
        }
      );
    }

    const text = pickPromptFromPostJson(info.postJson);
    if (text) {
      const payload = {
        filename: `${base}-prompt.txt`,
        content: String(text),
        mime: 'text/plain'
      };
      chrome.runtime.sendMessage({ type: 'SORA2_EXPORT', payload }, () => {
        void chrome.runtime.lastError;
      });
    }
  }

  function saveLinkFileIfRateLimited(info, base) {
    if (!info.postJsonRateLimited) return;
    const url = location.href;
    const payload = {
      filename: `${base}-link.txt`,
      content: String(url),
      mime: 'text/plain'
    };
    chrome.runtime.sendMessage({ type: 'SORA2_EXPORT', payload }, () => {
      void chrome.runtime.lastError;
    });
  }

  function logSkipFiles(info, base) {
    console.log('[sora2dl] skip downloaded:', `${base}.mp4`);
    if (info.postJson) {
      const extras = collectExtraUrls(info.postJson);
      for (const item of extras) {
        console.log('[sora2dl] skip downloaded:', `${base}.${item.ext}`);
      }
      const text = info.postJson?.post?.text ?? info.postJson?.text ?? '';
      if (text) {
        console.log('[sora2dl] skip downloaded:', `${base}-prompt.txt`);
      }
    }
    if (info.postJsonRateLimited) {
      console.log('[sora2dl] skip downloaded:', `${base}-link.txt`);
    }
  }

  function beginWaitForNextPage() {
    waitingForUserDown = true;
    updateStatus('↓キーで次へ（DL開始2.7秒後に自動）');
    if (!pageWatchTimer) {
      const prevPage = autoDownLastPageUrl || location.href;
      const startedAt = Date.now();
      pageWatchTimer = setInterval(async () => {
        if (!autoDownRunning || autoDownCancel) {
          stopPageWatch();
          stopAutoDownKeyPress();
          stopAutoDownRepeat();
          return;
        }
        if (location.href !== prevPage) {
          stopPageWatch();
          stopAutoDownKeyPress();
          stopAutoDownRepeat();
          waitingForUserDown = false;
          waitingForNextPage = false;
          await Sora2dl.core.utils.sleep(400);
          await downloadCurrentAndWait();
          return;
        }
        if (Date.now() - startedAt > 15000) {
          stopPageWatch();
          stopAutoDownKeyPress();
          waitingForNextPage = false;
          updateStatus('次のページに遷移しません');
        }
      }, 300);
    }
  }

  async function handleDownloadStarted() {
    if (!autoDownRunning) return;
    if (autoDownCancel) {
      autoDownRunning = false;
      updateStatus('連続DL停止');
      return;
    }
    beginWaitForNextPage();
    if (autoDownLastKind === 'draft') {
      startAutoDownRepeat(2300);
    }
    scheduleArrowDownAfterDelay(2700);
  }

  Sora2dl.core.downloader = {
    downloadAll,
    startAutoDown,
    stopAutoDown,
    resetAutoDownForRoute,
    handleDownloadStarted
  };
})();
