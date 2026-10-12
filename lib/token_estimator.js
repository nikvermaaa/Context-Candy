/**
 * lib/token_estimator.js
 * Honest token estimation displaying calibrated ranges rather than misleading exact numbers.
 * Accounts for code block density and multi-provider vision token variances.
 */
(function (global) {
  'use strict';

  /**
   * Estimate text tokens based on characters, words, and code block density.
   * Standard English prose averages ~4 chars / token.
   * Code, JSON, and punctuation-dense text averages ~2.5 - 3.2 chars / token.
   * @param {string} text
   * @returns {{min: number, max: number, avg: number}}
   */
  function estimateTextTokens(text) {
    if (!text || typeof text !== 'string') {
      return { min: 0, max: 0, avg: 0 };
    }

    const totalChars = text.length;
    // Count code block characters (text within triple backticks)
    let codeChars = 0;
    const codeBlockRegex = /```[\s\S]*?```/g;
    let match;
    while ((match = codeBlockRegex.exec(text)) !== null) {
      codeChars += match[0].length;
    }
    const proseChars = Math.max(0, totalChars - codeChars);

    // Prose: ~3.8 to 4.5 chars/token
    const proseTokensMin = Math.round(proseChars / 4.5);
    const proseTokensMax = Math.round(proseChars / 3.8);

    // Code: ~2.6 to 3.4 chars/token
    const codeTokensMin = Math.round(codeChars / 3.4);
    const codeTokensMax = Math.round(codeChars / 2.6);

    const min = proseTokensMin + codeTokensMin;
    const max = proseTokensMax + codeTokensMax;
    const avg = Math.round((min + max) / 2);

    return { min, max, avg };
  }

  /**
   * Provider-specific token cost ranges for media attachments.
   * Labeled clearly as approximate ranges.
   */
  const MEDIA_TOKEN_SPECS = {
    image: {
      universal: { min: 500, max: 1500, label: 'Universal (~500-1.5k/img)' },
      claude: { min: 1200, max: 1600, label: 'Claude (~1.2k-1.6k/img)' },
      gemini: { min: 258, max: 1050, label: 'Gemini (~258-1k/img)' },
      chatgpt: { min: 85, max: 1105, label: 'ChatGPT (~85-1.1k/img)' },
      groq: { min: 500, max: 1000, label: 'Groq vision (~500-1k/img)' },
      perplexity: { min: 500, max: 1200, label: 'Perplexity (~500-1.2k/img)' },
      generic: { min: 500, max: 1500, label: '~500-1.5k/img' }
    },
    pdf: {
      genericPerPage: { min: 250, max: 500, label: '~250-500/page' }
    }
  };

  /**
   * Estimate attachment tokens for a given target provider
   * @param {Array<{type: string, name?: string, size?: number, pageCount?: number}>} attachments
   * @param {string} targetProvider - 'universal' | 'claude' | 'gemini' | 'chatgpt' | 'perplexity' | 'groq' | 'generic'
   * @returns {{min: number, max: number, imageCount: number, pdfCount: number, description: string}}
   */
  function estimateMediaTokens(attachments, targetProvider = 'universal') {
    if (!Array.isArray(attachments) || attachments.length === 0) {
      return { min: 0, max: 0, imageCount: 0, pdfCount: 0, description: 'No attachments' };
    }

    let imageCount = 0;
    let pdfCount = 0;

    attachments.forEach(att => {
      const type = (att.type || '').toLowerCase();
      const name = (att.name || '').toLowerCase();
      if (type.startsWith('image/') || name.match(/\.(png|jpe?g|webp|gif)$/)) {
        imageCount++;
      } else if (type === 'application/pdf' || name.endsWith('.pdf')) {
        pdfCount++;
      }
    });

    const providerKey = (targetProvider in MEDIA_TOKEN_SPECS.image) ? targetProvider : 'generic';
    const imgSpec = MEDIA_TOKEN_SPECS.image[providerKey];
    const pdfSpec = MEDIA_TOKEN_SPECS.pdf.genericPerPage;

    const imgMin = imageCount * imgSpec.min;
    const imgMax = imageCount * imgSpec.max;

    // Default assume ~3 pages if page count is unknown
    const pdfMin = pdfCount * (pdfSpec.min * 2);
    const pdfMax = pdfCount * (pdfSpec.max * 4);

    const min = imgMin + pdfMin;
    const max = imgMax + pdfMax;

    const parts = [];
    if (imageCount > 0) parts.push(`${imageCount} image${imageCount > 1 ? 's' : ''} (approx ${imgMin.toLocaleString()}-${imgMax.toLocaleString()})`);
    if (pdfCount > 0) parts.push(`${pdfCount} PDF${pdfCount > 1 ? 's' : ''} (approx ${pdfMin.toLocaleString()}-${pdfMax.toLocaleString()})`);

    return {
      min,
      max,
      imageCount,
      pdfCount,
      description: parts.join(', ') || 'Attachments included'
    };
  }

  /**
   * Format human-readable token range badge
   * @param {string} text
   * @param {Array} attachments
   * @param {string} targetProvider
   * @returns {{textTokens: Object, mediaTokens: Object, totalRangeStr: string, isApproximate: boolean}}
   */
  function calculateTotalTokenRange(text, attachments = [], targetProvider = 'generic') {
    const textEst = estimateTextTokens(text);
    const mediaEst = estimateMediaTokens(attachments, targetProvider);

    const totalMin = textEst.min + mediaEst.min;
    const totalMax = textEst.max + mediaEst.max;

    const totalRangeStr = totalMax > 0 
      ? `~${totalMin.toLocaleString()} – ${totalMax.toLocaleString()} tokens (est.)`
      : '0 tokens';

    return {
      textTokens: textEst,
      mediaTokens: mediaEst,
      totalMin,
      totalMax,
      totalRangeStr,
      isApproximate: true
    };
  }

  global.CapsuleTokenEstimator = {
    estimateTextTokens,
    estimateMediaTokens,
    calculateTotalTokenRange
  };
})(typeof window !== 'undefined' ? window : globalThis);
