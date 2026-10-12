/**
 * lib/db.js
 * Unified cross-origin storage engine for Context Capsules and Binary Media.
 * Uses chrome.storage.local to share context across all AI tabs (ChatGPT, Claude, Gemini,
 * Perplexity, Groq) and the extension popup, with fallback and migration support.
 */
(function (global) {
  'use strict';

  const DB_NAME = 'CapsuleVaultDB';
  const DB_VERSION = 1;

  // Storage Policy: Unlimited candies & Permanent storage (no auto-deletion)
  const RETENTION_MAX_DAYS = null;
  const RETENTION_MAX_ITEMS = null;
  const RETENTION_POLICY = 'permanent';

  // Storage key schema
  const KEY_INDEX = 'cc_capsule_index';
  const KEY_CAP_PREFIX = 'cc_cap_';
  const KEY_ATT_PREFIX = 'cc_att_';
  const KEY_SETTINGS = 'cc_settings';

  // In-memory fallback store for offline tests and non-extension environments
  const fallbackStore = new Map();

  function getStorageApi() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return chrome.storage.local;
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      return browser.storage.local;
    }
    return null;
  }

  function getStorage(keys) {
    return new Promise((resolve) => {
      const api = getStorageApi();
      if (!api) {
        if (!keys) {
          const all = {};
          fallbackStore.forEach((v, k) => { all[k] = v; });
          return resolve(all);
        }
        if (typeof keys === 'string') {
          return resolve({ [keys]: fallbackStore.get(keys) });
        }
        if (Array.isArray(keys)) {
          const res = {};
          keys.forEach(k => { if (fallbackStore.has(k)) res[k] = fallbackStore.get(k); });
          return resolve(res);
        }
        return resolve({});
      }

      api.get(keys, (res) => {
        resolve(res || {});
      });
    });
  }

  function setStorage(items) {
    return new Promise((resolve, reject) => {
      const api = getStorageApi();
      if (!api) {
        Object.entries(items).forEach(([k, v]) => fallbackStore.set(k, v));
        return resolve();
      }

      api.set(items, () => {
        if (chrome?.runtime?.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  function removeStorage(keys) {
    return new Promise((resolve) => {
      const api = getStorageApi();
      const keyList = Array.isArray(keys) ? keys : [keys];
      if (!api) {
        keyList.forEach(k => fallbackStore.delete(k));
        return resolve();
      }

      api.remove(keyList, () => resolve());
    });
  }

  function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'cap_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
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

  function mergeTurns(oldTurns, newTurns) {
    if (!oldTurns || oldTurns.length === 0) return newTurns;
    if (!newTurns || newTurns.length === 0) return oldTurns;

    const turnKey = (t) => `${t.role}_${(t.content || '').slice(0, 100)}`;
    const seen = new Set(oldTurns.map(turnKey));
    const merged = [...oldTurns];

    newTurns.forEach(t => {
      const key = turnKey(t);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(t);
      }
    });

    return merged;
  }

  function extractCodeBlocks(turns) {
    const blocks = [];
    const codeRegex = /```([a-zA-Z0-9_\-\.]*)\n([\s\S]*?)```/g;
    turns.forEach((turn, turnIdx) => {
      let match;
      while ((match = codeRegex.exec(turn.content || '')) !== null) {
        blocks.push({
          turnIndex: turnIdx,
          language: match[1] || 'plaintext',
          code: match[2].trim(),
          role: turn.role
        });
      }
    });
    return blocks;
  }

  async function getRawCapsule(id) {
    if (!id) return null;
    const res = await getStorage(`${KEY_CAP_PREFIX}${id}`);
    return res[`${KEY_CAP_PREFIX}${id}`] || null;
  }

  async function findCapsuleBySessionUrl(url) {
    if (!url) return null;
    const index = await getIndex();
    const match = index.find(item => item.sessionUrl === url);
    if (!match) return null;
    return getRawCapsule(match.id);
  }

  async function getIndex() {
    const res = await getStorage(KEY_INDEX);
    return Array.isArray(res[KEY_INDEX]) ? res[KEY_INDEX] : [];
  }

  async function setIndex(index) {
    await setStorage({ [KEY_INDEX]: index });
  }

  /**
   * Save or incrementally update a capsule
   * @param {Object} capsuleData
   * @param {Array<Object>} attachments
   * @param {string} [passphrase]
   * @returns {Promise<Object>} saved capsule summary
   */
  async function saveOrUpdateCapsule(capsuleData, attachments = []) {
    let existing = null;
    if (capsuleData.id) {
      existing = await getRawCapsule(capsuleData.id);
    } else if (capsuleData.sessionUrl) {
      existing = await findCapsuleBySessionUrl(capsuleData.sessionUrl);
    }

    const capsuleId = existing ? existing.id : (capsuleData.id || generateUUID());
    const now = Date.now();
    const revision = (existing ? (existing.revision || 1) : 0) + 1;

    let finalTurns = capsuleData.turns || [];
    if (existing && existing.turns) {
      finalTurns = mergeTurns(existing.turns, capsuleData.turns || []);
    }

    const payloadToStore = {
      id: capsuleId,
      sessionUrl: capsuleData.sessionUrl || (existing ? existing.sessionUrl : ''),
      title: capsuleData.title || (existing ? existing.title : 'Untitled Session'),
      sourcePlatform: capsuleData.sourcePlatform || (existing ? existing.sourcePlatform : 'generic'),
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
      revision: revision,
      attachmentCount: (attachments.length || (existing ? existing.attachmentCount : 0)),
      meta: {
        totalTurns: finalTurns.length,
        hasCode: finalTurns.some(t => t.content && t.content.includes('```')),
        sourceUrl: (typeof window !== 'undefined' && window.location) ? window.location.href : (capsuleData.sessionUrl || '')
      }
    };

    const sensitiveContent = {
      turns: finalTurns,
      summary: capsuleData.summary || (existing ? existing.summary : null),
      codeBlocks: capsuleData.codeBlocks || extractCodeBlocks(finalTurns)
    };

    payloadToStore.isEncrypted = false;
    payloadToStore.turns = sensitiveContent.turns;
    payloadToStore.summary = sensitiveContent.summary;
    payloadToStore.codeBlocks = sensitiveContent.codeBlocks;

    // Lightweight attachment metadata only (no binary blobs)
    const serializedAttachments = (attachments || []).map(att => ({
      id: att.id || generateUUID(),
      capsuleId: capsuleId,
      name: att.name || 'attachment',
      mimeType: att.mimeType || att.type || 'application/octet-stream',
      size: att.size || 0,
      isMediaReference: true,
      createdAt: Date.now()
    }));

    // Save capsule and attachments
    const toSave = {
      [`${KEY_CAP_PREFIX}${capsuleId}`]: payloadToStore
    };
    if (serializedAttachments.length > 0) {
      toSave[`${KEY_ATT_PREFIX}${capsuleId}`] = serializedAttachments;
    }
    await setStorage(toSave);

    // Update capsule index
    const index = await getIndex();
    const summaryItem = {
      id: capsuleId,
      title: payloadToStore.title,
      sourcePlatform: payloadToStore.sourcePlatform,
      sessionUrl: payloadToStore.sessionUrl,
      updatedAt: now,
      createdAt: payloadToStore.createdAt,
      revision: revision,
      attachmentCount: serializedAttachments.length || payloadToStore.attachmentCount,
      turnsCount: finalTurns.length,
      isEncrypted: false
    };

    const filteredIndex = index.filter(item => item.id !== capsuleId);
    filteredIndex.unshift(summaryItem);
    filteredIndex.sort((a, b) => b.updatedAt - a.updatedAt);
    await setIndex(filteredIndex);

    return {
      id: capsuleId,
      title: payloadToStore.title,
      revision: revision,
      turnsCount: finalTurns.length,
      updatedAt: now,
      isEncrypted: false
    };
  }

  /**
   * Retrieve full capsule with attachments
   */
  async function getCapsule(id) {
    const raw = await getRawCapsule(id);
    if (!raw) return null;
    raw.attachments = await getAttachmentsForCapsule(id);
    return raw;
  }

  /**
   * List all stored capsules (unlimited and permanent)
   */
  async function listCapsules() {
    const index = await getIndex();
    return index.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async function deleteCapsule(id) {
    if (!id) return;
    await removeStorage([`${KEY_CAP_PREFIX}${id}`, `${KEY_ATT_PREFIX}${id}`]);
    const index = await getIndex();
    const updatedIndex = index.filter(item => item.id !== id);
    await setIndex(updatedIndex);
  }

  /**
   * Prune is disabled: candies are permanent and unlimited.
   */
  async function pruneExpiredAndExcessCandies() {
    return {
      prunedCount: 0,
      deletedIds: []
    };
  }

  /**
   * Calculate total vault storage footprint (text + attachments)
   */
  async function getStorageStats() {
    const index = await getIndex();
    const all = await getStorage(null);

    let totalSizeBytes = 0;
    let totalAttachments = 0;

    Object.entries(all).forEach(([key, val]) => {
      const serialized = JSON.stringify(val);
      totalSizeBytes += serialized.length;
      if (key.startsWith(KEY_ATT_PREFIX) && Array.isArray(val)) {
        totalAttachments += val.length;
      }
    });

    let formattedSize = '0 KB';
    if (totalSizeBytes > 1024 * 1024) {
      formattedSize = (totalSizeBytes / (1024 * 1024)).toFixed(2) + ' MB';
    } else {
      formattedSize = Math.max(1, Math.round(totalSizeBytes / 1024)) + ' KB';
    }

    return {
      totalCandies: index.length,
      maxCandies: 'Unlimited',
      retentionDays: 'Permanent',
      totalAttachments,
      totalSizeBytes,
      formattedSize
    };
  }

  async function saveAttachments(capsuleId, attachments) {
    const serializedAttachments = (attachments || []).map(att => ({
      id: att.id || generateUUID(),
      capsuleId: capsuleId,
      name: att.name || 'attachment',
      mimeType: att.mimeType || att.type || 'application/octet-stream',
      size: att.size || 0,
      isMediaReference: true,
      createdAt: Date.now()
    }));

    await setStorage({
      [`${KEY_ATT_PREFIX}${capsuleId}`]: serializedAttachments
    });
  }

  async function getAttachmentsForCapsule(capsuleId) {
    if (!capsuleId) return [];
    const res = await getStorage(`${KEY_ATT_PREFIX}${capsuleId}`);
    const items = res[`${KEY_ATT_PREFIX}${capsuleId}`] || [];

    return items.map(item => ({
      id: item.id,
      name: item.name,
      mimeType: item.mimeType,
      size: item.size,
      isMediaReference: true
    }));
  }

  /**
   * Export complete standalone bundle (metadata + turns + base64 encoded media)
   */
  async function exportBundle(capsuleId, passphrase = null) {
    const capsule = await getCapsule(capsuleId, passphrase);
    if (!capsule) throw new Error('Capsule not found');

    const attachments = await getAttachmentsForCapsule(capsuleId);
    const serializedAttachments = [];

    for (const att of attachments) {
      let b64 = att.base64;
      if (!b64 && att.blob) {
        b64 = await blobToBase64(att.blob);
      }
      serializedAttachments.push({
        id: att.id,
        name: att.name,
        mimeType: att.mimeType,
        size: att.size,
        base64: b64
      });
    }

    return {
      version: '1.0.0',
      schema: 'ai-context-capsule-bundle',
      exportedAt: new Date().toISOString(),
      capsule: {
        id: capsule.id,
        title: capsule.title,
        sourcePlatform: capsule.sourcePlatform,
        sessionUrl: capsule.sessionUrl,
        createdAt: capsule.createdAt,
        updatedAt: capsule.updatedAt,
        revision: capsule.revision,
        turns: capsule.turns || [],
        summary: capsule.summary || null,
        codeBlocks: capsule.codeBlocks || []
      },
      attachments: serializedAttachments
    };
  }

  /**
   * Import bundle JSON exported from any browser
   */
  async function importBundle(bundle, passphrase = null) {
    if (!bundle || bundle.schema !== 'ai-context-capsule-bundle') {
      throw new Error('Invalid capsule bundle format');
    }

    const { capsule, attachments = [] } = bundle;
    const reconstructedAttachments = [];

    for (const att of attachments) {
      let blob = null;
      if (att.base64) {
        blob = base64ToBlob(att.base64, att.mimeType);
      }
      reconstructedAttachments.push({
        id: att.id || generateUUID(),
        name: att.name,
        mimeType: att.mimeType,
        size: att.size,
        blob: blob,
        base64: att.base64
      });
    }

    return saveOrUpdateCapsule(capsule, reconstructedAttachments, passphrase);
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        const b64 = result.split(',')[1];
        resolve(b64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function base64ToBlob(b64, mimeType = 'application/octet-stream') {
    const byteChars = atob(b64);
    const byteArrays = [];
    for (let offset = 0; offset < byteChars.length; offset += 512) {
      const slice = byteChars.slice(offset, offset + 512);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      byteArrays.push(new Uint8Array(byteNumbers));
    }
    return new Blob(byteArrays, { type: mimeType });
  }

  /**
   * Auto-migrate any existing candies stored in the tab's local IndexedDB into shared storage
   */
  async function migrateFromIndexedDB() {
    try {
      if (typeof indexedDB === 'undefined') return;
      const dbReq = indexedDB.open(DB_NAME, DB_VERSION);
      dbReq.onsuccess = async (e) => {
        const idb = e.target.result;
        if (!idb.objectStoreNames.contains('capsules')) {
          idb.close();
          return;
        }
        const tx = idb.transaction(['capsules'], 'readonly');
        const store = tx.objectStore('capsules');
        const req = store.getAll();
        req.onsuccess = async () => {
          const oldCapsules = req.result || [];
          if (oldCapsules.length > 0) {
            for (const cap of oldCapsules) {
              const existing = await getRawCapsule(cap.id);
              if (!existing) {
                await saveOrUpdateCapsule(cap, cap.attachments || []);
              }
            }
          }
          idb.close();
        };
      };
    } catch (e) {
      // Ignore migration errors
    }
  }

  // Run migration on load
  migrateFromIndexedDB();

  function openDB() {
    return Promise.resolve(true);
  }

  global.CapsuleDB = {
    openDB,
    saveOrUpdateCapsule,
    getCapsule,
    listCapsules,
    deleteCapsule,
    pruneExpiredAndExcessCandies,
    getStorageStats,
    saveAttachments,
    getAttachmentsForCapsule,
    exportBundle,
    importBundle,
    blobToBase64,
    base64ToBlob,
    RETENTION_MAX_DAYS,
    RETENTION_MAX_ITEMS
  };
})(typeof window !== 'undefined' ? window : globalThis);
