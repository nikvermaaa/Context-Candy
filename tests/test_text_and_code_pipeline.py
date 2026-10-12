#!/usr/bin/env python3
"""
tests/test_text_and_code_pipeline.py
Automated test suite verifying the pure text and code extraction pipeline,
media detection usability notification, unlimited candies policy,
and strict zero-emoji compliance.
"""
import os
import json
import sys
import re
import unicodedata

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def test_security_and_summarizer_removal():
    print("[1] Verifying removal of Security tab, Settings tab, and AI summarizer...")
    popup_html_path = os.path.join(BASE_DIR, 'popup', 'popup.html')
    with open(popup_html_path, 'r', encoding='utf-8') as f:
        html = f.read()

    assert 'data-tab="security-tab"' not in html, "Security tab still found in popup.html"
    assert 'id="security-tab"' not in html, "Security section still found in popup.html"
    assert 'data-tab="settings-tab"' not in html, "Settings tab still found in popup.html"
    assert 'id="settings-tab"' not in html, "Settings section still found in popup.html"
    assert 'id="ai-api-key"' not in html, "AI API key input still found in popup.html"
    assert 'Optional AI Summarizer' not in html, "AI Summarizer panel still found in popup.html"

    capsule_engine_path = os.path.join(BASE_DIR, 'engine', 'capsule_engine.js')
    with open(capsule_engine_path, 'r', encoding='utf-8') as f:
        engine_code = f.read()

    assert 'summarizeWithAi' not in engine_code, "summarizeWithAi method still found in capsule_engine.js"
    assert 'useAiSummarizer' not in engine_code, "useAiSummarizer parameter still found in capsule_engine.js"
    print("    Security tab, Settings tab, and AI summarizer completely removed.")

def test_unlimited_and_permanent_storage():
    print("[2] Verifying unlimited storage policy and Vault footprint UI...")
    db_path = os.path.join(BASE_DIR, 'lib', 'db.js')
    with open(db_path, 'r', encoding='utf-8') as f:
        db_code = f.read()

    assert "RETENTION_POLICY = 'permanent'" in db_code, "Expected RETENTION_POLICY = 'permanent' in lib/db.js"
    assert "maxCandies: 'Unlimited'" in db_code, "Expected Unlimited candies in getStorageStats"
    assert "retentionDays: 'Permanent'" in db_code, "Expected Permanent retention in getStorageStats"

    popup_html_path = os.path.join(BASE_DIR, 'popup', 'popup.html')
    with open(popup_html_path, 'r', encoding='utf-8') as f:
        popup_html = f.read()
    # Vault should only show total candies and size, without writing "Permanent Storage"
    assert "Permanent Storage" not in popup_html, "Permanent Storage should not be written in Vault UI"
    assert "candies" in popup_html, "Candies label missing from popup.html"

    popup_js_path = os.path.join(BASE_DIR, 'popup', 'popup.js')
    with open(popup_js_path, 'r', encoding='utf-8') as f:
        popup_js = f.read()
    assert "Permanent storage" not in popup_js, "Permanent storage string still found in popup.js"
    print("    Unlimited storage policy and Vault footprint UI verified.")

def test_media_notification_on_wrap():
    print("[3] Verifying rectangular toast styling and media disclaimer note under Estimated Tokens...")
    popup_css_path = os.path.join(BASE_DIR, 'popup', 'popup.css')
    with open(popup_css_path, 'r', encoding='utf-8') as f:
        popup_css = f.read()

    assert "display: none !important;" in popup_css, "Hidden toast must have display: none !important"
    assert "left: 14px;" in popup_css and "right: 14px;" in popup_css, "Toast must be rectangular with left/right spans"
    assert "media-disclaimer-note" in popup_css, "media-disclaimer-note CSS missing from popup.css"

    popup_html_path = os.path.join(BASE_DIR, 'popup', 'popup.html')
    with open(popup_html_path, 'r', encoding='utf-8') as f:
        popup_html = f.read()

    assert "media-disclaimer-note" in popup_html, "media-disclaimer-note missing from popup.html"
    assert "Media and documents are not transferred automatically" in popup_html, "Disclaimer text missing in popup.html"

    widget_js_path = os.path.join(BASE_DIR, 'content', 'widget.js')
    with open(widget_js_path, 'r', encoding='utf-8') as f:
        widget_js = f.read()

    assert "media-disclaimer-note" in widget_js, "media-disclaimer-note missing from widget.js"
    assert "Media and documents are not transferred automatically" in widget_js, "Disclaimer text missing in widget.js"
    print("    Rectangular toast styling and media disclaimer note under Estimated Tokens properly verified.")

