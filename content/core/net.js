(() => {
  const Sora2dl = (window.Sora2dl = window.Sora2dl || {});
  Sora2dl.core = Sora2dl.core || {};

  const { buildPostApiUrl, sleep } = Sora2dl.core.utils;

  const postJsonCache = new Map();
  const draftCapture = new Map();
  let bearerAuth = '';

  function captureBearer(value) {
    if (!value || typeof value !== 'string') return;
    if (!value.toLowerCase().startsWith('bearer ')) return;
    bearerAuth = value;
  }

  function readHeaderValue(headers, name) {
    if (!headers) return '';
    try {
      if (headers instanceof Headers) return headers.get(name) || headers.get(name.toLowerCase()) || '';
      if (Array.isArray(headers)) {
        const hit = headers.find(([k]) => String(k).toLowerCase() === name.toLowerCase());
        return hit ? String(hit[1]) : '';
      }
      if (typeof headers === 'object') {
        return headers[name] || headers[name.toLowerCase()] || '';
      }
    } catch {
      return '';
    }
    return '';
  }

  function maybeCaptureDraftJson(url, data) {
    if (!url || !data) return;
    try {
      if (!url.includes('/backend/project_y/profile/drafts/v2/')) return;
      const { getGenIdFromUrl } = Sora2dl.core.utils;
      const id = getGenIdFromUrl(url);
      if (!id) return;
      draftCapture.set(id, data);
      const cacheKey = `draft:${id}`;
      postJsonCache.set(cacheKey, { data, rateLimited: false });
      console.log('[sora2dl] captured draft json:', id);
    } catch {
      // ignore
    }
  }

  function hookAuthCapture() {
    if (window.__sora2dl_hooked) return;
    window.__sora2dl_hooked = true;

    const origFetch = window.fetch;
    window.fetch = function (input, init = {}) {
      try {
        if (input instanceof Request) {
          captureBearer(input.headers?.get('authorization'));
        }
        const headerVal = readHeaderValue(init.headers, 'authorization');
        captureBearer(headerVal);
      } catch {
        // ignore
      }
      return origFetch.apply(this, arguments).then((resp) => {
        try {
          const url = resp.url || (input instanceof Request ? input.url : String(input));
          if (url && url.includes('/backend/project_y/profile/drafts/v2/')) {
            resp.clone().json().then((data) => maybeCaptureDraftJson(url, data)).catch(() => {});
          }
        } catch {
          // ignore
        }
        return resp;
      });
    };

    const OrigXHR = window.XMLHttpRequest;
    function WrappedXHR() {
      const xhr = new OrigXHR();
      const headers = {};
      const origSetHeader = xhr.setRequestHeader;
      xhr.setRequestHeader = function (name, value) {
        headers[String(name).toLowerCase()] = value;
        return origSetHeader.apply(xhr, arguments);
      };
      const origSend = xhr.send;
      xhr.send = function () {
        captureBearer(headers['authorization']);
        try {
          xhr.addEventListener('load', () => {
            const url = xhr.responseURL || '';
            if (url.includes('/backend/project_y/profile/drafts/v2/')) {
              try {
                const data = JSON.parse(xhr.responseText);
                maybeCaptureDraftJson(url, data);
              } catch {
                // ignore
              }
            }
          });
        } catch {
          // ignore
        }
        return origSend.apply(xhr, arguments);
      };
      return xhr;
    }
    window.XMLHttpRequest = WrappedXHR;
  }

  async function fetchPostJson(id, kind) {
    if (!id) return null;
    const cacheKey = `${kind}:${id}`;
    if (postJsonCache.has(cacheKey)) return postJsonCache.get(cacheKey);
    const apiUrl = buildPostApiUrl(id, kind);
    if (!apiUrl) return null;
    try {
      let attempt = 0;
      let sawRateLimit = false;
      let headers = undefined;
      if (kind === 'draft') {
        // Passive capture only. If already captured, cache will hit above.
        const captured = draftCapture.get(id);
        if (captured) {
          const result = { data: captured, rateLimited: false };
          postJsonCache.set(cacheKey, result);
          return result;
        }
        return { data: null, rateLimited: false };
      }
      while (attempt < 5) {
        const resp = await fetch(apiUrl, { credentials: 'include', headers });
        if (resp.status === 429 || resp.status === 502 || resp.status === 503 || resp.status === 504) {
          if (resp.status === 429) sawRateLimit = true;
          const retryAfter = Number(resp.headers.get('Retry-After')) || 0;
          const delayMs = retryAfter > 0 ? retryAfter * 1000 : 1000 + attempt * 1200;
          console.warn('[sora2dl] post json retry', resp.status, 'in', delayMs, 'ms');
          await sleep(delayMs);
          attempt += 1;
          continue;
        }
        if (!resp.ok) {
          console.warn('[sora2dl] post json failed', resp.status);
          const result = { data: null, rateLimited: sawRateLimit };
          postJsonCache.set(cacheKey, result);
          return result;
        }
        const data = await resp.json();
        const result = { data, rateLimited: false };
        postJsonCache.set(cacheKey, result);
        return result;
      }
      const result = { data: null, rateLimited: sawRateLimit };
      postJsonCache.set(cacheKey, result);
      return result;
    } catch (err) {
      console.warn('[sora2dl] post json failed:', err);
      const result = { data: null, rateLimited: false };
      postJsonCache.set(cacheKey, result);
      return result;
    }
  }

  Sora2dl.core.net = {
    fetchPostJson,
    hookAuthCapture,
    maybeCaptureDraftJson,
    readHeaderValue,
    captureBearer,
    draftCapture,
    postJsonCache,
    bearerAuth
  };
})();
