/**
 * background.js
 * Manifest V3 background service worker.
 * Handles lifecycle events and cross-tab communication.
 */

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Capsule Service Worker] Extension installed/updated:', details.reason);
});

// Listener for cross-origin or background tasks
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ status: 'PONG', timestamp: Date.now() });
    return true;
  }

  if (message.action === 'FETCH_IMAGE_DATA' || message.type === 'FETCH_IMAGE_DATA') {
    const url = message.url;
    if (!url) {
      sendResponse({ success: false, error: 'No URL provided' });
      return false;
    }

    fetch(url, { credentials: 'include' })
      .catch(() => fetch(url))
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const mimeHeader = res.headers.get('content-type');
        const mimeType = (mimeHeader ? mimeHeader.split(';')[0].trim() : 'image/png') || 'image/png';
        const buffer = await res.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        const len = bytes.byteLength;
        const chunkSize = 8192;
        for (let i = 0; i < len; i += chunkSize) {
          const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
          binary += String.fromCharCode.apply(null, chunk);
        }
        const base64 = btoa(binary);
        const dataUrl = `data:${mimeType};base64,${base64}`;
        sendResponse({
          success: true,
          dataUrl: dataUrl,
          mimeType: mimeType,
          size: len
        });
      })
      .catch((err) => {
        sendResponse({ success: false, error: err.message });
      });
    return true; // Keep message channel open for async response
  }
});
