// ==UserScript==
// @name         Visual Novel Engine V2 Beta
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  향상된 몰입감을 위한 비주얼 노벨 UI 스크립트 입니다.
// @author       agetion(c3ak)
// @match        *://crack.wrtn.ai/*
// @grant        GM_addStyle
// @run-at       document-idle
// @updateURL    https://github.com/c3ak/Visual_Novel_Engine_for_Crack/raw/refs/heads/main/VN_Engine.user.js
// @downloadURL  https://github.com/c3ak/Visual_Novel_Engine_for_Crack/raw/refs/heads/main/VN_Engine.user.js
// ==/UserScript==

(function() {
    'use strict';

    // --- 상수 정의 ---
    const DOM_IDS = {
        CONTAINER: 'vn-engine-container', BACKGROUND: 'vn-background-overlay', EVENT_CG: 'vn-event-cg-overlay',
        CHAR_CONTAINER: 'vn-character-container', STATUS_WINDOW: 'vn-status-window', DIALOGUE_BOX: 'vn-dialogue-box',
        CHAR_NAME: 'vn-character-name', DIALOGUE_TEXT: 'vn-dialogue-text', BACK_BUTTON: 'vn-back-button',
        SETTINGS_MODAL: 'vn-settings-modal', START_BUTTON: 'vn-start-button', SETTINGS_BUTTON: 'vn-settings-button',
        INPUT_BUTTON: 'vn-input-button', INPUT_MODAL: 'vn-input-modal', LOG_BUTTON: 'vn-log-button', LOG_MODAL: 'vn-log-modal',
        LOADING_INDICATOR: 'vn-loading-indicator'

    };
    const ANIMATION_TYPES = {
        'shake-vertical': '세로 흔들기', 'shake-horizontal': '가로 흔들기', 'flash': '반짝이기',
        'bounce': '통통 튀기', 'vibrate': '진동하기',
        'fall-left': '왼쪽으로 털썩(넘어짐)'
    };

    // --- 설정 관리자 ---
    const SettingsManager = {
        defaults: {
            characterMode: 'multi', dialogueBoxPos: { bottom: '40px', left: '50%', transform: 'translateX(-50%)' },
            statusWindowPos: { top: '20px', right: '20px' }, characterContainerPos: { bottom: '0px', left: '0px' },
            backgroundPattern: '/g/', characterPattern: '/c/', customBackgroundUrl: '', customAnimations: []
        },
        settings: {},
        load() {
            const savedSettings = localStorage.getItem('vnEngineSettings');
            this.settings = savedSettings ? JSON.parse(savedSettings) : { ...this.defaults };
            for (const key in this.defaults) { if (!this.settings.hasOwnProperty(key)) { this.settings[key] = this.defaults[key]; } }
        },
        save() { localStorage.setItem('vnEngineSettings', JSON.stringify(this.settings)); },
        createModal() {
            const animationOptions = Object.entries(ANIMATION_TYPES).map(([value, name]) => `<option value="${value}">${name}</option>`).join('');
            const modalHTML = `<div id="${DOM_IDS.SETTINGS_MODAL}" style="display: none; position: fixed; z-index: 100000; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.6);"><div class="vn-modal-content" style="background-color: #2c2c2c; margin: 5% auto; padding: 25px; border: 1px solid #888; width: 90%; max-width: 650px; border-radius: 10px; color: white; font-family: 'Pretendard', sans-serif; max-height: 90vh; overflow-y: auto;"><span id="vn-modal-close" style="color: #aaa; float: right; font-size: 28px; font-weight: bold; cursor: pointer;">&times;</span><h2 style="margin-top: 0; border-bottom: 1px solid #555; padding-bottom: 10px;">VN 엔진 설정</h2><div class="vn-setting-option" style="margin-bottom: 20px;"><label style="display: block; margin-bottom: 10px; font-weight: bold;">캐릭터 표시 방식</label><input type="radio" id="vn-char-mode-single" name="characterMode" value="single"> <label for="vn-char-mode-single">단일 캐릭터</label><br><input type="radio" id="vn-char-mode-multi" name="characterMode" value="multi"> <label for="vn-char-mode-multi">다중 캐릭터 (자동 배치)</label><br><input type="radio" id="vn-char-mode-internal" name="characterMode" value="internalImage"> <label for="vn-char-mode-internal">내부 이미지 (단일)</label></div><div id="vn-custom-bg-section" class="vn-setting-option" style="margin-bottom: 20px; display: none;"><label style="display: block; margin-bottom: 10px; font-weight: bold;">사용자 지정 배경 (단일/내부 모드용)</label><input type="text" id="vn-custom-bg-url-input" class="vn-pattern-input" placeholder="https://..."></div><div id="vn-multi-mode-section" class="vn-setting-option" style="display: none; margin-bottom: 20px;"><label style="display: block; margin-bottom: 10px; font-weight: bold;">URL 패턴 설정 (다중 모드 전용)</label><input type="text" id="vn-bg-pattern-input" class="vn-pattern-input" placeholder="배경 키워드"><input type="text" id="vn-char-pattern-input" class="vn-pattern-input" placeholder="캐릭터 키워드"></div><div id="vn-custom-anim-section" class="vn-setting-option" style="margin-bottom: 20px; display: none;"><label style="display: block; margin-bottom: 10px; font-weight: bold;">사용자 지정 연출 (다중 모드 전용)</label><div class="vn-anim-rule-list-container" style="max-height: 150px; overflow-y: auto; background-color: #333; padding: 10px; border-radius: 5px; margin-bottom: 10px;"><ul id="vn-animation-rules-list" style="list-style: none; margin: 0; padding: 0;"></ul></div><div class="vn-anim-add-form" style="display: flex; gap: 10px; margin-bottom: 10px;"><input type="text" id="vn-anim-trigger-input" placeholder="이미지 파일명 포함 단어" class="vn-pattern-input" style="flex: 2;"><select id="vn-anim-type-select" class="vn-pattern-input" style="flex: 1;">${animationOptions}</select><button id="vn-add-anim-rule-btn" class="vn-modal-button">규칙 추가</button></div><div><button id="vn-export-anim-btn" class="vn-modal-button">내보내기</button><button id="vn-import-anim-btn" class="vn-modal-button">가져오기</button><input type="file" id="vn-import-anim-input" style="display:none;" accept=".json"></div></div><div class="vn-setting-option" style="margin-bottom: 20px;"><label style="display: block; margin-bottom: 10px; font-weight: bold;">UI 위치 편집</label><button id="vn-edit-ui-button" class="vn-modal-button">편집 시작</button></div></div></div><style>.vn-modal-button { background-color: #555; color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer; } .vn-modal-button:hover { background-color: #666; } .vn-pattern-input { width: 100%; box-sizing: border-box; margin-top: 5px; padding: 6px; background-color: #444; color: white; border: 1px solid #666; border-radius: 4px; }</style>`;
            document.body.insertAdjacentHTML('beforeend', modalHTML); this.setupModalEventListeners();
        },
        setupModalEventListeners() {
            const self = this;
            document.getElementById('vn-modal-close').onclick = () => self.close();
            document.querySelectorAll('input[name="characterMode"]').forEach(radio => { radio.onchange = (e) => { self.settings.characterMode = e.target.value; self.save(); self.toggleModalSections(); }; });
            document.getElementById('vn-edit-ui-button').onclick = () => { self.close(); UIManager.toggleUiEditMode(true); };
            document.getElementById('vn-custom-bg-url-input').oninput = (e) => { self.settings.customBackgroundUrl = e.target.value; self.save(); };
            document.getElementById('vn-bg-pattern-input').oninput = (e) => { self.settings.backgroundPattern = e.target.value; self.save(); };
            document.getElementById('vn-char-pattern-input').oninput = (e) => { self.settings.characterPattern = e.target.value; self.save(); };
            document.getElementById('vn-add-anim-rule-btn').onclick = () => { const trigger = document.getElementById('vn-anim-trigger-input').value.trim(); const animation = document.getElementById('vn-anim-type-select').value; if (!trigger) { alert('트리거 단어를 입력해주세요.'); return; } self.settings.customAnimations.push({ id: Date.now(), trigger, animation }); self.save(); self.renderAnimationRules(); document.getElementById('vn-anim-trigger-input').value = ''; };
            document.getElementById('vn-export-anim-btn').onclick = () => { const dataStr = JSON.stringify(self.settings.customAnimations, null, 2); const blob = new Blob([dataStr], {type: "application/json"}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'vn_animation_settings.json'; a.click(); URL.revokeObjectURL(url); };
            const importInput = document.getElementById('vn-import-anim-input');
            document.getElementById('vn-import-anim-btn').onclick = () => importInput.click();
            importInput.onchange = (e) => { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = (event) => { try { const importedRules = JSON.parse(event.target.result); if (Array.isArray(importedRules)) { self.settings.customAnimations = importedRules; self.save(); self.renderAnimationRules(); alert('설정을 성공적으로 가져왔습니다.'); } else { throw new Error('JSON is not an array.'); } } catch (err) { console.error("VN Engine Import Error:", err); alert('파일을 가져오는 데 실패했습니다. 파일 형식이 올바른지 확인해주세요. (F12 > Console 확인)'); } }; reader.readAsText(file); importInput.value = ''; };
        },
        renderAnimationRules() {
            const listElement = document.getElementById('vn-animation-rules-list'); if (!listElement) return; listElement.innerHTML = '';
            this.settings.customAnimations.forEach(rule => { const li = document.createElement('li'); li.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 5px; border-bottom: 1px solid #444;'; li.innerHTML = `<span><strong style="color: #a2d2ff;">${rule.trigger}</strong> → ${ANIMATION_TYPES[rule.animation] || rule.animation}</span><button class="vn-delete-rule-btn" data-id="${rule.id}" style="background: #c70000; color: white; border: none; border-radius: 3px; cursor: pointer; padding: 2px 6px;">삭제</button>`; listElement.appendChild(li); });
            listElement.querySelectorAll('.vn-delete-rule-btn').forEach(btn => { btn.onclick = (e) => { const ruleId = Number(e.target.dataset.id); this.settings.customAnimations = this.settings.customAnimations.filter(r => r.id !== ruleId); this.save(); this.renderAnimationRules(); }; });
        },
        toggleModalSections() { const selectedMode = this.settings.characterMode; document.getElementById('vn-custom-bg-section').style.display = (selectedMode === 'single' || selectedMode === 'internalImage') ? 'block' : 'none'; document.getElementById('vn-multi-mode-section').style.display = (selectedMode === 'multi') ? 'block' : 'none'; document.getElementById('vn-custom-anim-section').style.display = (selectedMode === 'multi') ? 'block' : 'none'; },
        open() { document.querySelector(`input[name="characterMode"][value="${this.settings.characterMode}"]`).checked = true; document.getElementById('vn-custom-bg-url-input').value = this.settings.customBackgroundUrl; document.getElementById('vn-bg-pattern-input').value = this.settings.backgroundPattern; document.getElementById('vn-char-pattern-input').value = this.settings.characterPattern; this.toggleModalSections(); this.renderAnimationRules(); document.getElementById(DOM_IDS.SETTINGS_MODAL).style.display = 'block'; },
        close() { document.getElementById(DOM_IDS.SETTINGS_MODAL).style.display = 'none'; },
    };

    // --- 스타일 생성 ---
    function generateStyles(settings) {
        const posToCss = (posObj) => Object.entries(posObj).map(([key, value]) => `${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}: ${value};`).join(' ');
        let characterStyles = '';
        if (settings.characterMode === 'multi') {
            characterStyles = `
            #${DOM_IDS.CHAR_CONTAINER} {
                ${posToCss(settings.characterContainerPos)}
                position: absolute;
                width: 100%;
                height: 95vh;
                pointer-events: none;
                z-index: 2;
            }
            .vn-character-slot {
                position: absolute;
                bottom: 0;
                width: 40%;
                height: 100%;
                display: flex;
                justify-content: center;
                align-items: flex-end;
                /* 애니메이션 효과 추가 (밝기, 크기, 위치 변화) */
                transition: opacity 0.4s, transform 0.4s, left 0.4s ease-in-out, filter 0.4s ease-in-out;
                transform-origin: bottom center;
            }
            /* 말하는 중: 약간 커지고 밝아짐, 제일 앞으로 나옴 */
            .vn-character-slot.speaking {
                transform: scale(1.05);
                z-index: 10;
            }
            /* 듣는 중: 약간 작아지고 어두워짐 */
            .vn-character-slot.listening {
                transform: scale(0.95);
                filter: brightness(0.6);
                z-index: 1;
            }
            .vn-character-cg {
                max-width: 100%;
                max-height: 100%;
                object-fit: contain;
            }`;
        } else {
             characterStyles = `#${DOM_IDS.CHAR_CONTAINER} { ${posToCss(settings.characterContainerPos)} position: absolute; width: 100%; height: 100%; display: flex; justify-content: center; align-items: flex-end; pointer-events: none; z-index: 2; } .vn-character-cg { max-width: 40%; max-height: 95%; object-fit: contain; transition: opacity 0.3s ease-in-out, transform 0.3s ease-in-out; opacity: 0; transform: translateY(20px); } .vn-character-cg.visible { opacity: 1; transform: translateY(0); }`;
        }
        return `
            #${DOM_IDS.CONTAINER} { position: fixed !important; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 99990; pointer-events: none; display: none; }
            #${DOM_IDS.CONTAINER}.visible { display: block !important; }
            #${DOM_IDS.BACKGROUND} { width: 100%; height: 100%; background-size: cover; background-position: center; transition: background-image 0.5s ease-in-out; z-index: 0; }
            #${DOM_IDS.EVENT_CG} { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; background-color: #000; z-index: 1; opacity: 0; transition: opacity 0.5s ease-in-out; pointer-events: none; }
            #${DOM_IDS.EVENT_CG}.visible { opacity: 1; }
            ${characterStyles}
            #${DOM_IDS.DIALOGUE_BOX} { z-index: 3; position: absolute; ${posToCss(settings.dialogueBoxPos)} width: 95%; max-width: 1400px; background-color: rgba(0, 0, 0, 0.8); border: 1px solid #555; border-radius: 10px; padding: 30px 60px; color: white; font-family: 'Pretendard', sans-serif; pointer-events: auto; box-sizing: border-box; cursor: pointer; }
            #${DOM_IDS.CHAR_NAME} { position: absolute; top: 0; left: 40px; transform: translateY(-50%); background-color: rgba(40, 40, 40, 0.9); color: white; font-weight: bold; font-size: 1.2em; padding: 5px 15px; border-radius: 6px; border: 1px solid #777; z-index: 1; }
            #${DOM_IDS.DIALOGUE_TEXT} { flex-grow: 1; font-size: 1.7em; line-height: 1.6; min-height: 80px; }
            #${DOM_IDS.DIALOGUE_TEXT}.typing-effect { user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; }
            .action-text { font-style: italic; color: #ccc; }
            #${DOM_IDS.STATUS_WINDOW} { z-index: 3; position: absolute; ${posToCss(settings.statusWindowPos)} width: 300px; max-height: 80vh; background-color: rgba(0, 0, 0, 0.7); border: 1px solid #555; border-radius: 8px; padding: 15px; color: #eee; font-size: 14px; white-space: pre-wrap; overflow-y: auto; pointer-events: auto; }
            .vn-control-panel { position: fixed; left: 20px; bottom: 20px; z-index: 99999; display: flex; gap: 10px; }
            .vn-control-button { background-color: #444; color: white; border: none; border-radius: 8px; padding: 10px 15px; font-size: 14px; font-weight: bold; cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.2); transition: background-color 0.2s; }
            #${DOM_IDS.START_BUTTON} { background-color: #1a73e8; } #${DOM_IDS.START_BUTTON}:hover { background-color: #1765c7; }
            #${DOM_IDS.START_BUTTON}.active { background-color: #c70000; } #${DOM_IDS.START_BUTTON}.active:hover { background-color: #a00000; }
            #${DOM_IDS.SETTINGS_BUTTON}:hover { background-color: #555; }
            #${DOM_IDS.INPUT_BUTTON} {
                position: absolute;
                top: -38px; /* 대화창 바로 위에 위치 */
                right: 0;
                z-index: 5;
                background-color: #1a73e8;
                color: white;
                border: 1px solid #777;
                border-radius: 6px;
                padding: 6px 15px;
                font-size: 14px;
                font-weight: bold;
                cursor: pointer;
                box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                transition: background-color 0.2s;
                pointer-events: auto;
            }
            #${DOM_IDS.INPUT_BUTTON}:hover { background-color: #1765c7; }
            #${DOM_IDS.INPUT_MODAL} {
                display: none; /* JS로 켜고 끔 */
                position: absolute;

                /* 핵심: 대화창 바로 위에 붙이기 */
                bottom: 100%;
                left: 0;
                width: 100%;

                /* 디자인: 어두운 회색 바 */
                background-color: #2c2c2c;
                border: 1px solid #555;
                border-bottom: none; /* 대화창과 연결된 느낌을 위해 아래 테두리 제거 */
                border-radius: 8px 8px 0 0; /* 위쪽 모서리만 둥글게 */
                padding: 8px;
                box-sizing: border-box;
                z-index: 20; /* 입력 버튼보다 아래, 캐릭터보다는 위 */

                /* 내용물 가로 정렬 */
                flex-direction: row;
                align-items: center;
                gap: 10px;
                box-shadow: 0 -4px 10px rgba(0,0,0,0.2);
            }

            /* 기존 클래스 재활용: 내부 컨텐츠 정렬 */
            .vn-input-modal-content {
                display: flex;
                flex-direction: row; /* 가로로 배치 */
                width: 100%;
                gap: 10px;
                background: transparent; /* 배경 투명하게 (부모 색 따름) */
                box-shadow: none;
                padding: 0;
            }

            /* 제목은 바 형태에선 필요 없으니 숨김 */
            .vn-input-modal-title { display: none; }

            /* [수정됨 3] 텍스트 입력칸 디자인 */
            .vn-modal-textarea {
                flex-grow: 1; /* 남은 공간 꽉 채우기 */
                height: 36px; /* 높이 고정 (한 줄 느낌) */
                box-sizing: border-box;
                padding: 8px 10px;
                background-color: #444;
                color: white;
                border: 1px solid #666;
                border-radius: 4px;
                resize: none; /* 크기 조절 끄기 */
                font-size: 0.95em;
                font-family: inherit;
                line-height: 1.2;
            }
            .vn-modal-textarea:focus { outline: 1px solid #1a73e8; }

            /* 버튼 그룹 */
            .vn-input-modal-buttons {
                display: flex;
                gap: 5px;
                flex-shrink: 0; /* 공간 좁아져도 버튼 크기 유지 */
            }

            /* 버튼 디자인 */
            .vn-modal-button-cancel {
                background-color: #555;
                color: white;
                border: none;
                border-radius: 4px;
                padding: 0 12px;
                height: 36px;
                cursor: pointer;
                font-weight: bold;
                font-size: 13px;
            }
            .vn-modal-button-send {
                background-color: #1a73e8;
                color: white;
                border: none;
                border-radius: 4px;
                padding: 0 15px;
                height: 36px;
                cursor: pointer;
                font-weight: bold;
                font-size: 13px;
            }
            .vn-modal-button-send:hover { background-color: #1765c7; }
            .vn-modal-button-cancel:hover { background-color: #666; }

            #${DOM_IDS.LOG_BUTTON} {
            position: absolute;
            top: -38px; /* 입력 버튼과 동일한 높이 */
            right: 95px; /* 입력 버튼('대화 입력') 너비 + 간격 만큼 왼쪽으로 이동 */
            z-index: 5;
            background-color: #555; /* 기본 버튼 색상 */
            color: white;
            border: 1px solid #777;
            border-radius: 6px;
            padding: 6px 15px;
            font-size: 14px;
            font-weight: bold;
            cursor: pointer;
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
            transition: background-color 0.2s;
            pointer-events: auto;
            }
            #${DOM_IDS.LOG_BUTTON}:hover { background-color: #666; }

            #${DOM_IDS.LOADING_INDICATOR} {
            position: absolute;
            top: 15px;
            right: 20px;
            width: 24px;
            height: 24px;
            border: 3px solid rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            border-top-color: #fff;
            animation: vn-spin 1s ease-in-out infinite;
            z-index: 4; /* 대화 텍스트보다 위에, 다른 버튼보다는 아래에 위치 */
            display: none; /* 평소에는 숨겨둠 */
            }
            @keyframes vn-spin {
            to { transform: rotate(360deg); }
            }

            #${DOM_IDS.BACK_BUTTON} { position: absolute; bottom: 15px; right: 20px; font-size: 2em; color: #888; cursor: pointer; transition: color 0.2s; display: none; }
            #${DOM_IDS.BACK_BUTTON}:hover { color: #ccc; }
            .vn-ui-draggable { border: 2px dashed #00aaff !important; cursor: move !important; user-select: none; pointer-events: auto !important; }
            .vn-log-modal-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.7); z-index: 100002; justify-content: center; align-items: center; }
            .vn-log-modal-content { display: flex; flex-direction: column; background-color: #2c2c2c; padding: 25px; border-radius: 10px; width: 800px; max-width: 90%; height: 80vh; box-shadow: 0 5px 15px rgba(0,0,0,0.5); color: white; }
            .vn-log-modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
            .vn-log-modal-title { margin: 0; font-size: 1.5em; }
            .vn-log-modal-close { font-size: 2em; font-weight: bold; color: #aaa; cursor: pointer; }
            .vn-log-modal-body { flex-grow: 1; overflow-y: auto; padding-right: 15px; } /* 스크롤바 공간 확보 */
            .vn-log-entry { margin-bottom: 15px; border-bottom: 1px solid #444; padding-bottom: 15px; }
            .vn-log-char { color: #a2d2ff; font-size: 1.1em; }
            .vn-log-content { margin: 5px 0 0 0; font-size: 1.2em; line-height: 1.6; }
            .vn-log-content.action { font-style: italic; color: #ccc; }
            @keyframes shake-vertical { 0%, 100% { transform: translateY(0); } 10%, 30%, 50%, 70%, 90% { transform: translateY(-4px); } 20%, 40%, 60%, 80% { transform: translateY(4px); } } .vn-anim-shake-vertical { animation: shake-vertical 0.7s cubic-bezier(.36,.07,.19,.97) both; }
            @keyframes shake-horizontal { 0%, 100% { transform: translateX(0); } 10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); } 20%, 40%, 60%, 80% { transform: translateX(4px); } } .vn-anim-shake-horizontal { animation: shake-horizontal 0.7s cubic-bezier(.36,.07,.19,.97) both; }
            @keyframes flash { from, 50%, to { opacity: 1; } 25%, 75% { opacity: 0.6; } } .vn-anim-flash { animation: flash 0.8s; }
            @keyframes bounce { 0%, 20%, 50%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-20px); } 60% { transform: translateY(-10px); } } .vn-anim-bounce { animation: bounce 1s; }
            @keyframes vibrate { 0% { transform: translate(0); } 20% { transform: translate(-1px, 1px); } 40% { transform: translate(-1px, -1px); } 60% { transform: translate(1px, 1px); } 80% { transform: translate(1px, -1px); } 100% { transform: translate(0); } } .vn-anim-vibrate { animation: vibrate 0.2s linear infinite; animation-iteration-count: 3; }
            @keyframes fall-left {
                0% { transform: rotate(0deg); }
                30% { transform: rotate(-5deg); } /* 왼쪽 기우뚱 */
                50% { transform: rotate(5deg); }  /* 오른쪽 반동 */
                100% { transform: rotate(-90deg) translateY(10px); } /* 완전히 누움 (투명도 삭제됨) */
            }
            .vn-anim-fall-left {
                transform-origin: bottom center;
                animation: fall-left 2s ease-in forwards; /* forwards: 끝난 상태 유지 */
            }
        `;
    }

    // --- 로그 관리자 ---

    const LogManager = {
    history: [], // [ {character: '이름', content: '대사'}, ... ] 형태로 저장

    // 로그 추가
    add(character, content) {
        // action 텍스트는 character가 null이 될 수 있음
        this.history.push({ character: character || null, content });
    },

    // 새 대화 시작 시 로그 초기화
    clear() {
        this.history = [];
    },

    // 로그 모달에 표시할 HTML 생성
    render() {
        if (this.history.length === 0) {
            return '<p style="text-align: center; color: #888;">표시할 로그가 없습니다.</p>';
        }
        return this.history.map(log => {
            if (log.character) {
                // 캐릭터 대사 로그
                return `<div class="vn-log-entry">
                            <strong class="vn-log-char">${log.character}</strong>
                            <p class="vn-log-content">${log.content}</p>
                        </div>`;
            } else {
                // 행동(나레이션) 로그
                return `<div class="vn-log-entry">
                            <p class="vn-log-content action">${log.content}</p>
                        </div>`;
            }
        }).join('');
    }
};

    // --- 연출 관리자 ---
    const StageManager = {
        cueSheet: [], currentIndex: -1, firstTextCueIndex: -1, isTyping: false, typingTimer: null, isVisible: false, isFinished: true,

start(rawText) {
            UIManager.hideBackButton();

            // 1. 일단 텍스트를 분석해서 큐시트를 만듭니다.
            let parsedCues = this.parseCueSheet(rawText);

            if (SettingsManager.settings.characterMode === 'multi') {
                const previousCharacterIds = UIManager.activeCharacters.map(char => char.id);
                const newCueCharacterIds = new Set();

                // 2. [핵심] 큐시트 내용물 강제 교정 (Sanitization)
                // 파서가 실수로 배경을 캐릭터라고 분류했더라도 여기서 강제로 수정합니다.
                parsedCues.forEach(cue => {
                    if (cue.url && cue.url !== 'off') {
                        // ★ 강제 교정 1: URL에 '/g/'가 있으면 무조건 배경 이미지로 변경
                        if (cue.url.includes('/g/')) {
                            cue.type = 'background_image';
                        }
                        // ★ 강제 교정 2: URL에 '/c/'가 있으면 캐릭터로 확정하고 ID 수집
                        else if (cue.url.includes('/c/')) {
                            cue.type = 'character_update';
                            const charInfo = UIManager.parseCharacterInfoFromUrl(cue.url);
                            if (charInfo) newCueCharacterIds.add(charInfo.id);
                        }
                        // 만약 /c/도 /g/도 없는데 캐릭터 타입이라면? (안전장치)
                        else if (cue.type === 'character_update') {
                             // 보통 이런 경우는 드물지만, 일단 ID 수집 시도
                             const charInfo = UIManager.parseCharacterInfoFromUrl(cue.url);
                             if (charInfo) newCueCharacterIds.add(charInfo.id);
                        }
                    }
                });

                // 3. 이제 "화면엔 있는데, 리스트(newCueCharacterIds)엔 없는" 놈들을 찾습니다.
                // 배경(/g/)만 있는 경우, 위에서 type이 background로 바뀌었으므로 ID 수집이 안 됨 -> 전원 퇴장 처리됨.
                const charactersToRemove = previousCharacterIds.filter(id => !newCueCharacterIds.has(id));

                // 4. 퇴장 명령을 맨 앞에 꽂아넣습니다.
                charactersToRemove.forEach(id => {
                    parsedCues.unshift({ type: 'character_update', url: 'off', characterId: id });
                });
            }

            this.cueSheet = parsedCues;

            // 텍스트 시작 위치 설정 및 실행
            this.firstTextCueIndex = this.cueSheet.findIndex(c => c.type === 'dialogue' || c.type === 'action');
            if (this.cueSheet.length === 0) { this.isFinished = true; return; }

            UIManager.showAll();
            UIManager.applyCustomBackground();

            // 배경 이미지 즉시 적용 (깜빡임 방지)
            const bgCue = this.cueSheet.find(c => c.type === 'background_image');
            if (bgCue) UIManager.updateBackgroundImage(bgCue.url);

            const statusCue = this.cueSheet.find(c => c.type === 'status_window');
            if(statusCue) UIManager.updateStatusWindow(statusCue.content);

            this.currentIndex = -1;
            this.isVisible = true;
            this.isFinished = false;
            this.next();
        },
        next() { if (this.isTyping) { this.skipTyping(); return; } this.currentIndex++; if (this.currentIndex >= this.cueSheet.length) { this.isFinished = true; return; } this.processCue(this.cueSheet[this.currentIndex]); if (this.firstTextCueIndex !== -1 && this.currentIndex >= this.firstTextCueIndex) { UIManager.showBackButton(); } },
        previous() { if (this.isTyping) this.skipTyping(); if (this.currentIndex <= this.firstTextCueIndex) return; for (let i = this.currentIndex - 1; i >= 0; i--) { const cue = this.cueSheet[i]; if (cue.type === 'dialogue' || cue.type === 'action') { this.currentIndex = i; this.processCue(cue); if (this.currentIndex < this.firstTextCueIndex) UIManager.hideBackButton(); return; } } },
        hide() { if (!this.isVisible) return; UIManager.hideAll(); this.isVisible = false; this.isFinished = true; },
        formatText(text) { return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'); },
        type(element, text) { element.classList.add('typing-effect'); this.isTyping = true; let i = 0; element.innerHTML = ''; this.typingTimer = setInterval(() => { if (i < text.length) { element.innerHTML += text.charAt(i); i++; } else { this.skipTyping(); } }, 40); },
        skipTyping() { clearInterval(this.typingTimer); this.isTyping = false; const dialogueElement = UIManager.getDialogueTextElement(); if (dialogueElement) dialogueElement.classList.remove('typing-effect'); const cue = this.cueSheet[this.currentIndex]; if (cue && (cue.type === 'action' || cue.type === 'dialogue')) { dialogueElement.innerHTML = this.formatText(cue.content).replace(/\n/g, '<br>'); } },
        async processCue(cue) {
            switch (cue.type) {
                case 'character_update':
                    await UIManager.updateCharacter(cue.url, cue.characterId);
                    this.next();
                    break;
                case 'background_image':
                    UIManager.updateBackgroundImage(cue.url);
                    // 배경 변경 시 단일 모드 캐릭터 숨김
                    if (SettingsManager.settings.characterMode !== 'multi') {
                        UIManager.updateSingleCharacter('off');
                    }
                    this.next();
                    break;
                case 'action':
                    LogManager.add(null, cue.content);
                    // 나레이션: 아무도 강조하지 않음
                    UIManager.highlightSpeaker(null);
                    UIManager.updateDialogueBox(null, cue.content, true, (el, text) => this.type(el, text));
                    break;
                case 'dialogue':
                    LogManager.add(cue.character, cue.content);
                    // 대사: 말하는 사람 강조 (스마트 매핑)
                    UIManager.highlightSpeaker(cue.character);
                    UIManager.updateDialogueBox(cue.character, cue.content, false, (el, text) => this.type(el, text));
                    break;
                case 'status_window':
                    this.next();
                    break;
            }
        },
        parsers: [ { condition: () => SettingsManager.settings.characterMode === 'multi', regex: /^!\[([a-zA-Z0-9_]+)\]\((off)\)$/, handler: match => ({ type: 'character_update', url: 'off', characterId: match[1] }) }, { condition: () => SettingsManager.settings.characterMode === 'multi', regex: /^!\[\]\((.*?)\)$/, handler: match => { const url = match[1].trim(); const { backgroundPattern, characterPattern } = SettingsManager.settings; if (backgroundPattern && url.includes(backgroundPattern)) return { type: 'background_image', url }; if (characterPattern && url.includes(characterPattern)) return { type: 'character_update', url }; return { type: 'character_update', url }; } }, { condition: () => SettingsManager.settings.characterMode === 'single', regex: /^!\[bg\]\((.*?)\)$/, handler: match => ({ type: 'background_image', url: match[1].trim() }) }, { condition: () => SettingsManager.settings.characterMode === 'single', regex: /^!\[\]\((?!.*\b!\[bg\]\b)(.*?)\)$/, handler: match => ({ type: 'character_update', url: match[1].trim() }) }, { condition: () => SettingsManager.settings.characterMode === 'internalImage', regex: /^!\[(.+?)\]\((.*?)\)$/, handler: match => ({ type: 'character_update', url: match[2].trim() }) }, { regex: /^"?\*\*(.*?)\*\*\s*[|｜]\s*(.*?)"?$/, handler: match => ({ type: 'dialogue', character: match[1].trim(), content: match[2].trim() }) }, { regex: /^\*(.*)\*$/, handler: match => ({ type: 'action', content: match[1].trim() }) } ],
        parseCueSheet(rawText) { const lines = rawText.split('\n'); const cueSheet = []; let inCodeBlock = false; let codeBlockContent = ''; for (const line of lines) { const trimmedLine = line.trim(); if (trimmedLine.startsWith('```')) { inCodeBlock = !inCodeBlock; if (!inCodeBlock && codeBlockContent) { cueSheet.push({ type: 'status_window', content: codeBlockContent.trim() }); codeBlockContent = ''; } continue; } if (inCodeBlock) { codeBlockContent += line + '\n'; continue; } if (trimmedLine === '' || trimmedLine.startsWith('[//]: #')) continue; let matched = false; for (const parser of this.parsers) { if (parser.condition && !parser.condition()) continue; const match = trimmedLine.match(parser.regex); if (match) { cueSheet.push(parser.handler(match)); matched = true; break; } } if (!matched) { cueSheet.push({ type: 'action', content: trimmedLine }); } } if (codeBlockContent) { cueSheet.push({ type: 'status_window', content: codeBlockContent.trim() }); } return cueSheet; }
    };

    // --- UI 관리자 ---
    const UIManager = {
        elements: {}, activeCharacters: [], dragInfo: {}, resizeInfo: {},
    // [추가됨] 캐릭터 이름과 ID를 기억할 변수들
    characterMap: {},
    lastUpdatedCharId: null,

        setup() {
            GM_addStyle(generateStyles(SettingsManager.settings));
            const container = document.createElement('div'); container.id = DOM_IDS.CONTAINER;
            const characterContainerHTML = (SettingsManager.settings.characterMode === 'multi') ? `<div id="${DOM_IDS.CHAR_CONTAINER}"></div>` : `<div id="${DOM_IDS.CHAR_CONTAINER}"><img class="vn-character-cg" id="vn-cg-main"></div>`;
            container.innerHTML = `<div id="${DOM_IDS.BACKGROUND}"></div><img id="${DOM_IDS.EVENT_CG}" />${characterContainerHTML}<div id="${DOM_IDS.STATUS_WINDOW}"></div><div id="${DOM_IDS.DIALOGUE_BOX}"><div id="${DOM_IDS.CHAR_NAME}"></div><p id="${DOM_IDS.DIALOGUE_TEXT}"></p><div id="${DOM_IDS.BACK_BUTTON}">‹</div></div>`;
            document.body.appendChild(container);
            this.elements = { container: document.getElementById(DOM_IDS.CONTAINER), background: document.getElementById(DOM_IDS.BACKGROUND), eventCG: document.getElementById(DOM_IDS.EVENT_CG), charContainer: document.getElementById(DOM_IDS.CHAR_CONTAINER), statusWindow: document.getElementById(DOM_IDS.STATUS_WINDOW), dialogueBox: document.getElementById(DOM_IDS.DIALOGUE_BOX), charName: document.getElementById(DOM_IDS.CHAR_NAME), dialogueText: document.getElementById(DOM_IDS.DIALOGUE_TEXT), backButton: document.getElementById(DOM_IDS.BACK_BUTTON), cgSingle: (SettingsManager.settings.characterMode !== 'multi') ? document.getElementById('vn-cg-main') : null, };

            // 입력 버튼 코드
            this.createInputModal();
            const inputButton = document.createElement('button');
            inputButton.id = DOM_IDS.INPUT_BUTTON;
            inputButton.textContent = '대화 입력';
            this.elements.dialogueBox.appendChild(inputButton);
            inputButton.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleInputModal(true);
            });
            const logButton = document.createElement('button');
            logButton.id = DOM_IDS.LOG_BUTTON;
            logButton.textContent = '로그';
            this.elements.dialogueBox.appendChild(logButton);
            logButton.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleLogModal(true);
            });

            const loadingIndicator = document.createElement('div');
            loadingIndicator.id = DOM_IDS.LOADING_INDICATOR;
            this.elements.dialogueBox.appendChild(loadingIndicator);

            this.elements.dialogueBox?.addEventListener('click', (e) => { if (e.target.id !== DOM_IDS.BACK_BUTTON && !e.target.closest(`#${DOM_IDS.BACK_BUTTON}`)) StageManager.next(); });
            this.elements.backButton?.addEventListener('click', (e) => { e.stopPropagation(); StageManager.previous(); });
            const controlPanel = document.createElement('div'); controlPanel.className = 'vn-control-panel';
            controlPanel.innerHTML = `<button id="${DOM_IDS.START_BUTTON}" class="vn-control-button">VN 시작</button><button id="${DOM_IDS.SETTINGS_BUTTON}" class="vn-control-button">설정</button>`;
            document.body.appendChild(controlPanel);
            document.getElementById(DOM_IDS.START_BUTTON)?.addEventListener('click', toggleVNEngine);
            document.getElementById(DOM_IDS.SETTINGS_BUTTON)?.addEventListener('click', () => SettingsManager.open());
            SettingsManager.createModal();
            this.createLogModal();
            console.log("VN Engine: 비주얼 노벨 UI 및 제어판이 준비되었습니다.");
        },

        async updateCharacter(url, characterId = null) { if (SettingsManager.settings.characterMode === 'multi') { await this._updateMultiCharacter(url, characterId); } else { this.updateSingleCharacter(url); } },
        async _updateMultiCharacter(url, characterIdForOff = null) {
            const charContainer = this.elements.charContainer; if (!charContainer) return;
            if (url === 'off') {
                const charId = characterIdForOff; if (!charId) return;
                const indexToRemove = this.activeCharacters.findIndex(char => char.id === charId);
                if (indexToRemove > -1) { const charToRemove = this.activeCharacters[indexToRemove]; if (charToRemove.element) { charToRemove.element.style.opacity = 0; setTimeout(() => charToRemove.element.remove(), 400); } if (this.elements.eventCG.dataset.ownerId === charId) this.hideEventCG(charId); this.activeCharacters.splice(indexToRemove, 1); this._updateCharacterOrder(); }
                return;
            }
            const charInfo = this.parseCharacterInfoFromUrl(url); if (!charInfo) return;
            this.lastUpdatedCharId = charInfo.id;
            const aspectRatio = await this.getImageAspectRatio(url).catch(() => 1); const newMode = aspectRatio > 1.2 ? 'event' : 'standing';
            const existingChar = this.activeCharacters.find(char => char.id === charInfo.id);
            if (existingChar) {
                const oldMode = existingChar.mode; existingChar.url = url; existingChar.mode = newMode;
                if (newMode === 'event') { this.showEventCG(url, charInfo.id); if (existingChar.element) existingChar.element.style.display = 'none'; }
                else { if (oldMode === 'event') this.hideEventCG(charInfo.id); if (!existingChar.element) { existingChar.element = this._createCharacterElement(url); } existingChar.element.style.display = 'flex'; const img = existingChar.element.querySelector('.vn-character-cg'); if (img.src !== url) { img.src = url; this.applyAnimation(img, url); } }
            } else {
                const newChar = { id: charInfo.id, url, mode: newMode, element: null };
                if (newMode === 'standing') { newChar.element = this._createCharacterElement(url, false); this.applyAnimation(newChar.element.querySelector('.vn-character-cg'), url); }
                else { this.showEventCG(url, charInfo.id); }
                this.activeCharacters.push(newChar); this._updateCharacterOrder();
            }
        },
        _createCharacterElement(url, shouldAppend = false) {
            const slot = document.createElement('div'); slot.className = 'vn-character-slot'; slot.style.opacity = 0; slot.style.transform = 'translateY(20px)';
            const img = document.createElement('img'); img.className = 'vn-character-cg'; img.src = url; slot.appendChild(img);
            if (shouldAppend) { this.elements.charContainer.appendChild(slot); setTimeout(() => { slot.style.opacity = 1; slot.style.transform = 'translateY(0)'; }, 50); }
            return slot;
        },
        _updateCharacterOrder() {
            // [탐정 로그는 이제 제거하거나 주석 처리해도 됩니다]
            // console.log("--- _updateCharacterOrder 함수 실행됨! ---");

            const standingChars = this.activeCharacters.filter(c => c.mode === 'standing' && c.element);
            const container = this.elements.charContainer;
            const charCount = standingChars.length;

            if (charCount === 0) return;

            // --- ▼▼▼ 동적 겹침 값 계산 로직 (핵심 수정 부분) ▼▼▼ ---

            let overlapPercent; // 최종 겹침 값을 저장할 변수

            // ★★★ 여기서 값을 조절하여 연출을 커스터마이징하세요 ★★★
            const baseOverlap = 10; // 1~2명일 때의 기본 겹침 값 (%)
            const additionalOverlapPerChar = 8; // 3명째부터 1명 늘어날 때마다 추가할 겹침 값 (%)

            if (charCount <= 3) {
                // 캐릭터가 3명 이하일 때는 기본 겹침 값을 사용합니다.
                overlapPercent = baseOverlap;
            } else {
                // 4명 이상일 때, 기본 값에 추가 값을 더해줍니다.
                // (charCount - 2)는 4명일 때 1, 5명일 때 2가 되는 계산식입니다.
                overlapPercent = baseOverlap + (additionalOverlapPerChar * (charCount - 3));
            }


            const charWidth = 40; // 캐릭터 영역 너비는 고정
            const stepWidth = charWidth - overlapPercent;
            const totalGroupWidth = (stepWidth * (charCount - 1)) + charWidth;
            const startLeft = (100 - totalGroupWidth) / 2;

            standingChars.forEach((char, index) => {
                if (!char.element.parentElement) {
                    container.appendChild(char.element);
                }
                const charLeft = startLeft + (index * stepWidth);
                char.element.style.left = `${charLeft}%`;

                if (parseFloat(char.element.style.opacity) === 0) {
                    setTimeout(() => {
                        char.element.style.opacity = 1;
                        char.element.style.transform = 'translateY(0)';
                    }, 50);
                }
            });
        },
        applyAnimation(imgElement, url) {
            // 1. 기존에 적용된 애니메이션 클래스가 있다면 모두 초기화 (일어나게 하기 위함)
            const allAnimClasses = Object.keys(ANIMATION_TYPES).map(k => `vn-anim-${k}`);
            imgElement.classList.remove(...allAnimClasses);

            const filename = url.substring(url.lastIndexOf('/') + 1);
            const matchingRule = SettingsManager.settings.customAnimations.find(rule => filename.includes(rule.trigger));

            if (matchingRule) {
                const animClass = `vn-anim-${matchingRule.animation}`;
                imgElement.classList.add(animClass);

                // ★★★ 핵심 수정: 쓰러짐 효과는 자동으로 제거하지 않음 ★★★
                // 여기에 상태를 유지하고 싶은 애니메이션 ID를 추가하면 됩니다.
                const persistentAnimations = ['fall-left'];

                if (!persistentAnimations.includes(matchingRule.animation)) {
                    // 쓰러짐 효과가 아닐 때만(흔들기 등) 애니메이션 종료 후 클래스 제거
                    imgElement.addEventListener('animationend', () => {
                        imgElement.classList.remove(animClass);
                    }, { once: true });
                }
            }
        },
        getImageAspectRatio(url) { return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img.width / img.height); img.onerror = reject; img.src = url; }); },
        showEventCG(url, ownerId) { if (this.elements.eventCG) { this.elements.eventCG.dataset.ownerId = ownerId; this.elements.eventCG.src = url; this.elements.eventCG.classList.add('visible'); } },
        hideEventCG(ownerId) { if (this.elements.eventCG && this.elements.eventCG.dataset.ownerId === ownerId) { this.elements.eventCG.classList.remove('visible'); this.elements.eventCG.dataset.ownerId = ''; setTimeout(() => { if (!this.elements.eventCG.classList.contains('visible')) this.elements.eventCG.src = ''; }, 500); } },
        clearAllMultiCharacters() { if (this.elements.eventCG.classList.contains('visible')) { this.hideEventCG(this.elements.eventCG.dataset.ownerId); } this.activeCharacters.forEach(char => { if (char.element) char.element.remove(); }); this.activeCharacters = []; },
        toggleUiEditMode(enable) { const targets = [this.elements.dialogueBox, this.elements.statusWindow, this.elements.charContainer]; const editButton = document.getElementById('vn-edit-ui-button'); if (!editButton) return; if (enable) { this.showAll(); editButton.textContent = '편집 완료'; editButton.onclick = () => this.toggleUiEditMode(false); targets.forEach(el => { if(el) { el.classList.add('vn-ui-draggable'); el.onmousedown = (e) => this.onDragStart(e, el); } }); } else { editButton.textContent = '편집 시작'; editButton.onclick = () => { SettingsManager.close(); this.toggleUiEditMode(true); }; targets.forEach(el => { if(el) { el.classList.remove('vn-ui-draggable'); el.onmousedown = null; } }); if (!isEngineActive) { this.hideAll(); } } },
        onDragStart(e, el) { e.preventDefault(); e.stopPropagation(); this.dragInfo = { element: el, offsetX: e.clientX - el.getBoundingClientRect().left, offsetY: e.clientY - el.getBoundingClientRect().top }; document.onmousemove = (ev) => this.onDragMove(ev); document.onmouseup = () => this.onDragEnd(); },
        onDragMove(e) { if (!this.dragInfo.element) return; const newLeft = e.clientX - this.dragInfo.offsetX; const newTop = e.clientY - this.dragInfo.offsetY; this.dragInfo.element.style.left = `${newLeft}px`; this.dragInfo.element.style.top = `${newTop}px`; this.dragInfo.element.style.right = 'auto'; this.dragInfo.element.style.bottom = 'auto'; this.dragInfo.element.style.transform = 'none'; },
        onDragEnd() { const draggedEl = this.dragInfo.element; if (!draggedEl) return; const newPos = { top: `${draggedEl.style.top}`, left: `${draggedEl.style.left}`, transform: 'none' }; if (draggedEl.id === DOM_IDS.DIALOGUE_BOX) SettingsManager.settings.dialogueBoxPos = newPos; else if (draggedEl.id === DOM_IDS.STATUS_WINDOW) SettingsManager.settings.statusWindowPos = newPos; else if (draggedEl.id === DOM_IDS.CHAR_CONTAINER) SettingsManager.settings.characterContainerPos = newPos; SettingsManager.save(); this.dragInfo = {}; document.onmousemove = null; document.onmouseup = null; },
        showAll() { this.elements.container?.classList.add('visible'); },
        hideAll() { this.elements.container?.classList.remove('visible'); if (SettingsManager.settings.characterMode === 'multi') { this.clearAllMultiCharacters(); } else { this.updateSingleCharacter('off'); } },
        showBackButton() { if(this.elements.backButton) this.elements.backButton.style.display = 'block'; },
        hideBackButton() { if(this.elements.backButton) this.elements.backButton.style.display = 'none'; },
        parseCharacterInfoFromUrl(url) { if (!url || url.toLowerCase() === 'off') return null; const filename = url.substring(url.lastIndexOf('/') + 1).split('.')[0]; const match = filename.match(/^([a-zA-Z_]+[a-zA-Z])([0-9_].*)?$/) || filename.match(/^([a-zA-Z]+)([0-9_].*)?$/); if (match && match[1]) { return { id: match[1], fullId: filename }; } return { id: filename, fullId: filename }; },
        updateSingleCharacter(url) { const img = this.elements.cgSingle; if (!img) return; if (url.toLowerCase() === 'off') { img.classList.remove('visible'); setTimeout(() => { if (!img.classList.contains('visible')) img.src = ''; }, 300); } else { if (img.src !== url) { img.src = url; } if (!img.classList.contains('visible')) { img.classList.add('visible'); } } },
        applyCustomBackground() { const { characterMode, customBackgroundUrl } = SettingsManager.settings; if ((characterMode === 'single' || characterMode === 'internalImage') && customBackgroundUrl) this.updateBackgroundImage(customBackgroundUrl); },
        updateBackgroundImage(url) { if(this.elements.background && this.elements.background.style.backgroundImage !== `url("${url}")`) { this.elements.background.style.backgroundImage = `url("${url}")`; } },
        updateStatusWindow(text) { if(this.elements.statusWindow) this.elements.statusWindow.textContent = text; },
        updateDialogueBox(character, text, isAction, typeCallback) { const { charName, dialogueText } = this.elements; if (!charName || !dialogueText) return; if (character) { charName.textContent = character; charName.style.display = 'inline-block'; } else { charName.style.display = 'none'; } dialogueText.className = isAction ? 'action-text' : ''; typeCallback(dialogueText, text); },
        getDialogueTextElement() { return this.elements.dialogueText; },

        highlightSpeaker(speakerName) {
    if (SettingsManager.settings.characterMode !== 'multi') return;

    // 이름이 없거나 나레이션이면 강조 해제
    if (!speakerName) {
        this.activeCharacters.forEach(char => {
            if (char.element) {
                // 말하는 상태(speaking)는 제거하고
                char.element.classList.remove('speaking');
                // 듣는 상태(listening = 어두움)를 강제로 붙입니다.
                char.element.classList.add('listening');
            }
        });
        return;
    }

    const targetName = speakerName.trim();
    let targetId = this.characterMap[targetName];

    // 아는 ID가 없고, 방금 등장한 캐릭터가 있다면 "아, 걔가 얘구나" 하고 학습
    if (!targetId && this.lastUpdatedCharId) {
        this.characterMap[targetName] = this.lastUpdatedCharId;
        targetId = this.lastUpdatedCharId;
    }

    this.activeCharacters.forEach(char => {
        if (!char.element) return;

        // 1순위: 학습된 ID와 일치하는가?
        let isMatch = (char.id === targetId);

        // 2순위: 학습된 게 없으면 이름으로 추측 (기존 로직)
        if (!targetId) {
            const charIdLower = char.id.toLowerCase();
            const nameLower = targetName.toLowerCase().replace(/\s+/g, '');
            if (charIdLower.includes(nameLower) || nameLower.includes(charIdLower)) {
                isMatch = true;
                this.characterMap[targetName] = char.id; // 맞으면 이것도 학습
            }
        }

        // 클래스 적용
        if (isMatch) {
            char.element.classList.add('speaking');
            char.element.classList.remove('listening');
        } else {
            char.element.classList.add('listening');
            char.element.classList.remove('speaking');
        }
    });
},

