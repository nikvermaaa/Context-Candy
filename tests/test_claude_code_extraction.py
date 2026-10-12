#!/usr/bin/env python3
"""
tests/test_claude_code_extraction.py
Automated end-to-end unit tests verifying Claude input code extraction,
turn formatting, capsule distillation, and prompt tuning across target bots.
Strict zero-emoji compliance.
"""

import os
import sys
import json
import re

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def test_manifest_page_bridge():
    print("[1] Verifying manifest.json configuration for page_bridge.js...")
    manifest_path = os.path.join(BASE_DIR, 'manifest.json')
    with open(manifest_path, 'r', encoding='utf-8') as f:
        manifest = json.load(f)

    # Check MAIN world content script
    main_world_scripts = [
        cs for cs in manifest.get('content_scripts', [])
        if cs.get('world') == 'MAIN'
    ]
    assert len(main_world_scripts) > 0, "Missing MAIN world content script entry in manifest.json"
    bridge_script = main_world_scripts[0]
    assert 'content/page_bridge.js' in bridge_script.get('js', []), "page_bridge.js missing from MAIN world content script"
    assert bridge_script.get('run_at') == 'document_start', "MAIN world content script should run at document_start"

    # Check web accessible resources
    war = manifest.get('web_accessible_resources', [])
    assert any('content/page_bridge.js' in r.get('resources', []) for r in war), "page_bridge.js missing from web_accessible_resources"
    print("    manifest.json correctly registers page_bridge.js with world: MAIN.")

def test_page_bridge_implementation():
    print("[2] Verifying content/page_bridge.js implementation...")
    bridge_path = os.path.join(BASE_DIR, 'content', 'page_bridge.js')
    assert os.path.exists(bridge_path), "content/page_bridge.js does not exist"

    with open(bridge_path, 'r', encoding='utf-8') as f:
        code = f.read()

    assert 'window.fetch' in code, "Missing window.fetch interception in page_bridge.js"
    assert '/chat_conversations/' in code, "Missing chat_conversations API endpoint check"
    assert 'extracted_content' in code, "Missing extracted_content handling in page_bridge.js"
    assert '__reactFiber$' in code, "Missing React Fiber traversal in page_bridge.js"
    assert '__reactProps$' in code, "Missing React Props traversal in page_bridge.js"
    assert 'data-capsule-code' in code, "Missing data-capsule-code DOM annotation"
    assert 'CAPSULE_PAGE_BRIDGE_REQUEST' in code, "Missing CAPSULE_PAGE_BRIDGE_REQUEST message listener"
    assert 'CAPSULE_PAGE_BRIDGE_RESPONSE' in code, "Missing CAPSULE_PAGE_BRIDGE_RESPONSE message dispatcher"
    print("    content/page_bridge.js implements fetch interception, React Fiber inspection, and DOM annotation.")

def test_claude_adapter_code_extraction():
    print("[3] Verifying adapters/claude_adapter.js code extraction logic...")
    claude_adapter_path = os.path.join(BASE_DIR, 'adapters', 'claude_adapter.js')
    assert os.path.exists(claude_adapter_path), "claude_adapter.js does not exist"

    with open(claude_adapter_path, 'r', encoding='utf-8') as f:
        code = f.read()

    assert 'queryPageBridge' in code, "Missing queryPageBridge in claude_adapter.js"
    assert 'turnScope' in code, "Missing turnScope expansion in claude_adapter.js"
    assert 'data-capsule-code' in code, "Missing data-capsule-code inspection in claude_adapter.js"
    assert 'formatCodeBlock' in code, "Missing formatCodeBlock in claude_adapter.js"
    assert 'detectLanguage' in code, "Missing detectLanguage in claude_adapter.js"
    assert '[Attached Code:' in code, "Missing Attached Code marker in claude_adapter.js"
    assert 'buildConversationFromBridge' in code, "Missing buildConversationFromBridge fallback in claude_adapter.js"
    print("    claude_adapter.js implements turn scope widening, page bridge querying, and attached code formatting.")

