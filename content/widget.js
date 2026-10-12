/**
 * content/widget.js
 * Shadow DOM encapsulated floating UI widget for the AI Context Capsule Wrapper.
 * Provides on-page wrapping, selective turn capture, diff updating, token previews,
 * and progressive injection with fallback file handling.
 */
(function () {
  'use strict';

  // Prevent duplicate injection
  if (window.__capsuleContentInjected) return;
  window.__capsuleContentInjected = true;

  let hostEl = null;
  let shadow = null;
  let container = null;

  // State
  let currentSessionData = null;
  let savedCapsulesList = [];
  let selectedCapsuleId = null;
  let activePlatformId = null;

  function init() {
    activePlatformId = window.CapsuleAdapterManager?.getCurrentPlatformId() || "generic";
    setupPopupMessageListener();

    // Floating on-page button is off by default to keep web pages completely clean
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(["cc_show_floating_widget"], (res) => {
        if (res && res.cc_show_floating_widget === true) {
          renderFloatingWidget();
        }
      });
    }
  }

  function showOnPageToast(title, message, duration = 8000) {
    try {
      let toast = document.getElementById('capsule-onpage-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'capsule-onpage-toast';
        toast.style.cssText = `
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 2147483647;
          background: #0f172a;
          color: #f8fafc;
          padding: 12px 18px;
          border-radius: 10px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
          border: 1px solid #334155;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 13px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          max-width: 380px;
          pointer-events: auto;
          transition: opacity 0.25s ease-out;
        `;
        document.body.appendChild(toast);
      }
      const messageHtml = message
        ? ('<div style="color: #94a3b8; font-size: 11px; line-height: 1.3;">' + message + '</div>')
        : '';
      toast.innerHTML = `
        <div style="font-weight: 600; color: #38bdf8; display: flex; justify-content: space-between; align-items: center;">
          <span>Context Candy</span>
          <span style="font-size: 14px; color: #94a3b8; cursor: pointer; padding: 0 4px;" id="capsule-toast-close">&times;</span>
        </div>
        <div style="color: #f1f5f9; font-weight: 500; line-height: 1.4;">${title}</div>
      ` + messageHtml;
      toast.style.display = 'flex';
      toast.style.opacity = '1';

      const closeBtn = toast.querySelector('#capsule-toast-close');
      if (closeBtn) {
        closeBtn.onclick = () => {
          toast.style.display = 'none';
        };
      }

      setTimeout(() => {
        if (toast) {
          toast.style.opacity = '0';
          setTimeout(() => { if (toast) toast.style.display = 'none'; }, 250);
        }
      }, duration);
    } catch (e) {}
  }

  function setupPopupMessageListener() {
    if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.onMessage) return;

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "GET_PAGE_STATUS") {
        const health = window.CapsuleAdapterManager?.checkHealth();
        sendResponse({
          platformId: activePlatformId,
          isHealthy: health ? health.isHealthy : true
        });
        return false;
      }

      if (request.action === "EXTRACT_SESSION") {
        if (!window.CapsuleAdapterManager) {
          sendResponse({ success: false, error: "Adapter manager not loaded" });
          return false;
        }
        window.CapsuleAdapterManager.extractActiveSession()
          .then((session) => {
            sendResponse({ success: true, session });
          })
          .catch(err => {
            sendResponse({ success: false, error: err.message });
          });
        return true;
      }

      if (request.action === "INJECT_UNWRAP") {
        try {
          const textOk = window.CapsuleInjector?.injectText(request.text || "");
          sendResponse({ success: true, textInjected: textOk });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
        return false;
      }
    });
  }

  function renderFloatingWidget() {
    if (document.getElementById("capsule-wrapper-root")) return;

    hostEl = document.createElement("div");
    hostEl.id = "capsule-wrapper-root";
    document.body.appendChild(hostEl);

    shadow = hostEl.attachShadow({ mode: "open" });

    const linkEl = document.createElement("link");
    linkEl.rel = "stylesheet";
    linkEl.href = chrome.runtime.getURL("content/widget.css");
    shadow.appendChild(linkEl);

    container = document.createElement("div");
    container.className = "capsule-container";
    shadow.appendChild(container);

    renderWidgetContent();
    checkHealth();
    loadRecentCapsules();
  }

  function renderWidgetContent() {
    container.innerHTML = `
      <!-- Floating Action Button -->
      <div class="capsule-fab" id="fab-btn" title="Open Context Candy">
        <img class="capsule-fab-icon" src="${chrome.runtime.getURL('icons/icon16.png')}" style="width:16px;height:16px;border-radius:3px;" alt="Logo">
        <span class="capsule-fab-label">Context Candy</span>
      </div>

      <!-- Main Dashboard Panel -->
      <div class="capsule-panel hidden" id="main-panel">
        <div class="panel-header">
          <div class="header-title">
            <span>Context Candy</span>
            <span class="badge badge-platform">${activePlatformId}</span>
          </div>
          <button class="btn-close" id="close-panel-btn">&times;</button>
        </div>

        <div id="health-banner-container"></div>

        <div class="panel-body">
          <!-- Primary Actions -->
          <div class="actions-grid">
            <button class="btn-action btn-primary" id="btn-wrap">
              <span>Wrapping Context Candy</span>
              <span class="btn-subtext" id="wrap-subtext">Save state & diffs</span>
            </button>
            <button class="btn-action" id="btn-copy">
              <span>Copy Handoff</span>
              <span class="btn-subtext">Optimized Prompt</span>
            </button>
          </div>

          <!-- Token Estimation Card -->
          <div class="token-card" id="token-card">
            <div class="token-title">Estimated Tokens for Target</div>
            <div class="token-value" id="token-estimate-value">Select or wrap to estimate</div>
            <div class="token-detail" id="token-estimate-detail">Based on text and media ranges</div>
          </div>
          <div class="media-disclaimer-note">
            Media and documents are not transferred automatically. You have to inject or attach them next time when talking with the destination AI agent.
          </div>

          <!-- Target Format Selection -->
          <div class="target-select-group">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <label class="target-select-label" style="margin-bottom:0;">Target Framing:</label>
              <span style="font-size:10px; font-weight:600; padding:2px 7px; border-radius:4px; background:var(--surface, #f8fafc); color:var(--text-primary, #0f172a); border:1px solid var(--border, #e2e8f0); letter-spacing:0.02em;">Universal AI Handoff</span>
            </div>
            <div style="font-size:10px; color:var(--text-muted, #64748b); margin-top:2px;">Works across Claude, ChatGPT, Gemini, Perplexity, Groq, and all LLMs</div>
            <select class="target-select" id="target-format-select" style="display:none;" aria-hidden="true">
              <option value="universal" selected>Universal AI Handoff (All Models)</option>
            </select>
          </div>

          <!-- Unwrap / Inject Action -->
          <div class="target-select-group">
            <label class="target-select-label">Saved Candy to Unwrap:</label>
            <select class="target-select" id="capsule-picker-select">
              <option value="">(Loading saved candies...)</option>
            </select>
          </div>

          <button class="btn-action btn-primary" id="btn-unwrap" style="width: 100%;">
            <span>Unwrap Candy into Chat</span>
            <span class="btn-subtext">Text + Attachments</span>
          </button>

          <!-- Selective Capture Toggle & Drawer -->
          <details class="selective-panel" id="selective-details">
            <summary style="cursor: pointer; font-weight: 600; color: #94a3b8; font-size: 12px;">
              Selective Turn & Media Picker
            </summary>
            <div class="selective-list" id="selective-items-list" style="margin-top: 8px;">
              <span style="font-size: 11px; color: #64748b;">Wrap current session to select individual turns.</span>
            </div>
          </details>

          <!-- Attachment Fallback Drawer (Visible when file drop is rejected) -->
          <div class="attachment-drawer hidden" id="fallback-attachment-drawer">
            <div style="font-weight: 700; font-size: 12px; color: #c084fc;">
              Files Ready for Attachment
            </div>
            <div style="font-size: 11px; color: #e9d5ff;">
              Auto-drop is not accepted by this site. Use the buttons below:
            </div>
            <div id="fallback-chips-container" style="display: flex; flex-direction: column; gap: 6px;"></div>
          </div>
        </div>

        <!-- Privacy Confirmation Modal -->
        <div class="privacy-modal hidden" id="privacy-modal">
          <div class="privacy-title">Notice: Cross-Provider Transfer</div>
          <div class="privacy-msg" id="privacy-msg">
            You are transferring context from one AI provider to another.
          </div>
          <div style="display: flex; gap: 8px; justify-content: center; margin-top: 8px;">
            <button class="btn-action btn-primary" id="btn-privacy-confirm" style="padding: 6px 14px;">Continue</button>
            <button class="btn-action" id="btn-privacy-cancel" style="padding: 6px 14px;">Cancel</button>
          </div>
        </div>
      </div>

      <!-- Toast Feedback -->
      <div class="capsule-toast hidden" id="capsule-toast"></div>
    `;

    attachEvents();
  }

  function attachEvents() {
    const fabBtn = shadow.getElementById('fab-btn');
    const mainPanel = shadow.getElementById('main-panel');
    const closePanelBtn = shadow.getElementById('close-panel-btn');
    const btnWrap = shadow.getElementById('btn-wrap');
    const btnCopy = shadow.getElementById('btn-copy');
    const btnUnwrap = shadow.getElementById('btn-unwrap');
    const targetFormatSelect = shadow.getElementById('target-format-select');
    const capsulePickerSelect = shadow.getElementById('capsule-picker-select');
    const btnPrivacyConfirm = shadow.getElementById('btn-privacy-confirm');
    const btnPrivacyCancel = shadow.getElementById('btn-privacy-cancel');

    fabBtn.addEventListener('click', () => {
      mainPanel.classList.toggle('hidden');
      if (!mainPanel.classList.contains('hidden')) {
        loadRecentCapsules();
        updateTokenPreview();
      }
    });

    closePanelBtn.addEventListener('click', () => {
      mainPanel.classList.add('hidden');
    });

    btnWrap.addEventListener('click', handleWrapCurrentSession);
    btnCopy.addEventListener('click', handleCopyHandoffPrompt);
    btnUnwrap.addEventListener('click', handleUnwrapPrompt);

    targetFormatSelect.addEventListener('change', updateTokenPreview);
    capsulePickerSelect.addEventListener('change', (e) => {
      selectedCapsuleId = e.target.value;
      updateTokenPreview();
    });

    btnPrivacyCancel.addEventListener('click', () => {
      shadow.getElementById('privacy-modal').classList.add('hidden');
    });

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.cc_capsule_index) {
          loadRecentCapsules();
        }
      });
    }
  }

  function showToast(message, duration = 3000) {
    const toast = shadow.getElementById('capsule-toast');
    toast.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => {
      toast.classList.add('hidden');
    }, duration);
  }

  async function checkHealth() {
    const health = window.CapsuleAdapterManager?.checkHealth();
    const bannerContainer = shadow.getElementById('health-banner-container');
    if (health && !health.isHealthy) {
      bannerContainer.innerHTML = `
        <div class="health-alert">
          <span>Notice</span>
          <span>DOM changed or unrecognized. Scraping may be degraded.</span>
        </div>
      `;
    } else {
      bannerContainer.innerHTML = '';
    }
  }

  async function loadRecentCapsules() {
    const picker = shadow.getElementById('capsule-picker-select');
    if (!window.CapsuleDB) return;

    try {
      savedCapsulesList = await window.CapsuleDB.listCapsules();
      picker.innerHTML = '';

      if (savedCapsulesList.length === 0) {
        picker.innerHTML = '<option value="">(No capsules saved yet)</option>';
        return;
      }

      savedCapsulesList.forEach((cap, idx) => {
        const opt = document.createElement('option');
        opt.value = cap.id;
        const timeStr = new Date(cap.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        opt.textContent = `${cap.title} (${cap.sourcePlatform}, ${timeStr})`;
        if (idx === 0 && !selectedCapsuleId) {
          opt.selected = true;
          selectedCapsuleId = cap.id;
        } else if (cap.id === selectedCapsuleId) {
          opt.selected = true;
        }
        picker.appendChild(opt);
      });
    } catch (err) {
      console.warn('[CapsuleWidget] Failed to load capsules:', err);
    }
  }

  async function handleWrapCurrentSession() {
    try {
      showToast('Scraping session and media...');
      const session = await window.CapsuleAdapterManager.extractActiveSession();

      if (!session || !session.turns || session.turns.length === 0) {
        showToast('Notice: No messages found on this page to wrap.');
        return;
      }

      const allAttachments = Array.isArray(session.attachments) ? [...session.attachments] : [];
      if (Array.isArray(session.turns)) {
        session.turns.forEach(t => {
          if (Array.isArray(t.attachments)) {
            t.attachments.forEach(att => {
              if (!allAttachments.some(a => a.name === att.name || (a.id && a.id === att.id))) {
                allAttachments.push(att);
              }
            });
          }
        });
      }
      session.attachments = allAttachments;

      // Check if session already exists for diff update
      const result = await window.CapsuleDB.saveOrUpdateCapsule(session, allAttachments);
      selectedCapsuleId = result.id;

      showToast(`Saved! (${result.turnsCount} turns)`);
      renderSelectiveTurnPicker(session);
      await loadRecentCapsules();
      updateTokenPreview();
    } catch (err) {
      console.error('[CapsuleWidget] Wrap failed:', err);
      showToast('Error saving capsule: ' + err.message);
    }
  }

  function renderSelectiveTurnPicker(session) {
    const list = shadow.getElementById('selective-items-list');
    if (!list) return;

    list.innerHTML = '';
    session.turns.forEach((turn, idx) => {
      const item = document.createElement('label');
      item.className = 'selective-item';
      const snippet = (turn.content || '').slice(0, 70);
      item.innerHTML = `
        <input type="checkbox" checked data-turn-id="${turn.id}">
        <span style="font-weight: 700; font-size: 10px; color: ${turn.role === 'user' ? '#38bdf8' : '#a78bfa'};">
          ${turn.role.toUpperCase()}:
        </span>
        <span class="turn-snippet">${snippet || '[Attachment Turn]'}</span>
      `;
      list.appendChild(item);
    });

    if (session.attachments && session.attachments.length > 0) {
      const attHeader = document.createElement('div');
      attHeader.style.cssText = 'font-weight: 700; font-size: 11px; margin-top: 6px; color: #c084fc;';
      attHeader.textContent = 'Attached Media:';
      list.appendChild(attHeader);

      session.attachments.forEach(att => {
        const item = document.createElement('label');
        item.className = 'selective-item';
        item.innerHTML = `
          <input type="checkbox" checked data-att-id="${att.id}">
          <span class="turn-snippet">${att.name} (${Math.round((att.size || 0) / 1024)} KB)</span>
        `;
        list.appendChild(item);
      });
    }
  }

  function getSelectedTurnAndAttachmentIds() {
    const list = shadow.getElementById('selective-items-list');
    if (!list) return { selectedTurnIds: null, selectedAttachmentIds: null };

    const turnInputs = list.querySelectorAll('input[data-turn-id]:checked');
    const attInputs = list.querySelectorAll('input[data-att-id]:checked');

    if (turnInputs.length === 0 && attInputs.length === 0) {
      return { selectedTurnIds: null, selectedAttachmentIds: null };
    }

    return {
      selectedTurnIds: Array.from(turnInputs).map(i => i.getAttribute('data-turn-id')),
      selectedAttachmentIds: Array.from(attInputs).map(i => i.getAttribute('data-att-id'))
    };
  }

  async function updateTokenPreview() {
    if (!selectedCapsuleId || !window.CapsuleDB || !window.CapsuleTokenEstimator) return;

    try {
      const capsule = await window.CapsuleDB.getCapsule(selectedCapsuleId);
      if (!capsule) return;

      const target = shadow.getElementById('target-format-select').value;
      const { selectedTurnIds, selectedAttachmentIds } = getSelectedTurnAndAttachmentIds();

      const built = await window.CapsuleEngine.buildCapsule(capsule, {
        selectedTurnIds,
        selectedAttachmentIds
      });

      const tunedText = window.CapsulePromptTuner.tune(built, target);
      const est = window.CapsuleTokenEstimator.calculateTotalTokenRange(tunedText, built.attachments, target);

      const valEl = shadow.getElementById('token-estimate-value');
      const detEl = shadow.getElementById('token-estimate-detail');

      const rawText = (capsule.turns || []).map(t => `${t.role}: ${t.content}`).join('\n\n');
      const rawEst = window.CapsuleTokenEstimator.estimateTextTokens(rawText);
      const savingsPct = (rawEst.avg > 0 && rawEst.avg > est.textTokens.avg)
        ? Math.round((1 - (est.textTokens.avg / rawEst.avg)) * 100)
        : 0;

      const savingsLabel = savingsPct > 0 ? ` (${savingsPct}% saved)` : '';
      valEl.textContent = est.totalRangeStr;
      detEl.textContent = `Text: ~${est.textTokens.avg.toLocaleString()} tokens${savingsLabel} | ${est.mediaTokens.description}`;
    } catch (err) {
      console.warn('[CapsuleWidget] Token preview error:', err);
    }
  }

  async function handleCopyHandoffPrompt() {
    if (!selectedCapsuleId && savedCapsulesList.length > 0) {
      selectedCapsuleId = savedCapsulesList[0].id;
    }
    if (!selectedCapsuleId) {
      showToast('Please wrap a session first!');
      return;
    }

    const capsule = await window.CapsuleDB.getCapsule(selectedCapsuleId);
    if (!capsule) return;

    const target = shadow.getElementById('target-format-select').value;
    const { selectedTurnIds, selectedAttachmentIds } = getSelectedTurnAndAttachmentIds();

    const built = await window.CapsuleEngine.buildCapsule(capsule, {
      selectedTurnIds,
      selectedAttachmentIds
    });

    const tuned = window.CapsulePromptTuner.tune(built, target);
    await navigator.clipboard.writeText(tuned);
    showToast('Handoff prompt copied to clipboard!');
  }

  async function handleUnwrapPrompt() {
    if (!selectedCapsuleId && savedCapsulesList.length > 0) {
      selectedCapsuleId = savedCapsulesList[0].id;
    }
    if (!selectedCapsuleId) {
      showToast('No saved capsule selected to unwrap!');
      return;
    }

    const capsule = await window.CapsuleDB.getCapsule(selectedCapsuleId);
    if (!capsule) return;

    // Privacy warning check if crossing provider boundaries
    if (capsule.sourcePlatform && activePlatformId && capsule.sourcePlatform !== activePlatformId) {
      const confirmResult = await showPrivacyModal(capsule.sourcePlatform, activePlatformId);
      if (!confirmResult) return;
    }

    executeUnwrap(capsule);
  }

  function showPrivacyModal(source, target) {
    return new Promise((resolve) => {
      const modal = shadow.getElementById('privacy-modal');
      const msg = shadow.getElementById('privacy-msg');
      const btnConfirm = shadow.getElementById('btn-privacy-confirm');
      const btnCancel = shadow.getElementById('btn-privacy-cancel');

      msg.textContent = `You are about to transfer context from ${source.toUpperCase()} into ${target.toUpperCase()}. Ensure this complies with your privacy standards.`;
      modal.classList.remove('hidden');

      const onConfirm = () => {
        cleanup();
        resolve(true);
      };

      const onCancel = () => {
        cleanup();
        resolve(false);
      };

      function cleanup() {
        modal.classList.add('hidden');
        btnConfirm.removeEventListener('click', onConfirm);
        btnCancel.removeEventListener('click', onCancel);
      }

      btnConfirm.addEventListener('click', onConfirm);
      btnCancel.addEventListener('click', onCancel);
    });
  }

  async function executeUnwrap(capsule) {
    const target = shadow.getElementById('target-format-select').value;
    const { selectedTurnIds, selectedAttachmentIds } = getSelectedTurnAndAttachmentIds();

    const built = await window.CapsuleEngine.buildCapsule(capsule, {
      selectedTurnIds,
      selectedAttachmentIds
    });

    const tunedText = window.CapsulePromptTuner.tune(built, target);
    const hasMedia = built.attachments && built.attachments.length > 0;

    // 1. Inject prompt text & code
    const textSuccess = window.CapsuleInjector.injectText(tunedText);
    if (textSuccess) {
      showToast('Text and code context injected into prompt!');
    } else {
      await navigator.clipboard.writeText(tunedText);
      showToast('Prompt copied to clipboard (paste with Ctrl+V)');
    }
  }

  function showFallbackAttachmentDrawer() {
    // Media drawer deprecated in text & code mode
  }

  // Initialize once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
