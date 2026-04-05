(() => {
  const Sora2dl = (window.Sora2dl = window.Sora2dl || {});
  Sora2dl.core = Sora2dl.core || {};

  const BASE = 'https://videos.openai.com/az/files/';
  const CURRENT_VIDEO_SELECTOR = 'video, source, a[href*=".mp4"]';
  const ATTRS = [
    'src',
    'href',
    'data-src',
    'data-url',
    'data-video',
    'data-video-url',
    'data-download-url'
  ];

  const CONFIG = {
    autoScrollRounds: 30,
    autoScrollDelayMs: 600,
    autoScrollIdleRounds: 4,
    detailOpenTimeoutMs: 8000,
    perItemDelayMs: 300,
    cardLinkSelector: 'a[href^="/p/"], a[href*="/p/"]',
    modalSelector: 'div[role="dialog"], div[aria-modal="true"]',
    videoSelector: `video[src*="${BASE}"], source[src*="${BASE}"], a[href*="${BASE}"]`,
    promptSelectors: [
      'div[class*="max-h-"][class*="overflow-y-auto"]',
      'div[class*="max-h-[30vh]"]',
      '[data-testid="prompt"]',
      'div[aria-label="Prompt"]'
    ],
    createdAtSelectors: [
      'span.text-token-text-tertiary',
      'time',
      '[data-testid="created-at"]'
    ]
  };

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function normalizeUrl(raw) {
    try {
      const u = new URL(raw, location.href);
      u.hash = '';
      return u.toString();
    } catch {
      return null;
    }
  }

  function sanitizeFilename(name) {
    return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 180);
  }

  function toIsoString(text) {
    if (!text) return '';
    const trimmed = text.replace(/\s+/g, ' ').trim();
    const ms = Date.parse(trimmed);
    if (Number.isNaN(ms)) return '';
    return new Date(ms).toISOString();
  }

  function safeDateToken(text) {
    if (!text) return '';
    const cleaned = text.replace(/\s+/g, ' ').trim();
    return cleaned.replace(/[^0-9A-Za-z._-]/g, '_').slice(0, 40);
  }

  function buildFilename(meta, index) {
    const prompt = meta.prompt ? sanitizeFilename(meta.prompt) : '';
    const created = meta.createdAt ? safeDateToken(meta.createdAt) : '';
    let base = `sora_${index + 1}`;
    if (created) base += `_${created}`;
    if (prompt) base += `_${prompt}`;
    if (!base.endsWith('.mp4')) base += '.mp4';
    return base;
  }

  function toTimestampToken(dateLike) {
    const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    const yyyy = d.getUTCFullYear();
    const mm = pad(d.getUTCMonth() + 1);
    const dd = pad(d.getUTCDate());
    const hh = pad(d.getUTCHours());
    const mi = pad(d.getUTCMinutes());
    const ss = pad(d.getUTCSeconds());
    return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
  }

  function extractSktFromUrl(url) {
    try {
      const u = new URL(url);
      const skt = u.searchParams.get('skt');
      if (!skt) return '';
      return decodeURIComponent(skt);
    } catch {
      return '';
    }
  }

  function parsePostedAt(serial) {
    if (serial == null) return '';
    const n = Number(serial);
    if (!Number.isFinite(n)) return '';
    const ms = n > 1e12 ? n : n > 1e10 ? n : n > 1e9 ? n * 1000 : n * 1000;
    return toTimestampToken(new Date(ms));
  }

  function getPostLike(postJson) {
    if (!postJson) return {};
    if (postJson.post) return postJson.post;
    if (postJson.draft) return postJson.draft;
    return postJson;
  }

  function buildDateOnlyFilename(meta, url, postJson) {
    const post = getPostLike(postJson);
    const postId = post?.id || meta.postId || 'unknown';
    const postedAtToken =
      parsePostedAt(post?.posted_at) ||
      parsePostedAt(post?.created_at) ||
      parsePostedAt(postJson?.posted_at) ||
      parsePostedAt(postJson?.created_at);
    const fromSkt = url ? extractSktFromUrl(url) : '';
    const token =
      postedAtToken ||
      toTimestampToken(fromSkt) ||
      toTimestampToken(meta.createdAt) ||
      toTimestampToken(new Date());
    let base = token || 'sora_unknown';
    base = `${postId}/${base}`;
    if (!base.endsWith('.mp4')) base += '.mp4';
    return base;
  }

  function extractFileIdFromVideoUrl(url) {
    try {
      const u = new URL(url);
      const m = u.pathname.match(/\/az\/files\/([^/]+)/);
      if (!m) return '';
      const decoded = decodeURIComponent(m[1] || '');
      return decoded.split('/')[0] || '';
    } catch {
      return '';
    }
  }

  function buildDraftFilename(meta, url, postJson) {
    const post = getPostLike(postJson);
    const postId = post?.id || meta.postId || 'unknown';
    const fileId = extractFileIdFromVideoUrl(url) || 'unknown';
    let base = `${postId}/${fileId}`;
    if (!base.endsWith('.mp4')) base += '.mp4';
    return base;
  }

  function buildAutoFilename(meta, url, postJson) {
    const filename = meta?.kind === 'draft'
      ? buildDraftFilename(meta, url, postJson)
      : buildDateOnlyFilename(meta, url, postJson);
    return filename;
  }

  function guessFilename(url, index) {
    try {
      const u = new URL(url);
      const parts = u.pathname.split('/').filter(Boolean);
      let name = parts[parts.length - 1] || `sora_${index + 1}.mp4`;
      name = decodeURIComponent(name);
      if (!name.includes('.')) name += '.mp4';
      return sanitizeFilename(name);
    } catch {
      return `sora_${index + 1}.mp4`;
    }
  }

  function pickText(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent) return el.textContent.trim();
    }
    return '';
  }

  function getPostIdFromUrl(url) {
    try {
      const u = new URL(url);
      const m = u.pathname.match(/s_[0-9a-fA-F]+/);
      return m ? m[0] : '';
    } catch {
      return '';
    }
  }

  function getGenIdFromUrl(url) {
    try {
      const u = new URL(url);
      const m = u.pathname.match(/gen_[0-9a-zA-Z]+/);
      return m ? m[0] : '';
    } catch {
      return '';
    }
  }

  function buildPostApiUrl(id, kind) {
    if (!id) return '';
    if (kind === 'draft') {
      return `https://sora.chatgpt.com/backend/project_y/profile/drafts/v2/${id}`;
    }
    return `https://sora.chatgpt.com/backend/project_y/post/${id}`;
  }

  Sora2dl.core.utils = {
    BASE,
    CURRENT_VIDEO_SELECTOR,
    ATTRS,
    CONFIG,
    sleep,
    normalizeUrl,
    sanitizeFilename,
    toIsoString,
    safeDateToken,
    buildFilename,
    toTimestampToken,
    extractSktFromUrl,
    parsePostedAt,
    getPostLike,
    buildDateOnlyFilename,
    extractFileIdFromVideoUrl,
    buildDraftFilename,
    buildAutoFilename,
    guessFilename,
    pickText,
    getPostIdFromUrl,
    getGenIdFromUrl,
    buildPostApiUrl
  };
})();
