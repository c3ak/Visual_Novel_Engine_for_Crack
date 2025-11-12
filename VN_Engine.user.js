// ==UserScript==
// @name         Visual Novel Engine V1 Beta
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  v5.1 기반으로 내부 이미지 모드와 사용자 지정 배경 기능을 추가했습니다.
// @author       You & AI Assistant
// @match        *://crack.wrtn.ai/*
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const DOM_IDS = {
        CONTAINER: 'vn-engine-container',
        BACKGROUND: 'vn-background-overlay',
        EVENT_CG: 'vn-event-cg-overlay',
        CHAR_CONTAINER: 'vn-character-container',
        STATUS_WINDOW: 'vn-status-window',
        DIALOGUE_BOX: 'vn-dialogue-box',
        CHAR_NAME: 'vn-character-name',
        DIALOGUE_TEXT: 'vn-dialogue-text',
        BACK_BUTTON: 'vn-back-button',
        SETTINGS_MODAL: 'vn-settings-modal',
        START_BUTTON: 'vn-start-button',
        SETTINGS_BUTTON: 'vn-settings-button',
        CLIP_EDIT_HANDLE: 'vn-clip-edit-handle'
    };

    const SettingsManager = {
        defaults: {
            characterMode: 'multi',
            dialogueBoxPos: { bottom: '40px', left: '50%', transform: 'translateX(-50%)' },
            statusWindowPos: { top: '20px', right: '20px' },
            characterContainerPos: { bottom: '0px', left: '0px' },
            backgroundPattern: '/g/',
            characterPattern: '/c/',
            clipRect: null,
            customBackgroundUrl: '' // [V1 Beta 추가] 사용자 지정 배경 URL
        },
        settings: {},
        load() {
            const savedSettings = localStorage.getItem('vnEngineSettings');
            this.settings = savedSettings ? JSON.parse(savedSettings) : { ...this.defaults };
            for (const key in this.defaults) { if (!this.settings.hasOwnProperty(key)) { this.settings[key] = this.defaults[key]; } }
        },
        save() { localStorage.setItem('vnEngineSettings', JSON.stringify(this.settings)); },
        createModal() {
            const modalHTML = `
                <div id="${DOM_IDS.SETTINGS_MODAL}" style="display: none; position: fixed; z-index: 100000; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.6);">
                    <div class="vn-modal-content" style="background-color: #2c2c2c; margin: 10% auto; padding: 25px; border: 1px solid #888; width: 80%; max-width: 550px; border-radius: 10px; color: white; font-family: 'Pretendard', sans-serif;">
                        <span id="vn-modal-close" style="color: #aaa; float: right; font-size: 28px; font-weight: bold; cursor: pointer;">&times;</span>
                        <h2 style="margin-top: 0; border-bottom: 1px solid #555; padding-bottom: 10px;">VN 엔진 설정</h2>
                        <div class="vn-setting-option" style="margin-bottom: 20px;">
                            <label style="display: block; margin-bottom: 10px; font-weight: bold;">캐릭터 표시 방식</label>
                            <input type="radio" id="vn-char-mode-single" name="characterMode" value="single"> <label for="vn-char-mode-single">단일 캐릭터</label><br>
                            <input type="radio" id="vn-char-mode-multi" name="characterMode" value="multi"> <label for="vn-char-mode-multi">다중 캐릭터 (자동 배치)</label><br>
                            <input type="radio" id="vn-char-mode-internal" name="characterMode" value="internalImage"> <label for="vn-char-mode-internal">내부 이미지 (단일)</label>
                        </div>
                        <div id="vn-custom-bg-section" class="vn-setting-option" style="margin-bottom: 20px; display: none;">
                            <label style="display: block; margin-bottom: 10px; font-weight: bold;">사용자 지정 배경 (단일/내부 모드용)</label>
                            <div style="display: flex; gap: 10px; align-items: center;">
                                <label for="vn-custom-bg-url-input" style="flex-basis: 120px; text-align: right; padding-right: 10px;">배경 이미지 URL</label>
                                <input type="text" id="vn-custom-bg-url-input" class="vn-pattern-input" placeholder="https://...">
                            </div>
                        </div>
                        <div class="vn-setting-option" style="margin-bottom: 20px;">
                            <label style="display: block; margin-bottom: 10px; font-weight: bold;">UI & 클리핑 영역 편집</label>
                            <button id="vn-edit-ui-button" class="vn-modal-button">편집 시작</button>
                        </div>
                        <div id="vn-multi-mode-section" class="vn-setting-option" style="display: none;">
                            <label style="display: block; margin-bottom: 10px; font-weight: bold;">URL 패턴 설정 (다중 모드 전용)</label>
                            <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 8px;">
                                <label for="vn-bg-pattern-input" style="flex-basis: 120px; text-align: right; padding-right: 10px;">배경 키워드</label>
                                <input type="text" id="vn-bg-pattern-input" class="vn-pattern-input">
                            </div>
                            <div style="display: flex; gap: 10px; align-items: center;">
                                <label for="vn-char-pattern-input" style="flex-basis: 120px; text-align: right; padding-right: 10px;">캐릭터 키워드</label>
                                <input type="text" id="vn-char-pattern-input" class="vn-pattern-input">
                            </div>
                            <p style="font-size:0.8em; color:#999; margin-top:8px; padding-left: 130px;">* URL에 포함된 고유 텍스트로 이미지를 구분합니다.<br>(예: /backgrounds/, /character/ 등)</p>
                        </div>
                        <p style="font-size: 0.9em; color: #ccc; margin-top: 20px;">* 변경 후에는 VN 엔진을 재시작해야 적용됩니다.</p>
                    </div>
                </div>
                <style>
                    .vn-modal-button { background-color: #555; color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer; }
                    .vn-modal-button:hover { background-color: #666; }
                    .vn-pattern-input { flex-grow: 1; padding: 6px; background-color: #444; color: white; border: 1px solid #666; border-radius: 4px; }
                </style>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);

            const bgPatternInput = document.getElementById('vn-bg-pattern-input');
            const charPatternInput = document.getElementById('vn-char-pattern-input');
            const customBgUrlInput = document.getElementById('vn-custom-bg-url-input'); // [V1 Beta 추가]

            // [V1 Beta 수정] 모드에 따라 설정 UI 동적 변경
            const customBgSection = document.getElementById('vn-custom-bg-section');
            const multiModeSection = document.getElementById('vn-multi-mode-section');
            const characterModeRadios = document.querySelectorAll('input[name="characterMode"]');

            const toggleSections = () => {
                const selectedMode = document.querySelector('input[name="characterMode"]:checked').value;
                if (selectedMode === 'single' || selectedMode === 'internalImage') {
                    customBgSection.style.display = 'block';
                    multiModeSection.style.display = 'none';
                } else if (selectedMode === 'multi') {
                    customBgSection.style.display = 'none';
                    multiModeSection.style.display = 'block';
                }
            };

            document.getElementById('vn-modal-close').onclick = () => this.close();
            characterModeRadios.forEach(radio => {
                radio.onchange = (e) => {
                    this.settings.characterMode = e.target.value;
                    this.save();
                    toggleSections();
                };
            });
            document.getElementById('vn-edit-ui-button').onclick = () => { this.close(); UIManager.toggleUiEditMode(true); };
            bgPatternInput.oninput = (e) => { this.settings.backgroundPattern = e.target.value; this.save(); };
            charPatternInput.oninput = (e) => { this.settings.characterPattern = e.target.value; this.save(); };
            customBgUrlInput.oninput = (e) => { this.settings.customBackgroundUrl = e.target.value; this.save(); }; // [V1 Beta 추가]
        },
        open() {
            document.querySelector(`input[name="characterMode"][value="${this.settings.characterMode}"]`).checked = true;
            document.getElementById('vn-bg-pattern-input').value = this.settings.backgroundPattern;
            document.getElementById('vn-char-pattern-input').value = this.settings.characterPattern;
            document.getElementById('vn-custom-bg-url-input').value = this.settings.customBackgroundUrl; // [V1 Beta 추가]

            // [V1 Beta 추가] 모달 열 때 UI 상태 업데이트
            const selectedMode = this.settings.characterMode;
            document.getElementById('vn-custom-bg-section').style.display = (selectedMode === 'single' || selectedMode === 'internalImage') ? 'block' : 'none';
            document.getElementById('vn-multi-mode-section').style.display = (selectedMode === 'multi') ? 'block' : 'none';

            document.getElementById(DOM_IDS.SETTINGS_MODAL).style.display = 'block';
        },
        close() { document.getElementById(DOM_IDS.SETTINGS_MODAL).style.display = 'none'; }
    };

    function generateStyles(settings) {
        const posToCss = (posObj) => Object.entries(posObj).map(([key, value]) => `${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}: ${value};`).join(' ');
        let characterStyles = '';
        if (settings.characterMode === 'multi') {
             characterStyles = `#${DOM_IDS.CHAR_CONTAINER} { ${posToCss(settings.characterContainerPos)} position: absolute; width: 100%; height: 95vh; display: flex; justify-content: space-around; align-items: flex-end; padding: 0 2%; pointer-events: none; z-index: 2; } .vn-character-slot { flex: 1 1 33%; height: 100%; display: flex; justify-content: center; align-items: flex-end; } .vn-character-cg { max-width: 95%; max-height: 100%; object-fit: contain; transition: opacity 0.4s ease-in-out, transform 0.4s ease-in-out; opacity: 0; transform: translateY(20px); } #vn-cg-3 { transform: translateY(20px) scaleX(-1); } #vn-cg-3.visible { transform: translateY(0) scaleX(-1); } `;
        } else { // [V1 Beta 수정] 단일, 내부 이미지 모드 공통 스타일
             characterStyles = `#${DOM_IDS.CHAR_CONTAINER} { ${posToCss(settings.characterContainerPos)} position: absolute; width: 100%; height: 100%; display: flex; justify-content: center; align-items: flex-end; pointer-events: none; z-index: 2; } .vn-character-cg { max-width: 40%; max-height: 95%; object-fit: contain; transition: opacity 0.3s ease-in-out, transform 0.3s ease-in-out; opacity: 0; transform: translateY(20px); } `;
        }
        return `
            /* ... (기존 스타일 대부분 동일, 생략) ... */
            #${DOM_IDS.CONTAINER} { position: fixed !important; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 99990; pointer-events: none; display: none; }
            #${DOM_IDS.CONTAINER}.visible { display: block !important; }
            #${DOM_IDS.BACKGROUND} { width: 100%; height: 100%; background-size: cover; background-position: center; transition: background-image 0.5s ease-in-out; z-index: 0; }
            #${DOM_IDS.EVENT_CG} { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; background-color: #000; z-index: 1; opacity: 0; transition: opacity 0.5s ease-in-out; pointer-events: none; }
            #${DOM_IDS.EVENT_CG}.visible { opacity: 1; }
            ${characterStyles}
            .vn-character-cg.visible { opacity: 1; transform: translateY(0); }
            #${DOM_IDS.DIALOGUE_BOX} { z-index: 3; position: absolute; ${posToCss(settings.dialogueBoxPos)} width: 90%; max-width: 1200px; background-color: rgba(0, 0, 0, 0.8); border: 1px solid #555; border-radius: 10px; padding: 25px 30px; color: white; font-family: 'Pretendard', sans-serif; pointer-events: auto; box-sizing: border-box; cursor: pointer; }
            #${DOM_IDS.CHAR_NAME} { position: absolute; top: 0; left: 40px; transform: translateY(-50%); background-color: rgba(40, 40, 40, 0.9); color: white; font-weight: bold; font-size: 1.2em; padding: 5px 15px; border-radius: 6px; border: 1px solid #777; z-index: 1; }
            #${DOM_IDS.DIALOGUE_TEXT} { flex-grow: 1; font-size: 1.5em; line-height: 1.6; min-height: 80px; } /* [추가] 타이핑 중 텍스트 선택 방지 스타일 */
            #${DOM_IDS.DIALOGUE_TEXT}.typing-effect {
            user-select: none; /* 표준 속성 */
            -webkit-user-select: none; /* Safari/Chrome */
            -moz-user-select: none; /* Firefox */
            -ms-user-select: none; /* IE/Edge */
        }
        .action-text { font-style: italic; color: #ccc; }
            #${DOM_IDS.STATUS_WINDOW} { z-index: 3; position: absolute; ${posToCss(settings.statusWindowPos)} width: 300px; max-height: 80vh; background-color: rgba(0, 0, 0, 0.7); border: 1px solid #555; border-radius: 8px; padding: 15px; color: #eee; font-size: 14px; white-space: pre-wrap; overflow-y: auto; pointer-events: auto; }
            .vn-control-panel { position: fixed; left: 20px; bottom: 20px; z-index: 99999; display: flex; gap: 10px; }
            .vn-control-button { background-color: #444; color: white; border: none; border-radius: 8px; padding: 10px 15px; font-size: 14px; font-weight: bold; cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.2); transition: background-color 0.2s; }
            #${DOM_IDS.START_BUTTON} { background-color: #1a73e8; } #${DOM_IDS.START_BUTTON}:hover { background-color: #1765c7; }
            #${DOM_IDS.START_BUTTON}.active { background-color: #c70000; } #${DOM_IDS.START_BUTTON}.active:hover { background-color: #a00000; }
            #${DOM_IDS.SETTINGS_BUTTON}:hover { background-color: #555; }
            #${DOM_IDS.BACK_BUTTON} { position: absolute; bottom: 15px; right: 20px; font-size: 2em; color: #888; cursor: pointer; transition: color 0.2s; display: none; }
            #${DOM_IDS.BACK_BUTTON}:hover { color: #ccc; }
            .vn-ui-draggable { border: 2px dashed #00aaff !important; cursor: move !important; user-select: none; pointer-events: auto !important; }
            #${DOM_IDS.CLIP_EDIT_HANDLE} { position: fixed; border: 2px dashed #ff4757; background-color: rgba(255, 71, 87, 0.2); cursor: move; z-index: 99998; user-select: none; }
            .vn-resize-handle { position: absolute; width: 10px; height: 10px; background-color: white; border: 1px solid #333; z-index: 99999; }
            .vn-resize-handle.top-left { top: -6px; left: -6px; cursor: nwse-resize; } .vn-resize-handle.top { top: -6px; left: 50%; transform: translateX(-50%); cursor: ns-resize; } .vn-resize-handle.top-right { top: -6px; right: -6px; cursor: nesw-resize; } .vn-resize-handle.left { top: 50%; left: -6px; transform: translateY(-50%); cursor: ew-resize; } .vn-resize-handle.right { top: 50%; right: -6px; transform: translateY(-50%); cursor: ew-resize; } .vn-resize-handle.bottom-left { bottom: -6px; left: -6px; cursor: nesw-resize; } .vn-resize-handle.bottom { bottom: -6px; left: 50%; transform: translateX(-50%); cursor: ns-resize; } .vn-resize-handle.bottom-right { bottom: -6px; right: -6px; cursor: nwse-resize; }
        `;
    }


    const StageManager = {
        cueSheet: [], currentIndex: -1, firstTextCueIndex: -1, isTyping: false, typingTimer: null, isVisible: false, isFinished: true,
        start(rawText) {
            console.log("VN Engine: 새로운 시나리오 수신, 연출을 시작합니다.");
            UIManager.hideBackButton();
            this.cueSheet = this.parseCueSheet(rawText);
            this.firstTextCueIndex = this.cueSheet.findIndex(c => c.type === 'dialogue' || c.type === 'action');
            if (this.cueSheet.length === 0) { console.log("VN Engine: 큐시트가 비어있어 연출을 종료합니다."); this.isFinished = true; return; }

            UIManager.showAll();
            UIManager.applyCustomBackground();

            const bgCue = this.cueSheet.find(c => c.type === 'background_image');
            if (bgCue) UIManager.updateBackgroundImage(bgCue.url);

            const statusCue = this.cueSheet.find(c => c.type === 'status_window');
            if(statusCue) UIManager.updateStatusWindow(statusCue.content);
            this.currentIndex = -1;
            this.isVisible = true;
            this.isFinished = false;
            this.next();
        },
        next() { if (this.isTyping) { this.skipTyping(); return; } this.currentIndex++; if (this.currentIndex >= this.cueSheet.length) { console.log("VN Engine: 시나리오의 마지막입니다. UI를 유지합니다."); this.isFinished = true; return; } this.processCue(this.cueSheet[this.currentIndex]); if (this.firstTextCueIndex !== -1 && this.currentIndex > this.firstTextCueIndex) { UIManager.showBackButton(); } },
        previous() { if (this.isTyping) this.skipTyping(); if (this.currentIndex <= this.firstTextCueIndex) return; for (let i = this.currentIndex - 1; i >= 0; i--) { const cue = this.cueSheet[i]; if (cue.type === 'dialogue' || cue.type === 'action') { this.currentIndex = i; this.processCue(cue); if (this.currentIndex <= this.firstTextCueIndex) { UIManager.hideBackButton(); } return; } } },
        hide() { if (!this.isVisible) return; console.log("VN Engine: 시나리오 종료, 모든 UI를 숨깁니다."); UIManager.hideAll(); this.isVisible = false; this.isFinished = true; },
        formatText(text) { return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'); },
        type(element, text) { element.classList.add('typing-effect'); this.isTyping = true; let i = 0; element.innerHTML = ''; this.typingTimer = setInterval(() => { if (i < text.length) { element.innerHTML += text.charAt(i); i++; } else { this.skipTyping(); } }, 40); },
        skipTyping() { const dialogueElement = UIManager.getDialogueTextElement();
    if (dialogueElement) {
        dialogueElement.classList.remove('typing-effect'); // [추가]
    } clearInterval(this.typingTimer); this.isTyping = false; const cue = this.cueSheet[this.currentIndex]; if (cue && (cue.type === 'action' || cue.type === 'dialogue')) { UIManager.getDialogueTextElement().innerHTML = this.formatText(cue.content).replace(/\n/g, '<br>'); } },
        async processCue(cue) {
            console.log("VN Engine: 다음 큐 실행 ->", cue);
            switch (cue.type) {
                case 'character_update':
                    if (SettingsManager.settings.characterMode === 'multi') {
                        await UIManager.updateMultiCharacter(cue.url, cue.characterId);
                    } else {
                        UIManager.updateSingleCharacter(cue.url);
                    }
                    this.next();
                    break;
                case 'background_image': UIManager.updateBackgroundImage(cue.url); this.next(); break;
                case 'action': UIManager.updateDialogueBox(null, cue.content, true, (el, text) => this.type(el, text)); break;
                case 'dialogue': UIManager.updateDialogueBox(cue.character, cue.content, false, (el, text) => this.type(el, text)); break;
                case 'status_window': this.next(); break;
            }
        },
        parsers: [
            // 다중 모드 파서
            { condition: () => SettingsManager.settings.characterMode === 'multi', regex: /^!\[([a-zA-Z0-9_]+)\]\((off)\)$/, handler: match => ({ type: 'character_update', url: 'off', characterId: match[1] }) },
            { condition: () => SettingsManager.settings.characterMode === 'multi', regex: /^!\[\]\((.*?)\)$/, handler: match => { const url = match[1].trim(); const bgPattern = SettingsManager.settings.backgroundPattern; const charPattern = SettingsManager.settings.characterPattern; if (bgPattern && url.includes(bgPattern)) { return { type: 'background_image', url }; } if (charPattern && url.includes(charPattern)) { return { type: 'character_update', url }; } return { type: 'character_update', url }; } },
            // 단일 모드 파서
            { condition: () => SettingsManager.settings.characterMode === 'single', regex: /^!\[bg\]\((.*?)\)$/, handler: match => ({ type: 'background_image', url: match[1].trim() }) },
            { condition: () => SettingsManager.settings.characterMode === 'single', regex: /^!\[\]\((?!.*\b!\[bg\]\b)(.*?)\)$/, handler: match => ({ type: 'character_update', url: match[1].trim() }) },
            // 내부 이미지 모드 파서
            { condition: () => SettingsManager.settings.characterMode === 'internalImage', regex: /^!\[(.+?)\]\((.*?)\)$/, handler: match => ({ type: 'character_update', url: match[2].trim() }) },

            // ==========================[ 문제 해결된 공통 파서 ]==========================
            { regex: /^"?\*\*(.*?)\*\*\s*[|｜]\s*(.*?)"?$/, handler: match => ({ type: 'dialogue', character: match[1].trim(), content: match[2].trim() }) },
            // =========================================================================

            { regex: /^\*(.*)\*$/, handler: match => ({ type: 'action', content: match[1].trim() }) }
        ],
        parseCueSheet(rawText) { const lines = rawText.split('\n'); const cueSheet = []; let inCodeBlock = false; let codeBlockContent = ''; for (const line of lines) { const trimmedLine = line.trim(); if (trimmedLine.startsWith('```')) { inCodeBlock = !inCodeBlock; if (!inCodeBlock && codeBlockContent) { cueSheet.push({ type: 'status_window', content: codeBlockContent.trim() }); codeBlockContent = ''; } continue; } if (inCodeBlock) { codeBlockContent += line + '\n'; continue; } if (trimmedLine === '' || trimmedLine.startsWith('[//]: #')) continue; let matched = false; for (const parser of this.parsers) { if (parser.condition && !parser.condition()) continue; if (SettingsManager.settings.characterMode === 'single' && trimmedLine.includes('![bg]')) { if (parser.regex.source.includes('^!\\[\\]')) continue; } const match = trimmedLine.match(parser.regex); if (match) { cueSheet.push(parser.handler(match)); matched = true; break; } } if (!matched) { cueSheet.push({ type: 'action', content: trimmedLine }); } } if (codeBlockContent) { cueSheet.push({ type: 'status_window', content: codeBlockContent.trim() }); } return cueSheet; }
    };


    const UIManager = {
        elements: {}, activeCharacters: [], dragInfo: { element: null, offsetX: 0, offsetY: 0 }, resizeInfo: { element: null, handleType: null, initialRect: null, initialMouse: null },
        setup() {
            GM_addStyle(generateStyles(SettingsManager.settings));
            const container = document.createElement('div');
            container.id = DOM_IDS.CONTAINER;
            let characterContainerHTML = '';
            // [V1 Beta 수정] 다중 모드가 아닐 경우, 모두 단일 캐릭터 HTML 사용
            if (SettingsManager.settings.characterMode === 'multi') {
                characterContainerHTML = `<div id="${DOM_IDS.CHAR_CONTAINER}"><div class="vn-character-slot"><img class="vn-character-cg" id="vn-cg-1"></div><div class="vn-character-slot"><img class="vn-character-cg" id="vn-cg-2"></div><div class="vn-character-slot"><img class="vn-character-cg" id="vn-cg-3"></div></div>`;
            } else {
                characterContainerHTML = `<div id="${DOM_IDS.CHAR_CONTAINER}"><img class="vn-character-cg" id="vn-cg-main"></div>`;
            }
            container.innerHTML = `
                <div id="${DOM_IDS.BACKGROUND}"></div>
                <img id="${DOM_IDS.EVENT_CG}" />
                ${characterContainerHTML}
                <div id="${DOM_IDS.STATUS_WINDOW}"></div>
                <div id="${DOM_IDS.DIALOGUE_BOX}"><div id="${DOM_IDS.CHAR_NAME}"></div><p id="${DOM_IDS.DIALOGUE_TEXT}"></p><div id="${DOM_IDS.BACK_BUTTON}">‹</div></div>`;
            document.body.appendChild(container);
            this.elements = {
                container: document.getElementById(DOM_IDS.CONTAINER),
                background: document.getElementById(DOM_IDS.BACKGROUND),
                eventCG: document.getElementById(DOM_IDS.EVENT_CG),
                charContainer: document.getElementById(DOM_IDS.CHAR_CONTAINER),
                statusWindow: document.getElementById(DOM_IDS.STATUS_WINDOW),
                dialogueBox: document.getElementById(DOM_IDS.DIALOGUE_BOX),
                charName: document.getElementById(DOM_IDS.CHAR_NAME),
                dialogueText: document.getElementById(DOM_IDS.DIALOGUE_TEXT),
                backButton: document.getElementById(DOM_IDS.BACK_BUTTON),
                // [V1 Beta 수정] cgSingle을 모드에 따라 유연하게 할당
                cgSingle: (SettingsManager.settings.characterMode !== 'multi') ? document.getElementById('vn-cg-main') : null,
                cgMulti: (SettingsManager.settings.characterMode === 'multi') ? [document.getElementById('vn-cg-1'), document.getElementById('vn-cg-2'), document.getElementById('vn-cg-3')] : [],
            };
            this.elements.dialogueBox?.addEventListener('click', (e) => { if (e.target.id !== DOM_IDS.BACK_BUTTON && !e.target.closest(`#${DOM_IDS.BACK_BUTTON}`)) StageManager.next(); });
            this.elements.backButton?.addEventListener('click', (e) => { e.stopPropagation(); StageManager.previous(); });
            const controlPanel = document.createElement('div');
            controlPanel.className = 'vn-control-panel';
            controlPanel.innerHTML = `<button id="${DOM_IDS.START_BUTTON}" class="vn-control-button">VN 시작</button><button id="${DOM_IDS.SETTINGS_BUTTON}" class="vn-control-button">설정</button>`;
            document.body.appendChild(controlPanel);
            document.getElementById(DOM_IDS.START_BUTTON)?.addEventListener('click', toggleVNEngine);
            document.getElementById(DOM_IDS.SETTINGS_BUTTON)?.addEventListener('click', () => SettingsManager.open());
            SettingsManager.createModal();
            console.log("VN Engine: 비주얼 노벨 UI 및 제어판이 준비되었습니다.");
        },

        // [V1 Beta 추가] 사용자 지정 배경 적용 함수
        applyCustomBackground() {
            const mode = SettingsManager.settings.characterMode;
            const customBgUrl = SettingsManager.settings.customBackgroundUrl;
            if ((mode === 'single' || mode === 'internalImage') && customBgUrl) {
                this.updateBackgroundImage(customBgUrl);
                console.log("VN Engine: 사용자 지정 배경을 적용했습니다.", customBgUrl);
            }
        },

        /* ... (getImageAspectRatio, updateMultiCharacter, _rearrangeCharacters, showEventCG, hideEventCG, clearAllMultiCharacters 등 다중 모드 관련 함수는 변경 없음) ... */
        getImageAspectRatio(url) { return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img.width / img.height); img.onerror = reject; img.src = url; }); },
        async updateMultiCharacter(url, characterIdForOff = null) { if (url === 'off') { const charId = characterIdForOff; if (!charId) return; const indexToRemove = this.activeCharacters.findIndex(char => char.id === charId); if (indexToRemove > -1) { if (this.elements.eventCG.dataset.ownerId === charId) { this.hideEventCG(charId); } this.activeCharacters.splice(indexToRemove, 1); console.log(`캐릭터 '${charId}'를 목록에서 제거합니다.`); this._rearrangeCharacters(); } return; } const charInfo = this.parseCharacterInfoFromUrl(url); if (!charInfo) return; try { const aspectRatio = await this.getImageAspectRatio(url); const newMode = aspectRatio > 1 ? 'event' : 'standing'; const existingCharIndex = this.activeCharacters.findIndex(char => char.id === charInfo.id); if (existingCharIndex > -1) { const existingChar = this.activeCharacters[existingCharIndex]; const oldMode = existingChar.mode; existingChar.url = url; existingChar.mode = newMode; console.log(`캐릭터 '${charInfo.id}' 업데이트: ${oldMode} -> ${newMode}`); if (oldMode === 'standing' && newMode === 'event') { this.showEventCG(url, charInfo.id); this._rearrangeCharacters(); } else if (oldMode === 'event' && newMode === 'standing') { this.hideEventCG(charInfo.id); this._rearrangeCharacters(); } else if (oldMode === 'event' && newMode === 'event') { this.showEventCG(url, charInfo.id); } else { this._rearrangeCharacters(); } } else { console.log(`신규 캐릭터 '${charInfo.id}' 추가: 모드 '${newMode}'`); if (this.activeCharacters.length >= 3) { console.error("캐릭터 슬롯이 가득 찼습니다."); return; } this.activeCharacters.push({ id: charInfo.id, url: url, mode: newMode }); if (newMode === 'event') { this.showEventCG(url, charInfo.id); } this._rearrangeCharacters(true); } } catch (error) { console.error("VN Engine: 이미지 처리 중 오류:", error); } },
        _rearrangeCharacters(isNewCharacterAdded = false) { const slots = this.elements.cgMulti; const standingCharacters = this.activeCharacters.filter(char => char.mode === 'standing'); slots.forEach(img => img.classList.remove('visible')); const placement = {}; switch (standingCharacters.length) { case 1: placement[1] = standingCharacters[0]; break; case 2: placement[0] = standingCharacters[0]; placement[2] = standingCharacters[1]; break; case 3: placement[0] = standingCharacters[0]; placement[1] = standingCharacters[1]; placement[2] = standingCharacters[2]; break; } for (let i = 0; i < 3; i++) { if (!placement[i]) { slots[i].src = ''; } } for (const slotIndex in placement) { const char = placement[slotIndex]; const img = slots[slotIndex]; const newSrc = char.url; const applyAnimation = isNewCharacterAdded && char === standingCharacters[standingCharacters.length - 1]; if (applyAnimation) { img.src = newSrc; setTimeout(() => img.classList.add('visible'), 50); } else { img.classList.remove('visible'); img.src = newSrc; img.classList.add('visible'); } } },
        showEventCG(url, ownerId) { if (this.elements.eventCG) { if (this.elements.eventCG.classList.contains('visible') && this.elements.eventCG.dataset.ownerId !== ownerId) { this.elements.eventCG.classList.remove('visible'); } this.elements.eventCG.dataset.ownerId = ownerId; this.elements.eventCG.src = url; setTimeout(() => this.elements.eventCG.classList.add('visible'), 50); } },
        hideEventCG(ownerId) { if (this.elements.eventCG && this.elements.eventCG.dataset.ownerId === ownerId) { this.elements.eventCG.classList.remove('visible'); this.elements.eventCG.dataset.ownerId = ''; setTimeout(() => { if (!this.elements.eventCG.classList.contains('visible')) { this.elements.eventCG.src = ''; } }, 500); } },
        clearAllMultiCharacters() { if (this.elements.eventCG.classList.contains('visible')) { this.hideEventCG(this.elements.eventCG.dataset.ownerId); } this.activeCharacters = []; this._rearrangeCharacters(); },

        /* ... (toggleUiEditMode 이하 UI 편집 관련 함수는 변경 없음) ... */
        toggleUiEditMode(enable) { const targets = [this.elements.dialogueBox, this.elements.statusWindow, this.elements.charContainer]; const editButton = document.getElementById('vn-edit-ui-button'); if (!editButton) return; if (enable) { this.showAll(); editButton.textContent = '편집 완료'; editButton.onclick = () => this.toggleUiEditMode(false); targets.forEach(el => { if(el) { el.classList.add('vn-ui-draggable'); el.onmousedown = (e) => this.onDragStart(e, el); } }); this.createClipEditHandle(); } else { editButton.textContent = '편집 시작'; editButton.onclick = () => { SettingsManager.close(); this.toggleUiEditMode(true); }; targets.forEach(el => { if(el) { el.classList.remove('vn-ui-draggable'); el.onmousedown = null; } }); this.removeClipEditHandle(); if (!isEngineActive) { this.hideAll(); } } },
        createClipEditHandle() { if (document.getElementById(DOM_IDS.CLIP_EDIT_HANDLE)) return; const handle = document.createElement('div'); handle.id = DOM_IDS.CLIP_EDIT_HANDLE; document.body.appendChild(handle); let rect = SettingsManager.settings.clipRect; if (!rect) { const defaultWidth = 600, defaultHeight = 120; rect = { top: window.innerHeight - defaultHeight - 50, left: (window.innerWidth - defaultWidth) / 2, width: defaultWidth, height: defaultHeight }; } handle.style.top = `${rect.top}px`; handle.style.left = `${rect.left}px`; handle.style.width = `${rect.width}px`; handle.style.height = `${rect.height}px`; handle.onmousedown = (e) => this.onDragStart(e, handle, true); const handleTypes = ['top-left', 'top', 'top-right', 'left', 'right', 'bottom-left', 'bottom', 'bottom-right']; handleTypes.forEach(type => { const resizeHandle = document.createElement('div'); resizeHandle.className = `vn-resize-handle ${type}`; handle.appendChild(resizeHandle); resizeHandle.onmousedown = (e) => { e.stopPropagation(); this.onResizeStart(e, type); }; }); },
        removeClipEditHandle() { const handle = document.getElementById(DOM_IDS.CLIP_EDIT_HANDLE); if (handle) handle.remove(); },
        onDragStart(e, el, isClipHandle = false) { e.preventDefault(); e.stopPropagation(); this.dragInfo.element = el; const rect = el.getBoundingClientRect(); this.dragInfo.offsetX = e.clientX - rect.left; this.dragInfo.offsetY = e.clientY - rect.top; document.onmousemove = (ev) => { if (!this.dragInfo.element) return; const newLeft = ev.clientX - this.dragInfo.offsetX; const newTop = ev.clientY - this.dragInfo.offsetY; this.dragInfo.element.style.left = `${newLeft}px`; this.dragInfo.element.style.top = `${newTop}px`; if (!isClipHandle) { this.dragInfo.element.style.right = this.dragInfo.element.style.bottom = this.dragInfo.element.style.transform = 'auto'; } }; document.onmouseup = () => { const draggedEl = this.dragInfo.element; if (!draggedEl) return; if (isClipHandle) { const newRect = draggedEl.getBoundingClientRect(); SettingsManager.settings.clipRect = { top: newRect.top, left: newRect.left, width: newRect.width, height: newRect.height }; applyContainerClipping(); } else { const newPos = { top: `${(draggedEl.offsetTop / window.innerHeight) * 100}%`, left: `${(draggedEl.offsetLeft / window.innerWidth) * 100}%` }; if (draggedEl.id === DOM_IDS.DIALOGUE_BOX) SettingsManager.settings.dialogueBoxPos = newPos; else if (draggedEl.id === DOM_IDS.STATUS_WINDOW) SettingsManager.settings.statusWindowPos = newPos; else if (draggedEl.id === DOM_IDS.CHAR_CONTAINER) SettingsManager.settings.characterContainerPos = newPos; } SettingsManager.save(); this.dragInfo.element = null; document.onmousemove = document.onmouseup = null; }; },
        onResizeStart(e, handleType) { e.preventDefault(); this.resizeInfo.element = document.getElementById(DOM_IDS.CLIP_EDIT_HANDLE); if (!this.resizeInfo.element) return; this.resizeInfo.handleType = handleType; this.resizeInfo.initialRect = this.resizeInfo.element.getBoundingClientRect(); this.resizeInfo.initialMouse = { x: e.clientX, y: e.clientY }; document.onmousemove = this.onResizeMove.bind(this); document.onmouseup = this.onResizeEnd.bind(this); },
        onResizeMove(e) { const { element, handleType, initialRect, initialMouse } = this.resizeInfo; if (!element) return; const deltaX = e.clientX - initialMouse.x; const deltaY = e.clientY - initialMouse.y; const minSize = 20; let top = initialRect.top; let left = initialRect.left; let width = initialRect.width; let height = initialRect.height; if (handleType.includes('top')) { height -= deltaY; top += deltaY; } if (handleType.includes('bottom')) { height += deltaY; } if (handleType.includes('left')) { width -= deltaX; left += deltaX; } if (handleType.includes('right')) { width += deltaX; } if (width < minSize) { if (handleType.includes('left')) left = initialRect.left + initialRect.width - minSize; width = minSize; } if (height < minSize) { if (handleType.includes('top')) top = initialRect.top + initialRect.height - minSize; height = minSize; } element.style.top = `${top}px`; element.style.left = `${left}px`; element.style.width = `${width}px`; element.style.height = `${height}px`; },
        onResizeEnd() { const { element } = this.resizeInfo; if (element) { const finalRect = element.getBoundingClientRect(); SettingsManager.settings.clipRect = { top: finalRect.top, left: finalRect.left, width: finalRect.width, height: finalRect.height }; SettingsManager.save(); applyContainerClipping(); } document.onmousemove = null; document.onmouseup = null; this.resizeInfo = {}; },


        showAll() { this.elements.container?.classList.add('visible'); },
        hideAll() { this.elements.container?.classList.remove('visible'); if (SettingsManager.settings.characterMode === 'multi') { this.clearAllMultiCharacters(); } else { this.updateSingleCharacter('off'); } },
        showBackButton() { if(this.elements.backButton) this.elements.backButton.style.display = 'block'; },
        hideBackButton() { if(this.elements.backButton) this.elements.backButton.style.display = 'none'; },
        parseCharacterInfoFromUrl(url) { if (!url || url.toLowerCase() === 'off') return null; const filename = url.substring(url.lastIndexOf('/') + 1).split('.')[0]; const match = filename.match(/^([a-zA-Z_]+[a-zA-Z])([0-9_].*)?$/) || filename.match(/^([a-zA-Z]+)([0-9_].*)?$/); if (match && match[1]) { return { id: match[1], fullId: filename }; } return { id: filename, fullId: filename }; },
        updateSingleCharacter(url) { const img = this.elements.cgSingle; if (!img) return; if (url.toLowerCase() === 'off') { img.classList.remove('visible'); setTimeout(() => { if (!img.classList.contains('visible')) img.src = ''; }, 300); } else { if (img.src !== url) { img.src = url; } if (!img.classList.contains('visible')) { img.classList.add('visible'); } } },
        updateBackgroundImage(url) { if(this.elements.background && this.elements.background.style.backgroundImage !== `url("${url}")`) { this.elements.background.style.backgroundImage = `url(${url})`; } },
        updateStatusWindow(text) { if(this.elements.statusWindow) this.elements.statusWindow.textContent = text; },
        updateDialogueBox(character, text, isAction, typeCallback) { const { charName, dialogueText } = this.elements; if (!charName || !dialogueText) return; if (character) { charName.textContent = character; charName.style.display = 'inline-block'; } else { charName.style.display = 'none'; } dialogueText.className = isAction ? 'action-text' : ''; typeCallback(dialogueText, text); },
        getDialogueTextElement() { return this.elements.dialogueText; }
    };

    /* ... (CrackMessageFetcher, 전역 변수, 엔진 제어 함수 등은 변경 없음) ... */
    class PlatformMessage { constructor(id, role, content) { this.id = id; this.role = role; this.content = content; } } function extractCookie(key) { const e = document.cookie.match(new RegExp(`(?:^|; )${key.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1")}=([^;]*)`)); return e ? decodeURIComponent(e[1]) : null; } async function authFetch(method, url, body) { try { const param = { method: method, headers: { 'Authorization': `Bearer ${extractCookie("access_token")}`, 'Content-Type': 'application/json' } }; if (body) param.body = JSON.stringify(body); const result = await fetch(url, param); if (!result.ok) { return new Error(`HTTP 요청 실패 (${result.status})`); } return await result.json(); } catch (t) { return new Error(`알 수 없는 오류 (${t.message})`); } } class CrackMessageFetcher { constructor(chatId) { this.chatId = chatId; } async fetch(limit = 10) { const messages = []; const url = `https://contents-api.wrtn.ai/character-chat/v3/chats/${this.chatId}/messages?limit=${limit}`; const fetchResult = await authFetch("GET", url); if (fetchResult instanceof Error) throw fetchResult; const rawMessages = fetchResult.data?.list ?? fetchResult.data?.messages; if (!rawMessages) throw new Error("메시지를 가져오는 데 실패하였습니다."); for (let msg of rawMessages) { messages.push(new PlatformMessage(msg._id, msg.role, msg.content)); } return messages.reverse(); } }
    let lastMessageId = null; let isChecking = false; let pollingInterval = null; let isEngineActive = false;
    function applyContainerClipping() { if (!isEngineActive) return; const vnContainer = UIManager.elements.container; if (!vnContainer) return; const rect = SettingsManager.settings.clipRect; if (rect) { const clipPathValue = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${rect.left}px ${rect.top}px, ${rect.left + rect.width}px ${rect.top}px, ${rect.left + rect.width}px ${rect.top + rect.height}px, ${rect.left}px ${rect.top + rect.height}px, ${rect.left}px ${rect.top}px)`; vnContainer.style.clipPath = clipPathValue; } else { vnContainer.style.clipPath = 'none'; } }
    function getChatInfoFromUrl() { const pathname = window.location.pathname; const idPattern = /([a-f0-9]{24})/; let match; match = pathname.match(new RegExp("/episodes/" + idPattern.source)); if (match) return { id: match[1], type: 'episode' }; match = pathname.match(new RegExp("/chats/" + idPattern.source)); if (match) return { id: match[1], type: 'chat' }; match = pathname.match(new RegExp("/c/" + idPattern.source)); if (match) return { id: match[1], type: 'chat' }; return null; }
    async function checkForNewMessages() { if (!isEngineActive || isChecking || (StageManager.isVisible && !StageManager.isFinished)) return; isChecking = true; try { const chatInfo = getChatInfoFromUrl(); if (!chatInfo) return; const fetcher = new CrackMessageFetcher(chatInfo.id); const latestMessages = await fetcher.fetch(10); if (latestMessages.length === 0) return; if (lastMessageId === null) { lastMessageId = latestMessages[latestMessages.length - 1].id; console.log(`VN Engine: 초기 설정 완료. 마지막 메시지 ID: ${lastMessageId}`); return; } const lastSeenIndex = latestMessages.findIndex(msg => msg.id === lastMessageId); const newMessages = latestMessages.slice(lastSeenIndex + 1); if (newMessages.length > 0) { const assistantMessages = newMessages.filter(msg => msg.role === 'assistant' && msg.content && msg.content.trim() !== ''); if (assistantMessages.length > 0) { const fullResponse = assistantMessages.map(m => m.content).join('\n\n'); StageManager.start(fullResponse); } lastMessageId = newMessages[newMessages.length - 1].id; } } catch (error) { console.error("VN Engine: 새 메시지 확인 중 오류:", error); } finally { isChecking = false; } }
    function startRealtimeChecker() { const chatInfo = getChatInfoFromUrl(); if (chatInfo) { console.log(`VN Engine: ${chatInfo.type} 채팅방(${chatInfo.id}) 감지. 실시간 확인을 시작합니다.`); lastMessageId = null; pollingInterval = setInterval(checkForNewMessages, 2500); checkForNewMessages(); setTimeout(applyContainerClipping, 100); window.addEventListener('resize', applyContainerClipping); } else { console.log("VN Engine: 채팅방이 아님. 대기 상태로 전환합니다."); } }
    function stopRealtimeChecker() { if (pollingInterval) clearInterval(pollingInterval); pollingInterval = null; lastMessageId = null; isChecking = false; StageManager.hide(); window.removeEventListener('resize', applyContainerClipping); if (UIManager.elements.container) { UIManager.elements.container.style.clipPath = 'none'; } console.log("VN Engine: 실시간 확인을 중지합니다."); }
    function toggleVNEngine() { isEngineActive = !isEngineActive; const button = document.getElementById(DOM_IDS.START_BUTTON); if (button) { if (isEngineActive) { button.textContent = 'VN 종료'; button.classList.add('active'); startRealtimeChecker(); } else { button.textContent = 'VN 시작'; button.classList.remove('active'); stopRealtimeChecker(); } } }

    console.log("Visual Novel Engine V1 Beta 로드됨.");
    SettingsManager.load();
    UIManager.setup();
    let lastUrl = location.href; new MutationObserver(() => { const url = location.href; if (url !== lastUrl) { lastUrl = url; if(isEngineActive) { toggleVNEngine(); } } }).observe(document.body, { subtree: true, childList: true });

})();
