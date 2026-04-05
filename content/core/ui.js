(() => {
  const Sora2dl = (window.Sora2dl = window.Sora2dl || {});
  Sora2dl.core = Sora2dl.core || {};

  const { getRunningFlag, setRunningFlag, clearDownloadedSet } = Sora2dl.core.storage;

  function applyRunningState(running) {
    const status = document.getElementById('sora2dl-status');
    const btn = document.getElementById('sora2dl-toggle');
    if (status) status.textContent = running ? '実行待機。profileかdraftsの動画をクリックしてください' : '停止';
    if (btn) btn.textContent = running ? '実行中(クリックで停止)' : '有効にする';
  }

  function updateStatus(text) {
    const el = document.getElementById('sora2dl-status');
    if (el) el.textContent = text;
  }

  function mountPanel({ showReset, onToggleChange }) {
    if (document.getElementById('sora2dl-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'sora2dl-panel';
    panel.innerHTML = `
      <div class="sora2dl-title">Sora2 自動DL</div>
      <div id="sora2dl-status" class="sora2dl-status">停止</div>
      <div class="sora2dl-actions">
        <button id="sora2dl-toggle" class="sora2dl-btn sora2dl-primary">有効にする</button>
      </div>
    `;
    document.body.appendChild(panel);
    panel.querySelector('#sora2dl-toggle')?.addEventListener('click', async () => {
      const running = await getRunningFlag();
      const next = !running;
      setRunningFlag(next);
      applyRunningState(next);
      if (onToggleChange) onToggleChange(next);
    });

    if (showReset) {
      const actions = panel.querySelector('.sora2dl-actions');
      if (actions) {
        const resetBtn = document.createElement('button');
        resetBtn.id = 'sora2dl-reset';
        resetBtn.className = 'sora2dl-btn';
        resetBtn.textContent = 'DL情報 初期化';
        resetBtn.addEventListener('click', () => {
          clearDownloadedSet();
          updateStatus('DL情報 初期化');
        });
        actions.appendChild(resetBtn);
      }
    }
  }

  Sora2dl.core.ui = {
    applyRunningState,
    updateStatus,
    mountPanel
  };
})();
