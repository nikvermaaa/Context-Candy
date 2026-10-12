/**
 * popup/popup.js
 * Context Candy — Full Extension Dashboard.
 * Handles Wrapping from active tab, Prompt Tuning, In-chat Unwrapping,
 * Vault storage management, session handoff, and theme toggle.
 */
document.addEventListener('DOMContentLoaded', async () => {
  'use strict';

  let activeTabPlatform = null;
  let activeTabId = null;
  let savedCandies = [];
  let selectedCapsuleId = null;
  let currentLoadedCapsule = null;

  // Header Elements
  const platformBadge = document.getElementById('active-tab-platform-badge');
  const popupToast = document.getElementById('popup-toast');
  const skyThemeToggle = document.getElementById('sky-theme-toggle');
  const skyThemeToggleLarge = document.getElementById('sky-theme-toggle-large');

  // Theme & Sky Toggle Controller
  function getEffectiveTheme() {
    try {
      const saved = localStorage.getItem('theme');
      if (saved) return saved;
      return 'dark';
    } catch (e) {
      return 'dark';
    }
  }

  function applyTheme(theme, persist = true) {
    document.documentElement.setAttribute('data-theme', theme);
    const isDay = (theme === 'light');
    const stateStr = isDay ? 'day' : 'night';
    const ariaChecked = isDay ? 'true' : 'false';

    if (skyThemeToggle) {
      skyThemeToggle.setAttribute('data-state', stateStr);
      skyThemeToggle.setAttribute('aria-checked', ariaChecked);
    }
    if (skyThemeToggleLarge) {
      skyThemeToggleLarge.setAttribute('data-state', stateStr);
      skyThemeToggleLarge.setAttribute('aria-checked', ariaChecked);
    }

    if (persist) {
      try {
        localStorage.setItem('theme', theme);
      } catch (e) {}
    }
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || getEffectiveTheme();
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next, true);
  }

  function bindSkyToggle(toggleEl) {
    if (!toggleEl) return;
    toggleEl.addEventListener('click', () => toggleTheme());
    toggleEl.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        toggleTheme();
      }
    });
  }

  bindSkyToggle(skyThemeToggle);
  bindSkyToggle(skyThemeToggleLarge);

  try {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', (e) => {
      try {
        if (!localStorage.getItem('theme')) {
          applyTheme(e.matches ? 'dark' : 'light', false);
        }
      } catch (err) {}
    });
  } catch (err) {}

  applyTheme(getEffectiveTheme(), false);

  // Tab Navigation
  const tabs = document.querySelectorAll('.nav-tab');
  const tabContents = document.querySelectorAll('.tab-content');

  // Handoff Tab Elements
  const btnWrap = document.getElementById('btn-wrap-popup');
  const btnCopy = document.getElementById('btn-copy-popup');
  const btnUnwrap = document.getElementById('btn-unwrap-popup');
  const sessionNameInput = document.getElementById('session-name-input-popup');
  const targetSelect = document.getElementById('target-format-select-popup');
  const capsulePickerSelect = document.getElementById('capsule-picker-select-popup');
  const tokenValEl = document.getElementById('token-estimate-value');
  const tokenDetEl = document.getElementById('token-estimate-detail');
  const selectiveList = document.getElementById('selective-items-list-popup');

  // Vault Elements
  const capsulesListContainer = document.getElementById('capsules-list-container');
  const btnRefresh = document.getElementById('btn-refresh');
  const importFileInput = document.getElementById('import-file-input');
  const storageSizeVal = document.getElementById('storage-size-val');
  const storageCapVal = document.getElementById('storage-cap-val');

  // Settings Elements
  const toggleFloatingWidget = document.getElementById('toggle-floating-widget');

  let toastTimer = null;
  function showToast(msg, duration = 3000) {
    if (!popupToast) return;
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    popupToast.textContent = msg;
    popupToast.classList.remove('hidden');
    toastTimer = setTimeout(() => {
      popupToast.classList.add('hidden');
      popupToast.textContent = '';
      toastTimer = null;
    }, duration);
  }

  function showConfirmModal({
    title = 'Delete Candy',
    message = 'Are you sure you want to delete this candy?',
    confirmText = 'Delete',
    cancelText = 'Cancel',
    isDanger = true
  } = {}) {
    return new Promise((resolve) => {
      const modal = document.getElementById('confirm-modal');
      const titleEl = document.getElementById('confirm-modal-title');
      const messageEl = document.getElementById('confirm-modal-message');
      const confirmBtn = document.getElementById('confirm-modal-confirm');
      const cancelBtn = document.getElementById('confirm-modal-cancel');

      if (!modal || !confirmBtn || !cancelBtn) {
        resolve(window.confirm(message));
        return;
      }

      if (titleEl) titleEl.textContent = title;
      if (messageEl) messageEl.textContent = message;
      confirmBtn.textContent = confirmText;
      cancelBtn.textContent = cancelText;

      if (isDanger) {
        confirmBtn.className = 'btn modal-btn btn-danger';
      } else {
        confirmBtn.className = 'btn btn-primary modal-btn';
      }

      modal.classList.remove('hidden');
      modal.setAttribute('aria-hidden', 'false');

      function cleanup(result) {
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
        confirmBtn.removeEventListener('click', onConfirm);
        cancelBtn.removeEventListener('click', onCancel);
        modal.removeEventListener('click', onBackdropClick);
        document.removeEventListener('keydown', onKeyDown);
        resolve(result);
      }

      function onConfirm(e) {
        e.stopPropagation();
        cleanup(true);
      }

      function onCancel(e) {
        e.stopPropagation();
        cleanup(false);
      }

      function onBackdropClick(e) {
        if (e.target === modal) {
          cleanup(false);
        }
      }

      function onKeyDown(e) {
        if (e.key === 'Escape') {
          cleanup(false);
        } else if (e.key === 'Enter') {
          cleanup(true);
        }
      }

      confirmBtn.addEventListener('click', onConfirm);
      cancelBtn.addEventListener('click', onCancel);
      modal.addEventListener('click', onBackdropClick);
      document.addEventListener('keydown', onKeyDown);
      cancelBtn.focus();
    });
  }

  // 1. Detect Active Tab Platform
  async function detectActiveTab() {
    try {
      if (typeof chrome === 'undefined' || !chrome.tabs) return;
      const queryTabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!queryTabs || queryTabs.length === 0) return;
      const tab = queryTabs[0];
      activeTabId = tab.id;
      const url = tab.url || '';

      if (url.includes('claude.ai')) {
        activeTabPlatform = 'claude';
        platformBadge.textContent = 'Claude';
        platformBadge.className = 'platform-indicator badge-platform badge-claude';
      } else if (url.includes('gemini.google.com')) {
        activeTabPlatform = 'gemini';
        platformBadge.textContent = 'Gemini';
        platformBadge.className = 'platform-indicator badge-platform badge-gemini';
      } else if (url.includes('chatgpt.com') || url.includes('chat.openai.com')) {
        activeTabPlatform = 'chatgpt';
        platformBadge.textContent = 'ChatGPT';
        platformBadge.className = 'platform-indicator badge-platform badge-chatgpt';
      } else if (url.includes('perplexity.ai')) {
        activeTabPlatform = 'perplexity';
        platformBadge.textContent = 'Perplexity';
        platformBadge.className = 'platform-indicator badge-platform badge-perplexity';
      } else if (url.includes('groq.com')) {
        activeTabPlatform = 'groq';
        platformBadge.textContent = 'Groq';
        platformBadge.className = 'platform-indicator badge-platform badge-groq';
      } else {
        activeTabPlatform = null;
        platformBadge.textContent = 'Off-page';
        platformBadge.className = 'platform-indicator badge-platform badge-generic';
      }
    } catch (e) {
      console.warn('Tab detection error:', e);
    }
  }

  // 2. Tab Switching
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      tab.classList.add('active');
      const targetId = tab.getAttribute('data-tab');
      document.getElementById(targetId)?.classList.add('active');

      const popupMain = document.querySelector('.popup-main');
      if (popupMain) popupMain.scrollTop = 0;

      if (targetId === 'capsules-tab') {
        loadCapsules();
      } else if (targetId === 'handoff-tab') {
        loadHandoffCandies();
      }
    });
  });

  // 3. Load Candies into Handoff Select
  async function loadHandoffCandies() {
    if (!capsulePickerSelect || !window.CapsuleDB) return;

    try {
      savedCandies = await window.CapsuleDB.listCapsules();
      capsulePickerSelect.innerHTML = '';

      if (savedCandies.length === 0) {
        capsulePickerSelect.innerHTML = '<option value="">(No candies saved yet)</option>';
        selectedCapsuleId = null;
        currentLoadedCapsule = null;
        renderSelectivePicker(null);
        updateTokenPreviewPopup();
        return;
      }

      savedCandies.forEach((cap, idx) => {
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
        capsulePickerSelect.appendChild(opt);
      });

      if (!selectedCapsuleId && savedCandies.length > 0) {
        selectedCapsuleId = savedCandies[0].id;
      }

      await loadSelectedCandyDetails();
    } catch (err) {
      console.warn('Failed to load candies in handoff select:', err);
    }
  }

  async function loadSelectedCandyDetails() {
    if (!selectedCapsuleId || !window.CapsuleDB) return;
    try {
      currentLoadedCapsule = await window.CapsuleDB.getCapsule(selectedCapsuleId);
      renderSelectivePicker(currentLoadedCapsule);
      await updateTokenPreviewPopup();
    } catch (e) {
      console.warn('Failed to get candy details:', e);
    }
  }

  function renderSelectivePicker(capsule) {
    if (!selectiveList) return;
    if (!capsule || !capsule.turns || capsule.turns.length === 0) {
      selectiveList.innerHTML = '<div style="font-size: 11px; color: #94a3b8; padding: 6px;">No turns to display.</div>';
      return;
    }

    selectiveList.innerHTML = '';
    capsule.turns.forEach((turn) => {
      const item = document.createElement('label');
      item.className = 'selective-item';
      const snippet = (turn.content || '').slice(0, 70);
      item.innerHTML = `
        <input type="checkbox" checked data-turn-id="${turn.id}">
        <span class="turn-role ${turn.role === 'user' ? 'turn-role-user' : 'turn-role-assistant'}">
          ${turn.role.toUpperCase()}
        </span>
        <span class="turn-snippet">${snippet || '[Attachment Turn]'}</span>
      `;
      item.querySelector('input').addEventListener('change', updateTokenPreviewPopup);
      selectiveList.appendChild(item);
    });

    if (capsule.attachments && capsule.attachments.length > 0) {
      const attHeader = document.createElement('div');
      attHeader.style.cssText = 'font-weight: 600; font-size: 10px; margin-top: 6px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em;';
      attHeader.textContent = 'Attached Media';
      selectiveList.appendChild(attHeader);

      capsule.attachments.forEach(att => {
        const item = document.createElement('label');
        item.className = 'selective-item';
        item.innerHTML = `
          <input type="checkbox" checked data-att-id="${att.id}">
          <span class="turn-snippet">${att.name} (${Math.round((att.size || 0) / 1024)} KB)</span>
        `;
        item.querySelector('input').addEventListener('change', updateTokenPreviewPopup);
        selectiveList.appendChild(item);
      });
    }
  }

  function getSelectedTurnAndAttachmentIds() {
    if (!selectiveList) return { selectedTurnIds: null, selectedAttachmentIds: null };
    const turnInputs = selectiveList.querySelectorAll('input[data-turn-id]:checked');
    const attInputs = selectiveList.querySelectorAll('input[data-att-id]:checked');
    return {
      selectedTurnIds: Array.from(turnInputs).map(i => i.getAttribute('data-turn-id')),
      selectedAttachmentIds: Array.from(attInputs).map(i => i.getAttribute('data-att-id'))
    };
  }

  async function updateTokenPreviewPopup() {
    if (!currentLoadedCapsule || !window.CapsuleTokenEstimator || !window.CapsulePromptTuner || !window.CapsuleEngine) {
      tokenValEl.textContent = 'Select or wrap to estimate';
      tokenDetEl.textContent = 'Based on text and media ranges';
      return;
    }

    try {
      const target = targetSelect.value;
      const { selectedTurnIds, selectedAttachmentIds } = getSelectedTurnAndAttachmentIds();

      const built = await window.CapsuleEngine.buildCapsule(currentLoadedCapsule, {
        selectedTurnIds,
        selectedAttachmentIds
      });

      const tunedText = window.CapsulePromptTuner.tune(built, target);
      const est = window.CapsuleTokenEstimator.calculateTotalTokenRange(tunedText, built.attachments, target);

      const rawText = (currentLoadedCapsule.turns || []).map(t => `${t.role}: ${t.content}`).join('\n\n');
      const rawEst = window.CapsuleTokenEstimator.estimateTextTokens(rawText);
      const savingsPct = (rawEst.avg > 0 && rawEst.avg > est.textTokens.avg)
        ? Math.round((1 - (est.textTokens.avg / rawEst.avg)) * 100)
        : 0;

      const savingsLabel = savingsPct > 0 ? ` (${savingsPct}% saved)` : '';
      tokenValEl.textContent = est.totalRangeStr;
      tokenDetEl.textContent = `Text: ~${est.textTokens.avg.toLocaleString()} tokens${savingsLabel} | ${est.mediaTokens.description}`;
    } catch (e) {
      console.warn('Token preview error:', e);
    }
  }

  // 4. Primary Handoff Button Handlers
  if (btnWrap) {
    btnWrap.addEventListener('click', async () => {
      if (!activeTabPlatform || !activeTabId) {
        showToast('Open Claude, Gemini, ChatGPT, Perplexity, or Groq to wrap.');
        return;
      }

      showToast('Scraping active chat...');
      chrome.tabs.sendMessage(activeTabId, { action: 'EXTRACT_SESSION' }, async (response) => {
        if (chrome.runtime?.lastError || !response || !response.success) {
          showToast('Could not scrape tab. Refresh the AI chat page and try again.');
          return;
        }

        const session = response.session;
        if (!session || !session.turns || session.turns.length === 0) {
          showToast('Notice: No message turns found in this chat to wrap.');
          return;
        }

        // Apply custom session name if specified by user, otherwise fall back to Candy Context default
        const customName = sessionNameInput ? sessionNameInput.value.trim() : '';
        if (customName) {
          session.title = customName;
        } else {
          session.title = 'Candy Context';
        }

        try {
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

          const res = await window.CapsuleDB.saveOrUpdateCapsule(session, allAttachments);
          selectedCapsuleId = res.id;
          if (sessionNameInput) {
            sessionNameInput.value = session.title;
          }
          showToast(`Saved! (${res.turnsCount} turns)`);
          await loadHandoffCandies();
          await loadCapsules();
        } catch (err) {
          showToast('Error saving candy: ' + err.message);
        }
      });
    });
  }

  if (btnCopy) {
    btnCopy.addEventListener('click', async () => {
      if (!currentLoadedCapsule) {
        showToast('Please select or wrap a candy first!');
        return;
      }

      const target = targetSelect.value;
      const { selectedTurnIds, selectedAttachmentIds } = getSelectedTurnAndAttachmentIds();
      const built = await window.CapsuleEngine.buildCapsule(currentLoadedCapsule, {
        selectedTurnIds,
        selectedAttachmentIds
      });

      const tunedText = window.CapsulePromptTuner.tune(built, target);
      await navigator.clipboard.writeText(tunedText);
      showToast('Handoff prompt copied to clipboard!');
    });
  }

  if (btnUnwrap) {
    btnUnwrap.addEventListener('click', async () => {
      if (!currentLoadedCapsule) {
        showToast('Please select a candy to unwrap!');
        return;
      }
      if (!activeTabPlatform || !activeTabId) {
        showToast('Open Claude, Gemini, ChatGPT, Perplexity, or Groq to unwrap.');
        return;
      }

      const target = targetSelect.value;
      const { selectedTurnIds, selectedAttachmentIds } = getSelectedTurnAndAttachmentIds();
      const built = await window.CapsuleEngine.buildCapsule(currentLoadedCapsule, {
        selectedTurnIds,
        selectedAttachmentIds
      });

      const tunedText = window.CapsulePromptTuner.tune(built, target);
      const hasMedia = built.attachments && built.attachments.length > 0;

      chrome.tabs.sendMessage(activeTabId, {
        action: 'INJECT_UNWRAP',
        text: tunedText,
        attachments: []
      }, (response) => {
        if (chrome.runtime?.lastError || !response || !response.success) {
          navigator.clipboard.writeText(tunedText);
          showToast('Could not inject into chat directly. Copied prompt and code to clipboard.');
        } else {
          showToast('Unwrapped and injected into active chat!');
        }
      });
    });
  }

  capsulePickerSelect.addEventListener('change', (e) => {
    selectedCapsuleId = e.target.value;
    loadSelectedCandyDetails();
  });

  targetSelect.addEventListener('change', updateTokenPreviewPopup);

  // 5. Vault Storage Management
  async function updateStorageStatsUI() {
    if (!window.CapsuleDB?.getStorageStats) return;
    try {
      const stats = await window.CapsuleDB.getStorageStats();
      if (storageSizeVal) storageSizeVal.textContent = stats.formattedSize;
      const countLabel = stats.totalCandies === 1 ? 'candy' : 'candies';
      if (storageCapVal) storageCapVal.textContent = `(${stats.totalCandies} ${countLabel})`;
    } catch (e) {
      console.warn('Storage stats error:', e);
    }
  }

  async function loadCapsules() {
    capsulesListContainer.innerHTML = '<div class="empty-state">Loading stored candies...</div>';
    await updateStorageStatsUI();
    try {
      const capsules = await window.CapsuleDB.listCapsules();
      await updateStorageStatsUI();

      if (!capsules || capsules.length === 0) {
        capsulesListContainer.innerHTML = `
          <div class="empty-state">
            No candies saved yet.<br>
            Use the Handoff tab to wrap an active AI conversation.
          </div>
        `;
        return;
      }

      capsulesListContainer.innerHTML = '';
      capsules.forEach(cap => {
        const card = document.createElement('div');
        card.className = 'capsule-card';

        const dateStr = new Date(cap.updatedAt).toLocaleDateString([], {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        const attachmentBadge = cap.attachmentCount > 0 ? (`<span>${cap.attachmentCount} files</span>`) : '';
        const encryptedBadge = cap.isEncrypted ? '<span>[Encrypted]</span>' : '';

        card.innerHTML = `
          <div class="card-header">
            <span class="card-title">${cap.title}</span>
            <span class="card-platform">${cap.sourcePlatform}</span>
          </div>
          <div class="card-meta">
            <span>${cap.turnsCount || 0} turns</span>
            ${attachmentBadge}
            ${encryptedBadge}
            <span>${dateStr}</span>
          </div>
          <div class="card-actions">
            <button class="btn btn-secondary btn-sm btn-card-use" data-id="${cap.id}">Use in Handoff</button>
            <button class="btn btn-secondary btn-sm btn-card-export" data-id="${cap.id}">Export</button>
            <button class="btn btn-danger btn-sm btn-card-del" data-id="${cap.id}">Delete</button>
          </div>
        `;

        card.querySelector('.btn-card-use').addEventListener('click', () => {
          selectedCapsuleId = cap.id;
          tabs[0].click(); // switch to handoff tab
          capsulePickerSelect.value = cap.id;
          loadSelectedCandyDetails();
        });

        card.querySelector('.btn-card-export').addEventListener('click', async () => {
          try {
            const bundle = await window.CapsuleDB.exportBundle(cap.id);
            const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${cap.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.capsule.json`;
            a.click();
            URL.revokeObjectURL(url);
          } catch (e) {
            showToast('Export failed: ' + e.message);
          }
        });

        card.querySelector('.btn-card-del').addEventListener('click', async () => {
          const confirmed = await showConfirmModal({
            title: 'Delete Candy',
            message: `Delete candy "${cap.title}"?`,
            confirmText: 'Delete',
            cancelText: 'Cancel',
            isDanger: true
          });
          if (confirmed) {
            await window.CapsuleDB.deleteCapsule(cap.id);
            await loadCapsules();
            await loadHandoffCandies();
            showToast(`Deleted "${cap.title}"`);
          }
        });

        capsulesListContainer.appendChild(card);
      });
    } catch (err) {
      capsulesListContainer.innerHTML = `<div class="empty-state">Error: ${err.message}</div>`;
    }
  }

  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      loadCapsules();
      loadHandoffCandies();
      detectActiveTab();
    });
  }

  if (importFileInput) {
    importFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const bundle = JSON.parse(text);
        const res = await window.CapsuleDB.importBundle(bundle);
        showToast(`Imported "${res.title}" successfully!`);
        await loadCapsules();
        await loadHandoffCandies();
      } catch (err) {
        showToast('Import failed: ' + err.message);
      }
      importFileInput.value = '';
    });
  }

  // 6. Settings: Floating Widget Toggle
  if (toggleFloatingWidget) {
    chrome.storage?.local?.get(['cc_show_floating_widget'], (res) => {
      toggleFloatingWidget.checked = !!(res && res.cc_show_floating_widget);
    });

    toggleFloatingWidget.addEventListener('change', () => {
      const enabled = toggleFloatingWidget.checked;
      chrome.storage?.local?.set({ cc_show_floating_widget: enabled }, () => {
        showToast(enabled ? 'Floating button enabled on web pages' : 'Floating button hidden from web pages');
      });
    });
  }

  // Init
  await detectActiveTab();
  await loadHandoffCandies();
  await updateStorageStatsUI();
});
