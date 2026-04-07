// LM Translator - Content Script
(function () {
  'use strict';

  // ─── State ───────────────────────────────────────────────────────────────
  let isEnabled = true;
  let translationPanel = null;
  let floatingBall = null;
  let currentAbortController = null;
  let lastTranslatedText = '';
  let panelVisible = false;
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };
  let ballPosition = { x: window.innerWidth - 80, y: window.innerHeight / 2 };

  // ─── Load Settings ───────────────────────────────────────────────────────
  chrome.storage.sync.get({ enabled: true, lmPort: '1234', targetLang: 'auto' }, (data) => {
    isEnabled = data.enabled;
    createFloatingBall();
    createTranslationPanel();
    updateBallState();
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'TOGGLE') {
      isEnabled = msg.enabled;
      updateBallState();
      if (!isEnabled) hidePanel();
    }
  });

  // ─── Floating Ball ───────────────────────────────────────────────────────
  function createFloatingBall() {
    floatingBall = document.createElement('div');
    floatingBall.id = 'lmt-ball';
    floatingBall.innerHTML = `
      <div class="lmt-ball-inner">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="currentColor" opacity="0.15"/>
          <path d="M8 9h8M8 12h5M6.5 17l2-4 2 4M14.5 12v5M13 14.5h3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="lmt-ball-pulse"></div>
    `;
    floatingBall.style.left = (ballPosition.x) + 'px';
    floatingBall.style.top = (ballPosition.y) + 'px';

    // Drag
    floatingBall.addEventListener('mousedown', onBallMouseDown);
    floatingBall.addEventListener('click', onBallClick);

    document.body.appendChild(floatingBall);
  }

  function onBallMouseDown(e) {
    if (e.button !== 0) return;
    isDragging = false;
    const rect = floatingBall.getBoundingClientRect();
    dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    const onMove = (e) => {
      isDragging = true;
      floatingBall.classList.add('lmt-dragging');
      let x = e.clientX - dragOffset.x;
      let y = e.clientY - dragOffset.y;
      x = Math.max(8, Math.min(window.innerWidth - 60, x));
      y = Math.max(8, Math.min(window.innerHeight - 60, y));
      ballPosition = { x, y };
      floatingBall.style.left = x + 'px';
      floatingBall.style.top = y + 'px';
    };

    const onUp = () => {
      floatingBall.classList.remove('lmt-dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.preventDefault();
  }

  function onBallClick(e) {
    if (isDragging) { isDragging = false; return; }
    isEnabled = !isEnabled;
    chrome.storage.sync.set({ enabled: isEnabled });
    updateBallState();
    if (!isEnabled) hidePanel();
  }

  function updateBallState() {
    if (!floatingBall) return;
    floatingBall.classList.toggle('lmt-disabled', !isEnabled);
  }

  // ─── Translation Panel ───────────────────────────────────────────────────
  function createTranslationPanel() {
    translationPanel = document.createElement('div');
    translationPanel.id = 'lmt-panel';
    translationPanel.innerHTML = `
      <div class="lmt-panel-header">
        <div class="lmt-header-left">
          <div class="lmt-logo-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M8 9h8M8 12h5M6.5 17l2-4 2 4M14.5 12v5M13 14.5h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <span class="lmt-title">LM Translator</span>
        </div>
        <div class="lmt-header-actions">
          <button class="lmt-btn-icon lmt-btn-pin" id="lmt-pin" title="Pin panel">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="lmt-btn-icon lmt-btn-close" id="lmt-close" title="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="lmt-source-area">
        <div class="lmt-lang-badge" id="lmt-source-lang">检测中...</div>
        <div class="lmt-source-text" id="lmt-source-text">选中文字即可翻译</div>
      </div>
      <div class="lmt-divider">
        <div class="lmt-divider-line"></div>
        <div class="lmt-arrow-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="lmt-divider-line"></div>
      </div>
      <div class="lmt-result-area">
        <div class="lmt-lang-badge lmt-lang-target" id="lmt-target-lang">翻译结果</div>
        <div class="lmt-result-text" id="lmt-result-text">
          <span class="lmt-placeholder">等待翻译...</span>
        </div>
        <div class="lmt-typing-indicator" id="lmt-typing">
          <span></span><span></span><span></span>
        </div>
      </div>
      <div class="lmt-footer">
        <div class="lmt-model-badge" id="lmt-model-name">LM Studio</div>
        <button class="lmt-copy-btn" id="lmt-copy" title="复制翻译">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="1.8"/>
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="1.8"/>
          </svg>
          复制
        </button>
      </div>
    `;

    translationPanel.style.display = 'none';
    document.body.appendChild(translationPanel);

    // Events
    document.getElementById('lmt-close').addEventListener('click', hidePanel);
    document.getElementById('lmt-pin').addEventListener('click', togglePin);
    document.getElementById('lmt-copy').addEventListener('click', copyResult);

    // Drag panel
    const header = translationPanel.querySelector('.lmt-panel-header');
    let panelDrag = false;
    let panelOffset = { x: 0, y: 0 };

    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      panelDrag = true;
      const rect = translationPanel.getBoundingClientRect();
      panelOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!panelDrag) return;
      let x = e.clientX - panelOffset.x;
      let y = e.clientY - panelOffset.y;
      x = Math.max(8, Math.min(window.innerWidth - 320, x));
      y = Math.max(8, Math.min(window.innerHeight - 200, y));
      translationPanel.style.left = x + 'px';
      translationPanel.style.top = y + 'px';
      translationPanel.style.right = 'auto';
      translationPanel.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => { panelDrag = false; });
  }

  let isPinned = false;
  function togglePin() {
    isPinned = !isPinned;
    const btn = document.getElementById('lmt-pin');
    btn.classList.toggle('lmt-pinned', isPinned);
    btn.title = isPinned ? '取消固定' : '固定面板';
  }

  function showPanel(x, y) {
    translationPanel.style.display = 'flex';
    panelVisible = true;

    // Smart positioning
    const panelW = 310;
    const panelH = 280;
    let left = x + 12;
    let top = y + 12;

    if (left + panelW > window.innerWidth - 20) left = x - panelW - 12;
    if (top + panelH > window.innerHeight - 20) top = y - panelH - 12;
    left = Math.max(12, left);
    top = Math.max(12, top);

    translationPanel.style.left = left + 'px';
    translationPanel.style.top = top + 'px';
    translationPanel.style.right = 'auto';
    translationPanel.style.bottom = 'auto';

    requestAnimationFrame(() => {
      translationPanel.classList.add('lmt-panel-visible');
    });
  }

  function hidePanel() {
    translationPanel.classList.remove('lmt-panel-visible');
    setTimeout(() => {
      if (!panelVisible) translationPanel.style.display = 'none';
    }, 300);
    panelVisible = false;
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }
  }

  function copyResult() {
    const text = document.getElementById('lmt-result-text').textContent;
    if (text && text !== '等待翻译...') {
      navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('lmt-copy');
        btn.textContent = '✓ 已复制';
        btn.classList.add('lmt-copied');
        setTimeout(() => {
          btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="1.8"/></svg> 复制`;
          btn.classList.remove('lmt-copied');
        }, 2000);
      });
    }
  }

  // ─── Text Selection ───────────────────────────────────────────────────────
  let selectionTimer = null;

  document.addEventListener('mouseup', (e) => {
    if (!isEnabled) return;
    if (translationPanel && translationPanel.contains(e.target)) return;
    if (floatingBall && floatingBall.contains(e.target)) return;

    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(() => {
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : '';

      if (text.length < 1) {
        if (!isPinned) hidePanel();
        return;
      }

      if (text === lastTranslatedText && panelVisible) return;

      lastTranslatedText = text;
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const x = rect.left + window.scrollX + rect.width / 2;
      const y = rect.bottom + window.scrollY;

      showPanel(x, y);
      startTranslation(text);
    }, 200);
  });

  // ─── Translation ─────────────────────────────────────────────────────────
  async function startTranslation(text) {
    const sourceEl = document.getElementById('lmt-source-text');
    const resultEl = document.getElementById('lmt-result-text');
    const sourceLangEl = document.getElementById('lmt-source-lang');
    const targetLangEl = document.getElementById('lmt-target-lang');
    const typingEl = document.getElementById('lmt-typing');
    const modelEl = document.getElementById('lmt-model-name');

    // 更精确的三语种检测逻辑
    const hasKana = /[\u3040-\u309F\u30A0-\u30FF]/.test(text); // 包含平假名或片假名
    const hasHanzi = /[\u4e00-\u9fff\u3400-\u4dbf]/.test(text); // 包含汉字

    let sourceLang = 'English'; // 默认视为英文
    let targetLang = 'Chinese';

    // 优先级判断
    if (hasKana) {
        sourceLang = 'Japanese';
        targetLang = 'Chinese';
    } else if (hasHanzi) {
        sourceLang = 'Chinese';
        targetLang = 'English';
    }

    // UI 显示的语言标签
    const sourceLangLabel = sourceLang === 'Chinese' ? '中文' : (sourceLang === 'Japanese' ? '日文' : '英文');
    const targetLangLabel = targetLang === 'English' ? '英文' : '中文';

    sourceEl.textContent = text.length > 100 ? text.slice(0, 100) + '…' : text;
    sourceLangEl.textContent = sourceLangLabel;
    targetLangEl.textContent = targetLangLabel;
    resultEl.innerHTML = '';
    typingEl.style.display = 'flex';

    if (currentAbortController) currentAbortController.abort();
    currentAbortController = new AbortController();

    chrome.storage.sync.get({ lmPort: '1234' }, async (data) => {
      const port = data.lmPort || '1234';
      const endpoint = `http://localhost:${port}/v1/chat/completions`;

      // 针对不同语言，为模型提供最明确且排他的 Prompt
      let prompt = '';
      if (sourceLang === 'Chinese') {
          prompt = `Translate the following Chinese text to natural English. Output ONLY the translation, no explanations:\n\n${text}`;
      } else if (sourceLang === 'Japanese') {
          prompt = `将以下日文翻译成自然流畅的中文。只输出翻译结果，不要解释：\n\n${text}`;
      } else {
          prompt = `将以下英文翻译成自然流畅的中文。只输出翻译结果，不要解释：\n\n${text}`;
      }

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'local-model',
            messages: [{ role: 'user', content: prompt }],
            stream: true,
            max_tokens: 512,
            temperature: 0.3,
          }),
          signal: currentAbortController.signal,
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        // Get model name from first chunk if possible
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullText = '';
        let modelName = 'LM Studio';
        let firstChunk = true;

        typingEl.style.display = 'none';
        resultEl.innerHTML = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') break;
            try {
              const json = JSON.parse(data);
              if (firstChunk && json.model) {
                modelName = json.model.length > 20
                  ? json.model.slice(0, 18) + '…'
                  : json.model;
                modelEl.textContent = modelName;
                firstChunk = false;
              }
              const delta = json.choices?.[0]?.delta?.content || '';
              if (delta) {
                fullText += delta;
                resultEl.textContent = fullText;
              }
            } catch (_) {}
          }
        }

        if (!fullText) {
          resultEl.innerHTML = '<span class="lmt-error">无翻译结果</span>';
        }

      } catch (err) {
        typingEl.style.display = 'none';
        if (err.name === 'AbortError') return;
        if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
          resultEl.innerHTML = `<span class="lmt-error">⚠ 无法连接 LM Studio<br><small>请确认 LM Studio 运行在端口 ${port}</small></span>`;
        } else {
          resultEl.innerHTML = `<span class="lmt-error">翻译失败: ${err.message}</span>`;
        }
      }
    });
  }

})();