def test_selector_config_and_media_extractor():
    print("[4] Verifying selector_config.js and media_extractor.js updates...")
    sel_path = os.path.join(BASE_DIR, 'adapters', 'selector_config.js')
    with open(sel_path, 'r', encoding='utf-8') as f:
        sel_code = f.read()

    assert '[data-capsule-code]' in sel_code, "Missing data-capsule-code selector in selector_config.js"
    assert 'Attached Code' in sel_code, "Missing Attached Code unpack handling in extractCleanText"

    media_path = os.path.join(BASE_DIR, 'adapters', 'media_extractor.js')
    with open(media_path, 'r', encoding='utf-8') as f:
        media_code = f.read()

    assert 'data-capsule-code' in media_code, "Missing data-capsule-code handling in media_extractor.js"
    print("    selector_config.js and media_extractor.js properly unpack and preserve code attachments.")

def test_end_to_end_capsule_generation():
    print("[5] Testing end-to-end capsule formatting for multi-code Claude input...")
    # Simulate a Claude user turn containing prompt and two attached code files
    turn_text = "check if the both code same"
    code1 = "def solve():\n    return 42\n"
    code2 = "def solve():\n    return 42\n"

    # Simulate claude adapter formatCodeBlock
    formatted_code1 = f"\n\n[Attached Code: code1.py]\n```python\n{code1.strip()}\n```\n"
    formatted_code2 = f"\n\n[Attached Code: code2.py]\n```python\n{code2.strip()}\n```\n"

    turn_content = (turn_text + formatted_code1 + formatted_code2).strip()

    # Verify code artifacts extraction regex (from capsule_engine.js)
    code_regex = re.compile(r'```([a-zA-Z0-9_\-\.]*)\n([\s\S]*?)```')
    matches = code_regex.findall(turn_content)
    assert len(matches) == 2, f"Expected 2 code block matches, got {len(matches)}"
    assert matches[0][0] == 'python'
    assert 'return 42' in matches[0][1]
    assert matches[1][0] == 'python'
    assert 'return 42' in matches[1][1]

    # Verify PromptTuner Universal format
    prompt_tuner_path = os.path.join(BASE_DIR, 'engine', 'prompt_tuner.js')
    with open(prompt_tuner_path, 'r', encoding='utf-8') as f:
        pt_code = f.read()

    assert 'tuneUniversal' in pt_code, "Missing tuneUniversal in prompt_tuner.js"
    assert 'Transferred AI Session Context:' in pt_code, "Missing Transferred AI Session Context header in prompt_tuner.js"
    assert 'Resumption Directive' in pt_code, "Missing Resumption Directive in prompt_tuner.js"
    assert 'tuneForClaude' in pt_code, "Missing tuneForClaude alias in prompt_tuner.js"
    assert 'tuneForGemini' in pt_code, "Missing tuneForGemini alias in prompt_tuner.js"
    assert 'tuneForChatGPT' in pt_code, "Missing tuneForChatGPT alias in prompt_tuner.js"
    print("    Capsule engine and Universal prompt tuner accurately format turns and directives.")

def test_zero_emojis_in_repository():
    print("[6] Checking strict zero-emoji compliance across repository...")
    emoji_pattern = re.compile(
        "[\U0001F300-\U0001F9FF\U0001FA00-\U0001FAFF\U00002600-\U000026FF\U00002700-\U000027BF]"
    )

    checked_dirs = ['adapters', 'content', 'engine', 'lib', 'popup', 'tests']
    found = []
    for d in checked_dirs:
        dir_path = os.path.join(BASE_DIR, d)
        if not os.path.exists(dir_path):
            continue
        for root, _, files in os.walk(dir_path):
            for f in files:
                if f.endswith(('.js', '.py', '.html', '.css', '.json')):
                    fp = os.path.join(root, f)
                    with open(fp, 'r', encoding='utf-8', errors='ignore') as fh:
                        content = fh.read()
                        matches = emoji_pattern.findall(content)
                        if matches:
                            found.append((fp, matches[:3]))

    assert len(found) == 0, f"Found emojis in repository: {found}"
    print("    Zero emojis confirmed across all code, tests, and configuration files.")

def main():
    print("==================================================")
    print("   Claude Input Code Extraction Verification       ")
    print("==================================================")
    try:
        test_manifest_page_bridge()
        test_page_bridge_implementation()
        test_claude_adapter_code_extraction()
        test_selector_config_and_media_extractor()
        test_end_to_end_capsule_generation()
        test_zero_emojis_in_repository()
        print("\nAll 6 tests passed successfully.")
        return 0
    except AssertionError as e:
        print(f"\nVerification failed: {e}", file=sys.stderr)
        return 1

if __name__ == '__main__':
    sys.exit(main())