createInputModal() {
    // 혹시라도 이전에 만들어진 모달이 남아있으면 삭제 (중복 방지)
    const oldModal = document.getElementById(DOM_IDS.INPUT_MODAL);
    if (oldModal) oldModal.remove();

    // 입력바 HTML 생성
    const modalHTML = `
        <div id="${DOM_IDS.INPUT_MODAL}" style="display: none;"> <!-- 초기 상태 none 강제 -->
            <div class="vn-input-modal-content">
                <textarea id="vn-modal-textarea" class="vn-modal-textarea" placeholder="대화 내용을 입력하세요 (Ctrl+Enter)"></textarea>
                <div class="vn-input-modal-buttons">
                    <button id="vn-modal-send" class="vn-modal-button-send">전송</button>
                    <button id="vn-modal-cancel" class="vn-modal-button-cancel">닫기</button>
                </div>
            </div>
        </div>`;

    // [핵심] 대화창(dialogueBox) 안에 HTML을 추가
    if (this.elements.dialogueBox) {
        this.elements.dialogueBox.insertAdjacentHTML('beforeend', modalHTML);

        // 이벤트 리스너 연결
        document.getElementById('vn-modal-send').onclick = (e) => { e.stopPropagation(); this.sendMessage(); };
        document.getElementById('vn-modal-cancel').onclick = (e) => { e.stopPropagation(); this.toggleInputModal(false); };

        // 텍스트 영역 키보드 이벤트 (Ctrl+Enter)
        const textArea = document.getElementById('vn-modal-textarea');
        textArea.onkeydown = (e) => {
            e.stopPropagation(); // 키 입력이 VN 엔진의 다른 단축키와 겹치지 않게 함
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                this.sendMessage();
            }
        };
        // 입력창 클릭 시 대화가 진행되지 않도록 이벤트 전파 막기
        textArea.onclick = (e) => e.stopPropagation();
    } else {
        console.error("VN Engine Error: 대화창을 찾을 수 없어 입력창을 생성하지 못했습니다.");
    }
},

