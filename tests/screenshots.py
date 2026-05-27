#!/usr/bin/env python3
"""
Generate paper figures by automating ExpVis in a headless browser.
Requires: pip3 install playwright && python3 -m playwright install chromium
"""
import os, sys, time
from playwright.sync_api import sync_playwright

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docs', 'figures')
os.makedirs(OUT, exist_ok=True)
URL = 'file://' + os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'index.html')

def screenshot(page, name, full_page=False, delay=0.8):
    """Take a screenshot and save it."""
    path = os.path.join(OUT, name)
    time.sleep(delay)
    page.screenshot(path=path, full_page=full_page)
    print(f'  ✓ {name}')
    return path

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={'width': 1440, 'height': 900})
    page = ctx.new_page()
    page.goto(URL, wait_until='networkidle')
    time.sleep(1)

    # Close splash if present
    try:
        page.evaluate('document.getElementById("splash").style.display="none"')
        time.sleep(0.3)
    except: pass

    # ========== Fig 1: Full Editor Interface ==========
    # Load Stroop template to show a populated canvas
    page.evaluate('loadTemplate("stroop")')
    time.sleep(1)
    # Click on the first trial to show something in the inspector
    page.evaluate("""
        if (editor.phases.length > 1 && editor.phases[1].trials.length > 0) {
            editor.selectedTrial = editor.phases[1].trials[0].id;
            if (editor.phases[1].trials[0].components.length > 0) {
                editor.selComp = editor.phases[1].trials[0].components[0].id;
            }
            renderAll();
        }
    """)
    time.sleep(0.5)
    screenshot(page, 'fig1_editor_overview.png')
    print('Fig 1: Full editor with Stroop template loaded')

    # ========== Fig 2: Three-Tier Preview Pipeline ==========
    # Part 1: Inline preview (already showing in right panel)
    screenshot(page, 'fig2a_inline_preview.png')

    # Part 2: Visual position editor - click expand
    page.evaluate('expandPreview()')
    time.sleep(0.8)
    screenshot(page, 'fig2b_visual_editor.png')

    # Close visual editor
    page.evaluate("""
        var ov = document.querySelector('[style*=fixed][style*=rgba]');
        if(ov) ov.remove();
    """)
    time.sleep(0.3)

    # Part 3: Fullscreen preview
    page.evaluate('previewExperiment()')
    time.sleep(1.2)
    screenshot(page, 'fig2c_fullscreen_preview.png')

    # Close fullscreen preview
    page.evaluate("""
        var pv = document.getElementById('exp-preview');
        if(pv) pv.remove();
    """)
    time.sleep(0.3)
    print('Fig 2: Three-tier preview pipeline captured')

    # ========== Fig 3: AI Generation Workflow ==========
    # Open AI dialog
    page.evaluate('showAIGenerate()')
    time.sleep(0.5)
    # Select OpenAI provider
    try:
        page.select_option('#ai-provider', 'openai')
        time.sleep(0.2)
    except: pass
    # Fill in an example prompt
    page.evaluate("""
        var ta = document.getElementById('ai-prompt');
        if(ta) ta.value = 'Design a Flanker arrow task with 5 arrow variants. Left middle arrow → press F, right middle arrow → press J. 80 trials with fixation, error feedback, and a thank-you phase.';
    """)
    time.sleep(0.3)
    screenshot(page, 'fig3_ai_dialog.png')

    # Close AI dialog
    page.evaluate("""
        var ov = document.querySelector('[style*=fixed][style*=rgba]');
        if(ov) ov.remove();
    """)
    time.sleep(0.2)
    print('Fig 3: AI generation workflow captured')

    # ========== Fig 4: Tutorial Stroop Canvas ==========
    # Already loaded Stroop from Fig 1. Make sure we show the flow canvas clearly.
    page.evaluate('resetEditor()')
    time.sleep(0.3)
    page.evaluate('loadTemplate("stroop")')
    time.sleep(0.8)
    # Select the trials phase trial
    page.evaluate("""
        if (editor.phases.length > 1 && editor.phases[1].trials.length > 0) {
            editor.selectedTrial = editor.phases[1].trials[0].id;
            if (editor.phases[1].trials[0].components.length > 0) {
                editor.selComp = editor.phases[1].trials[0].components[3].id; // the keyboard component
            }
            renderAll();
        }
    """)
    time.sleep(0.3)
    # Scroll the canvas into view
    page.evaluate('document.getElementById("canvas-scroll").scrollTop = 0')
    time.sleep(0.2)
    screenshot(page, 'fig4_tutorial_stroop.png')
    print('Fig 4: Tutorial Stroop flow canvas captured')

    browser.close()
    print(f'\n✅ All figures saved to: {OUT}/')
    for f in sorted(os.listdir(OUT)):
        size = os.path.getsize(os.path.join(OUT, f))
        print(f'  {f} ({size//1024} KB)')
