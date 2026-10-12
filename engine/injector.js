/**
 * engine/injector.js
 * Progressive enhancement injection engine for text and multimodal attachments.
 * Automatically falls back to the Attachment Drawer if file drops are blocked by the host site.
 */
(function (global) {
  'use strict';

  class CapsuleInjector {
    /**
     * Inject formatted prompt text into active AI chat prompt area
     * @param {string} text
     * @returns {boolean} success
     */
    injectText(text) {
      if (!text) return false;

      const adapter = global.CapsuleAdapterManager?.getCurrentAdapter();
      const inputEl = adapter?.findInputField() || this.fallbackFindInput();

      if (!inputEl) {
        console.warn('[CapsuleInjector] Could not find chat input element');
        return false;
      }

      inputEl.focus();

      // Case 1: Standard textarea
      if (inputEl.tagName === 'TEXTAREA') {
        const start = inputEl.selectionStart || 0;
        const end = inputEl.selectionEnd || 0;
        const val = inputEl.value || '';
        inputEl.value = val.substring(0, start) + text + val.substring(end);
        inputEl.selectionStart = inputEl.selectionEnd = start + text.length;

        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }

      // Case 2: ContentEditable div (Claude, Gemini, ChatGPT use rich contenteditables)
      if (inputEl.isContentEditable || inputEl.getAttribute('contenteditable') === 'true') {
        // Try execCommand first (safest for React/ProseMirror/Lexical virtual DOM sync)
        const success = document.execCommand('insertText', false, text);
        if (!success) {
          // Fallback: direct text node replacement
          inputEl.innerText = text;
        }

        inputEl.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        inputEl.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ' ' }));
        return true;
      }

      return false;
    }

    fallbackFindInput() {
      const selectors = [
        'div[contenteditable="true"]',
        'textarea',
        '#prompt-textarea',
        'input[type="text"]'
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) return el;
      }
      return null;
    }

    dataUrlToBlob(dataUrl, fallbackMime = 'application/octet-stream') {
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
     * Deep selector querying that pierces open Shadow DOM roots (e.g. Google Gemini custom elements)
     * @param {string} selector
     * @param {Node} root
     * @returns {Array<HTMLElement>}
     */
    querySelectorAllDeep(selector, root = document) {
      const results = [];
      function search(node) {
        if (!node) return;
        if (node.querySelectorAll) {
          try {
            const matches = node.querySelectorAll(selector);
            for (let i = 0; i < matches.length; i++) {
              results.push(matches[i]);
            }
          } catch (e) {}
        }
        if (node.shadowRoot) {
          search(node.shadowRoot);
        }
        const children = node.children || node.childNodes || [];
        for (let i = 0; i < children.length; i++) {
          const child = children[i];
          if (child.nodeType === 1) { // Node.ELEMENT_NODE
            search(child);
          }
        }
      }
      search(root);
      return results;
    }

    /**
     * Ensure image blob is PNG format for strict Chromium ClipboardItem compliance
     * @param {Blob} blob
     * @returns {Promise<Blob>}
     */
    async convertToPngBlob(blob) {
      if (!blob) return null;
      if (blob.type === 'image/png') return blob;

      if (global.CapsuleMediaExtractor?.convertBlobToPng) {
        try {
          const res = await global.CapsuleMediaExtractor.convertBlobToPng(blob);
          if (res) return res;
        } catch (e) {}
      }

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

    /**
     * Progressive enhancement attempt to inject files into upload zone
     * @param {Array<Object>} attachments - [{ blob, dataUrl, base64, name, mimeType }]
     * @returns {Promise<{success: boolean, injectedCount: number, failedAttachments: Array, copiedToClipboard: boolean}>}
     */
    async injectFiles(attachments) {
      if (!attachments || attachments.length === 0) {
        return { success: true, injectedCount: 0, failedAttachments: [], copiedToClipboard: false };
      }

      const files = [];
      for (const att of attachments) {
        let blob = att.blob;
        if (!blob && att.dataUrl) {
          blob = this.dataUrlToBlob(att.dataUrl, att.mimeType);
        } else if (!blob && att.base64) {
          blob = this.dataUrlToBlob(`data:${att.mimeType || 'image/png'};base64,${att.base64}`, att.mimeType);
        }

        if (blob) {
          const file = new File([blob], att.name || 'image.png', { type: att.mimeType || blob.type || 'image/png' });
          files.push(file);
        }
      }

      if (files.length === 0) {
        return { success: false, injectedCount: 0, failedAttachments: attachments, copiedToClipboard: false };
      }

      // Progressive Enhancement 1: Always copy the primary image to system clipboard as PNG
      // Allows user to press Ctrl+V / Cmd+V in case the host AI site blocks synthetic drag events
      let copiedToClipboard = false;
      const firstImage = files.find(f => f.type.startsWith('image/'));
      if (firstImage) {
        try {
          copiedToClipboard = await this.copyImageToClipboard(firstImage);
        } catch (eClip) {}
      }

      const adapter = global.CapsuleAdapterManager?.getCurrentAdapter();
      const uploadTarget = adapter?.findUploadTarget() || adapter?.findInputField();
      const activeInput = adapter?.findInputField() || uploadTarget;

      try {
        const dt = new DataTransfer();
        files.forEach(f => dt.items.add(f));

        // Attempt 1: Deep search for <input type="file"> across light DOM and shadow roots
        const allFileInputs = this.querySelectorAllDeep('input[type="file"]');
        let fileInputTriggered = false;

        for (const fileInput of allFileInputs) {
          try {
            // Bypass React property cache tracker
            const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files');
            if (descriptor && descriptor.set) {
              descriptor.set.call(fileInput, dt.files);
            } else {
              fileInput.files = dt.files;
            }
            fileInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            fileInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            fileInputTriggered = true;
          } catch (eInput) {}
        }

        // Attempt 2: Synthetic clipboard paste event with attached DataTransfer
        if (activeInput) {
          try {
            activeInput.focus();
            let pasteEvent;
            try {
              pasteEvent = new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                composed: true,
                clipboardData: dt
              });
            } catch (eInit) {
              pasteEvent = new Event('paste', { bubbles: true, cancelable: true, composed: true });
            }

            try {
              Object.defineProperty(pasteEvent, 'clipboardData', {
                value: dt,
                writable: false
              });
            } catch (eDef) {}

            const pasteTargets = [
              activeInput,
              uploadTarget,
              document.querySelector('rich-textarea'),
              document.querySelector('.input-area-container'),
              document.querySelector('.input-area'),
              document.querySelector('chat-window'),
              document.body,
              document
            ].filter(Boolean);

            for (const pTarget of pasteTargets) {
              try {
                pTarget.dispatchEvent(pasteEvent);
              } catch (eP) {}
            }
          } catch (ePaste) {}
        }

        // Attempt 3: Synthetic drag & drop cascade onto composer targets
        const dropTargets = [
          uploadTarget,
          activeInput,
          document.querySelector('rich-textarea'),
          document.querySelector('.input-area-container'),
          document.querySelector('.input-area'),
          document.querySelector('chat-window'),
          document.querySelector('bard-mode'),
          document.querySelector('form'),
          document.querySelector('main'),
          document.body,
          document,
          window
        ].filter(Boolean);

        for (const target of dropTargets) {
          try {
            const dragEnter = new DragEvent('dragenter', { bubbles: true, cancelable: true, composed: true, dataTransfer: dt });
            const dragOver = new DragEvent('dragover', { bubbles: true, cancelable: true, composed: true, dataTransfer: dt });
            const drop = new DragEvent('drop', { bubbles: true, cancelable: true, composed: true, dataTransfer: dt });

            try {
              Object.defineProperty(dragEnter, 'dataTransfer', { value: dt });
              Object.defineProperty(dragOver, 'dataTransfer', { value: dt });
              Object.defineProperty(drop, 'dataTransfer', { value: dt });
            } catch (e) {}

            target.dispatchEvent(dragEnter);
            target.dispatchEvent(dragOver);
            target.dispatchEvent(drop);
          } catch (eDrop) {}
        }

        const dropAccepted = await this.verifyDropAcceptance(500);
        return {
          success: true,
          injectedCount: files.length,
          failedAttachments: [],
          copiedToClipboard: copiedToClipboard,
          fileInputTriggered: fileInputTriggered,
          dropAccepted: dropAccepted
        };
      } catch (err) {
        console.warn('[CapsuleInjector] File injection encountered error, activating clipboard fallback:', err);
        return {
          success: copiedToClipboard,
          injectedCount: files.length,
          failedAttachments: [],
          copiedToClipboard: copiedToClipboard
        };
      }
    }

    injectAttachments(attachments) {
      return this.injectFiles(attachments);
    }

    async verifyDropAcceptance(timeoutMs = 500) {
      return new Promise((resolve) => {
        setTimeout(() => {
          // Look for newly added attachment chips/previews across light DOM and shadow roots
          const previewIndicators = this.querySelectorAllDeep(
            '[data-testid*="attachment"], [class*="attachment"], img[src^="blob:"], .file-preview, [data-testid*="file-"]'
          );
          resolve(previewIndicators && previewIndicators.length > 0);
        }, timeoutMs);
      });
    }

    /**
     * Copy an image directly to the system clipboard (allowing instant Ctrl+V into chat).
     * Enforces strict Chromium PNG format requirement to prevent DOMException errors.
     * @param {Blob} imageBlob
     * @returns {Promise<boolean>}
     */
    async copyImageToClipboard(imageBlob) {
      if (!imageBlob || !navigator.clipboard || !navigator.clipboard.write) {
        return false;
      }
      try {
        if (typeof window !== 'undefined' && window.focus) {
          try { window.focus(); } catch (e) {}
        }

        const pngBlob = await this.convertToPngBlob(imageBlob);
        if (!pngBlob) return false;

        const item = new ClipboardItem({ 'image/png': pngBlob });
        await navigator.clipboard.write([item]);
        return true;
      } catch (err) {
        console.warn('[CapsuleInjector] Clipboard copy failed:', err);
        return false;
      }
    }

    /**
     * Trigger browser download for a fallback attachment file
     * @param {Blob} blob
     * @param {string} filename
     */
    downloadAttachment(blob, filename = 'attachment') {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
  }

  global.CapsuleInjector = new CapsuleInjector();
})(typeof window !== 'undefined' ? window : globalThis);
