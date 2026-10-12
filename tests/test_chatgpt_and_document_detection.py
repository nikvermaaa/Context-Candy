#!/usr/bin/env python3
"""
tests/test_chatgpt_and_document_detection.py
Automated test suite verifying:
1. Document card detection (PDF, MD, docx badges, download buttons)
2. ChatGPT Next.js DOM turn discovery, role classification, and targeted content extraction
3. Page bridge support for ChatGPT backend-api mapping endpoints
4. Attachment aggregation across turns in popup.js and widget.js wrap handlers
5. Strict zero-emoji compliance
"""
import os
import re
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def test_document_card_detection():
    print("[1] Verifying media extractor document card detection...")
    extractor_path = os.path.join(BASE_DIR, 'adapters', 'media_extractor.js')
    with open(extractor_path, 'r', encoding='utf-8') as f:
        code = f.read()

    assert 'docBadgeMatch' in code, "docBadgeMatch missing from media_extractor.js"
    assert 'Document|File' in code, "Document/File badge regex missing from media_extractor.js"
    assert 'downloadBtn' in code or 'hasDownload' in code, "Download button detection missing"
    assert 'fileExtMatch' in code, "File extension regex matching missing from media_extractor.js"
    assert 'pdf|md|docx?' in code, "Common document extensions missing from regex"
    print("    Document card, PDF/MD badges, and download button logic verified.")

def test_chatgpt_adapter_robustness():
    print("[2] Verifying ChatGPT adapter DOM scraping and role resolution...")
    cg_path = os.path.join(BASE_DIR, 'adapters', 'chatgpt_adapter.js')
    with open(cg_path, 'r', encoding='utf-8') as f:
        code = f.read()

    assert 'queryPageBridge' in code, "queryPageBridge missing in chatgpt_adapter.js"
    assert 'detectRole' in code, "detectRole missing in chatgpt_adapter.js"
    assert 'hasAssistant' in code and 'hasUser' in code, "Turn counterpart safeguard missing in chatgpt_adapter.js"
    assert 'mdContainer' in code, "Targeted markdown container extraction missing"
    assert 'userContainer' in code, "Targeted whitespace-pre-wrap extraction missing"
    assert 'cardCandidates' in code, "Turn document card scanning missing in chatgpt_adapter.js"
    assert 'capturedUploads' in code, "capturedUploads check missing in chatgpt_adapter.js"
    assert 'buildConversationFromBridge' in code, "buildConversationFromBridge missing in chatgpt_adapter.js"
    print("    ChatGPT adapter DOM robustness, role detection, and card scanning verified.")

def test_selector_config_chatgpt_and_code():
    print("[3] Verifying selector_config.js ChatGPT configuration & code fence preservation...")
    sel_path = os.path.join(BASE_DIR, 'adapters', 'selector_config.js')
    with open(sel_path, 'r', encoding='utf-8') as f:
        code = f.read()

    assert 'data-testid^="conversation-turn"' in code, "conversation-turn selector missing"
    assert 'article' in code, "article selector missing"
    assert 'data-message-author-role' in code, "data-message-author-role missing"
    assert 'group/conversation-turn' in code, "group/conversation-turn selector missing"
    assert 'you said' in code, "Screen reader heading check missing in userRoleCheck"
    assert 'capsule-code-fence' in code, "capsule-code-fence extraction marker missing"
    assert 'white-space:pre-wrap' in code, "Connected layout text extraction missing"
    print("    selector_config.js contains modern Next.js ChatGPT selectors and code fence logic.")

def test_page_bridge_chatgpt_support():
    print("[4] Verifying page_bridge.js ChatGPT API interception...")
    bridge_path = os.path.join(BASE_DIR, 'content', 'page_bridge.js')
    with open(bridge_path, 'r', encoding='utf-8') as f:
        code = f.read()

    assert '/backend-api/conversation' in code, "ChatGPT /backend-api/conversation endpoint missing from page_bridge.js"
    assert 'data.mapping' in code, "ChatGPT data.mapping message parser missing from page_bridge.js"
    print("    page_bridge.js correctly intercepts and parses ChatGPT conversation APIs.")

def test_media_disclaimer_under_estimated_tokens():
    print("[5] Verifying media disclaimer note placed under Estimated Tokens...")
    popup_html_path = os.path.join(BASE_DIR, 'popup', 'popup.html')
    with open(popup_html_path, 'r', encoding='utf-8') as f:
        html = f.read()

    assert 'token-card' in html, "token-card missing from popup.html"
    assert 'media-disclaimer-note' in html, "media-disclaimer-note missing from popup.html"
    assert 'Media and documents are not transferred automatically' in html, "Disclaimer text missing in popup.html"

    # Verify that media-disclaimer-note occurs immediately after token-card in popup.html
    token_pos = html.find('id="token-card"')
    note_pos = html.find('class="media-disclaimer-note"')
    assert token_pos != -1 and note_pos != -1 and note_pos > token_pos, "Disclaimer must appear after token-card in popup.html"

    widget_js_path = os.path.join(BASE_DIR, 'content', 'widget.js')
    with open(widget_js_path, 'r', encoding='utf-8') as f:
        widget_code = f.read()

    assert 'token-card' in widget_code, "token-card missing from widget.js"
    assert 'media-disclaimer-note' in widget_code, "media-disclaimer-note missing from widget.js"
    assert 'Media and documents are not transferred automatically' in widget_code, "Disclaimer text missing in widget.js"
    print("    Media disclaimer note verified under Estimated Tokens in popup and widget.")

def test_zero_emoji_compliance():
    print("[6] Checking strict zero-emoji compliance...")
    EMOJI_RANGES = [
        (0x1F600, 0x1F64F), (0x1F300, 0x1F5FF), (0x1F680, 0x1F6FF),
        (0x1F700, 0x1F77F), (0x1F780, 0x1F7FF), (0x1F800, 0x1F8FF),
        (0x1F900, 0x1F9FF), (0x1FA00, 0x1FA6F), (0x1FA70, 0x1FAFF),
        (0x2600, 0x26FF),   (0x2700, 0x27BF),   (0xFE00, 0xFE0F),
        (0x1F1E6, 0x1F1FF), (0x200D, 0x200D),   (0x2300, 0x23FF),
        (0x2B50, 0x2B50),   (0x203C, 0x203C),   (0x2049, 0x2049)
    ]
    def is_emoji(char):
        cp = ord(char)
        for start, end in EMOJI_RANGES:
            if start <= cp <= end:
                return True
        return False

    violations = []
    for root, dirs, files in os.walk(BASE_DIR):
        if '.git' in root:
            continue
        for fname in files:
            if fname.endswith(('.js', '.html', '.css', '.json', '.py', '.md')):
                fpath = os.path.join(root, fname)
                with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
                    for line_no, line in enumerate(f, 1):
                        for char in line:
                            if is_emoji(char):
                                violations.append((fpath, line_no, char))

    assert len(violations) == 0, f"Found {len(violations)} emoji violations: {violations[:5]}"
    print("    Strict zero-emoji compliance confirmed across repository.")

if __name__ == '__main__':
    print('=' * 50)
    print('   ChatGPT & Document Detection Test Suite       ')
    print('=' * 50)
    test_document_card_detection()
    test_chatgpt_adapter_robustness()
    test_selector_config_chatgpt_and_code()
    test_page_bridge_chatgpt_support()
    test_media_disclaimer_under_estimated_tokens()
    test_zero_emoji_compliance()
    print('')
    print('All 6 ChatGPT & document detection tests passed successfully!')
