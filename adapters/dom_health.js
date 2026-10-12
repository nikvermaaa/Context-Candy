/**
 * adapters/dom_health.js
 * Self-test diagnostic health checker.
 * Monitors DOM extraction and provides warning states if an AI platform updates its markup.
 */
(function (global) {
  'use strict';

  class DomHealthChecker {
    constructor() {
      this.lastHealthReport = null;
    }

    /**
     * Run diagnostic check against current page DOM
     * @param {Object} platformConfig
     * @returns {{isHealthy: boolean, turnsFound: number, inputFound: boolean, warnings: Array<string>}}
     */
    diagnose(platformConfig) {
      if (!platformConfig) {
        return {
          isHealthy: false,
          turnsFound: 0,
          inputFound: false,
          warnings: ['No platform configuration found for this domain.']
        };
      }

      const warnings = [];
      let turnsFound = 0;
      let matchedTurnSelector = null;

      // 1. Test turn selectors
      for (const sel of platformConfig.turnSelectors) {
        try {
          const els = document.querySelectorAll(sel);
          if (els && els.length > 0) {
            turnsFound = els.length;
            matchedTurnSelector = sel;
            break;
          }
        } catch (e) {
          // Selector syntax error in override
        }
      }

      if (turnsFound === 0 && !inputFound) {
        warnings.push(`Could not locate message turns or input field. The website's DOM layout may have changed.`);
      }

      // 2. Test input selectors
      let inputFound = false;
      let matchedInputSelector = null;
      for (const sel of platformConfig.inputSelectors) {
        try {
          const el = document.querySelector(sel);
          if (el) {
            inputFound = true;
            matchedInputSelector = sel;
            break;
          }
        } catch (e) {}
      }

      if (!inputFound && turnsFound > 0) {
        warnings.push(`Could not locate chat input prompt field. 1-click injection may need manual paste.`);
      }

      // Healthy if either conversation turns exist or input field is ready for new messages
      const isHealthy = turnsFound > 0 || inputFound;

      this.lastHealthReport = {
        platform: platformConfig.name,
        timestamp: Date.now(),
        isHealthy,
        turnsFound,
        matchedTurnSelector,
        inputFound,
        matchedInputSelector,
        warnings
      };

      return this.lastHealthReport;
    }

    getLastReport() {
      return this.lastHealthReport;
    }
  }

  global.CapsuleDomHealth = new DomHealthChecker();
})(typeof window !== 'undefined' ? window : globalThis);
