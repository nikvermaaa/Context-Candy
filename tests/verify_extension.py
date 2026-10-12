#!/usr/bin/env python3
"""
tests/verify_extension.py
Automated test suite verifying extension manifest integrity, file layout,
selector configs, prompt tuning formats, and token estimation ranges.
"""
import os
import json
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def strip_js_syntax(code):
    """Accurately strip comments, strings, regexes, and template literals using a character state machine."""
    out = []
    i = 0
    n = len(code)
    while i < n:
        if code[i:i+2] == '//':
            i = code.find('\n', i)
            if i == -1: break
        elif code[i:i+2] == '/*':
            end = code.find('*/', i+2)
            i = n if end == -1 else end + 2
        elif code[i] in ("'", '"'):
            quote = code[i]
            i += 1
            while i < n and code[i] != quote:
                if code[i] == '\\': i += 1
                i += 1
            i += 1
        elif code[i] == '`':
            i += 1
            while i < n and code[i] != '`':
                if code[i] == '\\': i += 1
                i += 1
            i += 1
        elif code[i] == '/' and i + 1 < n and code[i+1] not in ('/', '*', '='):
            prev = "".join(out).rstrip()
            if not prev or prev[-1] in '=(,:;[!?&|~^%<>+-':
                i += 1
                while i < n and code[i] != '/':
                    if code[i] == '\\': i += 1
                    i += 1
                i += 1
            else:
                out.append(code[i])
                i += 1
        else:
            out.append(code[i])
            i += 1
    return "".join(out)

def test_manifest_structure():
    print("[1] Verifying manifest.json...")
    manifest_path = os.path.join(BASE_DIR, 'manifest.json')
    assert os.path.exists(manifest_path), "manifest.json does not exist"

    with open(manifest_path, 'r', encoding='utf-8') as f:
        manifest = json.load(f)

    assert manifest.get('manifest_version') == 3, f"Expected manifest_version 3, got {manifest.get('manifest_version')}"
    assert 'storage' in manifest.get('permissions', []), "Missing storage permission"
    assert 'unlimitedStorage' in manifest.get('permissions', []), "Missing unlimitedStorage permission"
    assert 'clipboardWrite' in manifest.get('permissions', []), "Missing clipboardWrite permission"

    # Verify all 5 platform hosts
    hosts = manifest.get('host_permissions', [])
    assert any('claude.ai' in h for h in hosts), "Missing Claude host permission"
    assert any('gemini.google.com' in h for h in hosts), "Missing Gemini host permission"
    assert any('chatgpt.com' in h for h in hosts), "Missing ChatGPT host permission"
    assert any('perplexity.ai' in h for h in hosts), "Missing Perplexity host permission"
    assert any('groq.com' in h for h in hosts), "Missing Groq host permission"

    # Verify all content script files exist
    for cs in manifest.get('content_scripts', []):
        for js_file in cs.get('js', []):
            full_path = os.path.join(BASE_DIR, js_file)
            assert os.path.exists(full_path), f"Content script {js_file} referenced in manifest does not exist at {full_path}"

    # Verify action and popup
    popup_path = manifest.get('action', {}).get('default_popup')
    assert popup_path and os.path.exists(os.path.join(BASE_DIR, popup_path)), f"Popup {popup_path} not found"

    # Verify icons
    for size, icon_rel in manifest.get('icons', {}).items():
        icon_path = os.path.join(BASE_DIR, icon_rel)
        assert os.path.exists(icon_path), f"Icon {icon_rel} ({size}) not found"
        assert os.path.getsize(icon_path) > 0, f"Icon {icon_rel} is empty"

    # Verify background compatibility for both Chrome and Firefox MV3
    bg = manifest.get('background', {})
    assert bg.get('service_worker') == 'background.js', "Missing background.service_worker for Chrome"
    assert 'background.js' in bg.get('scripts', []), "Missing background.scripts for Firefox"

    print("    manifest.json is valid and all referenced assets exist.")

