/**
 * adapters/chatgpt_adapter.js
 * Scraper and DOM adapter for OpenAI ChatGPT (chatgpt.com / chat.openai.com)
 * Supports modern Next.js DOM structures, role-specific content containers,
 * document cards, uploaded files, and Main World page bridge fallback.
 */
(function (global) {
  'use strict';

  class ChatGPTAdapter {
    constructor() {
      this.platformId = 'chatgpt';
      this.name = 'ChatGPT';
    }

    getConfig() {
      return global.CapsuleSelectorConfig ? global.CapsuleSelectorConfig.get(this.platformId) : null;
    }

    /**
     * Query the Main World page bridge for intercepted chat API payloads
     * @param {number} timeoutMs
     * @returns {Promise<Object|null>}
     */
    queryPageBridge(timeoutMs = 350) {
      return new Promise((resolve) => {
        const reqId = 'req_cg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        let settled = false;

        function cleanup() {
          if (settled) return;
          settled = true;
          window.removeEventListener('message', onMessage);
          window.removeEventListener('CAPSULE_PAGE_BRIDGE_RESPONSE_EVENT', onEvent);
        }

        function onMessage(e) {
          if (e.data && e.data.type === 'CAPSULE_PAGE_BRIDGE_RESPONSE' && e.data.reqId === reqId) {
            cleanup();
            resolve(e.data);
          }
        }

        function onEvent(e) {
          if (e.detail && e.detail.reqId === reqId) {
            cleanup();
            resolve(e.detail);
          }
        }

        window.addEventListener('message', onMessage);
        window.addEventListener('CAPSULE_PAGE_BRIDGE_RESPONSE_EVENT', onEvent);

        window.postMessage({ type: 'CAPSULE_PAGE_BRIDGE_REQUEST', reqId: reqId }, '*');
        try {
          window.dispatchEvent(
            new CustomEvent('CAPSULE_PAGE_BRIDGE_REQUEST_EVENT', { detail: { reqId: reqId } })
          );
        } catch (err) {}

        setTimeout(() => {
          cleanup();
          resolve(null);
        }, timeoutMs);
      });
    }

    detectRole(el, config) {
      if (!el) return 'user';
      if (typeof config?.userRoleCheck === 'function') {
        return config.userRoleCheck(el) ? 'user' : 'assistant';
      }

      // Check author role attributes directly
      const authorRole = el.getAttribute('data-message-author-role') ||
                         el.querySelector?.('[data-message-author-role]')?.getAttribute('data-message-author-role');
      if (authorRole === 'user') return 'user';
      if (authorRole === 'assistant') return 'assistant';

      // OpenAI screen reader accessibility headings
      const srElements = el.querySelectorAll ? el.querySelectorAll('.sr-only, [class*="sr-only"], h2, h3, h4, h5, h6') : [];
      if (srElements.length > 0) {
        const srText = Array.from(srElements).map(h => (h.textContent || '').trim().toLowerCase()).join(' ');
        if (srText.includes('you said') || srText.includes('you:')) return 'user';
        if (srText.includes('chatgpt said') || srText.includes('chatgpt:') || srText.includes('thought for')) return 'assistant';
      }

      // User edit button
      if (el.querySelector && el.querySelector('button[aria-label*="Edit" i], button[data-testid*="edit" i]')) {
        return 'user';
      }

      // Assistant exclusive action buttons (Do NOT check Copy because user messages also have Copy buttons)
      if (el.querySelector && el.querySelector('button[aria-label*="Good" i], button[aria-label*="Bad" i], button[aria-label*="Read aloud" i], button[aria-label*="thumbs" i], button[aria-label*="Regenerate" i], button[data-testid*="feedback" i]')) {
        return 'assistant';
      }

      // In ChatGPT, assistant messages ALWAYS render markdown blocks
      if (el.querySelector && el.querySelector('.markdown, .prose, [class*="markdown"], [class*="prose"]')) {
        return 'assistant';
      }

      // User messages render whitespace-pre-wrap
      if (el.querySelector && el.querySelector('.whitespace-pre-wrap, [class*="whitespace-pre-wrap"], div[dir="auto"]')) {
        return 'user';
      }

      // Check test ID and class tokens
      const idAndClass = ((el.getAttribute('data-testid') || '') + ' ' + (el.className || '')).toLowerCase();
      if (/\buser\b/.test(idAndClass)) return 'user';
      if (/\b(assistant|agent)\b/.test(idAndClass)) return 'assistant';

      return 'user';
    }

    async extractConversation() {
      const config = this.getConfig();
      if (!config) throw new Error('ChatGPT configuration missing');

      // 1. Query the main world page bridge
      const bridgeData = await this.queryPageBridge(350);

      // 2. Multi-strategy DOM turn discovery
      let turnElements = [];
      for (const sel of config.turnSelectors) {
        try {
          const els = document.querySelectorAll(sel);
          if (els && els.length > 0) {
            const raw = Array.from(els);
            const filtered = raw.filter(el => !raw.some(other => other !== el && other.contains(el)));
            if (filtered.length > 0) {
              turnElements = filtered;
              break;
            }
          }
        } catch (selErr) {}
      }

      // 3. Safeguard: Ensure both user and assistant turns are included
      if (turnElements.length > 0) {
        const hasAssistant = turnElements.some(el => this.detectRole(el, config) === 'assistant');
        const hasUser = turnElements.some(el => this.detectRole(el, config) === 'user');

        if (!hasAssistant || !hasUser) {
          const extraCandidates = document.querySelectorAll(
            '[data-message-author-role="user"], [data-message-author-role="assistant"], .whitespace-pre-wrap, .markdown, .prose'
          );
          if (extraCandidates && extraCandidates.length > 0) {
            const combined = new Set(turnElements);
            extraCandidates.forEach(cand => {
              const row = cand.closest('[data-testid^="conversation-turn"], article, div[class*="turn"], div[data-message-id]') || cand;
              combined.add(row);
            });
            const list = Array.from(combined);
            list.sort((a, b) => {
              if (a === b) return 0;
              const pos = a.compareDocumentPosition(b);
              if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
              if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
              return 0;
            });
            turnElements = list.filter(el => !list.some(other => other !== el && other.contains(el)));
          }
        }
      }

      // 4. Fallback: If DOM turns empty, check bridge data directly
      if (turnElements.length === 0 && bridgeData && bridgeData.turns && bridgeData.turns.length > 0) {
        return this.buildConversationFromBridge(bridgeData);
      }

      const turns = [];
      const allAttachments = [];

      for (let i = 0; i < turnElements.length; i++) {
        const el = turnElements[i];
        const role = this.detectRole(el, config);
        const isUser = (role === 'user');

        // Extract targeted content based on role
        let content = '';
        if (role === 'assistant') {
          const mdContainer = el.querySelector('.markdown, .prose, [class*="markdown"], [class*="prose"]');
          if (mdContainer && global.CapsuleSelectorConfig?.extractCleanText) {
            content = global.CapsuleSelectorConfig.extractCleanText(mdContainer, false, this.platformId);
          } else if (mdContainer) {
            content = (mdContainer.innerText || mdContainer.textContent || '').trim();
          }
        } else {
          const userContainer = el.querySelector('.whitespace-pre-wrap, [class*="whitespace-pre-wrap"], div[dir="auto"]');
          if (userContainer && global.CapsuleSelectorConfig?.extractCleanText) {
            content = global.CapsuleSelectorConfig.extractCleanText(userContainer, true, this.platformId);
          } else if (userContainer) {
            content = (userContainer.innerText || userContainer.textContent || '').trim();
          }
        }

        // Fallback to extracting from whole element if targeted container was not found
        if (!content) {
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
        }

        const turnAttachments = [];

        // Check configured attachment selectors
        const attEls = el.querySelectorAll(config.attachmentSelectors.join(', '));
        for (const attEl of attEls) {
          if (global.CapsuleMediaExtractor) {
            const media = await global.CapsuleMediaExtractor.extractMediaFromElement(attEl);
            if (media && !turnAttachments.some(a => a.name === media.name)) {
              turnAttachments.push(media);
              allAttachments.push(media);
            }
          }
        }

        // Check document cards and download buttons in turn
        const cardCandidates = el.querySelectorAll('div, button, a');
        for (const cand of cardCandidates) {
          const txt = (cand.innerText || cand.textContent || '').trim();
          if (
            /(?:document|file)\s*[•·-]/i.test(txt) ||
            /\.(pdf|md|docx?|xlsx?|csv|zip|pptx?|txt|json)\b/i.test(txt) ||
            cand.getAttribute('data-testid')?.includes('file') ||
            cand.getAttribute('data-testid')?.includes('attachment')
          ) {
            if (global.CapsuleMediaExtractor) {
              const media = await global.CapsuleMediaExtractor.extractMediaFromElement(cand);
              if (media && !turnAttachments.some(a => a.name === media.name)) {
                turnAttachments.push(media);
                allAttachments.push(media);
              }
            }
          }
        }

        // Check img elements in turn (excluding avatars)
        const allImgs = el.querySelectorAll('img');
        for (const img of allImgs) {
          const w = img.naturalWidth || img.width || 0;
          const h = img.naturalHeight || img.height || 0;
          const isAvatar = (img.alt && /avatar|user|chatgpt|openai/i.test(img.alt) && (w <= 40 || h <= 40)) ||
                           (img.className && /avatar/i.test(img.className)) ||
                           (w > 0 && w <= 36 && h > 0 && h <= 36);
          if (!isAvatar && img.src && (img.src.startsWith('http') || img.src.startsWith('blob:') || img.src.startsWith('data:'))) {
            const alreadyCaptured = turnAttachments.some(a => a.sourceUrl === img.src);
            if (!alreadyCaptured && global.CapsuleMediaExtractor) {
              const media = await global.CapsuleMediaExtractor.extractMediaFromElement(img);
              if (media && !turnAttachments.some(a => a.name === media.name)) {
                turnAttachments.push(media);
                allAttachments.push(media);
              }
            }
          }
        }

        content = content.trim();
        if (!content && turnAttachments.length > 0) {
          content = `[Attached media/document: ${turnAttachments.map(a => a.name).join(', ')}]`;
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
              size: a.size || 0,
              isMediaReference: true
            })),
            timestamp: Date.now()
          });
        }
      }

      // Check captured uploads cache from drag-and-drop or file input
      if (global.CapsuleMediaExtractor?.capturedUploads) {
        for (const [key, upload] of global.CapsuleMediaExtractor.capturedUploads.entries()) {
          if (!allAttachments.some(a => a.name === upload.name)) {
            const att = {
              id: 'att_upload_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
              name: upload.name,
              mimeType: upload.mimeType || 'application/octet-stream',
              size: upload.size || 0,
              isMediaReference: true
            };
            allAttachments.push(att);
            if (turns.length > 0) {
              turns[0].attachments.push(att);
            }
          }
        }
      }

      let title = document.title ? document.title.replace(' - ChatGPT', '').trim() : 'ChatGPT Session';
      if (!title || title === 'ChatGPT') title = 'ChatGPT Session ' + new Date().toLocaleDateString();

      return {
        sourcePlatform: this.platformId,
        title: title,
        sessionUrl: window.location.href,
        turns: turns,
        attachments: allAttachments
      };
    }

    buildConversationFromBridge(bridgeData) {
      const turns = [];
      const allAttachments = [];

      bridgeData.turns.forEach((bTurn, idx) => {
        const turnAtts = [];
        if (Array.isArray(bTurn.attachments)) {
          bTurn.attachments.forEach(att => {
            const attObj = {
              id: 'att_b_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
              name: att.fileName || 'attachment',
              mimeType: att.fileType || 'application/octet-stream',
              size: att.fileSize || 0,
              isMediaReference: true
            };
            turnAtts.push(attObj);
            allAttachments.push(attObj);
          });
        }

        turns.push({
          id: `turn_${idx + 1}`,
          index: idx,
          role: bTurn.role || 'user',
          content: (bTurn.text || '').trim(),
          attachments: turnAtts,
          timestamp: Date.now()
        });
      });

      return {
        sourcePlatform: this.platformId,
        title: bridgeData.title || (document.title ? document.title.replace(' - ChatGPT', '').trim() : 'ChatGPT Session'),
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

  global.CapsuleChatGPTAdapter = new ChatGPTAdapter();
})(typeof window !== 'undefined' ? window : globalThis);
