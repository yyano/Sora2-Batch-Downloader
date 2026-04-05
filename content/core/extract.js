(() => {
  const Sora2dl = (window.Sora2dl = window.Sora2dl || {});
  Sora2dl.core = Sora2dl.core || {};

  const {
    BASE,
    CURRENT_VIDEO_SELECTOR,
    ATTRS,
    CONFIG,
    sleep,
    normalizeUrl,
    pickText,
    toIsoString,
    getPostIdFromUrl,
    getGenIdFromUrl
  } = Sora2dl.core.utils;
  const { fetchPostJson } = Sora2dl.core.net;

  function expandPromptIfCollapsed() {
    const buttons = Array.from(document.querySelectorAll('button'));
    const more = buttons.find((b) => b.textContent?.trim().toLowerCase() === 'more');
    if (more) {
      more.click();
      return true;
    }
    return false;
  }

  function expandPromptIfRequiresConfirm(scope) {
    const root = scope || document;
    const btn =
      root.querySelector(
        'button[class*="bg-token-bg-inverse"][class*="rounded-full"][class*="h-9"][class*="w-12"]'
      ) || null;
    if (btn && !btn.hasAttribute('disabled') && btn.getAttribute('data-disabled') !== 'true') {
      btn.click();
      return true;
    }
    return false;
  }

  function findVideoUrlInScope(scope) {
    const el = scope.querySelector(CONFIG.videoSelector);
    if (el) {
      const attrs = ['src', 'href', 'data-src', 'data-url'];
      for (const a of attrs) {
        const val = el.getAttribute(a);
        if (val && val.includes(BASE)) return normalizeUrl(val);
      }
    }
    return null;
  }

  function collectCandidateUrls(scope) {
    const urls = new Map();
    const root = scope || document;

    const nodes = root.querySelectorAll(CURRENT_VIDEO_SELECTOR);
    nodes.forEach((el) => {
      const val = el.currentSrc || el.src || el.href;
      if (val) {
        const norm = normalizeUrl(val);
        if (norm) urls.set(norm, norm);
      }
      for (const attr of ATTRS) {
        const v = el.getAttribute?.(attr);
        if (v) {
          const norm = normalizeUrl(v);
          if (norm) urls.set(norm, norm);
        }
      }
    });

    const perf = performance.getEntriesByType('resource');
    for (const e of perf) {
      if (typeof e.name === 'string') {
        if (e.name.includes(BASE) || e.name.includes('.mp4')) {
          const norm = normalizeUrl(e.name);
          if (norm) urls.set(norm, norm);
        }
      }
    }

    return Array.from(urls.keys());
  }

  function pickBestVideoUrl(scope) {
    const urls = collectCandidateUrls(scope);
    if (urls.length === 0) return { url: null, reason: 'not_found' };

    const nonBlob = urls.filter((u) => !u.startsWith('blob:'));
    const candidates = nonBlob.length > 0 ? nonBlob : urls;
    const sorted = candidates.filter((u) => u.includes(BASE) || u.includes('.mp4'));
    const url = sorted[0] || candidates[0];

    if (url && url.startsWith('blob:')) {
      return { url: null, reason: 'blob' };
    }
    return { url, reason: 'ok' };
  }

  function findCurrentVideoUrl(scope) {
    const el = scope.querySelector(CURRENT_VIDEO_SELECTOR);
    if (!el) return null;
    const attrs = ['currentSrc', 'src', 'href', 'data-src', 'data-url'];
    for (const a of attrs) {
      const val = el[a] || el.getAttribute?.(a);
      if (val && typeof val === 'string' && val.includes('.mp4')) {
        return normalizeUrl(val);
      }
    }
    return null;
  }

  async function waitForCondition(fn, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const v = fn();
      if (v) return v;
      await sleep(100);
    }
    return null;
  }

  async function waitForNextVideoUrl(prevUrl, timeoutMs) {
    return waitForCondition(() => {
      const url =
        findCurrentVideoUrl(document) ||
        findCurrentVideoUrl(document.querySelector(CONFIG.modalSelector) || document);
      if (!url) return null;
      if (url !== prevUrl) return url;
      return null;
    }, timeoutMs);
  }

  async function waitForPageUrlChange(prevUrl, timeoutMs) {
    return waitForCondition(() => {
      const now = location.href;
      if (now && now !== prevUrl) return now;
      return null;
    }, timeoutMs);
  }

  async function extractFromOpenView() {
    const modal = document.querySelector(CONFIG.modalSelector);
    const scope = modal || document;

    if (expandPromptIfCollapsed()) {
      await sleep(200);
    }

    if (expandPromptIfRequiresConfirm(scope)) {
      await sleep(200);
    }

    function pickTextInScope(target, selectors) {
      for (const sel of selectors) {
        const el = target.querySelector(sel);
        if (el && el.textContent) return el.textContent.trim();
      }
      return '';
    }

    const best = pickBestVideoUrl(scope);
    const url =
      best.url ||
      findCurrentVideoUrl(scope) ||
      findCurrentVideoUrl(document) ||
      findVideoUrlInScope(scope) ||
      findVideoUrlInScope(document);
    let prompt = pickTextInScope(scope, CONFIG.promptSelectors) || pickText(CONFIG.promptSelectors);
    if (!prompt) {
      prompt =
        (await waitForCondition(
          () => pickTextInScope(scope, CONFIG.promptSelectors) || pickText(CONFIG.promptSelectors),
          1500
        )) || '';
    }
    const createdAtRaw = pickText(CONFIG.createdAtSelectors);
    const createdAtIso = toIsoString(createdAtRaw);
    const createdAt = createdAtIso || createdAtRaw;

    const postId = getPostIdFromUrl(location.href);
    const genId = getGenIdFromUrl(location.href);
    const kind = postId ? 'post' : genId ? 'draft' : '';
    const id = postId || genId;
    const postJsonResult = await fetchPostJson(id, kind);

    return {
      url,
      prompt,
      createdAt,
      hasModal: !!modal,
      reason: best.reason,
      postId: id,
      kind,
      postJson: postJsonResult?.data || null,
      postJsonRateLimited: Boolean(postJsonResult?.rateLimited)
    };
  }

  async function openItemAndExtract(el) {
    const beforeUrl = location.href;
    el.scrollIntoView({ block: 'center' });
    el.click();

    await waitForCondition(() => {
      const modal = document.querySelector(CONFIG.modalSelector);
      if (modal) return true;
      if (location.href !== beforeUrl) return true;
      if (document.querySelector(CONFIG.videoSelector)) return true;
      return false;
    }, CONFIG.detailOpenTimeoutMs);

    const info = await extractFromOpenView();

    if (info.hasModal) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await sleep(300);
    } else if (location.href !== beforeUrl) {
      history.back();
      await sleep(800);
    }

    return info;
  }

  Sora2dl.core.extract = {
    expandPromptIfCollapsed,
    findVideoUrlInScope,
    collectCandidateUrls,
    pickBestVideoUrl,
    findCurrentVideoUrl,
    waitForCondition,
    waitForNextVideoUrl,
    waitForPageUrlChange,
    extractFromOpenView,
    openItemAndExtract
  };
})();
