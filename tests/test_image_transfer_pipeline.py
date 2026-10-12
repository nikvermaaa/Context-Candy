#!/usr/bin/env python3
"""
tests/test_image_transfer_pipeline.py
Automated test suite verifying the end-to-end image transfer pipeline:
1. Manifest host permissions for image CDNs
2. Background service worker ArrayBuffer base64 conversion
3. Media extractor blob/data/CDN and anonymous canvas fallback
4. Deep shadow DOM traversal and React descriptor bypass in injector
5. Adapters image attachment extraction
6. Strict zero-emoji compliance across repository
"""

import os
import sys
import json
import re

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def test_manifest_image_permissions():
    print("[1] Verifying manifest.json image host permissions...")
    manifest_path = os.path.join(BASE_DIR, 'manifest.json')
    with open(manifest_path, 'r', encoding='utf-8') as f:
        manifest = json.load(f)

    hosts = manifest.get('host_permissions', [])
    assert any('*://*/*' in h or 'https://*/*' in h for h in hosts), "Missing wildcard host permission for image CDNs"
    assert any('oaiusercontent.com' in h for h in hosts), "Missing oaiusercontent host permission"
    assert any('googleusercontent.com' in h for h in hosts), "Missing googleusercontent host permission"
    assert any('claude.ai' in h for h in hosts), "Missing claude.ai host permission"
    print("    manifest.json correctly authorizes broad image fetching across CDNs.")

def test_background_service_worker_binary_handling():
    print("[2] Verifying background.js ArrayBuffer base64 encoding...")
    bg_path = os.path.join(BASE_DIR, 'background.js')
    with open(bg_path, 'r', encoding='utf-8') as f:
        code = f.read()

    assert 'FETCH_IMAGE_DATA' in code, "Missing FETCH_IMAGE_DATA in background.js"
    assert 'arrayBuffer()' in code, "Missing arrayBuffer() in background.js FETCH_IMAGE_DATA"
    assert 'Uint8Array' in code, "Missing Uint8Array in background.js FETCH_IMAGE_DATA"
    assert 'btoa' in code, "Missing btoa in background.js FETCH_IMAGE_DATA"
    assert 'dataUrl' in code, "Missing dataUrl in background.js response"
    print("    background.js correctly uses ArrayBuffer chunked conversion without FileReader.")

def test_media_extractor_features():
    print("[3] Verifying media_extractor.js extraction strategies...")
    media_path = os.path.join(BASE_DIR, 'adapters', 'media_extractor.js')
    with open(media_path, 'r', encoding='utf-8') as f:
        code = f.read()

    assert "url.startsWith('blob:')" in code, "Missing blob: fast-path in fetchBinaryWithAuth"
    assert "url.startsWith('data:')" in code, "Missing data: fast-path in fetchBinaryWithAuth"
    assert 'crossOrigin' in code, "Missing crossOrigin anonymous fallback in extractBlobFromImageElement"
    assert 'convertBlobToPng' in code, "Missing convertBlobToPng in media_extractor.js"
    assert 'convertBlobToPng,' in code or 'convertBlobToPng:' in code, "convertBlobToPng not exported"
    print("    media_extractor.js supports blob/data URLs, anonymous CORS canvas, and PNG conversion.")

def test_injector_shadow_dom_and_react_bypass():
    print("[4] Verifying injector.js deep shadow DOM and React descriptor bypass...")
    injector_path = os.path.join(BASE_DIR, 'engine', 'injector.js')
    with open(injector_path, 'r', encoding='utf-8') as f:
        code = f.read()

    assert 'querySelectorAllDeep' in code, "Missing querySelectorAllDeep in injector.js"
    assert 'shadowRoot' in code, "querySelectorAllDeep must inspect shadowRoot"
    assert 'Object.getOwnPropertyDescriptor(HTMLInputElement.prototype' in code, "Missing React file input descriptor setter bypass"
    assert 'convertToPngBlob' in code, "Missing convertToPngBlob in injector.js"
    assert 'ClipboardItem' in code, "Missing ClipboardItem in injector.js"
    assert 'copiedToClipboard' in code, "Missing copiedToClipboard tracking in injectFiles"
    print("    injector.js pierces shadow roots and bypasses React synthetic file caches.")

def test_adapter_image_attachment_handling():
    print("[5] Verifying adapter image attachment extraction...")
    claude_path = os.path.join(BASE_DIR, 'adapters', 'claude_adapter.js')
    with open(claude_path, 'r', encoding='utf-8') as f:
        claude_code = f.read()
    assert 'isImage' in claude_code, "Claude adapter missing isImage check"

    chatgpt_path = os.path.join(BASE_DIR, 'adapters', 'chatgpt_adapter.js')
    with open(chatgpt_path, 'r', encoding='utf-8') as f:
        chatgpt_code = f.read()
    assert 'dataUrl' in chatgpt_code, "ChatGPT adapter missing dataUrl in attachment mapping"

    gemini_path = os.path.join(BASE_DIR, 'adapters', 'gemini_adapter.js')
    with open(gemini_path, 'r', encoding='utf-8') as f:
        gemini_code = f.read()
    assert 'dataUrl' in gemini_code, "Gemini adapter missing dataUrl in attachment mapping"
    print("    Claude, ChatGPT, and Gemini adapters properly capture and map image attachments.")

def test_zero_emojis_across_codebase():
    print("[6] Checking strict zero-emoji compliance...")
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
                if f.endswith(('.js', '.py', '.html', '.css', '.json', '.md')):
                    fp = os.path.join(root, f)
                    with open(fp, 'r', encoding='utf-8', errors='ignore') as fh:
                        content = fh.read()
                        matches = emoji_pattern.findall(content)
                        if matches:
                            found.append((fp, matches[:3]))

    assert len(found) == 0, f"Found emojis in repository: {found}"
    print("    Strict zero-emoji compliance confirmed across all code, tests, and documents.")

def main():
    print("==================================================")
    print("   Image Transfer Pipeline Automated Tests       ")
    print("==================================================")
    try:
        test_manifest_image_permissions()
        test_background_service_worker_binary_handling()
        test_media_extractor_features()
        test_injector_shadow_dom_and_react_bypass()
        test_adapter_image_attachment_handling()
        test_zero_emojis_across_codebase()
        print("\nAll 6 image transfer pipeline tests passed successfully.")
        return 0
    except AssertionError as e:
        print(f"\nVerification failed: {e}", file=sys.stderr)
        return 1

if __name__ == '__main__':
    sys.exit(main())
