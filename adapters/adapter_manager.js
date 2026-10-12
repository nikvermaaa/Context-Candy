/**
 * adapters/adapter_manager.js
 * Central router coordinating platform detection, extraction, and DOM health checks.
 */
(function (global) {
  'use strict';

  class AdapterManager {
    constructor() {
      this.adapters = {
        claude: global.CapsuleClaudeAdapter,
        gemini: global.CapsuleGeminiAdapter,
        chatgpt: global.CapsuleChatGPTAdapter,
        perplexity: global.CapsulePerplexityAdapter,
        groq: global.CapsuleGroqAdapter
      };
    }

    getCurrentPlatformId() {
      const hostname = window.location.hostname.toLowerCase();
      if (hostname.includes('claude.ai')) return 'claude';
      if (hostname.includes('gemini.google.com')) return 'gemini';
      if (hostname.includes('chatgpt.com') || hostname.includes('chat.openai.com')) return 'chatgpt';
      if (hostname.includes('perplexity.ai')) return 'perplexity';
      if (hostname.includes('groq.com')) return 'groq';
      return null;
    }

    getCurrentAdapter() {
      const platformId = this.getCurrentPlatformId();
      return platformId ? this.adapters[platformId] : null;
    }

    async extractActiveSession() {
      const adapter = this.getCurrentAdapter();
      if (!adapter) {
        throw new Error(`Unsupported AI platform: ${window.location.hostname}`);
      }
      return await adapter.extractConversation();
    }

    checkHealth() {
      const adapter = this.getCurrentAdapter();
      if (!adapter || !global.CapsuleDomHealth) return null;
      const config = adapter.getConfig ? adapter.getConfig() : null;
      return global.CapsuleDomHealth.diagnose(config);
    }
  }

  global.CapsuleAdapterManager = new AdapterManager();
})(typeof window !== 'undefined' ? window : globalThis);
