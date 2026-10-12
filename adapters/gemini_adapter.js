/**
 * adapters/gemini_adapter.js
 * Scraper and DOM adapter for Google Gemini (gemini.google.com)
 */
(function (global) {
  'use strict';

  class GeminiAdapter {
    constructor() {
      this.platformId = 'gemini';
      this.name = 'Google Gemini';
    }

    getConfig() {
      return global.CapsuleSelectorConfig ? global.CapsuleSelectorConfig.get(this.platformId) : null;
    }

    async extractConversation() {
      const config = this.getConfig();
      if (!config) throw new Error('Gemini configuration missing');

      // Find turn containers
      let turnElements = [];
      for (const sel of config.turnSelectors) {
        const els = document.querySelectorAll(sel);
        if (els && els.length > 0) {
          const raw = Array.from(els);
          turnElements = raw.filter(el => !raw.some(other => other !== el && other.contains(el)));
          if (turnElements.length > 0) break;
        }
      }

      const turns = [];
      const allAttachments = [];

      for (let i = 0; i < turnElements.length; i++) {
        const el = turnElements[i];
        const isUser = config.userRoleCheck(el);
        const role = isUser ? 'user' : 'assistant';

        // Extract text
        let content = '';
        if (global.CapsuleSelectorConfig && typeof global.CapsuleSelectorConfig.extractCleanText === 'function') {
          content = global.CapsuleSelectorConfig.extractCleanText(el, isUser, this.platformId);
        } else {
          const textNodes = el.querySelectorAll(config.textSelectors.join(', '));
          if (textNodes.length > 0) {
            content = Array.from(textNodes).map(n => n.innerText || n.textContent).join('\n\n').trim();
          } else {
            content = (el.innerText || el.textContent || '').trim();
          }
        }

        // Attachments
        const turnAttachments = [];
        const attEls = el.querySelectorAll(config.attachmentSelectors.join(', '));
        for (const attEl of attEls) {
          if (global.CapsuleMediaExtractor) {
            const media = await global.CapsuleMediaExtractor.extractMediaFromElement(attEl);
            if (media) {
              turnAttachments.push(media);
              allAttachments.push(media);
            }
          }
        }

        // Also scan all img elements in turn that are not small avatar icons
        const allImgs = el.querySelectorAll('img');
        for (const img of allImgs) {
          const w = img.naturalWidth || img.width || 0;
          const h = img.naturalHeight || img.height || 0;
          const isAvatar = (img.alt && /avatar|user|gemini|google/i.test(img.alt) && (w <= 40 || h <= 40)) ||
                           (img.className && /avatar/i.test(img.className)) ||
                           (w > 0 && w <= 36 && h > 0 && h <= 36);
          if (!isAvatar && img.src && (img.src.startsWith('http') || img.src.startsWith('blob:') || img.src.startsWith('data:'))) {
            const alreadyCaptured = turnAttachments.some(a => a.sourceUrl === img.src);
            if (!alreadyCaptured && global.CapsuleMediaExtractor) {
              const media = await global.CapsuleMediaExtractor.extractMediaFromElement(img);
              if (media) {
                turnAttachments.push(media);
                allAttachments.push(media);
              }
            }
          }
        }

        if (!content && turnAttachments.length > 0) {
          content = `[Attached image: ${turnAttachments.map(a => a.name).join(', ')}]`;
        }

        if (content || turnAttachments.length > 0) {
          turns.push({
            id: `turn_${i + 1}`,
            index: i,
            role: role,
            content: content,
            attachments: turnAttachments.map(a => ({
              id: a.id,
              name: a.name,
              mimeType: a.mimeType,
              size: a.size,
              dataUrl: a.dataUrl,
              base64: a.base64
            })),
            timestamp: Date.now()
          });
        }
      }

      let title = document.title ? document.title.replace(' - Gemini', '').trim() : 'Gemini Session';
      if (!title || title === 'Gemini') title = 'Gemini Session ' + new Date().toLocaleDateString();

      return {
        sourcePlatform: this.platformId,
        title: title,
        sessionUrl: window.location.href,
        turns: turns,
        attachments: allAttachments
      };
    }

    findInputField() {
      const config = this.getConfig();
      if (config) {
        for (const sel of config.inputSelectors) {
          const el = document.querySelector(sel);
          if (el) return el;
        }
      }
      return document.querySelector('rich-textarea div[contenteditable="true"]') ||
             document.querySelector('rich-textarea') ||
             document.querySelector('div[contenteditable="true"][role="textbox"]') ||
             document.querySelector('div[contenteditable="true"]') ||
             document.querySelector('textarea');
    }

    findUploadTarget() {
      const config = this.getConfig();
      if (config) {
        for (const sel of config.fileInputSelectors) {
          const el = document.querySelector(sel);
          if (el) return el;
        }
      }
      return document.querySelector('rich-textarea') ||
             document.querySelector('.input-area-container') ||
             document.querySelector('.input-area') ||
             document.querySelector('chat-window') ||
             this.findInputField();
    }
  }

  global.CapsuleGeminiAdapter = new GeminiAdapter();
})(typeof window !== 'undefined' ? window : globalThis);
