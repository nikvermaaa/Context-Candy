/**
 * content/page_bridge.js
 * Main World bridge script executed in the webpage context (world: "MAIN").
 * Provides direct access to window, React Fiber / Props internals, and
 * chat API responses for platforms like Anthropic Claude where user input
 * code is stored as React component state or attachment chips.
 */
(function () {
  'use strict';

  // In-memory cache of intercepted chat conversations
  const interceptedConversations = new Map();

  // 1. Monkey-patch window.fetch to observe chat conversation API payloads
  try {
    const originalFetch = window.fetch;
    if (typeof originalFetch === 'function') {
      window.fetch = async function (...args) {
        const response = await originalFetch.apply(this, args);
        try {
          const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
          if (
            url.includes('/chat_conversations/') ||
            url.includes('/chat_messages') ||
            url.includes('/conversations/') ||
            url.includes('/backend-api/conversation') ||
            url.includes('/backend-anon/conversation') ||
            url.includes('/conversation')
          ) {
            const clone = response.clone();
            clone.json().then((data) => {
              processInterceptedChatData(url, data);
            }).catch(() => {});
          }
        } catch (fetchErr) {
          // Silent catch to prevent interference with page
        }
        return response;
      };
    }
  } catch (patchErr) {
    // Silent catch
  }

  function processInterceptedChatData(url, data) {
    if (!data) return;
    try {
      // 1. ChatGPT conversation endpoint returns mapping object with message nodes
      if (data.mapping && typeof data.mapping === 'object') {
        const nodes = Object.values(data.mapping);
        const validNodes = nodes.filter(n => n.message && n.message.author && n.message.author.role !== 'system');
        validNodes.sort((a, b) => (a.message.create_time || 0) - (b.message.create_time || 0));

        const parsedTurns = [];
        validNodes.forEach((node, idx) => {
          const msg = node.message;
          const role = msg.author.role === 'user' ? 'user' : 'assistant';
          let text = '';
          const attachments = [];

          if (msg.content) {
            if (Array.isArray(msg.content.parts)) {
              text = msg.content.parts.filter(p => typeof p === 'string').join('\n\n');
            } else if (typeof msg.content.text === 'string') {
              text = msg.content.text;
            }
          }

          if (msg.metadata && Array.isArray(msg.metadata.attachments)) {
            msg.metadata.attachments.forEach(att => {
              attachments.push({
                fileName: att.name || 'attachment',
                content: '',
                fileType: att.mime_type || 'application/octet-stream',
                fileSize: att.size || 0,
                isImage: (att.mime_type || '').startsWith('image/')
              });
            });
          }

          if (text || attachments.length > 0) {
            parsedTurns.push({
              index: idx,
              role: role,
              text: text,
              attachments: attachments
            });
          }
        });

        if (parsedTurns.length > 0) {
          const chatId = data.conversation_id || extractChatIdFromUrl(url) || 'current_chatgpt';
          interceptedConversations.set(chatId, {
            id: chatId,
            title: data.title || 'ChatGPT Session',
            turns: parsedTurns,
            updatedAt: Date.now()
          });
          annotatePageAttachments();
          return;
        }
      }

      // 2. Claude chat_conversations endpoint returns object with chat_messages
      const messages = data.chat_messages || (Array.isArray(data) ? data : (data.messages || []));
      if (Array.isArray(messages) && messages.length > 0) {
        const parsedTurns = [];
        messages.forEach((msg, idx) => {
          const sender = msg.sender || (msg.role === 'human' ? 'human' : (msg.role === 'assistant' ? 'assistant' : 'user'));
          const isUser = sender === 'human' || sender === 'user';
          let text = '';
          const attachments = [];

          // Handle string or array content blocks
          if (typeof msg.text === 'string') {
            text = msg.text;
          } else if (typeof msg.content === 'string') {
            text = msg.content;
          } else if (Array.isArray(msg.content)) {
            msg.content.forEach((block) => {
              if (block.type === 'text' && block.text) {
                text += (text ? '\n\n' : '') + block.text;
              } else if (block.type === 'image') {
                const imgSource = block.source || {};
                const mediaType = imgSource.media_type || 'image/png';
                const b64 = imgSource.data || '';
                attachments.push({
                  fileName: `image_${attachments.length + 1}.png`,
                  content: '',
                  fileType: mediaType,
                  fileSize: b64 ? Math.round(b64.length * 0.75) : 0,
                  dataUrl: b64 ? `data:${mediaType};base64,${b64}` : null,
                  base64: b64 || null,
                  url: imgSource.url || null,
                  isImage: true
                });
              }
            });
          }

          // Process attachments (Claude stores pasted code & file uploads in attachments or files)
          const rawAttachments = msg.attachments || msg.files || [];
          if (Array.isArray(rawAttachments)) {
            rawAttachments.forEach((att) => {
              const fileName = att.file_name || att.name || 'Pasted content';
              const fileContent = att.extracted_content || att.content || att.text || '';
              const fileType = att.file_type || att.type || 'text/plain';
              const fileSize = att.file_size || att.size || (fileContent ? fileContent.length : 0);
              const isImg = fileType.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(fileName);
              attachments.push({
                fileName: fileName,
                content: fileContent,
                fileType: fileType,
                fileSize: fileSize,
                url: att.url || att.file_url || att.download_url || att.preview_url || null,
                isImage: isImg
              });
            });
          }

          parsedTurns.push({
            index: idx,
            role: isUser ? 'user' : 'assistant',
            text: text,
            attachments: attachments
          });
        });

        const chatId = data.uuid || data.id || extractChatIdFromUrl(url) || 'current_chat';
        interceptedConversations.set(chatId, {
          id: chatId,
          title: data.name || data.title || '',
          turns: parsedTurns,
          updatedAt: Date.now()
        });

        // Trigger DOM annotation for any matching attachment cards
        annotatePageAttachments();
      }
    } catch (err) {
      // Silent catch
    }
  }

  function extractChatIdFromUrl(url) {
    if (!url) return null;
    const match = url.match(/chat_conversations\/([a-zA-Z0-9_\-]+)/);
    return match ? match[1] : null;
  }

  // 2. React Fiber & Props inspection engine
  function getReactProps(el) {
    if (!el) return null;
    const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
    return key ? el[key] : null;
  }

  function getReactFiber(el) {
    if (!el) return null;
    const key = Object.keys(el).find(
      (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
    );
    return key ? el[key] : null;
  }

  function searchFiberForCode(startFiber, maxDepth = 15) {
    if (!startFiber) return null;
    const visited = new Set();
    const queue = [{ fiber: startFiber, depth: 0 }];

    while (queue.length > 0) {
      const { fiber, depth } = queue.shift();
      if (!fiber || visited.has(fiber) || depth > maxDepth) continue;
      visited.add(fiber);

      // Check memoizedProps
      const props = fiber.memoizedProps;
      if (props && typeof props === 'object') {
        const found = inspectObjectForCode(props);
        if (found) return found;
      }

      // Check memoizedState
      const state = fiber.memoizedState;
      if (state && typeof state === 'object') {
        const found = inspectObjectForCode(state);
        if (found) return found;
      }

      // Walk up parent
      if (fiber.return && !visited.has(fiber.return)) {
        queue.push({ fiber: fiber.return, depth: depth + 1 });
      }
      // Walk down child
      if (fiber.child && !visited.has(fiber.child) && depth < 6) {
        queue.push({ fiber: fiber.child, depth: depth + 1 });
      }
      // Walk sibling
      if (fiber.sibling && !visited.has(fiber.sibling) && depth < 6) {
        queue.push({ fiber: fiber.sibling, depth: depth + 1 });
      }
    }
    return null;
  }

  function inspectObjectForCode(obj, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 4) return null;

    // Check direct attachment/file properties
    const candidateCode =
      obj.extracted_content ||
      obj.content ||
      obj.text ||
      obj.code ||
      obj.snippet;

    if (typeof candidateCode === 'string' && candidateCode.trim().length > 0) {
      const fileName = obj.file_name || obj.fileName || obj.name || 'Pasted content';
      // Ensure it is not just a tiny UI label
      if (candidateCode.includes('\n') || candidateCode.length > 25 || obj.file_name) {
        return {
          fileName: fileName,
          content: candidateCode,
          fileType: obj.file_type || obj.type || 'text/plain'
        };
      }
    }

    // Check nested attachment or file objects
    const nested = obj.attachment || obj.file || obj.document || obj.item || obj.chatMessage;
    if (nested && typeof nested === 'object') {
      const res = inspectObjectForCode(nested, depth + 1);
      if (res) return res;
    }

    // Check attachments array
    if (Array.isArray(obj.attachments)) {
      for (const att of obj.attachments) {
        const res = inspectObjectForCode(att, depth + 1);
        if (res) return res;
      }
    }

    return null;
  }

  // 3. Annotate DOM attachment elements directly with data attributes
  function annotatePageAttachments() {
    try {
      const selectors = [
        '[data-testid*="attachment"]',
        '[data-testid*="file"]',
        '[data-testid*="snippet"]',
        '[class*="attachment"]',
        '[class*="snippet"]',
        '[class*="FilePreview"]',
        '[class*="PastedContent"]',
        'div.cursor-pointer',
        'button'
      ];
      const elements = document.querySelectorAll(selectors.join(', '));

      elements.forEach((el) => {
        // If already annotated, skip
        if (el.getAttribute('data-capsule-code')) return;

        const textContent = (el.textContent || '').trim();
        // Check if element resembles a code/file chip
        const hasCodeKeyword = /pasted content|snippet|\.(py|js|ts|jsx|tsx|html|css|json|cpp|c|java|go|rs|sh|sql|txt|md|yml|yaml|rb|php)\b/i.test(textContent);

        if (!hasCodeKeyword && !el.getAttribute('data-testid')?.includes('attachment')) {
          return;
        }

        // Try React props / fiber
        const fiber = getReactFiber(el);
        const props = getReactProps(el);
        let codeData = null;

        if (props) {
          codeData = inspectObjectForCode(props);
        }
        if (!codeData && fiber) {
          codeData = searchFiberForCode(fiber, 12);
        }

        // Fallback: match from intercepted conversations
        if (!codeData) {
          for (const conv of interceptedConversations.values()) {
            for (const turn of conv.turns) {
              for (const att of turn.attachments) {
                if (textContent.includes(att.fileName) || (att.fileName === 'Pasted content' && textContent.toLowerCase().includes('pasted content'))) {
                  codeData = att;
                  break;
                }
              }
              if (codeData) break;
            }
            if (codeData) break;
          }
        }

        if (codeData && codeData.content) {
          el.setAttribute('data-capsule-code', codeData.content);
          el.setAttribute('data-capsule-filename', codeData.fileName || 'Pasted content');
          if (codeData.fileType) {
            el.setAttribute('data-capsule-mimetype', codeData.fileType);
          }
        }
      });
    } catch (err) {
      // Silent catch
    }
  }

  // 4. Crawl React root to discover all conversation messages if API fetch wasn't intercepted
  function crawlReactRootForMessages() {
    try {
      const rootCandidates = [
        document.querySelector('#root'),
        document.querySelector('#__next'),
        document.querySelector('main'),
        document.body
      ];

      for (const root of rootCandidates) {
        if (!root) continue;
        const fiber = getReactFiber(root);
        if (!fiber) continue;

        // BFS to find conversation messages in state or props
        const queue = [fiber];
        const visited = new Set();
        let depth = 0;

        while (queue.length > 0 && depth < 500) {
          const current = queue.shift();
          depth++;
          if (!current || visited.has(current)) continue;
          visited.add(current);

          const props = current.memoizedProps;
          if (props && typeof props === 'object') {
            const msgs = props.messages || props.chatMessages;
            if (Array.isArray(msgs) && msgs.length > 0) {
              const turns = [];
              msgs.forEach((m, idx) => {
                const isUser = m.sender === 'human' || m.role === 'human' || m.role === 'user';
                const text = m.text || m.content || '';
                const atts = [];
                const rawAtts = m.attachments || m.files || [];
                if (Array.isArray(rawAtts)) {
                  rawAtts.forEach((att) => {
                    const code = att.extracted_content || att.content || att.text || '';
                    const fName = att.file_name || att.name || 'Attachment';
                    const fType = att.file_type || att.type || 'text/plain';
                    const isImg = fType.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(fName);
                    if (code || isImg || att.url || att.file_url) {
                      atts.push({
                        fileName: fName,
                        content: code,
                        fileType: fType,
                        fileSize: att.file_size || (code ? code.length : 0),
                        url: att.url || att.file_url || null,
                        isImage: isImg
                      });
                    }
                  });
                }
                turns.push({
                  index: idx,
                  role: isUser ? 'user' : 'assistant',
                  text: text,
                  attachments: atts
                });
              });

              if (turns.length > 0) {
                return turns;
              }
            }
          }

          if (current.child && !visited.has(current.child)) queue.push(current.child);
          if (current.sibling && !visited.has(current.sibling)) queue.push(current.sibling);
        }
      }
    } catch (err) {
      // Silent catch
    }
    return null;
  }

  // 5. Query handler responding to isolated-world content script requests
  function handleExtractionQuery(reqId) {
    annotatePageAttachments();

    // Collect latest conversation data
    let turns = null;
    let latestChat = null;

    if (interceptedConversations.size > 0) {
      // Get the most recently updated conversation
      const chats = Array.from(interceptedConversations.values());
      chats.sort((a, b) => b.updatedAt - a.updatedAt);
      latestChat = chats[0];
      turns = latestChat.turns;
    }

    if (!turns || turns.length === 0) {
      turns = crawlReactRootForMessages();
    }

    // Collect all annotated DOM code blocks
    const domAttachments = [];
    try {
      document.querySelectorAll('[data-capsule-code]').forEach((el) => {
        const code = el.getAttribute('data-capsule-code');
        const filename = el.getAttribute('data-capsule-filename') || 'Pasted content';
        const mime = el.getAttribute('data-capsule-mimetype') || 'text/plain';
        if (code) {
          domAttachments.push({
            fileName: filename,
            content: code,
            fileType: mime
          });
        }
      });
    } catch (e) {}

    const payload = {
      type: 'CAPSULE_PAGE_BRIDGE_RESPONSE',
      reqId: reqId,
      success: true,
      title: latestChat ? latestChat.title : '',
      turns: turns || [],
      domAttachments: domAttachments
    };

    window.postMessage(payload, '*');
    try {
      window.dispatchEvent(
        new CustomEvent('CAPSULE_PAGE_BRIDGE_RESPONSE_EVENT', { detail: payload })
      );
    } catch (evtErr) {}
  }

  // Listen for extraction requests from isolated world
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'CAPSULE_PAGE_BRIDGE_REQUEST') {
      handleExtractionQuery(event.data.reqId);
    }
  });

  window.addEventListener('CAPSULE_PAGE_BRIDGE_REQUEST_EVENT', (event) => {
    const reqId = event.detail ? event.detail.reqId : null;
    handleExtractionQuery(reqId);
  });

  // Watch DOM mutations to auto-annotate dynamic chips
  let debounceTimer = null;
  const observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      annotatePageAttachments();
    }, 400);
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
      }
    });
  }

  // Run initial annotation
  annotatePageAttachments();
})();
