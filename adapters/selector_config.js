/**
 * adapters/selector_config.js
 * Hot-patchable selector schema for Claude, Gemini, ChatGPT, Perplexity, and Groq.
 * Emphasizes semantic attributes, ARIA roles, and standard container tags over fragile hashed classes.
 */
(function (global) {
  'use strict';

  const DEFAULT_CONFIG = {
    claude: {
      platformId: 'claude',
      name: 'Anthropic Claude',
      hostMatches: ['claude.ai'],
      // Turn containers
      turnSelectors: [
        'div[data-testid="chat-message"], div[class*="font-claude"], div[class*="font-user"], [data-testid="user-message"], [data-testid="assistant-message"], div.group[data-testid], div[data-is-streaming], div.standard-markdown, div.prose',
        '[data-testid="user-message"], [data-testid="assistant-message"]',
        '.font-claude-message, .font-user-message',
        'div[class*="ChatMessage"]'
      ],
      userRoleCheck: (el) => {
        if (!el) return false;
        if (el.getAttribute('data-testid') === 'user-message') return true;
        if (el.querySelector && el.querySelector('[data-testid="user-message"]')) return true;
        if (el.classList && el.classList.contains('font-user-message')) return true;
        if (el.querySelector && el.querySelector('.font-user-message')) return true;
        if (el.className && typeof el.className === 'string' && (el.className.includes('UserMessage') || el.className.includes('font-user'))) return true;
        if (el.getAttribute('data-message-author-role') === 'user') return true;
        return false;
      },
      textSelectors: ['.font-user-message', '.font-claude-message', '[data-message-author-role] p', '.prose'],
      codeSelectors: ['pre > code', 'div[data-testid="code-block"]', 'pre'],
      // Attachment selectors
      attachmentSelectors: [
        '[data-capsule-code]',
        '[data-testid*="attachment"]',
        '[data-testid*="file"]',
        '[data-testid*="snippet"]',
        '[data-testid*="artifact"]',
        'div[class*="attachment"]',
        'div[class*="snippet"]',
        'div[class*="FilePreview"]',
        'div[class*="file-item"]',
        'div[class*="FileItem"]',
        'div[class*="artifact"]',
        'div[class*="PastedContent"]',
        'img[src^="data:"], img[src*="claude.ai"], img[src*="anthropic"]',
        'button[aria-label*="download" i]',
        'button[aria-label*="Download"]',
        'a[download]',
        'a[href*=".pdf"]',
        'a[href*=".md"]'
      ],
      // Input target
      inputSelectors: [
        'div[contenteditable="true"][data-placeholder]',
        'div[contenteditable="true"].ProseMirror',
        'div[contenteditable="true"]',
        'textarea[placeholder*="Reply"]',
        'fieldset textarea'
      ],
      fileInputSelectors: ['input[type="file"]']
    },

    gemini: {
      platformId: 'gemini',
      name: 'Google Gemini',
      hostMatches: ['gemini.google.com'],
      turnSelectors: [
        'user-query, model-response',
        '[data-test-id="user-query"], [data-test-id="model-response"]',
        '.conversation-container > *',
        '.query-content, .response-content'
      ],
      userRoleCheck: (el) => {
        const tagName = el.tagName.toLowerCase();
        return tagName === 'user-query' ||
               el.getAttribute('data-test-id') === 'user-query' ||
               el.classList.contains('query-content') ||
               el.querySelector('.query-content') !== null;
      },
      textSelectors: ['.query-text', '.response-paragraph', '.markdown', 'p'],
      codeSelectors: ['code-block', 'pre code', 'pre'],
      attachmentSelectors: [
        'img.image-preview',
        'uploaded-file-item',
        'img[src^="blob:"]',
        'img[src*="googleusercontent.com"]',
        'a[download]'
      ],
      inputSelectors: [
        'rich-textarea div[contenteditable="true"]',
        'rich-textarea',
        'div[contenteditable="true"][aria-label*="prompt"]',
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"]',
        'textarea.textarea',
        'textarea'
      ],
      fileInputSelectors: [
        'input[type="file"]',
        'rich-textarea input[type="file"]',
        '.input-area input[type="file"]',
        '.input-area-container input[type="file"]'
      ]
    },

    chatgpt: {
      platformId: 'chatgpt',
      name: 'ChatGPT',
      hostMatches: ['chatgpt.com', 'chat.openai.com'],
      turnSelectors: [
        '[data-testid^="conversation-turn"]',
        'article',
        '[data-message-author-role="user"], [data-message-author-role="assistant"]',
        'div[class*="group/conversation-turn"]',
        'div[class*="agent-turn"], div[class*="user-turn"]',
        'div[class*="conversation-turn"]',
        'div[data-message-id]',
        'main [data-testid^="conversation-turn"]',
        'main article'
      ],
      userRoleCheck: (el) => {
        if (!el) return false;

        // 1. Explicit author role attributes
        const authorRole = el.getAttribute('data-message-author-role') ||
                           el.querySelector?.('[data-message-author-role]')?.getAttribute('data-message-author-role');
        if (authorRole === 'user') return true;
        if (authorRole === 'assistant') return false;

        // 2. OpenAI screen reader accessibility headings
        const srElements = el.querySelectorAll ? el.querySelectorAll('.sr-only, [class*="sr-only"], h2, h3, h4, h5, h6') : [];
        if (srElements.length > 0) {
          const srText = Array.from(srElements).map(h => (h.textContent || '').trim().toLowerCase()).join(' ');
          if (srText.includes('you said') || srText.includes('you:')) return true;
          if (srText.includes('chatgpt said') || srText.includes('chatgpt:') || srText.includes('thought for')) return false;
        }

        // 3. User edit action button (only present on user turns)
        if (el.querySelector && el.querySelector('button[aria-label*="Edit" i], button[data-testid*="edit" i]')) return true;

        // 4. Assistant-exclusive action buttons (Do NOT check Copy because user messages also have Copy buttons)
        if (el.querySelector && el.querySelector('button[aria-label*="Good" i], button[aria-label*="Bad" i], button[aria-label*="Read aloud" i], button[aria-label*="thumbs" i], button[aria-label*="Regenerate" i], button[data-testid*="feedback" i]')) {
          return false;
        }

        // 5. Container structures: assistant always renders .markdown / .prose
        const hasMarkdown = !!(el.querySelector && el.querySelector('.markdown, .prose, [class*="markdown"], [class*="prose"]'));
        const hasWhitespace = !!(el.querySelector && el.querySelector('.whitespace-pre-wrap, [class*="whitespace-pre-wrap"], div[dir="auto"]'));

        if (hasMarkdown) return false;
        if (hasWhitespace) return true;

        // 6. Test ID and class tokens
        const testId = ((el.getAttribute('data-testid') || '') + ' ' + (el.className || '')).toLowerCase();
        if (/\buser\b/i.test(testId)) return true;
        if (/\b(assistant|agent)\b/i.test(testId)) return false;

        // 7. Visual layout: user turns are right-aligned or surface-secondary
        if (el.querySelector && el.querySelector('[class*="items-end"], [class*="justify-end"], [class*="user-chat"], [class*="bg-token-main-surface-secondary"]')) {
          return true;
        }

        return false;
      },
      textSelectors: ['.markdown', '.prose', '.whitespace-pre-wrap', 'div[dir="auto"]', 'p'],
      codeSelectors: ['pre code', 'pre'],
      attachmentSelectors: [
        'img[src*="oaiusercontent.com"]',
        'img[src*="oaistatic.com"]',
        'img[src*="openai.com"]',
        'img[src^="blob:"]',
        'img[src^="data:"]',
        'img[alt*="Uploaded"]',
        '[data-testid*="file"]',
        '[data-testid*="attachment"]',
        'div[data-testid="file-attachment"]',
        'div[class*="image"] img',
        'button[aria-label*="image"] img',
        'button[aria-label*="download" i]',
        'button[aria-label*="Download"]',
        'a[download]',
        'a[href*=".pdf"]',
        'a[href*=".md"]'
      ],
      inputSelectors: [
        '#prompt-textarea',
        'div[contenteditable="true"][id="prompt-textarea"]',
        'div[contenteditable="true"]',
        'textarea[data-id="root"]'
      ],
      fileInputSelectors: ['input[type="file"]']
    },

    perplexity: {
      platformId: 'perplexity',
      name: 'Perplexity AI',
      hostMatches: ['perplexity.ai'],
      turnSelectors: [
        '[data-testid="thread-message"]',
        'div[class*="ThreadMessage"]',
        '.isolate > div > div',
        'div.group\\/query'
      ],
      userRoleCheck: (el) => {
        return el.querySelector('h1, h2, .font-display') !== null ||
               el.className.includes('query') ||
               el.getAttribute('data-author') === 'user';
      },
      textSelectors: ['.prose', 'div[class*="prose"]', 'p'],
      codeSelectors: ['pre code', 'pre'],
      attachmentSelectors: [
        'img[src*="perplexity"]',
        'img[src^="blob:"]',
        'div[class*="attachment"]'
      ],
      inputSelectors: [
        'textarea[placeholder*="Ask"]',
        'textarea[placeholder*="Follow-up"]',
        'div[contenteditable="true"]',
        'textarea'
      ],
      fileInputSelectors: ['input[type="file"]']
    },

    groq: {
      platformId: 'groq',
      name: 'Groq Chat',
      hostMatches: ['groq.com', 'chat.groq.com'],
      turnSelectors: [
        '[data-testid="chat-message"]',
        'div[class*="message"]',
        'div[role="presentation"] > div',
        '.flex.flex-col > .group'
      ],
      userRoleCheck: (el) => {
        return el.getAttribute('data-role') === 'user' ||
               el.className.includes('user') ||
               el.querySelector('[data-role="user"]') !== null;
      },
      textSelectors: ['.markdown', '.prose', 'p'],
      codeSelectors: ['pre code', 'pre'],
      attachmentSelectors: ['img', 'a[download]'],
      inputSelectors: [
        'textarea[placeholder*="message"]',
        'textarea',
        'div[contenteditable="true"]'
      ],
      fileInputSelectors: ['input[type="file"]']
    }
  };

  class SelectorConfigManager {
    constructor() {
      this.config = Object.assign({}, DEFAULT_CONFIG);
      this.loadOverrides();
    }

    async loadOverrides() {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          const res = await chrome.storage.local.get('selector_overrides');
          if (res.selector_overrides) {
            this.config = Object.assign({}, DEFAULT_CONFIG, res.selector_overrides);
          }
        }
      } catch (e) {
        // Fall back to default
      }
    }

    getConfigForHost(hostname = window.location.hostname) {
      for (const [key, platform] of Object.entries(this.config)) {
        if (platform.hostMatches.some(host => hostname.includes(host))) {
          return platform;
        }
      }
      return null;
    }

    get(platformId) {
      return this.config[platformId] || null;
    }

    extractCleanText(el, isUser = false, platformId = 'generic') {
      if (!el) return '';
      try {
        const clone = el.cloneNode(true);

        // Remove action buttons, feedback widgets, avatars, SVGs, and screen reader labels
        const actionSelectors = [
          'button[aria-label*="Copy" i]',
          'button[aria-label*="Good" i]',
          'button[aria-label*="Bad" i]',
          'button[aria-label*="Read aloud" i]',
          'button[aria-label*="Retry" i]',
          'button[aria-label*="Edit" i]',
          'button[title*="Copy" i]',
          '.sr-only',
          '[class*="sr-only"]',
          'svg',
          '.avatar',
          '[class*="avatar"]'
        ];
        clone.querySelectorAll(actionSelectors.join(', ')).forEach(n => n.remove());

        // Remove buttons that literally only say "Copy" or "Copy code" or are empty icon buttons
        clone.querySelectorAll('button').forEach(btn => {
          const txt = (btn.textContent || '').trim().toLowerCase();
          if (txt === 'copy' || txt === 'copy code' || txt === '') {
            btn.remove();
          }
        });

        // Unpack snippet or attachment data attributes if present (e.g. data-capsule-code, data-content, data-code)
        const attachmentEls = clone.querySelectorAll(
          '[data-capsule-code], [data-testid*="attachment"], [class*="attachment"], div[class*="snippet"], [data-testid*="file-"]'
        );
        attachmentEls.forEach(att => {
          const rawCode = att.getAttribute('data-capsule-code') || att.getAttribute('data-content') || att.getAttribute('data-code') || att.getAttribute('data-snippet');
          if (rawCode && !att.textContent.includes(rawCode)) {
            const fileName = att.getAttribute('data-capsule-filename') || att.getAttribute('data-filename') || 'Attached Code';
            let lang = '';
            const extMatch = fileName.match(/\.([a-zA-Z0-9]+)$/);
            if (extMatch) {
              const ext = extMatch[1].toLowerCase();
              const extMap = { py: 'python', js: 'javascript', ts: 'typescript', jsx: 'jsx', tsx: 'tsx', cpp: 'cpp', c: 'c', rs: 'rust', go: 'go', html: 'html', css: 'css', json: 'json', md: 'markdown', sh: 'bash', sql: 'sql' };
              lang = extMap[ext] || ext;
            }
            const pre = document.createElement('pre');
            const codeEl = document.createElement('code');
            if (lang) codeEl.className = `language-${lang}`;
            codeEl.textContent = rawCode;
            pre.appendChild(codeEl);

            const label = document.createElement('div');
            label.textContent = `\n[Attached Code: ${fileName}]\n`;
            att.innerHTML = '';
            att.appendChild(label);
            att.appendChild(pre);
          }
        });

        // Process code blocks inside <pre> and [class*="code-block"] so they retain standard Markdown fences
        const preElements = clone.querySelectorAll('pre, [class*="code-block"]');
        preElements.forEach(pre => {
          const codeEl = pre.querySelector('code') || pre;
          let codeText = codeEl.textContent || '';
          let lang = '';
          const classStr = (codeEl.className || '') + ' ' + (pre.className || '');
          const langMatch = classStr.match(/(?:language|lang|hljs)-([a-zA-Z0-9_\-\.]+)/i);
          if (langMatch) {
            lang = langMatch[1].toLowerCase();
          } else {
            const span = pre.querySelector('span');
            if (span) {
              const spanTxt = (span.textContent || '').trim().toLowerCase();
              if (spanTxt && spanTxt.length < 25 && !spanTxt.includes('copy')) {
                lang = spanTxt;
              }
            }
          }

          // Clean code lines if leading line is identical to language header
          let lines = (codeText || '').split('\n');
          if (lines.length > 0 && lang && lines[0].trim().toLowerCase() === lang.toLowerCase()) {
            lines.shift();
          }
          const cleanCode = lines.join('\n').replace(/\r\n/g, '\n').trim();

          const fenceDiv = document.createElement('div');
          fenceDiv.className = 'capsule-code-fence';
          fenceDiv.textContent = `\n\n\`\`\`${lang}\n${cleanCode}\n\`\`\`\n\n`;
          pre.parentNode?.replaceChild(fenceDiv, pre);
        });

        // Extract full turn text and code with connected layout preservation
        let text = '';
        let holder = null;
        try {
          if (typeof document !== 'undefined' && document.body) {
            holder = document.createElement('div');
            holder.setAttribute('aria-hidden', 'true');
            holder.style.cssText = 'position:fixed;left:-99999px;top:-99999px;opacity:0;pointer-events:none;z-index:-9999;width:1000px;white-space:pre-wrap;';
            document.body.appendChild(holder);
            holder.appendChild(clone);
            text = (holder.innerText || '').trim();
          }
        } catch (attachErr) {}
        finally {
          if (holder && holder.parentNode) {
            holder.parentNode.removeChild(holder);
          }
        }

        if (!text) {
          text = (clone.innerText || clone.textContent || '').trim();
        }
        return text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
      } catch (err) {
        return (el.innerText || el.textContent || '').trim();
      }
    }
  }

  global.CapsuleSelectorConfig = new SelectorConfigManager();
})(typeof window !== 'undefined' ? window : globalThis);
