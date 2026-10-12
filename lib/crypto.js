/**
 * lib/crypto.js
 * Web Crypto API implementation for AES-GCM-256 vault encryption at rest.
 * Provides PBKDF2 key derivation from user passphrase with random salt and IV.
 */
(function (global) {
  'use strict';

  const PBKDF2_ITERATIONS = 100000;
  const KEY_LENGTH = 256;
  const ALGORITHM = 'AES-GCM';

  function bufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function base64ToBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  async function deriveKey(passphrase, saltBytes) {
    const encoder = new TextEncoder();
    const passphraseKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(passphrase),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBytes,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256'
      },
      passphraseKey,
      { name: ALGORITHM, length: KEY_LENGTH },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypt arbitrary JSON-serializable data or plain string
   * @param {*} data
   * @param {string} passphrase
   * @returns {Promise<{ciphertext: string, iv: string, salt: string, isEncrypted: boolean}>}
   */
  async function encryptData(data, passphrase) {
    if (!passphrase) {
      return { data, isEncrypted: false };
    }
    const encoder = new TextEncoder();
    const jsonString = typeof data === 'string' ? data : JSON.stringify(data);
    const plainBytes = encoder.encode(jsonString);

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const key = await deriveKey(passphrase, salt);
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: ALGORITHM, iv: iv },
      key,
      plainBytes
    );

    return {
      ciphertext: bufferToBase64(encryptedBuffer),
      iv: bufferToBase64(iv),
      salt: bufferToBase64(salt),
      isEncrypted: true
    };
  }

  /**
   * Decrypt package created by encryptData
   * @param {Object} encryptedPackage
   * @param {string} passphrase
   * @returns {Promise<any>}
   */
  async function decryptData(encryptedPackage, passphrase) {
    if (!encryptedPackage || !encryptedPackage.isEncrypted) {
      return encryptedPackage ? (encryptedPackage.data !== undefined ? encryptedPackage.data : encryptedPackage) : null;
    }
    if (!passphrase) {
      throw new Error('Passphrase required to decrypt encrypted capsule');
    }

    const salt = new Uint8Array(base64ToBuffer(encryptedPackage.salt));
    const iv = new Uint8Array(base64ToBuffer(encryptedPackage.iv));
    const cipherBuffer = base64ToBuffer(encryptedPackage.ciphertext);

    const key = await deriveKey(passphrase, salt);
    try {
      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: ALGORITHM, iv: iv },
        key,
        cipherBuffer
      );
      const decoder = new TextDecoder();
      const jsonString = decoder.decode(decryptedBuffer);
      try {
        return JSON.parse(jsonString);
      } catch (e) {
        return jsonString;
      }
    } catch (err) {
      throw new Error('Decryption failed: Invalid passphrase or corrupted data');
    }
  }

  global.CapsuleCrypto = {
    encryptData,
    decryptData,
    bufferToBase64,
    base64ToBuffer
  };
})(typeof window !== 'undefined' ? window : globalThis);
