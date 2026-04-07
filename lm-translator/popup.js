// LM Translator - Popup Script
document.addEventListener('DOMContentLoaded', () => {
  const enableToggle = document.getElementById('enableToggle');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const portInput = document.getElementById('portInput');
  const testBtn = document.getElementById('testBtn');
  const testBtnText = document.getElementById('testBtnText');

  // Load saved settings
  chrome.storage.sync.get({ enabled: true, lmPort: '1234' }, (data) => {
    enableToggle.checked = data.enabled;
    portInput.value = data.lmPort;
    updateStatus(data.enabled);
  });

  // Toggle enable/disable
  enableToggle.addEventListener('change', () => {
    const enabled = enableToggle.checked;
    chrome.storage.sync.set({ enabled });
    updateStatus(enabled);

    // Notify content scripts
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE', enabled }).catch(() => {});
      }
    });
  });

  // Port input
  portInput.addEventListener('change', () => {
    const port = portInput.value.trim() || '1234';
    portInput.value = port;
    chrome.storage.sync.set({ lmPort: port });
  });

  portInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') portInput.blur();
  });

  // Test connection
  testBtn.addEventListener('click', async () => {
    const port = portInput.value.trim() || '1234';
    testBtn.disabled = true;
    testBtnText.textContent = '连接中...';
    testBtn.className = 'test-btn';

    try {
      const res = await fetch(`http://localhost:${port}/v1/models`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (res.ok) {
        const data = await res.json();
        const models = data.data || [];
        const modelCount = models.length;
        testBtnText.textContent = modelCount > 0
          ? `✓ 已连接 · ${modelCount} 个模型`
          : '✓ 已连接 LM Studio';
        testBtn.classList.add('success');
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
        testBtnText.textContent = '✕ 无法连接，请检查 LM Studio';
      } else {
        testBtnText.textContent = `✕ 连接失败: ${err.message}`;
      }
      testBtn.classList.add('error');
    }

    testBtn.disabled = false;
    setTimeout(() => {
      testBtnText.textContent = '测试连接';
      testBtn.className = 'test-btn';
    }, 3000);
  });

  function updateStatus(enabled) {
    if (enabled) {
      statusDot.classList.remove('off');
      statusText.textContent = '已启用';
    } else {
      statusDot.classList.add('off');
      statusText.textContent = '已停用';
    }
  }
});
