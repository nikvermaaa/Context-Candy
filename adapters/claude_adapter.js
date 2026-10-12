/**
 * adapters/claude_adapter.js
 * Scraper and DOM adapter for Anthropic Claude (claude.ai)
 * Handles full conversation history extraction, user input code chips,
 * pasted snippets, uploaded files, and assistant artifacts.
 */
(function (global) {
  'use strict';

  class ClaudeAdapter {
    constructor() {
      this.platformId = 'claude';
      this.name = 'Anthropic Claude';
    }

    getConfig() {
      return global.CapsuleSelectorConfig ? global.CapsuleSelectorConfig.get(this.platformId) : null;
    }

    /**
     * Query the Main World page bridge for intercepted chat API payloads or React Fiber data
     * @param {number} timeoutMs
     * @returns {Promise<Object|null>}
     */
    queryPageBridge(timeoutMs = 350) {
      return new Promise((resolve) => {
        const reqId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
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

    detectLanguage(filename, code) {
      if (filename) {
        const m = filename.match(/\.([a-zA-Z0-9]+)$/);
        if (m) {
          const ext = m[1].toLowerCase();
          const map = {
            py: 'python', js: 'javascript', ts: 'typescript', jsx: 'jsx', tsx: 'tsx',
            cpp: 'cpp', c: 'c', h: 'c', hpp: 'cpp', rs: 'rust', go: 'go',
            html: 'html', css: 'css', json: 'json', md: 'markdown', sh: 'bash',
            bash: 'bash', zsh: 'bash', sql: 'sql', java: 'java', kt: 'kotlin',
            rb: 'ruby', php: 'php', swift: 'swift', yaml: 'yaml', yml: 'yaml',
            xml: 'xml', txt: 'plaintext'
          };
          if (map[ext]) return map[ext];
        }
      }
      if (code) {
        if (code.includes('def ') || (code.includes('import ') && code.includes(':'))) return 'python';
        if (code.includes('function ') || code.includes('const ') || code.includes('let ')) return 'javascript';
        if (code.includes('public class ') || code.includes('System.out')) return 'java';
        if (code.includes('fn main') || code.includes('let mut ')) return 'rust';
        if (code.includes('SELECT ') || (code.includes('FROM ') && code.includes('WHERE '))) return 'sql';
        if (code.startsWith('<!DOCTYPE') || code.includes('<html')) return 'html';
      }
      return 'plaintext';
    }

    formatCodeBlock(filename, code) {
      const lang = this.detectLanguage(filename, code);
      const safeName = filename || 'Attached Code';
      return `\n\n[Attached Code: ${safeName}]\n\`\`\`${lang}\n${code.trim()}\n\`\`\`\n`;
    }

    async extractConversation() {
      const config = this.getConfig();
      if (!config) throw new Error('Claude configuration missing');

      // 1. Query the main world page bridge for high-fidelity chat data
      const bridgeData = await this.queryPageBridge(350);

      // 2. Find turn containers in DOM
      let turnElements = [];
      for (const sel of config.turnSelectors) {
        const els = document.querySelectorAll(sel);
        if (els && els.length > 0) {
          const raw = Array.from(els);
          turnElements = raw.filter(el => !raw.some(other => other !== el && other.contains(el)));
          if (turnElements.length > 0) {
            break;
          }
        }
      }

      // Safeguard: Ensure assistant turns are included if the selector only caught user turns
      const hasAssistant = turnElements.some(el => !config.userRoleCheck(el));
      if (!hasAssistant && turnElements.length > 0) {
        const assistantEls = document.querySelectorAll(
          '.font-claude-message, div[class*="font-claude"], [data-testid="chat-message"], [data-testid="assistant-message"], div[data-is-streaming], div.standard-markdown, div.prose'
        );
        if (assistantEls && assistantEls.length > 0) {
          const combined = Array.from(new Set([...turnElements, ...Array.from(assistantEls)]));
          combined.sort((a, b) => {
            if (a === b) return 0;
            const pos = a.compareDocumentPosition(b);
            if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
            if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
            return 0;
          });
          turnElements = combined.filter(el => !combined.some(other => other !== el && other.contains(el)));
        }
      }

      // Fallback: If DOM is completely empty/virtualized but bridge has intercepted turns, use bridge directly
      if (turnElements.length === 0 && bridgeData && bridgeData.turns && bridgeData.turns.length > 0) {
        return this.buildConversationFromBridge(bridgeData);
      }

      const turns = [];
      const allAttachments = [];

      for (let i = 0; i < turnElements.length; i++) {
        const el = turnElements[i];
        const isUser = config.userRoleCheck(el);
        const role = isUser ? 'user' : 'assistant';

        // Expand turn scope to find sibling attachment chips and parent row containers
        const turnScope = el.closest(
          '.group, [data-testid*="row"], [class*="ChatMessage"], div[class*="flex-col"], [data-testid="chat-message"]'
        ) || el.parentElement?.parentElement || el.parentElement || el;

        // Extract clean text from turn element
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
        const turnCodeBlocks = [];

        // Check for attached code chips inside the turn scope
        const chipEls = turnScope.querySelectorAll(config.attachmentSelectors.join(', '));
        for (const chipEl of chipEls) {
          const directCode = chipEl.getAttribute('data-capsule-code');
          const chipFilename = chipEl.getAttribute('data-capsule-filename') || 'Attached Code';
          const chipMime = chipEl.getAttribute('data-capsule-mimetype') || 'text/plain';

          if (directCode && directCode.trim()) {
            turnCodeBlocks.push({
              fileName: chipFilename,
              content: directCode.trim(),
              fileType: chipMime
            });
          } else {
            // Check media extractor
            if (global.CapsuleMediaExtractor) {
              const media = await global.CapsuleMediaExtractor.extractMediaFromElement(chipEl);
              if (media) {
                turnAttachments.push(media);
                allAttachments.push(media);
              }
            }
          }
        }

        // Bridge synchronization: Check if bridgeData has matching turn attachments
        if (bridgeData && bridgeData.turns && bridgeData.turns[i]) {
          const bTurn = bridgeData.turns[i];
          if (bTurn.attachments && Array.isArray(bTurn.attachments)) {
            for (const bAtt of bTurn.attachments) {
              if (bAtt.isImage || (bAtt.fileType && bAtt.fileType.startsWith('image/')) || bAtt.dataUrl) {
                let imgDataUrl = bAtt.dataUrl || null;
                let imgBase64 = bAtt.base64 || (imgDataUrl && imgDataUrl.includes(',') ? imgDataUrl.split(',')[1] : null);
                if (!imgDataUrl && bAtt.url && global.CapsuleMediaExtractor) {
                  try {
                    const fetchedBlob = await global.CapsuleMediaExtractor.fetchBinaryWithAuth(bAtt.url);
                    if (fetchedBlob) {
                      imgDataUrl = await global.CapsuleMediaExtractor.blobToDataUrl(fetchedBlob);
                      if (imgDataUrl && imgDataUrl.includes(',')) imgBase64 = imgDataUrl.split(',')[1];
                    }
                  } catch (eF) {}
                }
                const imgAttachment = {
                  id: 'att_bridge_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                  name: bAtt.fileName || 'image.png',
                  mimeType: bAtt.fileType || 'image/png',
                  size: bAtt.fileSize || 0,
                  dataUrl: imgDataUrl,
                  base64: imgBase64,
                  sourceUrl: bAtt.url
                };
                turnAttachments.push(imgAttachment);
                allAttachments.push(imgAttachment);
              } else if (bAtt.content && bAtt.content.trim()) {
                const alreadyHas = turnCodeBlocks.some(
                  c => c.fileName === bAtt.fileName || c.content === bAtt.content
                );
                if (!alreadyHas) {
                  turnCodeBlocks.push({
                    fileName: bAtt.fileName || 'Pasted content',
                    content: bAtt.content.trim(),
                    fileType: bAtt.fileType || 'text/plain'
                  });
                }
              }
            }
          }
        }

        // Append extracted code blocks to turn content if not already present
        for (const codeItem of turnCodeBlocks) {
          const snippet = codeItem.content.substring(0, Math.min(30, codeItem.content.length));
          if (!content.includes(snippet)) {
            content += this.formatCodeBlock(codeItem.fileName, codeItem.content);
          }

          // Register in attachments package
          const base64Data = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(codeItem.content))) : '';
          const codeAttachment = {
            id: 'code_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            name: codeItem.fileName,
            mimeType: codeItem.fileType || 'text/plain',
            size: codeItem.content.length,
            dataUrl: 'data:text/plain;base64,' + base64Data,
            base64: base64Data,
            textContent: codeItem.content
          };
          turnAttachments.push(codeAttachment);
          allAttachments.push(codeAttachment);
        }

        // Fallback: check all img elements in turnScope that are not small avatar icons
        const allImgs = turnScope.querySelectorAll('img');
        for (const img of allImgs) {
          const w = img.naturalWidth || img.width || 0;
          const h = img.naturalHeight || img.height || 0;
          const isAvatar = (img.alt && /avatar|user|claude|anthropic/i.test(img.alt) && (w <= 40 || h <= 40)) ||
                           (img.className && /avatar/i.test(img.className)) ||
                           (w > 0 && w <= 36 && h > 0 && h <= 36);
          if (!isAvatar && img.src && (img.src.startsWith('http') || img.src.startsWith('blob:') || img.src.startsWith('data:'))) {
            const alreadyImg = turnAttachments.some(a => a.sourceUrl === img.src);
            if (!alreadyImg && global.CapsuleMediaExtractor) {
              const media = await global.CapsuleMediaExtractor.extractMediaFromElement(img);
              if (media) {
                turnAttachments.push(media);
                allAttachments.push(media);
              }
            }
          }
        }

        // Check document cards and file download buttons in turnScope (e.g. "Document • PDF", "Download")
        const cardCandidates = turnScope.querySelectorAll('div, button, a');
        for (const cand of cardCandidates) {
          const txt = (cand.innerText || cand.textContent || '').trim();
          if (
            /(?:document|file)\s*[•·-]/i.test(txt) ||
            (/download/i.test(txt) && /\.(pdf|md|docx?|xlsx?|csv|zip)\b/i.test(txt)) ||
            cand.getAttribute('data-testid')?.includes('file') ||
            cand.getAttribute('data-testid')?.includes('attachment') ||
            cand.getAttribute('data-testid')?.includes('artifact')
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
              size: a.size,
              dataUrl: a.dataUrl,
              base64: a.base64
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

      // Title detection
      let title = bridgeData?.title;
      if (!title && document.title) {
        title = document.title.replace(' - Claude', '').trim();
      }
      if (!title || title === 'Claude') {
        title = 'Claude Session ' + new Date().toLocaleDateString();
      }

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
        let content = (bTurn.text || '').trim();
        const turnAttachments = [];

        if (Array.isArray(bTurn.attachments)) {
          bTurn.attachments.forEach(att => {
            if (att.content) {
              content += this.formatCodeBlock(att.fileName, att.content);
              const b64 = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(att.content))) : '';
              const attObj = {
                id: 'code_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                name: att.fileName || 'Pasted content',
                mimeType: att.fileType || 'text/plain',
                size: att.content.length,
                dataUrl: 'data:text/plain;base64,' + b64,
                base64: b64
              };
              turnAttachments.push(attObj);
              allAttachments.push(attObj);
            }
          });
        }

        turns.push({
          id: `turn_${idx + 1}`,
          index: idx,
          role: bTurn.role,
          content: content.trim(),
          attachments: turnAttachments,
          timestamp: Date.now()
        });
      });

      return {
        sourcePlatform: this.platformId,
        title: bridgeData.title || (document.title ? document.title.replace(' - Claude', '').trim() : 'Claude Session'),
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

  global.CapsuleClaudeAdapter = new ClaudeAdapter();
})(typeof window !== 'undefined' ? window : globalThis);
