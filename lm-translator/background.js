// LM Translator - Background Service Worker
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ enabled: true, lmPort: '1234' });
});
