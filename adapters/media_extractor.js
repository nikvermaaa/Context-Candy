/**
 * adapters/media_extractor.js
 * Multi-strategy binary retrieval for images and documents.
 * 1. Proactive capture: Listens to drag-and-drop / input file events in the DOM.
 * 2. Authenticated Fetch: Captures session-bound or signed CDN URLs before expiry.
 * 3. Canvas Pixel Extract: Draws rendered <img> elements onto offscreen canvas for blob export.
 */
(function (global) {
  'use strict';

  // In-memory cache of files captured at upload time
  const capturedUploads = new Map();

  // Initialize upload event listeners once document is ready
  function initUploadInterceptor() {
    try {
      // Intercept file inputs
      document.addEventListener('change', (e) => {
        const target = e.target;
        if (target && target.tagName === 'INPUT' && target.type === 'file' && target.files) {
          for (let i = 0; i < target.files.length; i++) {
            const file = target.files[i];
            cacheFile(file);
          }
        }
      }, true);

      // Intercept drop events
      document.addEventListener('drop', (e) => {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          for (let i = 0; i < e.dataTransfer.files.length; i++) {
            const file = e.dataTransfer.files[i];
            cacheFile(file);
          }
        }
      }, true);
    } catch (err) {
      console.warn('[Capsule MediaExtractor] Failed to attach upload interceptors:', err);
    }
  }

  function cacheFile(file) {
    const key = `${file.name}_${file.size}`;
    capturedUploads.set(key, {
      name: file.name,
      mimeType: file.type,
      size: file.size,
      blob: file,
      capturedAt: Date.now()
    });
  }

  /**
   * Extract image bytes via canvas drawing fallback
   * Bypasses URL expiry and private object URLs
   * @param {HTMLImageElement} imgEl
   * @returns {Promise<Blob|null>}
   */
  async function extractBlobFromImageElement(imgEl) {
    if (!imgEl) return null;

    // Fast-path: if src is already data: or blob:, fetch directly
    if (imgEl.src && (imgEl.src.startsWith('data:') || imgEl.src.startsWith('blob:'))) {
      try {
        const directBlob = await fetchBinaryWithAuth(imgEl.src);
        if (directBlob) return directBlob;
      } catch (e) {}
    }

    // Attempt 1: If image is already rendered and has natural dimensions
    try {
      if (imgEl.complete && (imgEl.naturalWidth > 0 || imgEl.width > 0)) {
        const renderedBlob = await drawToBlob(imgEl);
        if (renderedBlob) return renderedBlob;
      }
    } catch (e) {}

    // Attempt 2: Load via offscreen Image with anonymous CORS to avoid tainted canvas
    if (imgEl.src && !imgEl.src.startsWith('data:') && !imgEl.src.startsWith('blob:')) {
      try {
        const offscreenBlob = await new Promise((resolve) => {
          const tempImg = new Image();
          tempImg.crossOrigin = 'anonymous';
          tempImg.onload = () => {
            drawToBlob(tempImg).then(resolve).catch(() => resolve(null));
          };
          tempImg.onerror = () => resolve(null);
          setTimeout(() => resolve(null), 3000);
          tempImg.src = imgEl.src;
        });
        if (offscreenBlob) return offscreenBlob;
      } catch (e) {}
    }

    // Attempt 3: Wait for pending load if not yet complete
    if (!imgEl.complete) {
      try {
        const pendingBlob = await new Promise((resolve) => {
          const onLoad = () => {
            drawToBlob(imgEl).then(resolve).catch(() => resolve(null));
          };
          imgEl.addEventListener('load', onLoad, { once: true });
          imgEl.addEventListener('error', () => resolve(null), { once: true });
          setTimeout(() => resolve(null), 3000);
        });
        if (pendingBlob) return pendingBlob;
      } catch (e) {}
    }

    return null;
  }

  function drawToBlob(imgEl) {
    return new Promise((resolve) => {
      try {
        const canvas = document.createElement('canvas');
        const w = imgEl.naturalWidth || imgEl.width || 300;
        const h = imgEl.naturalHeight || imgEl.height || 300;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imgEl, 0, 0, w, h);
        canvas.toBlob((blob) => {
          resolve(blob);
        }, 'image/png');
      } catch (err) {
        // Tainted canvas or render error
        resolve(null);
      }
    });
  }

  /**
   * Convert any image blob to image/png for strict Chromium ClipboardItem compliance
   * @param {Blob} blob
   * @returns {Promise<Blob>}
   */
  async function convertBlobToPng(blob) {
    if (!blob) return null;
    if (blob.type === 'image/png') return blob;

    return new Promise((resolve) => {
      try {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width || 300;
            canvas.height = img.naturalHeight || img.height || 300;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            canvas.toBlob((pngBlob) => {
              URL.revokeObjectURL(url);
              resolve(pngBlob || blob);
            }, 'image/png');
          } catch (e) {
            URL.revokeObjectURL(url);
            resolve(blob);
          }
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(blob);
        };
        img.src = url;
      } catch (err) {
        resolve(blob);
      }
    });
  }

  function blobToDataUrl(blob) {
    if (!blob) return Promise.resolve(null);
    if (typeof blob === 'string') return Promise.resolve(blob);
    return new Promise((resolve) => {
      try {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      } catch (e) {
        resolve(null);
      }
    });
  }

  function dataUrlToBlob(dataUrl, fallbackMime = 'application/octet-stream') {
    if (!dataUrl) return null;
    try {
      const parts = dataUrl.split(',');
      const match = parts[0].match(/:(.*?);/);
      const mime = match ? match[1] : fallbackMime;
      const bstr = atob(parts[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new Blob([u8arr], { type: mime });
    } catch (e) {
      return null;
    }
  }

  /**
   * Fetch binary blob via authenticated request using active browser session or background proxy
   * @param {string} url
   * @returns {Promise<Blob|null>}
   */
  async function fetchBinaryWithAuth(url) {
    if (!url) return null;
    try {
      // Scheme 1: In-page data: and blob: URLs
      // Blob URLs exist only in the renderer process and must be fetched directly without mode: 'cors'
      if (url.startsWith('data:') || url.startsWith('blob:')) {
        try {
          const res = await fetch(url);
          if (res.ok) {
            return await res.blob();
          }
        } catch (eBlob) {}
      }

      // Scheme 2: Extension background service worker proxy
      // Bypasses page CSP and cross-origin restrictions for CDN images
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage && !url.startsWith('blob:')) {
        try {
          const bgData = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'FETCH_IMAGE_DATA', url }, (res) => {
              if (chrome.runtime.lastError || !res || !res.success) {
                resolve(null);
              } else {
                resolve(res);
              }
            });
          });

          if (bgData && bgData.dataUrl) {
            return dataUrlToBlob(bgData.dataUrl, bgData.mimeType);
          }
        } catch (eBg) {}
      }

      // Scheme 3: Authenticated fetch with session cookies
      try {
        const res = await fetch(url, {
          method: 'GET',
          credentials: 'include'
        });
        if (res.ok) {
          return await res.blob();
        }
      } catch (e1) {}

      // Scheme 4: Direct unauthenticated fetch
      try {
        const res = await fetch(url);
        if (res.ok) {
          return await res.blob();
        }
      } catch (e2) {}

      return null;
    } catch (err) {
      return null;
    }
  }

  /**
   * Lightweight attachment metadata detector for DOM elements (images, file cards, download links, code)
   * Captures filenames and types for prompt reference and usability notification without binary overhead.
   * @param {HTMLElement} el
   * @returns {Promise<Object|null>} attachment package
   */
  async function extractMediaFromElement(el) {
    if (!el) return null;

    // Check if element is an annotated or embedded code attachment
    const codePayload = el.getAttribute('data-capsule-code');
    if (codePayload) {
      return {
        id: 'code_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        name: (el.getAttribute('data-capsule-filename') || 'Attached Code').trim(),
        mimeType: el.getAttribute('data-capsule-mimetype') || 'text/plain',
        size: codePayload.length,
        extractedText: codePayload,
        isCode: true,
        isRetrieved: true
      };
    }

    let name = 'attachment';
    let mimeType = 'application/octet-stream';
    let found = false;

    // Check if element is or contains <img>
    const imgEl = el.tagName === 'IMG' ? el : el.querySelector('img');
    if (imgEl) {
      name = imgEl.alt || imgEl.getAttribute('data-filename') || 'image.png';
      mimeType = 'image/png';
      found = true;
    }

    // Check background-image
    if (!found && el.style) {
      const bgImg = window.getComputedStyle ? window.getComputedStyle(el).backgroundImage : el.style.backgroundImage;
      if (bgImg && bgImg.includes('url(')) {
        name = 'image.png';
        mimeType = 'image/png';
        found = true;
      }
    }

    // Check if element is a PDF/document link
    const linkEl = el.tagName === 'A' ? el : el.querySelector('a[href]');
    if (!found && linkEl && linkEl.href) {
      name = linkEl.download || linkEl.textContent.trim() || 'document.pdf';
      mimeType = name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream';
      found = true;
    }

    // Check if element is a document card (e.g. "Document • PDF", [Download], ".pdf", ".md", ".docx")
    if (!found) {
      const fullText = (el.innerText || el.textContent || '').trim();
      const docBadgeMatch = fullText.match(/(?:Document|File)\s*[•·-]\s*([A-Za-z0-9]+)/i);
      const downloadBtn = el.querySelector('button, [role="button"]');
      const hasDownload = downloadBtn && /download/i.test(downloadBtn.textContent || downloadBtn.getAttribute('aria-label') || '');
      const fileExtMatch = fullText.match(/\b([a-zA-Z0-9_\-\s]+?\.(pdf|md|docx?|xlsx?|csv|zip|pptx?|epub|txt))\b/i);

      if (docBadgeMatch || hasDownload || fileExtMatch) {
        if (fileExtMatch) {
          name = fileExtMatch[1].trim();
          const ext = fileExtMatch[2].toLowerCase();
          const mimeMap = {
            pdf: 'application/pdf', md: 'text/markdown', doc: 'application/msword',
            docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            csv: 'text/csv', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            zip: 'application/zip', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            epub: 'application/epub+zip', txt: 'text/plain'
          };
          mimeType = mimeMap[ext] || 'application/octet-stream';
        } else if (docBadgeMatch) {
          const typeStr = docBadgeMatch[1].toLowerCase();
          const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);
          const titleLine = lines.find(l => !/download|document\s*[•·-]/i.test(l)) || 'document';
          name = `${titleLine}.${typeStr}`;
          mimeType = typeStr === 'pdf' ? 'application/pdf' : 'application/octet-stream';
        } else if (hasDownload) {
          const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);
          const titleLine = lines.find(l => !/download/i.test(l)) || 'document.pdf';
          name = titleLine.includes('.') ? titleLine : `${titleLine}.pdf`;
          mimeType = name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream';
        }
        found = true;
      }
    }

    // Check capturedUploads by matching file text
    if (!found) {
      const text = el.textContent || '';
      for (const [key, cached] of capturedUploads.entries()) {
        if (text.includes(cached.name)) {
          name = cached.name;
          mimeType = cached.mimeType || 'application/octet-stream';
          found = true;
          break;
        }
      }
    }

    // Check generic attachment / file testid or class markers
    if (!found) {
      const testId = el.getAttribute('data-testid') || '';
      const cls = el.className && typeof el.className === 'string' ? el.className : '';
      if (testId.includes('file') || testId.includes('attachment') || testId.includes('artifact') || cls.includes('attachment') || cls.includes('FilePreview') || cls.includes('file-item')) {
        const text = (el.innerText || el.textContent || '').trim();
        const firstLine = text.split('\n')[0]?.trim();
        if (firstLine && firstLine.length < 80) {
          name = firstLine;
          mimeType = name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : (name.toLowerCase().endsWith('.md') ? 'text/markdown' : 'application/octet-stream');
          found = true;
        }
      }
    }

    if (!found) return null;

    return {
      id: 'att_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      name: name.replace(/[\n\r\t]/g, '').trim(),
      mimeType: mimeType,
      size: 0,
      blob: null,
      dataUrl: null,
      base64: null,
      isMediaReference: true,
      isRetrieved: false
    };
  }

  // Self-initialize
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initUploadInterceptor);
    } else {
      initUploadInterceptor();
    }
  }

  global.CapsuleMediaExtractor = {
    extractMediaFromElement,
    extractBlobFromImageElement,
    fetchBinaryWithAuth,
    convertBlobToPng,
    blobToDataUrl,
    dataUrlToBlob,
    capturedUploads
  };
})(typeof window !== 'undefined' ? window : globalThis);
