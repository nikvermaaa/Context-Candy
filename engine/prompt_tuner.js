/**
 * engine/prompt_tuner.js
 * Universal AI Handoff prompt tuning compatible across all AI models:
 * Claude, ChatGPT, Gemini, Perplexity, Groq, and others.
 */
(function (global) {
  'use strict';

  class PromptTuner {
    /**
     * Tune capsule prompt for universal AI model handoff
     * @param {Object} capsule
     * @param {string} targetProvider
     * @returns {string} tuned prompt
     */
    tune(capsule, targetProvider = 'universal') {
      return this.tuneUniversal(capsule);
    }

    /**
     * Single universal prompt format that works across Claude, ChatGPT, Gemini, Perplexity, Groq, etc.
     * Uses structured Markdown with clear directives, metadata, code artifacts, and complete turn history.
     */
    tuneUniversal(capsule) {
      if (!capsule) return '';
      const turns = capsule.turns || capsule.zeroKeyDistillation?.allTurns || capsule.zeroKeyDistillation?.recentTurns || [];
      const attachments = capsule.attachments || [];
      const codeArtifacts = capsule.zeroKeyDistillation?.codeArtifacts || [];

      let md = `# Transferred AI Session Context: ${capsule.title || 'Ongoing Task'}\n\n`;
      md += `> **Resumption Directive**:\n`;
      md += `> You are continuing a conversation transferred from another AI model (${capsule.sourcePlatform || 'Previous Assistant'}).\n`;
      md += `> Read the complete conversation history below from Turn 1 to the end and all enclosed code artifacts.\n`;
      md += `> Resume seamlessly from where the conversation left off without restarting or asking the user to repeat prior context.\n\n`;

      md += `### Session Metadata\n`;
      md += `- **Origin**: ${capsule.sourcePlatform || 'AI Session'}\n`;
      md += `- **Total Conversation Turns**: ${turns.length}\n`;
      if (codeArtifacts.length > 0) {
        md += `- **Active Code Artifacts**: ${codeArtifacts.length}\n`;
      }
      if (attachments.length > 0) {
        md += `- **Referenced Media**: ${attachments.length}\n`;
      }
      md += `- **Handoff Timestamp**: ${new Date().toISOString()}\n\n`;

      if (capsule.summary && capsule.summary.trim()) {
        md += `### Executive Summary\n${capsule.summary.trim()}\n\n`;
      }

      if (attachments.length > 0) {
        md += `### Referenced Media & Attachments (${attachments.length})\n`;
        attachments.forEach((att, idx) => {
          const sizeKb = att.size ? ` (${Math.round(att.size / 1024)} KB)` : '';
          const mime = att.mimeType ? ` [${att.mimeType}]` : '';
          md += `${idx + 1}. **${att.name}**${mime}${sizeKb}\n`;
        });
        md += `> Note: Media files referenced above are not transferred automatically. The user will re-upload them directly to this chat if needed for this task.\n\n`;
      }

      if (codeArtifacts.length > 0) {
        md += `### Active Code State\n`;
        codeArtifacts.forEach((art, idx) => {
          const lang = art.language || 'plaintext';
          md += `#### Code Artifact ${idx + 1} (${lang})\n\`\`\`${lang}\n${art.code.trim()}\n\`\`\`\n\n`;
        });
      }

      if (turns.length > 0) {
        md += `### Conversation History (${turns.length} Turns from Start)\n\n`;
        turns.forEach((t, idx) => {
          const roleLabel = t.role === 'user' ? 'User' : 'Assistant';
          let text = (t.content || '').trim();
          if (t.attachments && t.attachments.length > 0) {
            const attList = t.attachments.map(a => a.name).join(', ');
            text = `[User Attached: ${attList}]\n${text}`.trim();
          }
          md += `#### Turn ${idx + 1} [${roleLabel}]\n${text}\n\n`;
        });
      }

      md += `---\n**Next Step**: Please confirm receipt of this context and let me know the best next step to continue.`;
      return md;
    }

    // Legacy method aliases for backward compatibility with tests and callers
    tuneForClaude(capsule) { return this.tuneUniversal(capsule); }
    tuneForGemini(capsule) { return this.tuneUniversal(capsule); }
    tuneForChatGPT(capsule) { return this.tuneUniversal(capsule); }
    tuneForPerplexity(capsule) { return this.tuneUniversal(capsule); }
    tuneForGroq(capsule) { return this.tuneUniversal(capsule); }
    tuneForProjectInstructions(capsule) { return this.tuneUniversal(capsule); }
    tuneForLocalMCP(capsule) { return this.tuneUniversal(capsule); }
  }

  global.CapsulePromptTuner = new PromptTuner();
})(typeof window !== 'undefined' ? window : globalThis);