def test_prompt_tuner_text_and_code_focus():
    print("[4] Verifying prompt tuner text and code focus...")
    tuner_path = os.path.join(BASE_DIR, 'engine', 'prompt_tuner.js')
    with open(tuner_path, 'r', encoding='utf-8') as f:
        tuner_code = f.read()

    assert "Active Code State" in tuner_code, "Active Code State section missing in prompt_tuner.js"
    assert "Conversation History" in tuner_code, "Conversation History section missing in prompt_tuner.js"
    assert "system clipboard" not in tuner_code, "Obsolete clipboard image reference still in prompt_tuner.js"
    assert "re-upload them directly to this chat" in tuner_code, "Re-upload note missing in prompt_tuner.js"
    print("    Prompt tuner focuses on active code state, full history, and clean referenced media notes.")

def test_media_extractor_metadata_only():
    print("[5] Verifying media extractor metadata-only operation...")
    extractor_path = os.path.join(BASE_DIR, 'adapters', 'media_extractor.js')
    with open(extractor_path, 'r', encoding='utf-8') as f:
        extractor_code = f.read()

    assert "isMediaReference: true" in extractor_code, "isMediaReference flag missing in media_extractor.js"
    assert "data-capsule-code" in extractor_code, "Code payload extraction missing in media_extractor.js"
    print("    Media extractor operates in lightweight metadata mode without binary bloat.")

def test_strict_zero_emojis():
    print("[6] Checking strict zero-emoji compliance...")
    emoji_pattern = re.compile(
        "[\U0001F600-\U0001F64F"
        "\U0001F300-\U0001F5FF"
        "\U0001F680-\U0001F6FF"
        "\U0001F1E0-\U0001F1FF"
        "\U0001F900-\U0001F9FF"
        "\U0001FA00-\U0001FA6F"
        "\U0001FA70-\U0001FAFF"
        "\U00002600-\U000026FF"
        "]+", flags=re.UNICODE
    )

    violations = []
    for root, dirs, files in os.walk(BASE_DIR):
        if any(skip in root for skip in ['.git', '.gemini', 'node_modules', '__pycache__']):
            continue
        for f in files:
            if f.endswith(('.js', '.py', '.html', '.css', '.json', '.md')):
                fpath = os.path.join(root, f)
                with open(fpath, 'r', encoding='utf-8', errors='ignore') as fh:
                    for line_no, line in enumerate(fh, 1):
                        for ch in line:
                            name = unicodedata.name(ch, '')
                            cat = unicodedata.category(ch)
                            if 'EMOJI' in name or ('So' in cat and ord(ch) > 0x1F000):
                                violations.append((os.path.relpath(fpath, BASE_DIR), line_no, ch, name))

    assert len(violations) == 0, f"Found {len(violations)} emojis: {violations[:5]}"
    print("    Strict zero-emoji compliance confirmed across all project files.")

def main():
    print("==================================================")
    print("   Text & Code Pipeline Automated Test Suite      ")
    print("==================================================")
    try:
        test_security_and_summarizer_removal()
        test_unlimited_and_permanent_storage()
        test_media_notification_on_wrap()
        test_prompt_tuner_text_and_code_focus()
        test_media_extractor_metadata_only()
        test_strict_zero_emojis()
        print("\nAll 6 text & code pipeline tests passed successfully!")
        return 0
    except AssertionError as e:
        print(f"\nVerification failed: {e}", file=sys.stderr)
        return 1

if __name__ == '__main__':
    sys.exit(main())