toggleInputModal(show) {
    const modal = document.getElementById(DOM_IDS.INPUT_MODAL);
    if (!modal) {
        // 모달이 없으면 다시 생성 시도
        this.createInputModal();
        return;
    }

    if (show) {
        modal.style.display = 'flex'; // 보이게 설정
        const t = document.getElementById('vn-modal-textarea');
        if (t) {
            t.value = '';
            t.focus();
        }
    } else {
        modal.style.display = 'none'; // 숨김
    }
},
        sendMessage() {
            const textarea = document.getElementById('vn-modal-textarea');
            const message = textarea.value.trim();
            if (!message) return;
            const wrtnTextarea = document.querySelector('textarea[placeholder*="메시지"]');
            if (!wrtnTextarea) { alert("오류: 채팅 입력창을 찾을 수 없습니다."); return; }
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
            nativeInputValueSetter.call(wrtnTextarea, message);
            wrtnTextarea.dispatchEvent(new Event('input', { bubbles: true }));
            setTimeout(() => {
                const inputContainer = wrtnTextarea.closest('div[class*="input"], div[class*="container"]') || wrtnTextarea.parentElement.parentElement;
                if (!inputContainer) return;
                const buttons = inputContainer.querySelectorAll('button');
                if (buttons && buttons.length > 0) {
                    const sendBtn = buttons[buttons.length - 1];
                    if (!sendBtn.disabled) { sendBtn.click(); this.toggleInputModal(false); }
                }
            }, 50);
        },

        toggleLoadingIndicator(show) {
        const indicator = document.getElementById(DOM_IDS.LOADING_INDICATOR);
        if (indicator) {
        indicator.style.display = show ? 'block' : 'none';
        }
        },

        createLogModal() {
            const modalHTML = `
        <div id="${DOM_IDS.LOG_MODAL}" class="vn-log-modal-overlay">
            <div class="vn-log-modal-content">
                <div class="vn-log-modal-header">
                    <h2 class="vn-log-modal-title">대화 로그</h2>
                    <span id="vn-log-modal-close" class="vn-log-modal-close">&times;</span>
                </div>
                <div id="vn-log-modal-body" class="vn-log-modal-body">
                    <!-- 로그 내용이 여기에 동적으로 삽입됩니다. -->
                </div>
            </div>
        </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const modal = document.getElementById(DOM_IDS.LOG_MODAL);
    document.getElementById('vn-log-modal-close').addEventListener('click', () => this.toggleLogModal(false));
    modal.addEventListener('click', (e) => {
        if (e.target.id === DOM_IDS.LOG_MODAL) this.toggleLogModal(false);
    });
},

// toggleLogModal 함수를 UIManager 객체 내부에 새로 추가 (createLogModal 함수 밑에 추가)

        toggleLogModal(show) {
            const modal = document.getElementById(DOM_IDS.LOG_MODAL);
    if (!modal) return;

    if (show) {
        const body = document.getElementById('vn-log-modal-body');
        body.innerHTML = LogManager.render(); // LogManager를 통해 렌더링
        modal.style.display = 'flex';
        // 모달을 연 후 스크롤을 맨 아래로 이동
        setTimeout(() => { body.scrollTop = body.scrollHeight; }, 0);
    } else {
        modal.style.display = 'none';
    }
},
    };

    // --- 데이터 패쳐 및 전역 로직 ---
    class PlatformMessage { constructor(id, role, content) { this.id = id; this.role = role; this.content = content; } }
    function extractCookie(key) { const e = document.cookie.match(new RegExp(`(?:^|; )${key.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1")}=([^;]*)`)); return e ? decodeURIComponent(e[1]) : null; }
    async function authFetch(method, url, body) { try { const param = { method: method, headers: { 'Authorization': `Bearer ${extractCookie("access_token")}`, 'Content-Type': 'application/json' } }; if (body) param.body = JSON.stringify(body); const result = await fetch(url, param); if (!result.ok) { return new Error(`HTTP 요청 실패 (${result.status})`); } return await result.json(); } catch (t) { return new Error(`알 수 없는 오류 (${t.message})`); } }
    class CrackMessageFetcher { constructor(chatId) { this.chatId = chatId; } async fetch(limit = 10) { const messages = []; const url = `https://contents-api.wrtn.ai/character-chat/v3/chats/${this.chatId}/messages?limit=${limit}`; const fetchResult = await authFetch("GET", url); if (fetchResult instanceof Error) throw fetchResult; const rawMessages = fetchResult.data?.list ?? fetchResult.data?.messages; if (!rawMessages) throw new Error("메시지를 가져오는 데 실패하였습니다."); for (let msg of rawMessages) { messages.push(new PlatformMessage(msg._id, msg.role, msg.content)); } return messages.reverse(); } }

    let lastMessageId = null, isChecking = false, isEngineActive = false;
    let generationStopTime = null;
    let pollingTimer = null, uiObserver = null;
    let stopDelayTimer = null;
    let isHighSpeedMode = false;

    // ★ 수정됨: 사용자가 지적한 'cursor="not-allowed"' 상태를 감지합니다.
    const UI_SELECTORS = {
        // 버튼에 button path[d="M6 6h12v12H6z 속성이 있으면 '생성 중'으로 판단
        GENERATING_BTN: 'button svg path[d="M6 6h12v12H6Z"]'
    };

    function getChatInfoFromUrl() { const pathname = window.location.pathname; const idPattern = /([a-f0-9]{24})/; let match; match = pathname.match(new RegExp("/episodes/" + idPattern.source)); if (match) return { id: match[1], type: 'episode' }; match = pathname.match(new RegExp("/chats/" + idPattern.source)); if (match) return { id: match[1], type: 'chat' }; match = pathname.match(new RegExp("/c/" + idPattern.source)); if (match) return { id: match[1], type: 'chat' }; return null; }

    // --- 스마트 폴링 로직 (핵심) ---
async function adaptivePollingLoop() {
    if (!isEngineActive) return;

    // 1. 현재 버튼이 있는지 확인
    const hasButton = !!document.querySelector(UI_SELECTORS.GENERATING_BTN);

    if (hasButton) {
        // [상황 A] 버튼이 있음 -> 무조건 고속 모드 유지
        isHighSpeedMode = true;

        // 혹시 "끄려고 예약해둔 타이머"가 있다면 취소 (다시 생성 시작했으므로)
        if (stopDelayTimer) {
            clearTimeout(stopDelayTimer);
            stopDelayTimer = null;
        }
    } else if (isHighSpeedMode && !stopDelayTimer) {
        // [상황 B] 버튼이 사라졌는데, 아직 고속 모드임 -> "2초 뒤에 꺼라" 예약
        stopDelayTimer = setTimeout(() => {
            isHighSpeedMode = false; // 2초 뒤에 비로소 꺼짐
            stopDelayTimer = null;
        }, 1000);
    }

    // --- 실제 동작 (상태에 따라 행동) ---

    // 로딩 인디케이터는 고속 모드인 동안 계속 켜둠 (유예 시간 포함)
    UIManager.toggleLoadingIndicator(isHighSpeedMode);

    if (isHighSpeedMode) {
        // [고속 모드] 2초 간격 (유예 시간 동안은 이쪽으로 들어옴)
        await checkForNewMessages();
        if (pollingTimer) clearTimeout(pollingTimer);
        pollingTimer = setTimeout(adaptivePollingLoop, 2000);
    } else {
        // [절전 모드] 10초 간격
        if (pollingTimer) clearTimeout(pollingTimer);
        pollingTimer = setTimeout(adaptivePollingLoop, 10000);
    }
}
    // 버튼의 상태 변화(활성 <-> 비활성)를 감지하는 감시자

function startUiObserver() {
    if (uiObserver) return;

    const observerConfig = {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ['disabled', 'cursor', 'class'] // 'cursor' 변화를 감지
    };

    uiObserver = new MutationObserver((mutations) => {
        // "생성 중인" 버튼(cursor: pointer)이 나타났는지 확인합니다. (수정)
        const generatingBtn = document.querySelector(UI_SELECTORS.GENERATING_BTN);

        // 해당 버튼이 나타났을 때만 즉시 루프를 깨웁니다. (수정)
        if (generatingBtn && pollingTimer) {
            // console.log("감지: 'pointer' 커서 버튼 나타남! 즉시 데이터 확인 시작");
            clearTimeout(pollingTimer);
            adaptivePollingLoop();
        }
    });

    uiObserver.observe(document.body, observerConfig);
}
    async function checkForNewMessages() {
        if (!isEngineActive || isChecking || (StageManager.isVisible && !StageManager.isFinished)) return;
        isChecking = true;
        try {
            const chatInfo = getChatInfoFromUrl(); if (!chatInfo) return;
            const fetcher = new CrackMessageFetcher(chatInfo.id);
            const latestMessages = await fetcher.fetch(10);
            if (latestMessages.length === 0) return;
            if (lastMessageId === null) { lastMessageId = latestMessages[latestMessages.length - 1].id; return; }
            const lastSeenIndex = latestMessages.findIndex(msg => msg.id === lastMessageId);
            const newMessages = latestMessages.slice(lastSeenIndex + 1);
            if (newMessages.length > 0) {
                const assistantMessages = newMessages.filter(msg => msg.role === 'assistant' && msg.content && msg.content.trim() !== '');
                if (assistantMessages.length > 0) {
                    const fullResponse = assistantMessages.map(m => m.content).join('\n\n');
                    StageManager.start(fullResponse);
                }
                lastMessageId = newMessages[newMessages.length - 1].id;
            }
        } catch (error) {
            console.error("VN Engine: 새 메시지 확인 중 오류:", error);
        } finally {
            isChecking = false;
        }
    }



    function startRealtimeChecker() {
    const chatInfo = getChatInfoFromUrl();
    if (chatInfo) {
        lastMessageId = null;
        startUiObserver();
        adaptivePollingLoop(); // 루프 시작
    }
}

    function stopRealtimeChecker() {
    if (pollingTimer) clearTimeout(pollingTimer);
    pollingTimer = null;
    if (uiObserver) { uiObserver.disconnect(); uiObserver = null; }
    lastMessageId = null; isChecking = false;
    StageManager.hide();
    UIManager.toggleLoadingIndicator(false);
    if (UIManager.elements.container) UIManager.elements.container.style.clipPath = 'none';
}

    function toggleVNEngine() {
        isEngineActive = !isEngineActive;
        const button = document.getElementById(DOM_IDS.START_BUTTON);
        if (button) {
            if (isEngineActive) {
                button.textContent = 'VN 종료'; button.classList.add('active'); startRealtimeChecker();
            } else {
                button.textContent = 'VN 시작'; button.classList.remove('active'); stopRealtimeChecker();
            }
        }
    }
    // --- 스크립트 초기화 ---
    console.log("Visual Novel Engine V1.5 (Complete & Stable) 로드됨.");
    SettingsManager.load();
    UIManager.setup();
    let lastUrl = location.href; new MutationObserver(() => { const url = location.href; if (url !== lastUrl) { lastUrl = url; if(isEngineActive) { toggleVNEngine(); } } }).observe(document.body, { subtree: true, childList: true });

})();
