<div align="center">
  <img src="icons/candy128.png" alt="Context Candy Logo" width="96" height="96" />
  <h1>Context Candy</h1>
  <p><strong>Universal Context Handoff for Your AI Agents</strong></p>
  <p>Wrap, distill, secure, and seamlessly transfer conversation context, code state, and multimodal attachments across Anthropic Claude, OpenAI ChatGPT, Google Gemini, Perplexity AI, and Groq.</p>

  <p>
    <a href="#quick-start-installation"><img src="https://img.shields.io/badge/Manifest-V3-blue.svg" alt="Manifest V3" /></a>
    <a href="#security--privacy-guarantees"><img src="https://img.shields.io/badge/Privacy-100%25%20Local-green.svg" alt="100% Local" /></a>
    <a href="#supported-platforms"><img src="https://img.shields.io/badge/Platforms-Claude%20%7C%20ChatGPT%20%7C%20Gemini%20%7C%20Perplexity%20%7C%20Groq-orange.svg" alt="Platforms" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-purple.svg" alt="MIT License" /></a>
  </p>
</div>

---

## Overview

When working with modern AI models, developers frequently hit context limits, rate limits, or need to switch models mid-thought (e.g. brainstorming in Claude, testing code speed in Groq, verifying facts in Perplexity, or generating assets in ChatGPT). 

**Context Candy** is a zero-build, local-first Manifest V3 browser extension that captures conversation turns, extracted code blocks, and media references, packaging them into structured "candies" that can be injected into any other AI chat in one click.

---

## Key Features

### 1. Supported Platforms
Native DOM adapters engineered and tested across 5 major AI platforms:
- **Anthropic Claude** (`claude.ai`)
- **OpenAI ChatGPT** (`chatgpt.com` and `chat.openai.com`)
- **Google Gemini** (`gemini.google.com`)
- **Perplexity AI** (`perplexity.ai`)
- **Groq Chat** (`groq.com` and `chat.groq.com`)

### 2. Per-Target Prompt Tuning
Every AI model responds differently to structured input. Context Candy automatically reformats unwrapped context for the target destination:
- **Claude Framing**: Structured XML syntax (`<session_context>`, `<active_code_state>`, `<recent_exchanges>`) optimized for Claude 3.5 Sonnet / Opus.
- **ChatGPT Framing**: System and developer directive preambles with resumption framing.
- **Gemini Framing**: Hierarchical bulleted directives with explicit attachment anchors.
- **Perplexity Framing**: Query-first research synthesis framing.
- **Groq Framing**: Ultra-dense Markdown prioritizing code and terminal output for high-throughput Llama 3 models.
- **Universal Framing**: Clean portable Markdown compatible with any LLM interface.

### 3. Dual Precision Theme System
Context Candy includes a dual-theme architecture built for precision:
- **Obsidian Dark Mode**: Deep metallic black (`#020202`) with high-contrast hierarchy, glass elevation, and Linear/Raycast-inspired design.
- **Minimalist Light Mode**: Crisp white surfaces (`#ffffff`), subtle dot-matrix background pattern, and distinctive precision dotted and dashed borders matching modern design systems.
- **Sleek Sun/Moon Toggle**: Instant theme switching in the popup header with state persistence.

### 4. Selective Turn & Attachment Inspector
Before wrapping or unwrapping, inspect every turn and attached file:
- Expand the **Selective Turn & Media Inspector** to select or deselect individual exchanges.
- Exclude unnecessary preamble, irrelevant tangents, or sensitive information to minimize token consumption.

### 5. Honest Token Estimator
Live token counter calibrated against each provider's tokenizer:
- Accounts for text token density, code blocks, and media overhead.
- Clear indicators so you never trigger provider token limits unintentionally.

### 6. Permanent Vault Storage & Portable Bundles
- **Unlimited Storage Policy**: Stored sessions ("candies") remain in browser IndexedDB permanently without artificial caps or auto-deletion.
- **Bundle Export & Import**: Export any session as a `.capsule.json` file for cross-browser, cross-device, or team sharing.
- **Storage Footprint Meter**: Real-time disk utilization gauge in the Vault tab.

### 7. Security & Client-Side Privacy
- **100% Local-First**: No remote telemetry, no external servers, and no tracking. All data is processed directly inside your browser.
- **Client-Side Storage**: All conversations and metadata reside safely in your private IndexedDB.
- **Zero API Keys Required**: No third-party accounts or sensitive API keys needed.

---

## Quick Start: Installation

Context Candy is built on native modern Web Standards (ES Modules, Manifest V3, Shadow DOM). **No build tools, npm packages, or bundlers are required.**

### Chrome, Brave, Edge, Opera, or Vivaldi

1. Download or clone this repository:
   ```bash
   git clone https://github.com/your-username/context-candy.git
   ```
2. Open your browser's extensions page:
   - **Google Chrome**: `chrome://extensions`
   - **Brave**: `brave://extensions`
   - **Microsoft Edge**: `edge://extensions`
   - **Opera**: `opera://extensions`
3. Toggle on **Developer mode** (top-right corner).
4. Click **Load unpacked** (top-left corner).
5. Select the downloaded `context-candy` folder (the root folder containing `manifest.json`).
6. The **Context Candy** icon will appear in your browser toolbar. Pin it for quick access.

---

## How to Use

