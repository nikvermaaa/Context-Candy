/**
 * adapters/perplexity_adapter.js
 * Scraper and DOM adapter for Perplexity AI (perplexity.ai)
 */
(function (global) {
  'use strict';

  class PerplexityAdapter {
    constructor() {
      this.platformId = 'perplexity';
      this.name = 'Perplexity AI';
    }

    getConfig() {
      return global.CapsuleSelectorConfig ? global.CapsuleSelectorConfig.get(this.platformId) : null;
    }

    async extractConversation() {
      const config = this.getConfig();
      if (!config) throw new Error('Perplexity configuration missing');

      let turnElements = [];
      for (const sel of config.turnSelectors) {
        const els = document.querySelectorAll(sel);
        if (els && els.length > 0) {
          turnElements = Array.from(els);
          break;
        }
      }

      const turns = [];
      const allAttachments = [];

      for (let i = 0; i < turnElements.length; i++) {
        const el = turnElements[i];
        const isUser = config.userRoleCheck(el);
        const role = isUser ? 'user' : 'assistant';

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

        if (content || turnAttachments.length > 0) {
          turns.push({
            id: `turn_${i + 1}`,
            index: i,
            role: role,
            content: content,
            attachments: turnAttachments.map(a => ({ id: a.id, name: a.name, mimeType: a.mimeType, size: a.size })),
            timestamp: Date.now()
          });
        }
      }

      let title = document.title ? document.title.replace(' - Perplexity', '').trim() : 'Perplexity Query';
      if (!title || title === 'Perplexity') title = 'Perplexity Research ' + new Date().toLocaleDateString();

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
      if (!config) return null;
      for (const sel of config.inputSelectors) {
        const el = document.querySelector(sel);
        if (el) return el;
      }
      return null;
    }

    findUploadTarget() {
      const config = this.getConfig();
      if (!config) return null;
      for (const sel of config.fileInputSelectors) {
        const el = document.querySelector(sel);
        if (el) return el;
      }
      return this.findInputField();
    }
  }

  global.CapsulePerplexityAdapter = new PerplexityAdapter();
})(typeof window !== 'undefined' ? window : globalThis);