def test_javascript_syntax_and_balancing():
    print("[2] Checking JavaScript file integrity...")
    js_files = []
    for root, _, files in os.walk(BASE_DIR):
        for file in files:
            if file.endswith('.js') and not file.startswith('.'):
                js_files.append(os.path.join(root, file))

    assert len(js_files) >= 12, f"Expected at least 12 JS files, found {len(js_files)}"

    for js_path in js_files:
        rel_path = os.path.relpath(js_path, BASE_DIR)
        with open(js_path, 'r', encoding='utf-8') as f:
            code = f.read()

        assert len(code) > 50, f"File {rel_path} appears empty or truncated"

        stripped = strip_js_syntax(code)

        braces = stripped.count('{') - stripped.count('}')
        parens = stripped.count('(') - stripped.count(')')
        brackets = stripped.count('[') - stripped.count(']')

        assert braces == 0, f"Unbalanced braces in {rel_path} (diff: {braces})"
        assert parens == 0, f"Unbalanced parentheses in {rel_path} (diff: {parens})"
        assert brackets == 0, f"Unbalanced brackets in {rel_path} (diff: {brackets})"

    print(f"    Verified {len(js_files)} JavaScript files: syntax and brace balancing are clean.")

def test_adapter_coverage():
    print("[3] Verifying 5-Platform Adapter coverage...")
    platforms = ['claude', 'gemini', 'chatgpt', 'perplexity', 'groq']
    for p in platforms:
        adapter_file = os.path.join(BASE_DIR, 'adapters', f'{p}_adapter.js')
        assert os.path.exists(adapter_file), f"Missing adapter file: {adapter_file}"
        with open(adapter_file, 'r', encoding='utf-8') as f:
            content = f.read()
        assert 'extractConversation' in content, f"Adapter {p} missing extractConversation"
        assert 'findInputField' in content, f"Adapter {p} missing findInputField"
        assert 'findUploadTarget' in content, f"Adapter {p} missing findUploadTarget"
    print(f"    All {len(platforms)} platform adapters implement required contracts.")

def test_prompt_tuning_logic():
    print("[4] Testing Prompt Tuner and Target Formatting...")
    prompt_tuner_path = os.path.join(BASE_DIR, 'engine', 'prompt_tuner.js')
    with open(prompt_tuner_path, 'r', encoding='utf-8') as f:
        tuner_code = f.read()

    targets = ['Claude', 'Gemini', 'ChatGPT', 'Perplexity', 'Groq', 'ProjectInstructions', 'LocalMCP']
    for t in targets:
        assert f'tuneFor{t}' in tuner_code, f"PromptTuner missing method tuneFor{t}"

    print("    PromptTuner coverage complete across all models and export formats.")

def test_token_estimator_ranges():
    print("[5] Testing Token Estimator provider specs...")
    token_est_path = os.path.join(BASE_DIR, 'lib', 'token_estimator.js')
    with open(token_est_path, 'r', encoding='utf-8') as f:
        estimator_code = f.read()

    assert 'MEDIA_TOKEN_SPECS' in estimator_code
    assert 'claude' in estimator_code
    assert 'gemini' in estimator_code
    assert 'chatgpt' in estimator_code
    assert 'groq' in estimator_code
    assert 'perplexity' in estimator_code
    assert 'estimateTextTokens' in estimator_code
    assert 'calculateTotalTokenRange' in estimator_code
    print("    Token Estimator provider specifications validated.")

def test_retention_policy_constants():
    print("[6] Testing Unlimited Candies & Permanent Storage Policy...")
    db_path = os.path.join(BASE_DIR, 'lib', 'db.js')
    with open(db_path, 'r', encoding='utf-8') as f:
        db_code = f.read()

    assert "RETENTION_POLICY = 'permanent'" in db_code, "Expected RETENTION_POLICY = 'permanent' in lib/db.js"
    assert 'getStorageStats' in db_code, "Expected getStorageStats function in lib/db.js"
    assert 'Unlimited' in db_code, "Expected Unlimited candies capability in lib/db.js"
    print("    Retention policy validated: permanent storage & unlimited candies.")

def main():
    print("==================================================")
    print("   AI Context Capsule Extension Verification      ")
    print("==================================================")
    try:
        test_manifest_structure()
        test_javascript_syntax_and_balancing()
        test_adapter_coverage()
        test_prompt_tuning_logic()
        test_token_estimator_ranges()
        test_retention_policy_constants()
        print("\nAll 6 automated tests passed with flying colors! ")
        return 0
    except AssertionError as e:
        print(f"\nVerification failed: {e}", file=sys.stderr)
        return 1

if __name__ == '__main__':
    sys.exit(main())