### 1. Wrapping an Active Session
1. Open any supported AI conversation ([Claude](https://claude.ai), [ChatGPT](https://chatgpt.com), [Gemini](https://gemini.google.com), [Perplexity](https://perplexity.ai), or [Groq](https://chat.groq.com)).
2. Click the **Context Candy** extension icon in your toolbar.
3. The platform badge will automatically detect your active tab.
4. Give your session a name (or keep the default).
5. Click **Wrap Session**:
   - Turns, code snippets, and file references are captured.
   - The session is saved to your local Vault.
   - The estimated token count updates automatically.

### 2. Unwrapping into Another AI
1. Navigate to your destination AI chat.
2. Open the **Context Candy** popup.
3. Under **Saved Session to Unwrap**, select the session you want to resume.
4. (Optional) Expand the **Selective Turn & Media Inspector** to pick specific turns.
5. Click **Unwrap Session**:
   - The tuned prompt is injected directly into the chat prompt box.
   - If direct injection is restricted by the page, click **Copy Handoff** and paste (`Ctrl+V` / `Cmd+V`) into the prompt box.

### 3. Managing the Vault
1. Click the **Vault** tab in the popup.
2. View all stored candies with turn counts, creation timestamps, and source platforms.
3. Actions available per capsule:
   - **Use in Handoff**: Instantly selects the candy in the Handoff tab.
   - **Export**: Downloads a portable `.capsule.json` bundle.
   - **Delete**: Removes the session from local storage.
4. Use **Import Bundle** in the toolbar to restore sessions from file.

---

## Project Structure

```
context-candy/
├── manifest.json              # Manifest V3 extension configuration
├── background.js              # Background service worker (cross-tab coordination)
├── LICENSE                    # MIT License
├── README.md                  # Project documentation
├── .gitignore                 # Git ignore rules for clean repository
├── icons/                     # Extension branding and icon assets
│   ├── candy16.png            # 16x16 toolbar icon
│   ├── candy32.png            # 32x32 Retina toolbar icon
│   ├── candy48.png            # 48x48 extension management icon
│   ├── candy128.png           # 128x128 Web Store / README icon
│   ├── candy256.png           # 256x256 high-resolution asset
│   ├── context_candy_banner.png # Project banner for README and documentation
│   └── icon.svg               # Vector source icon
├── popup/                     # Main extension popup interface
│   ├── popup.html             # Structure for Handoff and Vault tabs
│   ├── popup.js               # Event handling, state, and theme management
│   └── popup.css              # Obsidian Dark & Dotted Light theme stylesheets
├── content/                   # On-page content scripts
│   ├── page_bridge.js         # MAIN world script for API and React state inspection
│   ├── widget.js              # Shadow DOM encapsulated floating UI
│   └── widget.css             # Shadow DOM scoped styles
├── adapters/                  # Platform DOM extractors and injectors
│   ├── adapter_manager.js     # Router coordinating active platform adapters
│   ├── selector_config.js     # Semantic selectors and code fence rules
│   ├── media_extractor.js     # Lightweight attachment and document detector
│   ├── dom_health.js          # Self-test diagnostic health check
│   ├── claude_adapter.js      # Anthropic Claude scraper and injector
│   ├── chatgpt_adapter.js     # OpenAI ChatGPT scraper and injector
│   ├── gemini_adapter.js      # Google Gemini scraper and injector
│   ├── perplexity_adapter.js  # Perplexity AI scraper and injector
│   └── groq_adapter.js        # Groq Chat scraper and injector
├── engine/                    # Context synthesis and formatting
│   ├── capsule_engine.js      # Turn serialization and selective filtering
│   ├── prompt_tuner.js        # Target-specific formatting rules
│   └── injector.js            # Text typing and file drop simulation
├── lib/                       # Core utility modules
│   ├── db.js                  # IndexedDB persistent storage engine
│   └── token_estimator.js     # Provider-calibrated token estimator
├── fonts/                     # Bundled web fonts
│   ├── Ubuntu-Variable.ttf
│   └── Newsreader-Variable.ttf
└── tests/                     # Automated test suites
    ├── verify_extension.py    # Master extension integrity test
    ├── test_chatgpt_and_document_detection.py
    ├── test_claude_code_extraction.py
    └── test_text_and_code_pipeline.py
```

---

## Security & Privacy Guarantees

- **No Remote Servers**: Context Candy operates entirely in your browser. No data, analytics, or telemetry are transmitted to third-party endpoints.
- **Scoped Host Permissions**: The extension only activates on authorized AI platform domains.
- **Safe at Rest**: All conversation history is stored strictly in your browser's private IndexedDB storage.
- **Zero Hallucination Risk**: Verbatim turns and direct code artifacts—no uncontrolled background transformations.

---

## Automated Verification

You can verify extension integrity, file syntax, schema contracts, and storage policies at any time:

```bash
python3 tests/verify_extension.py
```

To run individual adapter and pipeline test suites:
```bash
python3 tests/test_chatgpt_and_document_detection.py
python3 tests/test_claude_code_extraction.py
python3 tests/test_text_and_code_pipeline.py
```

---

## Contributing

Contributions, bug reports, and adapter updates are welcome. To contribute:
1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/new-adapter`).
3. Make your changes and run `python3 tests/verify_extension.py`.
4. Submit a Pull Request.

---

## License

This project is licensed under the [MIT License](LICENSE).
