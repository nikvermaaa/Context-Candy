/**
 * engine/capsule_engine.js
 * Distillation, diffing, and selective turn filtering.
 * Pure text and code verbatim mode.
 */
(function (global) {
  'use strict';

  class CapsuleEngine {
    constructor() {
      // Retain full conversation history by default
    }

    /**
     * Build an optimized capsule payload from extracted session data
     * @param {Object} rawSession - { turns, attachments, title, sourcePlatform, sessionUrl }
     * @param {Object} options - { selectedTurnIds, selectedAttachmentIds }
     * @returns {Promise<Object>} distilled capsule
     */
    async buildCapsule(rawSession, options = {}) {
      const {
        selectedTurnIds = null,
        selectedAttachmentIds = null
      } = options;

      // 1. Filter turns if user specified selective turns
      let turns = rawSession.turns || [];
      if (Array.isArray(selectedTurnIds) && selectedTurnIds.length > 0) {
        const idSet = new Set(selectedTurnIds);
        turns = turns.filter(t => idSet.has(t.id));
      }

      // 2. Filter attachments
      let attachments = rawSession.attachments || [];
      if (Array.isArray(selectedAttachmentIds) && selectedAttachmentIds.length > 0) {
        const idSet = new Set(selectedAttachmentIds);
        attachments = attachments.filter(a => idSet.has(a.id));
      }

      // 3. Extract code artifacts across all selected turns (all files retained)
      const codeArtifacts = this.extractCodeArtifacts(turns);

      // 4. Complete verbatim turns from the start of the chat:
      // Preserves 100% of the conversation history, user prompts, assistant answers, and code blocks
      const allTurns = turns.map((t, idx) => ({
        id: t.id || `turn_${idx + 1}`,
        index: typeof t.index === 'number' ? t.index : idx,
        role: t.role,
        content: (t.content || '').trim(),
        attachments: t.attachments || []
      }));

      return {
        id: rawSession.id || null,
        title: rawSession.title || 'Conversation Capsule',
        sourcePlatform: rawSession.sourcePlatform || 'generic',
        sessionUrl: rawSession.sessionUrl || '',
        totalTurns: allTurns.length,
        summary: null,
        zeroKeyDistillation: {
          codeArtifacts: codeArtifacts,
          recentTurns: allTurns, // Full conversation from start
          allTurns: allTurns
        },
        turns: allTurns,
        attachments: attachments
      };
    }

    extractCodeArtifacts(turns) {
      const artifacts = [];
      const codeRegex = /```([a-zA-Z0-9_\-\.]*)\n([\s\S]*?)```/g;

      turns.forEach((turn) => {
        let match;
        while ((match = codeRegex.exec(turn.content || '')) !== null) {
          const lang = match[1] || 'plaintext';
          const code = match[2].trim();
          if (code.length > 20) {
            artifacts.push({
              language: lang,
              code: code,
              role: turn.role,
              turnId: turn.id
            });
          }
        }
      });

      // Retain all extracted code artifacts across the entire session
      return artifacts;
    }

  }

  global.CapsuleEngine = new CapsuleEngine();
})(typeof window !== 'undefined' ? window : globalThis);
