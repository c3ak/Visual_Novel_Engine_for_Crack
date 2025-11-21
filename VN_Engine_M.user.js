// ==UserScript==
// @name         Visual Novel Engine V1_mobile
// @namespace    http://tampermonkey.net/
// @version      1.2-mobile-beta
// @description  모바일 UI 편집 기능 및 버튼 터치 문제를 모두 수정한 최종 안정화 버전입니다.
// @author       You & AI Assistant
// @match        *://crack.wrtn.ai/*
// @grant        GM_addStyle
// @run-at       document-idle
// @updateURL    https://github.com/c3ak/Visual_Novel_Engine_for_Crack/raw/refs/heads/main/VN_Engine_M.user.js
// @downloadURL  https://github.com/c3ak/Visual_Novel_Engine_for_Crack/raw/refs/heads/main/VN_Engine_M.user.js
// ==/UserScript==

(function() {
    'use strict';

    // --- 상수 정의 --- (변경 없음)
    const DOM_IDS = {
        CONTAINER: 'vn-engine-container', BACKGROUND: 'vn-background-overlay', EVENT_CG: 'vn-event-cg-overlay',
        CHAR_CONTAINER: 'vn-character-container', STATUS_WINDOW: 'vn-status-window', DIALOGUE_BOX: 'vn-dialogue-box',
        CHAR_NAME: 'vn-character-name', DIALOGUE_TEXT: 'vn-dialogue-text', BACK_BUTTON: 'vn-back-button',
        SETTINGS_MODAL: 'vn-settings-modal', START_BUTTON: 'vn-start-button', SETTINGS_BUTTON: 'vn-settings-button',
        STATUS_TOGGLE: 'vn-status-toggle-button', INPUT_BUTTON: 'vn-input-button', INPUT_MODAL: 'vn-input-modal',
        LOG_BUTTON: 'vn-log-button', LOG_MODAL: 'vn-log-modal',
        LOADING_INDICATOR: 'vn-loading-indicator'
    };
    const ANIMATION_TYPES = {
        'shake-vertical': '세로 흔들기', 'shake-horizontal': '가로 흔들기', 'flash': '반짝이기',
        'bounce': '통통 튀기', 'vibrate': '진동하기'
    };

    // --- 설정 관리자 --- (변경 없음)
    const SettingsManager = {
        defaults: {
            characterMode: 'multi', dialogueBoxPos: { bottom: '40px', left: '50%', transform: 'translateX(-50%)' },
            statusWindowPos: { top: '20px', right: '20px' },
            statusTogglePos: { top: '20px', right: '20px' },
            characterContainerPos: { bottom: '0px', left: '0px' },
            backgroundPattern: '/g/', characterPattern: '/c/', clipRect: null, customBackgroundUrl: '', customAnimations: []
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
            importInput.onchange = (e) => { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = (event) => { try { const importedRules = JSON.parse(event.target.result); if (Array.isArray(importedRules)) { self.settings.customAnimations = importedRules; self.save(); self.renderAnimationRules(); alert('설정을 성공적으로 가져왔습니다.'); } else { throw new Error('JSON is not an array.'); } } catch (err) { console.error("VN Engine Import Error:", err); alert('파일을 가져오는 데 실패했습니다. 파일 형식이 올바른지 확인해주세요. (F12 > Console 확인)'); } }; reader.readText(file); importInput.value = ''; };
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

    // --- 스타일 생성 --- (수정함)
    function generateStyles(settings) {
        const posToCss = (posObj) => Object.entries(posObj).map(([key, value]) => `${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}: ${value};`).join(' ');
        let characterStyles = '';
    if (settings.characterMode === 'multi') {
        characterStyles = `
        #${DOM_IDS.CHAR_CONTAINER} {
        ${posToCss(settings.characterContainerPos)}
        position: absolute;
        width: 100%;
        height: 95vh; /* 모바일 높이에 맞게 조절 */
        pointer-events: none;
        z-index: 2;
        }
        .vn-character-slot {
        position: absolute; /* 이제 flex가 아니라 절대 위치로 제어됨 */
        bottom: 0;
        width: 50%; /* 모바일 화면이 좁으므로 45%~50% 정도 추천 */
        height: 100%;
        display: flex;
        justify-content: center;
        align-items: flex-end;
        /* left 속성에 애니메이션 추가 */
        transition: opacity 0.4s, transform 0.4s, left 0.4s ease-in-out;
        }
        .vn-character-cg {
        max-width: 110%;
        max-height: 100%;
        object-fit: contain;
        }`;
        } else {
             characterStyles = `#${DOM_IDS.CHAR_CONTAINER} { ${posToCss(settings.characterContainerPos)} position: absolute; width: 100%; height: 100%; display: flex; justify-content: center; align-items: flex-end; pointer-events: none; z-index: 2; } .vn-character-cg { max-width: 50%; max-height: 95%; object-fit: contain; transition: opacity 0.3s ease-in-out, transform 0.3s ease-in-out; opacity: 0; transform: translateY(20px); } .vn-character-cg.visible { opacity: 1; transform: translateY(0); }`;
        }
        return `
            #${DOM_IDS.CONTAINER} { position: fixed !important; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 99990; pointer-events: none; display: none; }
            #${DOM_IDS.CONTAINER}.visible { display: block !important; }
            #${DOM_IDS.BACKGROUND} { width: 100%; height: 100%; background-size: cover; background-position: center; transition: background-image 0.5s ease-in-out; z-index: 0; }
            #${DOM_IDS.EVENT_CG} { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; background-color: #000; z-index: 1; opacity: 0; transition: opacity 0.5s ease-in-out; pointer-events: none; }
            #${DOM_IDS.EVENT_CG}.visible { opacity: 1; }
            ${characterStyles}
            #${DOM_IDS.DIALOGUE_BOX} { position: relative; z-index: 3; position: absolute; ${posToCss(settings.dialogueBoxPos)} width: 95%; max-width: 1200px; background-color: rgba(0, 0, 0, 0.8); border: 1px solid #555; border-radius: 10px; padding: 12px 25px; color: white; font-family: 'Pretendard', sans-serif; pointer-events: auto; box-sizing: border-box; cursor: pointer; }
            #${DOM_IDS.CHAR_NAME} { position: absolute; top: 0; left: 30px; transform: translateY(-50%); background-color: rgba(40, 40, 40, 0.9); color: white; font-weight: bold; font-size: 1.1em; padding: 4px 12px; border-radius: 6px; border: 1px solid #777; z-index: 1; }
            #${DOM_IDS.DIALOGUE_TEXT} { flex-grow: 1; font-size: 1.2em; line-height: 1.5; min-height: 50px; }
            #${DOM_IDS.DIALOGUE_TEXT}.typing-effect { user-select: none; } .action-text { font-style: italic; color: #ccc; }
            #${DOM_IDS.STATUS_TOGGLE} { z-index: 4; position: absolute; ${posToCss(settings.statusTogglePos)} background-color: #333; color: white; border: 1px solid #666; border-radius: 6px; padding: 6px 12px; font-size: 14px; font-weight: bold; cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.3); transition: background-color 0.2s; pointer-events: auto; }
            #${DOM_IDS.STATUS_TOGGLE}:hover { background-color: #444; }
            #${DOM_IDS.STATUS_WINDOW} { z-index: 3; position: absolute; ${posToCss(settings.statusWindowPos)} width: 220px; max-height: 60vh; background-color: rgba(0, 0, 0, 0.75); border: 1px solid #555; border-radius: 8px; padding: 15px; color: #eee; font-size: 14px; white-space: pre-wrap; overflow-y: auto; pointer-events: auto; transform-origin: top right; transition: opacity 0.3s, transform 0.3s; }
            #${DOM_IDS.STATUS_WINDOW}.collapsed { opacity: 0; transform: scale(0.8); pointer-events: none; }
            .vn-control-panel {
                position: fixed;
                left: 0;
                bottom: 15px; /* 스크린샷과 동일한 하단 위치 */
                z-index: 99999;
                display: flex;
                align-items: center;
                background-color: rgba(30, 30, 30, 0.8);
                border-radius: 0 8px 8px 0;
                box-shadow: 2px 0 8px rgba(0,0,0,0.3);
                transition: transform 0.35s ease-in-out; /* 부드러운 전환 효과 */
            }

            /* [수정] 서랍이 닫혔을 때 (collapsed)의 위치 */
            .vn-control-panel.collapsed {
                /* 패널 전체 너비만큼 왼쪽으로 이동시키되, 토글 버튼 너비만큼은 다시 오른쪽으로 당겨서 보이게 함 */
                transform: translateX(-100%) translateX(48px); /* 48px는 토글 버튼 너비 */
            }

            /* [추가] 서랍 내용(버튼 목록) 컨테이너 */
            #vn-drawer-content {
                display: flex; /* 버튼을 가로로 배치 */
                gap: 8px;
                padding: 8px 0 8px 8px; /* 오른쪽 패딩은 없음 */
                overflow: hidden;
                white-space: nowrap;
            }

            /* [수정] 모든 제어 버튼의 공통 스타일 */
            .vn-control-button {
                background-color: #444;
                color: white;
                border: none;
                border-radius: 8px;
                padding: 12px 18px;
                font-size: 16px;
                font-weight: bold;
                cursor: pointer;
                transition: background-color 0.2s;
                flex-shrink: 0;
            }

            /* [수정] 토글 버튼(손잡이) 전용 스타일 */
            #vn-drawer-toggle {
                padding: 12px 14px;
                border-radius: 0 8px 8px 0; /* 오른쪽만 둥글게 */
                background-color: #333;
                font-size: 20px;
                line-height: 1.1; /* 아이콘 세로 정렬 미세조정 */
            }

            #${DOM_IDS.START_BUTTON} { background-color: #1a73e8; } #${DOM_IDS.START_BUTTON}:hover { background-color: #1765c7; }
            #${DOM_IDS.START_BUTTON}.active { background-color: #c70000; } #${DOM_IDS.START_BUTTON}.active:hover { background-color: #a00000; }
            #${DOM_IDS.SETTINGS_BUTTON}:hover, #vn-drawer-toggle:hover { background-color: #555; }
            #${DOM_IDS.INPUT_BUTTON} {
                position: absolute;
                top: -18px;
                right: 20px;
                z-index: 5;
                background-color: #1a73e8;
                color: white;
                border: 1px solid #777;
                border-radius: 6px;
                padding: 5px 12px;
                font-size: 14px;
                font-weight: bold;
                cursor: pointer;
                box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                transition: background-color 0.2s, transform 0.2s;
                pointer-events: auto;
            }
            #${DOM_IDS.INPUT_BUTTON}:hover {
                background-color: #1765c7;
                transform: translateY(-1px);
            }
            #${DOM_IDS.LOG_BUTTON} {
                position: absolute;
                top: -18px; /* 입력 버튼과 동일한 높이 */
                right: 70px; /* 입력 버튼('입력') 너비 + 간격 만큼 왼쪽으로 이동 */
                z-index: 10;
                background-color: #555; /* 기본 버튼 색상 */
                color: white;
                border: 1px solid #777;
                border-radius: 6px;
                padding: 5px 12px;
                font-size: 14px;
                font-weight: bold;
                cursor: pointer;
                box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                transition: background-color 0.2s;
                pointer-events: auto;
            }
            #${DOM_IDS.LOG_BUTTON}:hover { background-color: #666; }

            .vn-log-modal-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.7); z-index: 100002; justify-content: center; align-items: center; }
            .vn-log-modal-content { display: flex; flex-direction: column; background-color: #2c2c2c; padding: 20px; border-radius: 10px; width: 90%; max-width: 600px; height: 80vh; box-shadow: 0 5px 15px rgba(0,0,0,0.5); color: white; }
            .vn-log-modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
            .vn-log-modal-title { margin: 0; font-size: 1.3em; }
            .vn-log-modal-close { font-size: 1.8em; font-weight: bold; color: #aaa; cursor: pointer; }
            .vn-log-modal-body { flex-grow: 1; overflow-y: auto; padding-right: 10px; }
            .vn-log-entry { margin-bottom: 12px; border-bottom: 1px solid #444; padding-bottom: 12px; }
            .vn-log-char { color: #a2d2ff; font-size: 1.0em; }
            .vn-log-content { margin: 5px 0 0 0; font-size: 1.1em; line-height: 1.5; }
            .vn-log-content.action { font-style: italic; color: #ccc; }

            /* [추가] 입력 모달 스타일 */
            .vn-input-modal-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.7); z-index: 100001; justify-content: center; align-items: center; }
            .vn-input-modal-content { background-color: #2c2c2c; padding: 20px; border-radius: 10px; width: 90%; max-width: 500px; box-shadow: 0 5px 15px rgba(0,0,0,0.5); display: flex; flex-direction: column; gap: 15px; }
            .vn-input-modal-title { margin: 0; color: white; font-size: 1.2em; }
            .vn-modal-textarea { width: 100%; height: 120px; box-sizing: border-box; padding: 10px; background-color: #444; color: white; border: 1px solid #666; border-radius: 4px; resize: vertical; font-size: 1em; }
            .vn-input-modal-buttons { display: flex; justify-content: flex-end; gap: 10px; }
            .vn-modal-button-cancel, .vn-modal-button-send { border: none; border-radius: 5px; padding: 8px 16px; font-weight: bold; cursor: pointer; }
            .vn-modal-button-cancel { background-color: #555; color: white; } .vn-modal-button-cancel:hover { background-color: #666; }
            .vn-modal-button-send { background-color: #1a73e8; color: white; } .vn-modal-button-send:hover { background-color: #1765c7; }

            #${DOM_IDS.BACK_BUTTON} { position: absolute; bottom: 10px; right: 15px; font-size: 2.2em; color: #888; cursor: pointer; transition: color 0.2s; display: none; }
            #${DOM_IDS.BACK_BUTTON}:hover { color: #ccc; }
            .vn-ui-draggable { border: 2px dashed #00aaff !important; cursor: move !important; user-select: none; pointer-events: auto !important; }
            /* ... (애니메이션 등 나머지 스타일은 그대로 유지) ... */
            @keyframes shake-vertical { 0%, 100% { transform: translateY(0); } 10%, 30%, 50%, 70%, 90% { transform: translateY(-4px); } 20%, 40%, 60%, 80% { transform: translateY(4px); } } .vn-anim-shake-vertical { animation: shake-vertical 0.7s cubic-bezier(.36,.07,.19,.97) both; }
            @keyframes shake-horizontal { 0%, 100% { transform: translateX(0); } 10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); } 20%, 40%, 60%, 80% { transform: translateX(4px); } } .vn-anim-shake-horizontal { animation: shake-horizontal 0.7s cubic-bezier(.36,.07,.19,.97) both; }
            @keyframes flash { from, 50%, to { opacity: 1; } 25%, 75% { opacity: 0.6; } } .vn-anim-flash { animation: flash 0.8s; }
            @keyframes bounce { 0%, 20%, 50%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-15px); } 60% { transform: translateY(-8px); } } .vn-anim-bounce { animation: bounce 1s; }
            @keyframes vibrate { 0% { transform: translate(0); } 20% { transform: translate(-1px, 1px); } 40% { transform: translate(-1px, -1px); } 60% { transform: translate(1px, 1px); } 80% { transform: translate(1px, -1px); } 100% { transform: translate(0); } } .vn-anim-vibrate { animation: vibrate 0.2s linear infinite; animation-iteration-count: 3; }
            #${DOM_IDS.LOADING_INDICATOR} {
                position: absolute;
                bottom: 15px; /* 뒤로가기 버튼과 같은 높이 */
                right: 60px;  /* 뒤로가기 버튼(15px)보다 왼쪽(앞)에 위치 */
                width: 24px;
                height: 24px;
                border: 3px solid rgba(255, 255, 255, 0.3);
                border-radius: 50%;
                border-top-color: #fff; /* 하얀색이 돔 */
                animation: vn-spin 1s ease-in-out infinite;
                z-index: 10;
                display: none; /* 평소에는 숨김 */
                pointer-events: none;
            }
            @keyframes vn-spin {
                to { transform: rotate(360deg); }
            }
        `;
    }

    // --- 연출 관리자 --- (변경 없음)
    const StageManager = {
        cueSheet: [], currentIndex: -1, firstTextCueIndex: -1, isTyping: false, typingTimer: null, isVisible: false, isFinished: true,
        start(rawText) {
            UIManager.hideBackButton();
            let parsedCues = this.parseCueSheet(rawText);
            if (SettingsManager.settings.characterMode === 'multi') {
                const hasCharacterUpdate = parsedCues.some(cue => cue.type === 'character_update' && cue.url !== 'off');
                if (hasCharacterUpdate) {
                    const previousCharacterIds = UIManager.activeCharacters.map(char => char.id);
                    const newCueCharacterIds = new Set();
                    parsedCues.forEach(cue => {
                        if (cue.type === 'character_update' && cue.url !== 'off') {
                            const charInfo = UIManager.parseCharacterInfoFromUrl(cue.url);
                            if (charInfo) newCueCharacterIds.add(charInfo.id);
                        }
                    });
                    const charactersToRemove = previousCharacterIds.filter(id => !newCueCharacterIds.has(id));
                    charactersToRemove.forEach(id => {
                        parsedCues.unshift({ type: 'character_update', url: 'off', characterId: id });
                    });
                }
            }
            this.cueSheet = parsedCues;
            this.firstTextCueIndex = this.cueSheet.findIndex(c => c.type === 'dialogue' || c.type === 'action');
            if (this.cueSheet.length === 0) { this.isFinished = true; return; }
            UIManager.showAll(); UIManager.applyCustomBackground(); const bgCue = this.cueSheet.find(c => c.type === 'background_image'); if (bgCue) UIManager.updateBackgroundImage(bgCue.url);
            const statusCue = this.cueSheet.find(c => c.type === 'status_window'); if(statusCue) UIManager.updateStatusWindow(statusCue.content);
            this.currentIndex = -1; this.isVisible = true; this.isFinished = false; this.next();
        },
        next() { if (this.isTyping) { this.skipTyping(); return; } this.currentIndex++; if (this.currentIndex >= this.cueSheet.length) { this.isFinished = true; return; } this.processCue(this.cueSheet[this.currentIndex]); if (this.firstTextCueIndex !== -1 && this.currentIndex >= this.firstTextCueIndex) { UIManager.showBackButton(); } },
        previous() { if (this.isTyping) this.skipTyping(); if (this.currentIndex <= this.firstTextCueIndex) return; for (let i = this.currentIndex - 1; i >= 0; i--) { const cue = this.cueSheet[i]; if (cue.type === 'dialogue' || cue.type === 'action') { this.currentIndex = i; this.processCue(cue); if (this.currentIndex < this.firstTextCueIndex) UIManager.hideBackButton(); return; } } },
        hide() { if (!this.isVisible) return; UIManager.hideAll(); this.isVisible = false; this.isFinished = true; },
        formatText(text) { return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'); },
        type(element, text) { element.classList.add('typing-effect'); this.isTyping = true; let i = 0; element.innerHTML = ''; this.typingTimer = setInterval(() => { if (i < text.length) { element.innerHTML += text.charAt(i); i++; } else { this.skipTyping(); } }, 40); },
        skipTyping() { clearInterval(this.typingTimer); this.isTyping = false; const dialogueElement = UIManager.getDialogueTextElement(); if (dialogueElement) dialogueElement.classList.remove('typing-effect'); const cue = this.cueSheet[this.currentIndex]; if (cue && (cue.type === 'action' || cue.type === 'dialogue')) { dialogueElement.innerHTML = this.formatText(cue.content).replace(/\n/g, '<br>'); } },
        async processCue(cue) {
            switch (cue.type) {
                case 'character_update': await UIManager.updateCharacter(cue.url, cue.characterId); this.next(); break;
                case 'background_image': UIManager.updateBackgroundImage(cue.url); this.next(); break;
                case 'action':
                LogManager.add(null, cue.content); // ★ 추가
                UIManager.updateDialogueBox(null, cue.content, true, (el, text) => this.type(el, text));
                break;
                case 'dialogue': LogManager.add(cue.character, cue.content); UIManager.updateDialogueBox(cue.character, cue.content, false, (el, text) => this.type(el, text)); break;
                case 'status_window': this.next(); break;
            }
        },
        parsers: [
            // 1. 멀티 모드: 캐릭터 끄기 (![ID](off))
            {
                condition: () => SettingsManager.settings.characterMode === 'multi',
                regex: /^!\[([a-zA-Z0-9_]+)\]\((off)\)$/,
                handler: match => ({ type: 'character_update', url: 'off', characterId: match[1] })
            },
            // 2. 멀티 모드: 자동 감지 (![](URL))
            {
                condition: () => SettingsManager.settings.characterMode === 'multi',
                regex: /^!\[\]\((.*?)\)$/,
                handler: match => {
                    const url = match[1].trim();
                    const { backgroundPattern, characterPattern } = SettingsManager.settings;
                    if (backgroundPattern && url.includes(backgroundPattern)) return { type: 'background_image', url };
                    if (characterPattern && url.includes(characterPattern)) return { type: 'character_update', url };
                    return { type: 'character_update', url };
                }
            },
            // 3. 싱글 모드: 배경 변경 (![bg](URL))
            {
                condition: () => SettingsManager.settings.characterMode === 'single',
                regex: /^!\[bg\]\((.*?)\)$/,
                handler: match => ({ type: 'background_image', url: match[1].trim() })
            },
            // 4. 싱글 모드: 캐릭터 변경 (![](URL))
            {
                condition: () => SettingsManager.settings.characterMode === 'single',
                regex: /^!\[\]\((?!.*\b!\[bg\]\b)(.*?)\)$/,
                handler: match => ({ type: 'character_update', url: match[1].trim() })
            },
            // 5. 내부 이미지 모드
            {
                condition: () => SettingsManager.settings.characterMode === 'internalImage',
                regex: /^!\[(.+?)\]\((.*?)\)$/,
                handler: match => ({ type: 'character_update', url: match[2].trim() })
            },
            // 6. 대화문 (**이름** | 내용)
            {
                regex: /^"?\*\*(.*?)\*\*\s*[|｜]\s*(.*?)"?$/,
                handler: match => ({ type: 'dialogue', character: match[1].trim(), content: match[2].trim() })
            },
            // 7. [수정됨] 지문 (*내용*) -> 2문장씩 자르기 적용
            {
                regex: /^\*(.*)\*$/,
                handler: match => {
                    const content = match[1].trim();

                    // 문장 부호(.!?)를 기준으로 문장을 나눕니다.
                    const sentences = content.match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g);

                    // 문장 분리가 안 되면 그냥 통째로 반환
                    if (!sentences || sentences.length === 0) {
                        return { type: 'action', content: content };
                    }

                    const results = [];
                    // 2문장씩 묶어서 결과 배열 생성
                    for (let i = 0; i < sentences.length; i += 2) {
                        let chunk = sentences[i].trim();
                        if (sentences[i + 1]) {
                            chunk += ' ' + sentences[i + 1].trim();
                        }
                        results.push({ type: 'action', content: chunk });
                    }
                    return results; // 배열 반환
                }
            }
        ],
        parseCueSheet(rawText) {
            const lines = rawText.split('\n');
            const cueSheet = [];
            let inCodeBlock = false;
            let codeBlockContent = '';

            for (const line of lines) {
                const trimmedLine = line.trim();

                // 코드 블록(상태창) 처리
                if (trimmedLine.startsWith('```')) {
                    inCodeBlock = !inCodeBlock;
                    if (!inCodeBlock && codeBlockContent) {
                        cueSheet.push({ type: 'status_window', content: codeBlockContent.trim() });
                        codeBlockContent = '';
                    }
                    continue;
                }
                if (inCodeBlock) {
                    codeBlockContent += line + '\n';
                    continue;
                }

                // 빈 줄이나 주석 무시
                if (trimmedLine === '' || trimmedLine.startsWith('[//]: #')) continue;

                let matched = false;
                for (const parser of this.parsers) {
                    if (parser.condition && !parser.condition()) continue;
                    const match = trimmedLine.match(parser.regex);
                    if (match) {
                        // [중요 변경점] 결과가 배열(여러 화면)이면 펼쳐서 넣고, 아니면 그냥 넣기
                        const result = parser.handler(match);
                        if (Array.isArray(result)) {
                            cueSheet.push(...result);
                        } else {
                            cueSheet.push(result);
                        }
                        matched = true;
                        break;
                    }
                }
                if (!matched) {
                    // 매칭 안 되는 일반 텍스트도 2문장씩 끊고 싶다면 여기도 로직 추가 가능 (일단 기본 유지)
                    cueSheet.push({ type: 'action', content: trimmedLine });
                }
            }
            if (codeBlockContent) {
                cueSheet.push({ type: 'status_window', content: codeBlockContent.trim() });
            }
            return cueSheet;
        },
    };

    // --- UI 관리자 ---
    const UIManager = {
        elements: {}, activeCharacters: [], dragInfo: {}, resizeInfo: {},

        getEventCoords(e) {
            if (e.touches && e.touches.length > 0) { return e.touches[0]; }
            if (e.changedTouches && e.changedTouches.length > 0) { return e.changedTouches[0]; }
            return e;
        },

        setup() {
            GM_addStyle(generateStyles(SettingsManager.settings));
            const container = document.createElement('div');
            container.id = DOM_IDS.CONTAINER;
            const characterContainerHTML = (SettingsManager.settings.characterMode === 'multi') ? `<div id="${DOM_IDS.CHAR_CONTAINER}"></div>` : `<div id="${DOM_IDS.CHAR_CONTAINER}"><img class="vn-character-cg" id="vn-cg-main"></div>`;
            container.innerHTML = `<div id="${DOM_IDS.BACKGROUND}"></div><img id="${DOM_IDS.EVENT_CG}" />${characterContainerHTML}<div id="${DOM_IDS.STATUS_WINDOW}" class="collapsed"></div><button id="${DOM_IDS.STATUS_TOGGLE}">상태</button><div id="${DOM_IDS.DIALOGUE_BOX}"><div id="${DOM_IDS.CHAR_NAME}"></div><p id="${DOM_IDS.DIALOGUE_TEXT}"></p><div id="${DOM_IDS.BACK_BUTTON}">‹</div></div>`;
            document.body.appendChild(container);
            this.elements = { container: document.getElementById(DOM_IDS.CONTAINER), background: document.getElementById(DOM_IDS.BACKGROUND), eventCG: document.getElementById(DOM_IDS.EVENT_CG), charContainer: document.getElementById(DOM_IDS.CHAR_CONTAINER), statusWindow: document.getElementById(DOM_IDS.STATUS_WINDOW), statusToggle: document.getElementById(DOM_IDS.STATUS_TOGGLE), dialogueBox: document.getElementById(DOM_IDS.DIALOGUE_BOX), charName: document.getElementById(DOM_IDS.CHAR_NAME), dialogueText: document.getElementById(DOM_IDS.DIALOGUE_TEXT), backButton: document.getElementById(DOM_IDS.BACK_BUTTON), cgSingle: (SettingsManager.settings.characterMode !== 'multi') ? document.getElementById('vn-cg-main') : null, };
            this.elements.statusToggle?.addEventListener('click', () => this.toggleStatusWindow());
            this.elements.dialogueBox?.addEventListener('click', (e) => {
            // 클릭된 대상이 버튼(로그, 입력, 뒤로가기) 중 하나인지 확인합니다.
            if (e.target.closest(`#${DOM_IDS.LOG_BUTTON}, #${DOM_IDS.INPUT_BUTTON}, #${DOM_IDS.BACK_BUTTON}`)) {
            return; // 버튼을 눌렀다면, 대화 넘기기를 실행하지 않고 여기서 함수를 종료합니다.
            }
            // 위의 경우가 아니라면, 일반적인 대화창 클릭이므로 다음 대사로 넘어갑니다.
            StageManager.next();
            });
            this.elements.backButton?.addEventListener('click', (e) => { e.stopPropagation(); StageManager.previous(); });
            const controlPanel = document.createElement('div');
            // [수정] 초기 상태를 닫힘으로 설정하기 위해 'collapsed' 클래스를 추가합니다.
            controlPanel.className = 'vn-control-panel collapsed';

            // --- [수정] 사이드 서랍 형태의 HTML 구조로 변경 ---
            controlPanel.innerHTML = `
                <div id="vn-drawer-content">
                    <button id="${DOM_IDS.START_BUTTON}" class="vn-control-button">VN 시작</button>
                    <button id="${DOM_IDS.SETTINGS_BUTTON}" class="vn-control-button">설정</button>
                </div>
                <button id="vn-drawer-toggle" class="vn-control-button">›</button>
            `;
            // ------------------------------------

            document.body.appendChild(controlPanel);

            // --- [수정] 토글 버튼이 부모(controlPanel)의 클래스를 변경하도록 수정 ---
            const drawerToggle = document.getElementById('vn-drawer-toggle');
            drawerToggle.addEventListener('click', () => {
                controlPanel.classList.toggle('collapsed');
                // 아이콘 모양을 화살표로 변경
                drawerToggle.textContent = controlPanel.classList.contains('collapsed') ? '›' : '‹';
            });
            const loadingIndicator = document.createElement('div');
            loadingIndicator.id = DOM_IDS.LOADING_INDICATOR;
            this.elements.dialogueBox.appendChild(loadingIndicator);

            this.createInputModal();
            this.createLogModal();

            // --- [추가] 입력 버튼을 대화창 내부에 직접 생성하고 이벤트 리스너를 추가합니다. ---
            const inputButton = document.createElement('button');
            inputButton.id = DOM_IDS.INPUT_BUTTON;
            inputButton.textContent = '입력';
            this.elements.dialogueBox.appendChild(inputButton);
            inputButton.addEventListener('click', () => this.toggleInputModal(true));
            const logButton = document.createElement('button');
            logButton.id = DOM_IDS.LOG_BUTTON;
            logButton.textContent = '로그';
            this.elements.dialogueBox.appendChild(logButton);
            logButton.addEventListener('click', (e) => {
            e.stopPropagation(); // 대화창 클릭으로 넘어가지 않게 함
            this.toggleLogModal(true);
        });
            const startButton = document.getElementById(DOM_IDS.START_BUTTON);
            const settingsButton = document.getElementById(DOM_IDS.SETTINGS_BUTTON);
            const openSettings = () => SettingsManager.open();
            if (startButton) {
                startButton.addEventListener('click', toggleVNEngine);
                startButton.addEventListener('touchstart', (e) => { e.preventDefault(); toggleVNEngine(); });
            }
            if (settingsButton) {
                settingsButton.addEventListener('click', openSettings);
                settingsButton.addEventListener('touchstart', (e) => { e.preventDefault(); openSettings(); });
            }
            SettingsManager.createModal();
            console.log("VN Engine: 비주얼 노벨 UI 및 제어판이 준비되었습니다.");
        },

        createInputModal() {
            const modalHTML = `
                <div id="${DOM_IDS.INPUT_MODAL}" class="vn-input-modal-overlay">
                    <div class="vn-input-modal-content">
                        <h3 class="vn-input-modal-title">메시지 입력</h3>
                        <textarea id="vn-modal-textarea" class="vn-modal-textarea" placeholder="여기에 메시지를 입력하세요..."></textarea>
                        <div class="vn-input-modal-buttons">
                            <button id="vn-modal-cancel" class="vn-modal-button-cancel">취소</button>
                            <button id="vn-modal-send" class="vn-modal-button-send">전송</button>
                        </div>
                    </div>
                </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            document.getElementById('vn-modal-send').addEventListener('click', () => this.sendMessage());
            document.getElementById('vn-modal-cancel').addEventListener('click', () => this.toggleInputModal(false));
            document.getElementById(DOM_IDS.INPUT_MODAL).addEventListener('click', (e) => { if (e.target.id === DOM_IDS.INPUT_MODAL) this.toggleInputModal(false); });
        },

        toggleInputModal(show) {
            const modal = document.getElementById(DOM_IDS.INPUT_MODAL);
            if (!modal) return;
            modal.style.display = show ? 'flex' : 'none';
            if (show) { document.getElementById('vn-modal-textarea').focus(); }
        },

    sendMessage() {
        const textarea = document.getElementById('vn-modal-textarea');
        const message = textarea.value.trim();
        if (!message) return;

        const wrtnTextarea = document.querySelector('textarea[placeholder="메시지 보내기"]');
        if (!wrtnTextarea) {
            alert("오류: WRTN의 메시지 입력창을 찾을 수 없습니다. 페이지 구조가 변경되었을 수 있습니다.");
            return;
        }

        const inputContainer = wrtnTextarea.parentElement?.parentElement;
        if (!inputContainer) {
            alert("오류: WRTN의 입력창 컨테이너를 찾을 수 없습니다. 페이지 구조가 변경되었을 수 있습니다.");
            return;
        }

        // [수정] 컨테이너 안의 '모든' 버튼을 찾습니다.
        const allButtons = inputContainer.querySelectorAll('button');
        if (!allButtons || allButtons.length === 0) {
            alert("오류: WRTN의 전송 버튼을 찾을 수 없습니다. (컨테이너에 버튼이 없음)");
            return;
        }

        // [핵심] 찾은 버튼 목록에서 '가장 마지막' 버튼을 진짜 전송 버튼으로 선택합니다.
        const wrtnSendButton = allButtons[allButtons.length - 1];

        // React가 입력 변경을 인지하도록 값을 설정하고 이벤트를 발생시킴
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        nativeInputValueSetter.call(wrtnTextarea, message);
        const event = new Event('input', { bubbles: true });
        wrtnTextarea.dispatchEvent(event);

        // React가 상태를 업데이트하여 버튼을 활성화할 시간을 아주 잠깐(50ms) 줍니다.
        setTimeout(() => {
            if (wrtnSendButton.disabled) {
                // 이 시점에도 비활성화되어 있다면 클릭이 안될 수 있지만, 일단 시도합니다.
                console.warn("VN Engine: 전송 버튼이 비활성화 상태이지만 클릭을 시도합니다.");
            }
            wrtnSendButton.click();
            textarea.value = '';
            this.toggleInputModal(false);
        }, 50);
    },
        toggleStatusWindow() {
            if (!this.elements.statusWindow) return;
            this.elements.statusWindow.classList.toggle('collapsed');
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
        const standingChars = this.activeCharacters.filter(c => c.mode === 'standing' && c.element);
        const container = this.elements.charContainer;
        const charCount = standingChars.length;

        if (charCount === 0) return;

        // --- [PC 로직 이식] 동적 겹침 계산 ---
        let overlapPercent;

        // 모바일은 화면이 좁으므로 PC보다 겹침 값을 더 크게 잡는 것이 좋습니다.
        const baseOverlap = 15; // 기본 겹침 (%)
        const additionalOverlapPerChar = 8; // 인원 추가 시 더 겹치게 할 값 (%)

        if (charCount <= 2) {
        overlapPercent = baseOverlap;
        } else {
        overlapPercent = 10 + (additionalOverlapPerChar * (charCount - 2));
        }

    // CSS에서 설정한 width와 맞춰야 합니다 (위에서 45%로 설정했으므로 여기도 45)
        const charWidth = 50;
        const stepWidth = charWidth - overlapPercent;
        const totalGroupWidth = (stepWidth * (charCount - 1)) + charWidth;

    // 화면 중앙 정렬을 위한 시작점 계산
        const startLeft = (100 - totalGroupWidth) / 2;

        standingChars.forEach((char, index) => {
            if (!char.element.parentElement) {
                container.appendChild(char.element);
        }

        // 계산된 위치(left) 적용
            const charLeft = startLeft + (index * stepWidth);
            char.element.style.left = `${charLeft}%`;

        // 등장 애니메이션
        if (parseFloat(char.element.style.opacity) === 0) {
            setTimeout(() => {
                char.element.style.opacity = 1;
                char.element.style.transform = 'translateY(0)';
            }, 50);
        }
    });
},
        applyAnimation(imgElement, url) { const filename = url.substring(url.lastIndexOf('/') + 1); const matchingRule = SettingsManager.settings.customAnimations.find(rule => filename.includes(rule.trigger)); if (matchingRule) { const animClass = `vn-anim-${matchingRule.animation}`; imgElement.classList.add(animClass); imgElement.addEventListener('animationend', () => { imgElement.classList.remove(animClass); }, { once: true }); } },
        getImageAspectRatio(url) { return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img.width / img.height); img.onerror = reject; img.src = url; }); },
        showEventCG(url, ownerId) { if (this.elements.eventCG) { this.elements.eventCG.dataset.ownerId = ownerId; this.elements.eventCG.src = url; this.elements.eventCG.classList.add('visible'); } },
        hideEventCG(ownerId) { if (this.elements.eventCG && this.elements.eventCG.dataset.ownerId === ownerId) { this.elements.eventCG.classList.remove('visible'); this.elements.eventCG.dataset.ownerId = ''; setTimeout(() => { if (!this.elements.eventCG.classList.contains('visible')) this.elements.eventCG.src = ''; }, 500); } },
        clearAllMultiCharacters() { if (this.elements.eventCG.classList.contains('visible')) { this.hideEventCG(this.elements.eventCG.dataset.ownerId); } this.activeCharacters.forEach(char => { if (char.element) char.element.remove(); }); this.activeCharacters = []; },

        // 로딩 아이콘을 켜고 끄는 함수입니다.
        // show가 true면 보이고(block), false면 숨깁니다(none).
        toggleLoadingIndicator(show) {
            const indicator = document.getElementById(DOM_IDS.LOADING_INDICATOR);
            if (indicator) {
                indicator.style.display = show ? 'block' : 'none';
            }
        },
        toggleUiEditMode(enable) {
            const targets = [this.elements.dialogueBox, this.elements.statusWindow, this.elements.charContainer, this.elements.statusToggle];
            const editButton = document.getElementById('vn-edit-ui-button');
            if (!editButton) return;
            if (!this._dragHandlers) { this._dragHandlers = new Map(); }
            if (enable) {
                this.showAll();
                editButton.textContent = '편집 완료';
                editButton.onclick = () => this.toggleUiEditMode(false);
                targets.forEach(el => {
                    if (el) {
                        el.classList.add('vn-ui-draggable');
                        const mousedownHandler = (e) => this.onDragStart(e, el);
                        const touchstartHandler = (e) => this.onDragStart(e, el);
                        this._dragHandlers.set(el, { mousedownHandler, touchstartHandler });
                        el.addEventListener('mousedown', mousedownHandler);
                        el.addEventListener('touchstart', touchstartHandler);
                    }
                });
            } else {
                editButton.textContent = '편집 시작';
                editButton.onclick = () => { SettingsManager.close(); this.toggleUiEditMode(true); };
                targets.forEach(el => {
                    if (el) {
                        el.classList.remove('vn-ui-draggable');
                        const handlers = this._dragHandlers.get(el);
                        if (handlers) {
                            el.removeEventListener('mousedown', handlers.mousedownHandler);
                            el.removeEventListener('touchstart', handlers.touchstartHandler);
                            this._dragHandlers.delete(el);
                        }
                    }
                });
                if (!isEngineActive) { this.hideAll(); }
            }
        },
        onDragStart(e, el, isClipHandle = false) {
            e.preventDefault(); e.stopPropagation();
            const event = this.getEventCoords(e);
            this.dragInfo = { element: el, offsetX: event.clientX - el.getBoundingClientRect().left, offsetY: event.clientY - el.getBoundingClientRect().top, isClipHandle: isClipHandle };
            el.style.transition = 'transform 0.1s ease-out, box-shadow 0.1s ease-out';
            el.style.transform = 'scale(1.02)';
            el.style.boxShadow = '0 0 20px rgba(0, 170, 255, 0.8)';
            document.addEventListener('mousemove', this.onDragMove.bind(this));
            document.addEventListener('touchmove', this.onDragMove.bind(this), { passive: false });
            document.addEventListener('mouseup', this.onDragEnd.bind(this));
            document.addEventListener('touchend', this.onDragEnd.bind(this));
        },
        onDragMove(e) {
            if (e.cancelable) e.preventDefault();
            if (!this.dragInfo.element) return;
            const event = this.getEventCoords(e);
            if (!event) return;
            let newLeft = event.clientX - this.dragInfo.offsetX;
            let newTop = event.clientY - this.dragInfo.offsetY;
            const snapThreshold = 20;
            const el = this.dragInfo.element;
            const rect = el.getBoundingClientRect();
            if (newLeft < snapThreshold) newLeft = 0;
            if (newTop < snapThreshold) newTop = 0;
            if (Math.abs(newLeft + rect.width - window.innerWidth) < snapThreshold) newLeft = window.innerWidth - rect.width;
            if (Math.abs(newTop + rect.height - window.innerHeight) < snapThreshold) newTop = window.innerHeight - rect.height;
            el.style.left = `${newLeft}px`;
            el.style.top = `${newTop}px`;
            if (!this.dragInfo.isClipHandle) {
                el.style.right = 'auto';
                el.style.bottom = 'auto';
            }
        },
        onDragEnd() {
            const draggedEl = this.dragInfo.element;
            if (!draggedEl) return;
            draggedEl.style.transform = 'scale(1)';
            draggedEl.style.boxShadow = 'none';
            setTimeout(() => { draggedEl.style.transition = ''; }, 100);
            if (this.dragInfo.isClipHandle) {
                const newRect = draggedEl.getBoundingClientRect();
                SettingsManager.settings.clipRect = { top: newRect.top, left: newRect.left, width: newRect.width, height: newRect.height };
            } else {
                const newPos = { top: `${draggedEl.style.top}`, left: `${draggedEl.style.left}`, transform: 'none' };
                if (draggedEl.id === DOM_IDS.DIALOGUE_BOX) SettingsManager.settings.dialogueBoxPos = newPos;
                else if (draggedEl.id === DOM_IDS.STATUS_WINDOW) SettingsManager.settings.statusWindowPos = newPos;
                else if (draggedEl.id === DOM_IDS.STATUS_TOGGLE) SettingsManager.settings.statusTogglePos = newPos;
                else if (draggedEl.id === DOM_IDS.CHAR_CONTAINER) SettingsManager.settings.characterContainerPos = newPos;
            }
            SettingsManager.save();
            this.dragInfo = {};
            document.removeEventListener('mousemove', this.onDragMove.bind(this));
            document.removeEventListener('touchmove', this.onDragMove.bind(this));
            document.removeEventListener('mouseup', this.onDragEnd.bind(this));
            document.removeEventListener('touchend', this.onDragEnd.bind(this));
        },
        showAll() { this.elements.container?.classList.add('visible'); },
        hideAll() { this.elements.container?.classList.remove('visible'); if (SettingsManager.settings.characterMode === 'multi') { this.clearAllMultiCharacters(); } else { this.updateSingleCharacter('off'); } },
        showBackButton() { if (this.elements.backButton) this.elements.backButton.style.display = 'block'; },
        hideBackButton() { if (this.elements.backButton) this.elements.backButton.style.display = 'none'; },
        parseCharacterInfoFromUrl(url) {
            if (!url || url.toLowerCase() === 'off') return null;
            const filename = url.substring(url.lastIndexOf('/') + 1).split('.')[0];
            // 아래 한 줄이 PC 버전과 동일하게 수정된 핵심 코드입니다.
            const match = filename.match(/^([a-zA-Z_]+[a-zA-Z])([0-9_].*)?$/) || filename.match(/^([a-zA-Z]+)([0-9_].*)?$/);
            if (match && match[1]) {
                return { id: match[1], fullId: filename };
            }
            return { id: filename, fullId: filename };
        },
        updateSingleCharacter(url) { const img = this.elements.cgSingle; if (!img) return; if (url.toLowerCase() === 'off') { img.classList.remove('visible'); setTimeout(() => { if (!img.classList.contains('visible')) img.src = ''; }, 300); } else { if (img.src !== url) { img.src = url; } if (!img.classList.contains('visible')) { img.classList.add('visible'); } } },
        applyCustomBackground() { const { characterMode, customBackgroundUrl } = SettingsManager.settings; if ((characterMode === 'single' || characterMode === 'internalImage') && customBackgroundUrl) this.updateBackgroundImage(customBackgroundUrl); },
        updateBackgroundImage(url) { if (this.elements.background && this.elements.background.style.backgroundImage !== `url("${url}")`) { this.elements.background.style.backgroundImage = `url("${url}")`; } },
        updateStatusWindow(text) {
            const { statusWindow } = this.elements;
            if (statusWindow) {
                statusWindow.textContent = text;
                if (text && text.trim() !== '') {
                    statusWindow.classList.remove('collapsed');
                }
            }
        },
        updateDialogueBox(character, text, isAction, typeCallback) { const { charName, dialogueText } = this.elements; if (!charName || !dialogueText) return; if (character) { charName.textContent = character; charName.style.display = 'inline-block'; } else { charName.style.display = 'none'; } dialogueText.className = isAction ? 'action-text' : ''; typeCallback(dialogueText, text); },
        getDialogueTextElement() { return this.elements.dialogueText; }
            ,createLogModal() {
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

    toggleLogModal(show) {
        const modal = document.getElementById(DOM_IDS.LOG_MODAL);
        if (!modal) return;

        if (show) {
            const body = document.getElementById('vn-log-modal-body');
            body.innerHTML = LogManager.render();
            modal.style.display = 'flex';
            // 모달을 연 후 스크롤을 맨 아래로 이동
            setTimeout(() => { body.scrollTop = body.scrollHeight; }, 0);
        } else {
            modal.style.display = 'none';
        }
    }
    };

// --- 데이터 패쳐 및 전역 로직 ---
    class PlatformMessage { constructor(id, role, content) { this.id = id; this.role = role; this.content = content; } }
    function extractCookie(key) { const e = document.cookie.match(new RegExp(`(?:^|; )${key.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1")}=([^;]*)`)); return e ? decodeURIComponent(e[1]) : null; }
    async function authFetch(method, url, body) { try { const param = { method: method, headers: { 'Authorization': `Bearer ${extractCookie("access_token")}`, 'Content-Type': 'application/json' } }; if (body) param.body = JSON.stringify(body); const result = await fetch(url, param); if (!result.ok) { return new Error(`HTTP 요청 실패 (${result.status})`); } return await result.json(); } catch (t) { return new Error(`알 수 없는 오류 (${t.message})`); } }
    class CrackMessageFetcher { constructor(chatId) { this.chatId = chatId; } async fetch(limit = 10) { const messages = []; const url = `https://contents-api.wrtn.ai/character-chat/v3/chats/${this.chatId}/messages?limit=${limit}`; const fetchResult = await authFetch("GET", url); if (fetchResult instanceof Error) throw fetchResult; const rawMessages = fetchResult.data?.list ?? fetchResult.data?.messages; if (!rawMessages) throw new Error("메시지를 가져오는 데 실패하였습니다."); for (let msg of rawMessages) { messages.push(new PlatformMessage(msg._id, msg.role, msg.content)); } return messages.reverse(); } }
    let lastMessageId = null, isChecking = false, isEngineActive = false;
    let pollingTimer = null, uiObserver = null;

// '생성 중지' 버튼(네모 아이콘)의 SVG 경로
    const UI_SELECTORS = {
        GENERATING_BTN: 'button svg path[d="M6 6h12v12H6Z"]'
};
    function getChatInfoFromUrl() {
        const pathname = window.location.pathname;
        const idPattern = /([a-f0-9]{24})/;
        let match;
        match = pathname.match(new RegExp("/episodes/" + idPattern.source));
        if (match) return { id: match[1], type: 'episode' };
        match = pathname.match(new RegExp("/chats/" + idPattern.source));
        if (match) return { id: match[1], type: 'chat' };
        match = pathname.match(new RegExp("/c/" + idPattern.source));
        if (match) return { id: match[1], type: 'chat' };
        return null;
    }
    async function adaptivePollingLoop() {
    if (!isEngineActive) return;

    // '생성 중' 버튼(멈춤 아이콘)이 있는지 확인
    const generatingBtn = document.querySelector(UI_SELECTORS.GENERATING_BTN);
    const isGenerating = !!generatingBtn;

    UIManager.toggleLoadingIndicator(isGenerating);


    // 생성 중이면 2초(고속), 아니면 10초(저속) 대기
    const nextInterval = isGenerating ? 2000 : 10000;

    // 메시지 확인 실행
    if (isGenerating) {
        await checkForNewMessages();
    }

    if (pollingTimer) clearTimeout(pollingTimer);
    pollingTimer = setTimeout(adaptivePollingLoop, nextInterval);
}

// 2. 버튼 상태 변화를 실시간으로 감시하는 옵저버 함수
    function startUiObserver() {
    if (uiObserver) return;

    const observerConfig = {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ['disabled', 'cursor', 'class']
    };

    uiObserver = new MutationObserver((mutations) => {
        const isMyOwnMutation = mutations.some(m =>
            m.target.id === DOM_IDS.LOADING_INDICATOR ||
           (m.target.parentElement && m.target.parentElement.id === DOM_IDS.DIALOGUE_BOX)
            );
            if (isMyOwnMutation) return;
        const generatingBtn = document.querySelector(UI_SELECTORS.GENERATING_BTN);
        // 생성 중 버튼이 갑자기 나타나면 즉시 루프를 재실행 (반응속도 향상)
        if (generatingBtn && pollingTimer) {
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
            const chatInfo = getChatInfoFromUrl();
            if (!chatInfo) return;
            const fetcher = new CrackMessageFetcher(chatInfo.id);
            const latestMessages = await fetcher.fetch(10);
            if (latestMessages.length === 0) return;
            if (lastMessageId === null) {
                lastMessageId = latestMessages[latestMessages.length - 1].id;
                return;
            }
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
        startUiObserver(); // [추가] 감시자 시작
        adaptivePollingLoop(); // [추가] 스마트 루프 시작
    }
}

function stopRealtimeChecker() {
    if (pollingTimer) clearTimeout(pollingTimer); // [변경] interval -> timeout
    pollingTimer = null;

    // [추가] 옵저버 해제
    if (uiObserver) {
        uiObserver.disconnect();
        uiObserver = null;
    }

    UIManager.toggleLoadingIndicator(false);

    lastMessageId = null;
    isChecking = false;
    StageManager.hide();
}
    function toggleVNEngine() {
        isEngineActive = !isEngineActive;
        const button = document.getElementById(DOM_IDS.START_BUTTON);
        if (button) {
            if (isEngineActive) {
                button.textContent = 'VN 종료';
                button.classList.add('active');
                startRealtimeChecker();
            } else {
                button.textContent = 'VN 시작';
                button.classList.remove('active');
                stopRealtimeChecker();
            }
        }
    }
    // --- 스크립트 초기화 ---
    console.log("Visual Novel Engine V1.5 (UI-Edit-Fix) 로드됨.");
    SettingsManager.load();
    UIManager.setup();
    let lastUrl = location.href; new MutationObserver(() => { const url = location.href; if (url !== lastUrl) { lastUrl = url; if(isEngineActive) { toggleVNEngine(); } } }).observe(document.body, { subtree: true, childList: true });

})();
