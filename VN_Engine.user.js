// ==UserScript==
// @name         Visual Novel Engine V3
// @namespace    http://tampermonkey.net/
// @version      3
// @description  향상된 몰입감을 위한 비주얼 노벨 UI 스크립트 입니다.
// @author       agetion(c3ak)
// @match        *://crack.wrtn.ai/*
// @connect      contents-api.wrtn.ai
// @connect      raw.githubusercontent.com
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
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


// --- 오디오 관리자 ---
    const AudioManager = {
        currentAudio: null,
        currentUrl: null,
        rules: [],

        loadRules(rules) { this.rules = rules || []; },

        // [신규] 볼륨 즉시 업데이트 함수
        updateVolume() {
            if (this.currentAudio && !this.currentAudio.paused) {
                this.currentAudio.volume = SettingsManager.settings.globalVolume;
            }
        },

        checkAndPlay(imageUrl) {
            if (!imageUrl || imageUrl === 'off') return;
            const filename = imageUrl.substring(imageUrl.lastIndexOf('/') + 1);
            const match = this.rules.find(rule => filename.includes(rule.trigger));
            if (match) {
                this.play(match.audioUrl);
            }
        },

        play(url) {
            if (this.currentUrl === url && this.currentAudio && !this.currentAudio.paused) return;
            if (this.currentAudio) {
                this.fadeOutAndStop(this.currentAudio);
            }
            this.currentUrl = url;
            const newAudio = new Audio(url);
            newAudio.loop = true;
            newAudio.volume = 0;
            const playPromise = newAudio.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    this.fadeIn(newAudio, SettingsManager.settings.globalVolume);
                    this.currentAudio = newAudio;
                }).catch(error => {
                    console.warn("VN Engine: BGM 재생 실패", error);
                });
            }
        },

        fadeIn(audio, targetVol) {
            let vol = 0;
            const timer = setInterval(() => {
                const maxVol = SettingsManager.settings.globalVolume;
                if (!audio || audio.paused) { clearInterval(timer); return; }
                vol += 0.05;
                if (vol >= maxVol) {
                    vol = maxVol;
                    audio.volume = vol;
                    clearInterval(timer);
                } else {
                    audio.volume = vol;
                }
            }, 100);
        },

        fadeOutAndStop(audio) {
            if (!audio) return;
            let vol = audio.volume;
            const timer = setInterval(() => {
                vol -= 0.05;
                if (vol <= 0) {
                    vol = 0;
                    audio.volume = 0;
                    audio.pause();
                    audio.currentTime = 0;
                    clearInterval(timer);
                } else {
                    audio.volume = vol;
                }
            }, 100);
        },

        // ★ [신규 추가] 모든 오디오 정지 함수
        stopAll() {
            if (this.currentAudio) {
                this.fadeOutAndStop(this.currentAudio); // 서서히 꺼짐
                this.currentAudio = null;
                this.currentUrl = null;
            }
        }
    };
    // [신규] URL에서 식별 ID 추출 (작품 ID 우선)
    function getCurrentTargetId() {
        const path = window.location.pathname;

        // 1순위: 작품(Story) ID (예: /stories/xxxx/episodes/...)
        const storyMatch = path.match(/\/stories\/([a-f0-9]{24})/);
        if (storyMatch) return { id: storyMatch[1], type: 'story', name: '작품' };

        // 2순위: 일반 채팅(Chat) ID
        const chatMatch = path.match(/\/chats\/([a-f0-9]{24})/);
        if (chatMatch) return { id: chatMatch[1], type: 'chat', name: '채팅방' };

        const cMatch = path.match(/\/c\/([a-f0-9]{24})/);
        if (cMatch) return { id: cMatch[1], type: 'chat', name: '채팅방' };

        return null;
    }

    // URL에서 Story ID를 추출하는 헬퍼 함수
    const getStoryId = () => {
        // /stories/ 와 /episodes/ 사이의 ID 추출
        const match = window.location.pathname.match(/\/stories\/([a-f0-9]+)/);
        // 만약 없으면 채팅방 ID라도 가져오도록 시도 (범용성)
        if (!match) {
            const chatMatch = window.location.pathname.match(/\/chats\/([a-f0-9]+)/);
            return chatMatch ? chatMatch[1] : 'unknown_id';
        }
        return match[1];
    };

    // --- 라이브러리 매니저 (수정됨: 오토 로드 기능 추가) ---
    const LibraryManager = {
        presets: [],
        lastLoadedId: null, // 중복 로드 방지용

        load() {
            const data = localStorage.getItem('vnEngineLibrary');
            try { this.presets = data ? JSON.parse(data) : []; } catch (e) { this.presets = []; }
        },

        save() {
            localStorage.setItem('vnEngineLibrary', JSON.stringify(this.presets));
            this.render();
        },

        addPreset(data, name = '', coverUrl = '') {
            const target = getCurrentTargetId(); // 현재 페이지 ID 가져오기
            const storyId = data.meta?.storyId || target?.id || 'unknown';
            const finalName = name || `Preset ${new Date().toLocaleDateString()}`;

            const newPreset = {
                id: Date.now().toString(),
                name: finalName,
                storyId: storyId, // 이 ID가 나중에 자동 매칭의 기준이 됩니다.
                coverUrl: coverUrl,
                data: {
                    animations: data.settings?.animations || data.customAnimations || [],
                    bgm: data.settings?.bgm || data.customBgmRules || [],
                    // [추가] 오프닝 스크립트 저장
                    opening: data.opening || SettingsManager.settings.openingScript || ""
                },
                createdAt: new Date().toISOString()
            };

            this.presets.unshift(newPreset);
            this.save();
            this.showToast(`✅ "${finalName}" 저장이 완료되었습니다.`);
        },

        deletePreset(id) {
            if(confirm("정말 이 프리셋을 삭제하시겠습니까?")) {
                this.presets = this.presets.filter(p => p.id !== id);
                this.save();
            }
        },

        updateCover(id) {
            const url = prompt("커버로 사용할 이미지 URL을 입력하세요:");
            if (url) {
                const preset = this.presets.find(p => p.id === id);
                if (preset) { preset.coverUrl = url; this.save(); }
            }
        },

    // [핵심] 설정을 실제 엔진에 적용하는 내부 함수
    _applySettingsData(data) {
        SettingsManager.settings.customAnimations = data.animations || [];
        SettingsManager.settings.customBgmRules = data.bgm || [];

        // [수정 시작] ---------------
        const rawOpening = data.opening;
        let finalScripts = [];

        if (Array.isArray(rawOpening)) {
            // 1. 배열 형태인 경우
            // ★ [핵심 로직] content가 존재하고, 공백을 제외한 길이가 0보다 큰 경우만 남깁니다.
            // 즉, 템플릿에 content: "" 로 비어있는 항목은 자동으로 걸러집니다.
            finalScripts = rawOpening.filter(item => item.content && item.content.trim().length > 0);

        } else if (typeof rawOpening === 'string' && rawOpening.trim() !== "") {
            // 2. 문자열 형태인 경우 (구형 호환)
            finalScripts = [{ title: "기본 오프닝", content: rawOpening }];
        }

        SettingsManager.settings.openingScripts = finalScripts;
        SettingsManager.save();

        // UI 및 엔진 갱신
        SettingsManager.renderAnimationRules();
        SettingsManager.renderBgmRules();
        AudioManager.loadRules(SettingsManager.settings.customBgmRules);
    },

    // UI에서 카트리지 클릭 시 호출 (수동 로드)
    applyPreset(id) {
        const preset = this.presets.find(p => p.id === id);
        if (!preset) return;

        if (confirm(`[${preset.name}] 설정을 적용하시겠습니까?`)) {
            this._applySettingsData(preset.data);
            this.lastLoadedId = preset.storyId; // 현재 로드된 ID 기억
            SettingsManager.close();
            this.showToast(`💿 "${preset.name}" 설정이 적용되었습니다.`);
        }
    },

    // [신규] URL 변경 시 자동 로드 체크 함수
    checkAutoLoad() {
        this.load(); // 최신 목록 로드
        const target = getCurrentTargetId(); // 현재 페이지 ID 가져오기
        if (!target || !target.id) return;

        // 이미 이 ID로 로드한 적이 있다면 중복 실행 방지
        if (this.lastLoadedId === target.id) return;

        // 현재 페이지의 작품 ID와 일치하는 프리셋 찾기
        const match = this.presets.find(p => p.storyId === target.id);

        if (match) {
            // 1. 매칭되는 프리셋이 있으면 -> 적용
            console.log(`VN Engine: Auto-loading preset for ${target.id}`);
            this._applySettingsData(match.data);
            this.showToast(`🔄 작품 ID 감지: "${match.name}" 설정이 적용되었습니다.`);
        } else {
            // 2. 매칭되는 프리셋이 없으면 -> ★ 콘텐츠 설정 초기화!
            // (이전 방에서 쓰던 설정이 넘어오지 않도록 방지)
            SettingsManager.resetContentSettings();

            // 토스트 메시지는 너무 자주 뜨면 귀찮을 수 있으니,
            // 필요하다면 아래 주석을 풀어주세요.
            this.showToast(` 등록된 설정이 없어 초기화되었습니다.`);
        }

        // 현재 로드된 ID 기억 (중복 실행 방지용)
        this.lastLoadedId = target.id;
    },

    // 토스트 메시지 표시 함수
    showToast(message) {
        let toast = document.getElementById('vn-toast-message');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'vn-toast-message';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.className = 'show';
        setTimeout(() => { toast.className = toast.className.replace('show', ''); }, 3000);
    },

    render() {
        const container = document.getElementById('vn-library-container');
        if (!container) return;

        if (this.presets.length === 0) {
            container.innerHTML = '<div class="vn-empty-msg">저장된 카트리지가 없습니다.<br>"+ 새로 만들기"로 현재 설정을 저장하거나<br>파일을 가져와보세요.</div>';
            return;
        }

        let html = '<div class="vn-library-grid">';
        this.presets.forEach(p => {
            const bgStyle = p.coverUrl ? `background-image: url('${p.coverUrl}');` : 'background: linear-gradient(45deg, #333, #555); display: flex; align-items: center; justify-content: center;';
            const noImgContent = p.coverUrl ? '' : '<span style="font-size: 2em;">💿</span>';

            html += `
                <div class="vn-cartridge">
                    <!-- [수정] onclick 제거, data-action 추가 -->
                    <div class="vn-cartridge-cover" style="${bgStyle}" data-action="load" data-id="${p.id}">
                        ${noImgContent}
                    </div>
                    <div class="vn-cartridge-info">
                        <div class="vn-cartridge-title" title="${p.name}">${p.name}</div>
                        <div class="vn-cartridge-id">ID: ${p.storyId.substring(0, 10)}...</div>
                        <div class="vn-cartridge-actions">
                             <!-- [수정] onclick 제거, data-action 추가 -->
                            <button class="vn-btn-sm vn-btn-del" data-action="delete" data-id="${p.id}">🗑 삭제</button>
                        </div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
    }
};
    window.LibraryManager = LibraryManager;

    // --- 설정 관리자 ---
    const SettingsManager = {
        defaults: {
            characterMode: 'multi', dialogueBoxPos: { bottom: '40px', left: '50%', transform: 'translateX(-50%)' },
            statusWindowPos: { top: '20px', right: '20px' }, characterContainerPos: { bottom: '0px', left: '0px' },
            backgroundPattern: '/g/', characterPattern: '/c/', customBackgroundUrl: '', customAnimations: [], customBgmRules: [],
            // globalVolume, typingSpeed 뒤에 openingScripts 배열로 변경
            globalVolume: 0.5, typingSpeed: 40,
            openingScripts: []
        },
        settings: {},
        load() {
            const savedSettings = localStorage.getItem('vnEngineSettings');
            this.settings = savedSettings ? JSON.parse(savedSettings) : { ...this.defaults };
            for (const key in this.defaults) { if (!this.settings.hasOwnProperty(key)) { this.settings[key] = this.defaults[key]; } }
            // 오디오 관리자에 규칙 로드
            if (this.settings.customBgmRules) { AudioManager.loadRules(this.settings.customBgmRules); }
        },
        save() { localStorage.setItem('vnEngineSettings', JSON.stringify(this.settings)); },

        resetContentSettings() {
            // 1. 설정값 비우기 (시스템 설정은 건드리지 않음)
            this.settings.customAnimations = [];
            this.settings.customBgmRules = [];
            this.settings.openingScripts = [];

            // 2. 변경된 빈 설정을 저장
            this.save();

            // 3. 설정창 UI도 빈 목록으로 갱신 (사용자가 설정창을 열었을 때 비어있도록)
            this.renderAnimationRules();
            this.renderBgmRules();

            // 4. 오디오 관리자 규칙도 비우기
            AudioManager.loadRules([]);

            console.log("VN Engine: 설정이 없어 초기 상태로 리셋되었습니다.");
        },

        // [UI 리메이크] 탭 구조(사이드바 + 컨텐츠) 적용
        createModal() {
            const animationOptions = Object.entries(ANIMATION_TYPES).map(([value, name]) => `<option value="${value}">${name}</option>`).join('');

            const modalHTML = `
            <div id="${DOM_IDS.SETTINGS_MODAL}" style="display: none; position: fixed; z-index: 100000; left: 0; top: 0; width: 100%; height: 100%; overflow: hidden; background-color: rgba(0,0,0,0.6); align-items: center; justify-content: center;">
                <div class="vn-modal-content" style="background-color: #2c2c2c; width: 850px; height: 650px; display: flex; border-radius: 10px; border: 1px solid #555; position: relative; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">

                    <!-- 닫기 버튼 -->
                    <span id="vn-modal-close" style="position: absolute; top: 15px; right: 20px; color: #aaa; font-size: 28px; font-weight: bold; cursor: pointer; z-index: 20;">&times;</span>

                    <!-- [왼쪽] 사이드바 탭 -->
                    <div class="vn-settings-sidebar" style="width: 180px; background-color: #222; border-right: 1px solid #444; padding-top: 60px; box-sizing: border-box;">
                        <div class="vn-tab-btn active" data-tab="vn-tab-general">🛠 일반 설정</div>
                        <div class="vn-tab-btn" data-tab="vn-tab-system">⚙ 환경 설정</div>
                        <!-- 라이브러리 탭 버튼 추가 -->
                        <div class="vn-tab-btn" data-tab="vn-tab-library">📚 라이브러리</div>
                    </div>

                    <!-- [오른쪽] 컨텐츠 영역 -->
                    <div class="vn-settings-body" style="flex: 1; padding: 40px; overflow-y: auto; color: white; font-family: 'Pretendard', sans-serif;">
                        <h2 style="margin-top: 0; border-bottom: 1px solid #555; padding-bottom: 15px; margin-bottom: 25px; font-size: 24px;">VN 엔진 설정</h2>

                        <!-- 탭 1: 일반 설정 (기존 기능들) -->
                        <div id="vn-tab-general" class="vn-tab-content active">

                            <!-- BGM 설정 -->
                            <div id="vn-bgm-section" class="vn-setting-option" style="margin-bottom: 30px;">
                                <label style="display: block; margin-bottom: 10px; font-weight: bold; color: #a2d2ff;">♫ BGM 설정 (이미지 키워드 매칭)</label>
                                <div class="vn-rule-list-container" style="height: 120px; overflow-y: auto; background-color: #333; padding: 10px; border-radius: 5px; margin-bottom: 10px; border: 1px solid #555;">
                                    <ul id="vn-bgm-rules-list" style="list-style: none; margin: 0; padding: 0;"></ul>
                                </div>
                                <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                                    <input type="text" id="vn-bgm-trigger" placeholder="파일명 키워드 (예: rain)" class="vn-pattern-input" style="flex: 1;">
                                    <input type="text" id="vn-bgm-url" placeholder="음악 URL (.mp3 등)" class="vn-pattern-input" style="flex: 2;">
                                    <button id="vn-add-bgm-btn" class="vn-modal-button">추가</button>
                                </div>
                            </div>

                            <hr style="border: 0; border-top: 1px solid #444; margin: 20px 0;">

                            <!-- 모드 선택 -->
                            <div class="vn-setting-option" style="margin-bottom: 20px;">
                                <label style="display: block; margin-bottom: 10px; font-weight: bold;">모드 선택</label>
                                <div style="display: flex; gap: 20px;">
                                    <div><input type="radio" id="vn-char-mode-single" name="characterMode" value="single"> <label for="vn-char-mode-single">범용 모드</label></div>
                                    <div><input type="radio" id="vn-char-mode-multi" name="characterMode" value="multi"> <label for="vn-char-mode-multi">비주얼챗 모드</label></div>
                                </div>
                            </div>

                            <!-- 사용자 배경 (범용) -->
                            <div id="vn-custom-bg-section" class="vn-setting-option" style="margin-bottom: 20px; display: none;">
                                <label style="display: block; margin-bottom: 10px; font-weight: bold;">사용자 지정 배경 (범용 모드용)</label>
                                <input type="text" id="vn-custom-bg-url-input" class="vn-pattern-input" placeholder="이미지 URL (https://...)">
                            </div>

                            <!-- URL 패턴 (멀티) -->
                            <div id="vn-multi-mode-section" class="vn-setting-option" style="display: none; margin-bottom: 20px;">
                                <label style="display: block; margin-bottom: 10px; font-weight: bold;">URL 패턴 설정 (비주얼챗 모드 전용)</label>
                                <input type="text" id="vn-bg-pattern-input" class="vn-pattern-input" placeholder="배경 키워드 (/g/)" style="margin-bottom: 5px;">
                                <input type="text" id="vn-char-pattern-input" class="vn-pattern-input" placeholder="캐릭터 키워드 (/c/)">
                            </div>

                            <!-- 사용자 연출 (멀티) -->
                            <div id="vn-custom-anim-section" class="vn-setting-option" style="margin-bottom: 20px; display: none;">
                                <label style="display: block; margin-bottom: 10px; font-weight: bold;">사용자 지정 연출 (비주얼챗 모드 전용)</label>
                                <div class="vn-anim-rule-list-container" style="height: 120px; overflow-y: auto; background-color: #333; padding: 10px; border-radius: 5px; margin-bottom: 10px; border: 1px solid #555;">
                                    <ul id="vn-animation-rules-list" style="list-style: none; margin: 0; padding: 0;"></ul>
                                </div>
                                <div class="vn-anim-add-form" style="display: flex; gap: 10px; margin-bottom: 10px;">
                                    <input type="text" id="vn-anim-trigger-input" placeholder="이미지 키워드" class="vn-pattern-input" style="flex: 2;">
                                    <select id="vn-anim-type-select" class="vn-pattern-input" style="flex: 1;">${animationOptions}</select>
                                    <button id="vn-add-anim-rule-btn" class="vn-modal-button">규칙 추가</button>
                                </div>
                                <div style="display: flex; gap: 10px;">
                                    <button id="vn-export-anim-btn" class="vn-modal-button" style="background-color: #444;">내보내기</button>
                                    <button id="vn-import-anim-btn" class="vn-modal-button" style="background-color: #444;">가져오기</button>
                                    <input type="file" id="vn-import-anim-input" style="display:none;" accept=".json">
                                </div>
                            </div>

                            <hr style="border: 0; border-top: 1px solid #444; margin: 20px 0;">

                            <div class="vn-setting-option">
                                <label style="display: block; margin-bottom: 10px; font-weight: bold;">UI 위치 편집</label>
                                <button id="vn-edit-ui-button" class="vn-modal-button" style="width: 100%;">화면 UI 편집 모드 시작</button>
                            </div>
                        </div>

                        <!-- 탭 2: 환경 설정 (신규 기능) -->
                        <div id="vn-tab-system" class="vn-tab-content">

                            <!-- 볼륨 조절 -->
                            <div class="vn-setting-option" style="margin-bottom: 40px; background: #333; padding: 20px; border-radius: 8px;">
                                <label style="display: block; margin-bottom: 15px; font-size: 1.1em; font-weight: bold;">
                                     BGM 음량 <span id="vn-vol-display" style="color:#a2d2ff; float:right;">50%</span>
                                </label>
                                <input type="range" id="vn-vol-slider" min="0" max="1" step="0.05" style="width: 100%; cursor: pointer;">
                            </div>

                            <!-- 텍스트 속도 조절 -->
                            <div class="vn-setting-option" style="margin-bottom: 40px; background: #333; padding: 20px; border-radius: 8px;">
                                <label style="display: block; margin-bottom: 15px; font-size: 1.1em; font-weight: bold;">
                                     텍스트 출력 속도 <span id="vn-speed-display" style="color:#a2d2ff; float:right;">보통</span>
                                </label>
                                <input type="range" id="vn-speed-slider" min="10" max="90" step="10" style="width: 100%; cursor: pointer; direction: rtl;">
                                <div style="display: flex; justify-content: space-between; font-size: 0.8em; color: #aaa; margin-top: 5px;">
                                    <span>느림</span>
                                    <span>빠름</span>
                                </div>
                            </div>

                        </div>
                        <!-- 탭 3: 라이브러리 (신규 추가) -->
                        <div id="vn-tab-library" class="vn-tab-content">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                                <h3 style="margin: 0; font-size: 1.2em; border-bottom: none;">📚 라이브러리</h3>
                                <button id="vn-library-add-btn" class="vn-modal-button" style="background-color: #28a745;">+ 새로 만들기</button>
                            </div>

                            <!-- 라이브러리 목록 컨테이너 -->
                            <div id="vn-library-container" style="background-color: #333; border-radius: 8px; padding: 20px; min-height: 300px; display: flex; flex-direction: column; gap: 10px; border: 1px solid #555;">
                                <div style="text-align: center; color: #888; margin-top: 100px;">
                                    저장된 라이브러리가 없습니다.
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>

            <style>
                .vn-tab-btn { padding: 15px 20px; color: #888; cursor: pointer; border-left: 4px solid transparent; transition: all 0.2s; font-weight: bold; font-size: 15px; margin-bottom: 5px; }
                .vn-tab-btn:hover { background-color: #2a2a2a; color: #ccc; }
                .vn-tab-btn.active { background-color: #2c2c2c; color: white; border-left: 4px solid #1a73e8; background: linear-gradient(90deg, rgba(26,115,232,0.1) 0%, rgba(0,0,0,0) 100%); }
                .vn-tab-content { display: none; }
                .vn-tab-content.active { display: block; animation: vn-slide-in 0.3s ease-out; }
                @keyframes vn-slide-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

                .vn-modal-button { background-color: #1a73e8; color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer; font-weight: bold; transition: background 0.2s; }
                .vn-modal-button:hover { background-color: #1765c7; }
                .vn-pattern-input { width: 100%; box-sizing: border-box; margin-top: 5px; padding: 8px; background-color: #444; color: white; border: 1px solid #666; border-radius: 4px; }

                /* 슬라이더 커스텀 스타일 */
                input[type=range] { -webkit-appearance: none; background: transparent; }
                input[type=range]:focus { outline: none; }
                input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; height: 24px; width: 24px; border-radius: 50%; background: #1a73e8; cursor: pointer; margin-top: -10px; border: 2px solid #fff; box-shadow: 0 2px 5px rgba(0,0,0,0.3); }
                input[type=range]::-webkit-slider-runnable-track { width: 100%; height: 6px; cursor: pointer; background: #555; border-radius: 3px; }

                /* --- 라이브러리 카트리지 스타일 (포스터 비율 적용) --- */
            .vn-library-grid {
                display: grid;
                /* 너비를 좁혀서 세로로 긴 느낌을 낼 수 있게 최소 너비를 줄임 (200px -> 160px) */
                grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
                gap: 20px;
                padding: 10px;
            }
            .vn-cartridge {
                background-color: #2a2a2a;
                border: 1px solid #444;
                border-radius: 8px;
                overflow: hidden;
                transition: transform 0.2s, box-shadow 0.2s;
                position: relative;
                display: flex;
                flex-direction: column;
                /* 그림자 효과 강화 */
                box-shadow: 0 4px 6px rgba(0,0,0,0.3);
            }
            .vn-cartridge:hover {
                transform: translateY(-8px);
                box-shadow: 0 12px 20px rgba(0,0,0,0.5);
                border-color: #1a73e8;
                z-index: 10;
            }
            .vn-cartridge-cover {
                /* [핵심] 높이를 대폭 늘려서 포스터 비율(약 2:3)을 만듦 */
                height: 240px;
                background-color: #1e1e1e;
                background-size: cover;
                background-position: center;
                position: relative;
                cursor: pointer;
                border-bottom: 1px solid #333;
            }
            .vn-cartridge-cover::after {
                content: '▶ Load';
                position: absolute;
                top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.6);
                display: flex; justify-content: center; align-items: center;
                color: white; font-weight: bold; font-size: 1.2em;
                opacity: 0; transition: opacity 0.2s;
                backdrop-filter: blur(2px);
            }
            .vn-cartridge-cover:hover::after { opacity: 1; }

            .vn-cartridge-info { padding: 10px; flex: 1; display: flex; flex-direction: column; }
            .vn-cartridge-title { font-weight: bold; margin-bottom: 5px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .vn-cartridge-id { font-size: 0.8em; color: #aaa; margin-bottom: 8px; font-family: monospace; }
            .vn-cartridge-actions { margin-top: auto; display: flex; gap: 5px; }
            .vn-btn-sm { flex: 1; border: none; padding: 5px; border-radius: 4px; cursor: pointer; font-size: 0.8em; color: white; transition: background 0.2s; }
            .vn-btn-img { background-color: #555; } .vn-btn-img:hover { background-color: #666; }
            .vn-btn-del { background-color: #c72c2c; } .vn-btn-del:hover { background-color: #a00000; }
            .vn-empty-msg { text-align: center; color: #888; margin-top: 50px; width: 100%; }
            </style>`;

            document.body.insertAdjacentHTML('beforeend', modalHTML); this.setupModalEventListeners();
        },

        setupModalEventListeners() {
            const self = this;
            document.getElementById('vn-modal-close').onclick = () => self.close();

            // --- 탭 전환 로직 (신규) ---
            const tabBtns = document.querySelectorAll('.vn-tab-btn');
            tabBtns.forEach(btn => {
                btn.onclick = () => {
                    // 모든 탭 비활성화
                    document.querySelectorAll('.vn-tab-btn').forEach(b => b.classList.remove('active'));
                    document.querySelectorAll('.vn-tab-content').forEach(c => c.classList.remove('active'));
                    // 클릭한 탭 활성화
                    btn.classList.add('active');
                    document.getElementById(btn.dataset.tab).classList.add('active');
                };
            });

            // --- 볼륨 슬라이더 이벤트 (신규) ---
            const volSlider = document.getElementById('vn-vol-slider');
            const volDisplay = document.getElementById('vn-vol-display');
            volSlider.oninput = (e) => {
                const val = parseFloat(e.target.value);
                self.settings.globalVolume = val;
                volDisplay.textContent = Math.round(val * 100) + "%";
                self.save();
                AudioManager.updateVolume(); // 오디오 매니저에 즉시 반영
            };

            // --- 텍스트 속도 슬라이더 이벤트 (신규) ---
            const speedSlider = document.getElementById('vn-speed-slider');
            const speedDisplay = document.getElementById('vn-speed-display');
            speedSlider.oninput = (e) => {
                const val = parseInt(e.target.value);
                self.settings.typingSpeed = val;

                let text = "보통";
                if (val <= 20) text = "매우 빠름";
                else if (val <= 40) text = "빠름";
                else if (val >= 70) text = "느림";

                speedDisplay.textContent = text + ` (${val}ms)`;
                self.save();
            };

            // --- 기존 설정들의 이벤트 핸들러 유지 ---
            document.querySelectorAll('input[name="characterMode"]').forEach(radio => { radio.onchange = (e) => { self.settings.characterMode = e.target.value; self.save(); self.toggleModalSections(); }; });
            document.getElementById('vn-edit-ui-button').onclick = () => { self.close(); UIManager.toggleUiEditMode(true); };
            document.getElementById('vn-custom-bg-url-input').oninput = (e) => { self.settings.customBackgroundUrl = e.target.value; self.save(); };
            document.getElementById('vn-bg-pattern-input').oninput = (e) => { self.settings.backgroundPattern = e.target.value; self.save(); };
            document.getElementById('vn-char-pattern-input').oninput = (e) => { self.settings.characterPattern = e.target.value; self.save(); };

            // 애니메이션 추가 버튼
            document.getElementById('vn-add-anim-rule-btn').onclick = () => { const trigger = document.getElementById('vn-anim-trigger-input').value.trim(); const animation = document.getElementById('vn-anim-type-select').value; if (!trigger) { alert('트리거 단어를 입력해주세요.'); return; } self.settings.customAnimations.push({ id: Date.now(), trigger, animation }); self.save(); self.renderAnimationRules(); document.getElementById('vn-anim-trigger-input').value = ''; };

            // 내보내기 (Export) 버튼 로직 수정
            document.getElementById('vn-export-anim-btn').onclick = () => {
                const coverUrl = prompt("내보낼 파일에 저장할 '커버 이미지 URL'을 입력하세요 (선택사항):", "") || "";

                // 템플릿용 예시 데이터 생성
                const templateOpening = [
                    {
                        "title": "예시: 학교 복도 (제목을 수정하세요)",
                        "content": "이곳에 오프닝 시나리오를 마크다운 형식으로 작성하세요."
                    },
                    {
                        "title": "예시: 방과 후 (사용하지 않으면 이 항목을 지우거나 content를 비우세요)",
                        "content": ""
                    }
                ];

                const exportData = {
                    meta: {
                        storyId: getCurrentTargetId()?.id || 'manual',
                        exportDate: new Date().toISOString(),
                        version: "2.5", // 버전 업데이트
                        coverUrl: coverUrl
                    },
                    settings: {
                        animations: self.settings.customAnimations || [],
                        bgm: self.settings.customBgmRules || []
                    },
                    // ★ [핵심] 빈 배열 대신 템플릿 배열을 넣어줍니다.
                    opening: templateOpening
                };

                const dataStr = JSON.stringify(exportData, null, 2);
                const blob = new Blob([dataStr], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `vn_preset_${exportData.meta.storyId}_template.json`; // 파일명에 template 표시
                a.click();
                URL.revokeObjectURL(url);
            };

            // BGM 추가 버튼
            document.getElementById('vn-add-bgm-btn').onclick = () => {
                const trigger = document.getElementById('vn-bgm-trigger').value.trim();
                const url = document.getElementById('vn-bgm-url').value.trim();
                if (!trigger || !url) { alert('트리거 단어와 오디오 URL을 모두 입력해주세요.'); return; }
                if (!self.settings.customBgmRules) self.settings.customBgmRules = [];
                self.settings.customBgmRules.push({ id: Date.now(), trigger, audioUrl: url });
                self.save();
                self.renderBgmRules();
                AudioManager.loadRules(self.settings.customBgmRules);
                document.getElementById('vn-bgm-trigger').value = '';
                document.getElementById('vn-bgm-url').value = '';
            };

            // --- [신규] 라이브러리 "+ 새로 만들기" 버튼 ---
            const addLibBtn = document.getElementById('vn-library-add-btn');
            if (addLibBtn) {
                addLibBtn.onclick = () => {
                    const name = prompt("이 설정(프리셋)의 이름을 입력해주세요:", "나의 설정");
                    if (name === null) return;

                    const currentData = {
                        meta: { storyId: getCurrentTargetId()?.id || 'manual' },
                        settings: {
                            animations: self.settings.customAnimations || [],
                            bgm: self.settings.customBgmRules || []
                        }
                    };

                    const coverUrl = prompt("커버 이미지 URL이 있다면 입력해주세요 (취소 시 기본값):", "");
                    LibraryManager.addPreset(currentData, name, coverUrl || '');
                    document.querySelector('[data-tab="vn-tab-library"]').click();
                };
            }

            // --- [수정됨] 통합 가져오기 (Import) ---
            const importInput = document.getElementById('vn-import-anim-input');
            const importBtn = document.getElementById('vn-import-anim-btn');

            if (importBtn && importInput) {
                importBtn.onclick = () => importInput.click();

                // 파일 가져오기 (파일명을 카트리지 이름으로 사용)
                importInput.onchange = (e) => {
                    const file = e.target.files[0];
                    if (!file) return;

                    const reader = new FileReader();
                    reader.onload = (event) => {
                        try {
                            let importedData;
                            try { importedData = JSON.parse(event.target.result); }
                            catch (jsonErr) { throw new Error("JSON 파일 형식이 올바르지 않습니다."); }

                            const isNewFormat = importedData.settings && importedData.meta;
                            const isOldFormat = Array.isArray(importedData);

                            if (!isNewFormat && !isOldFormat) throw new Error("VN Engine 설정 파일이 아닙니다.");

                            const fileNameWithoutExt = file.name.replace(/\.json$/i, '');
                            const defaultName = fileNameWithoutExt;
                            const savedCoverUrl = importedData.meta?.coverUrl || "";

                            // [중요] 오프닝 데이터 추출 (파일에 없으면 빈 문자열)
                            const openingData = importedData.opening || "";

                            if (confirm(`파일을 읽었습니다!\n파일명: ${file.name}\n\n[확인] -> '라이브러리'에 저장합니다.\n[취소] -> 저장 안 하고 '즉시 적용'합니다.`)) {
                                // 라이브러리에 저장
                                LibraryManager.addPreset(importedData, defaultName, savedCoverUrl);
                                document.querySelector('[data-tab="vn-tab-library"]').click();
                            } else {
                                // [취소] -> 즉시 적용 모드
                                if (isNewFormat) {
                                    self.settings.customAnimations = importedData.settings.animations || [];
                                    self.settings.customBgmRules = importedData.settings.bgm || [];

                                    // ★★★ [이 부분이 빠져 있었습니다] 오프닝 즉시 적용 ★★★
                                    self.settings.openingScript = openingData;
                                } else if (isOldFormat) {
                                    self.settings.customAnimations = importedData;
                                }

                                self.save(); // 저장
                                self.renderAnimationRules();
                                self.renderBgmRules();
                                AudioManager.loadRules(self.settings.customBgmRules);

                                // 오프닝 유무 알려주기
                                if(self.settings.openingScript) {
                                    alert('설정이 적용되었습니다.\n(오프닝이 포함되어 있습니다. VN 시작 시 재생됩니다.)');
                                } else {
                                    alert('설정이 적용되었습니다.');
                                }
                            }
                        } catch (err) {
                            console.error(err);
                            alert('오류: ' + err.message);
                        }
                    };
                    reader.readAsText(file);
                    importInput.value = '';
                };
            }
            // [신규] 라이브러리 클릭 이벤트 연결 (삭제/로드 버튼 작동용)
            // HTML의 onclick 대신 자바스크립트로 직접 이벤트를 처리합니다.
            const libContainer = document.getElementById('vn-library-container');
            if (libContainer) {
                libContainer.onclick = (e) => {
                    // 클릭된 요소가 액션 버튼(또는 커버)인지 확인
                    const target = e.target.closest('[data-action]');
                    if (!target) return;

                    const action = target.dataset.action;
                    const id = target.dataset.id;

                    if (action === 'delete') {
                        LibraryManager.deletePreset(id);
                    } else if (action === 'load') {
                        LibraryManager.applyPreset(id);
                    }
                };
            }
        },


        renderAnimationRules() {
            const listElement = document.getElementById('vn-animation-rules-list'); if (!listElement) return; listElement.innerHTML = '';
            this.settings.customAnimations.forEach(rule => { const li = document.createElement('li'); li.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 5px; border-bottom: 1px solid #444;'; li.innerHTML = `<span><strong style="color: #a2d2ff;">${rule.trigger}</strong> → ${ANIMATION_TYPES[rule.animation] || rule.animation}</span><button class="vn-delete-rule-btn" data-id="${rule.id}" style="background: #c70000; color: white; border: none; border-radius: 3px; cursor: pointer; padding: 2px 6px;">삭제</button>`; listElement.appendChild(li); });
            listElement.querySelectorAll('.vn-delete-rule-btn').forEach(btn => { btn.onclick = (e) => { const ruleId = Number(e.target.dataset.id); this.settings.customAnimations = this.settings.customAnimations.filter(r => r.id !== ruleId); this.save(); this.renderAnimationRules(); }; });
        },

        renderBgmRules() {
            const listElement = document.getElementById('vn-bgm-rules-list'); if (!listElement) return; listElement.innerHTML = '';
            const rules = this.settings.customBgmRules || [];
            rules.forEach(rule => {
                const li = document.createElement('li');
                li.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 5px; border-bottom: 1px solid #444;';
                const shortUrl = rule.audioUrl.length > 30 ? rule.audioUrl.substring(0, 27) + '...' : rule.audioUrl;
                li.innerHTML = `<span><strong style="color: #ff9e9e;">${rule.trigger}</strong> ♪ ${shortUrl}</span><button class="vn-delete-bgm-btn" data-id="${rule.id}" style="background: #c70000; color: white; border: none; border-radius: 3px; cursor: pointer; padding: 2px 6px;">삭제</button>`;
                listElement.appendChild(li);
            });
            listElement.querySelectorAll('.vn-delete-bgm-btn').forEach(btn => {
                btn.onclick = (e) => {
                    const ruleId = Number(e.target.dataset.id);
                    this.settings.customBgmRules = this.settings.customBgmRules.filter(r => r.id !== ruleId);
                    this.save();
                    this.renderBgmRules();
                    AudioManager.loadRules(this.settings.customBgmRules);
                };
            });
        },

        toggleModalSections() { const selectedMode = this.settings.characterMode; document.getElementById('vn-custom-bg-section').style.display = (selectedMode === 'single' || selectedMode === 'internalImage') ? 'block' : 'none'; document.getElementById('vn-multi-mode-section').style.display = (selectedMode === 'multi') ? 'block' : 'none'; document.getElementById('vn-custom-anim-section').style.display = (selectedMode === 'multi') ? 'block' : 'none'; },

        open() {
            // [수정] 창 열 때 모달 표시 방식을 flex로 변경 (중앙 정렬 위함)
            document.getElementById(DOM_IDS.SETTINGS_MODAL).style.display = 'flex';

            // 기존 설정값들 복원
            document.querySelector(`input[name="characterMode"][value="${this.settings.characterMode}"]`).checked = true;
            document.getElementById('vn-custom-bg-url-input').value = this.settings.customBackgroundUrl;
            document.getElementById('vn-bg-pattern-input').value = this.settings.backgroundPattern;
            document.getElementById('vn-char-pattern-input').value = this.settings.characterPattern;

            // [신규] 슬라이더 값 복원
            const vol = this.settings.globalVolume !== undefined ? this.settings.globalVolume : 0.5;
            document.getElementById('vn-vol-slider').value = vol;
            document.getElementById('vn-vol-display').textContent = Math.round(vol * 100) + "%";

            const speed = this.settings.typingSpeed !== undefined ? this.settings.typingSpeed : 40;
            document.getElementById('vn-speed-slider').value = speed;
            let text = "보통";
            if (speed <= 20) text = "매우 빠름"; else if (speed <= 40) text = "빠름"; else if (speed >= 70) text = "느림";
            document.getElementById('vn-speed-display').textContent = text + ` (${speed}ms)`;

            this.toggleModalSections();
            this.renderAnimationRules();
            this.renderBgmRules();
            // 창을 열 때 라이브러리 데이터를 불러오고 화면을 그립니다.
            LibraryManager.load();
            LibraryManager.render();
        },
        close() { document.getElementById(DOM_IDS.SETTINGS_MODAL).style.display = 'none'; },
    };

    // --- [신규] 세션 ID 추출 헬퍼 ---
    // URL의 맨 뒤에 있는 ID(세션 ID)를 가져옵니다.
    function getCurrentSessionId() {
        const path = window.location.pathname;
        // 예: .../episodes/693e93e06029d526c1767aad -> 693e93e06029d526c1767aad 추출
        // 예: .../chats/abcde... -> abcde... 추출
        const match = path.match(/\/([a-f0-9]{24})$/);
        return match ? match[1] : null;
    }

    // --- [신규] 오프닝 시청 기록 관리자 ---
    const OpeningHistoryManager = {
        storageKey: 'vnOpeningHistory', // 저장소 키 이름
        history: [], // 본 세션 ID 목록

        load() {
            try {
                const data = localStorage.getItem(this.storageKey);
                this.history = data ? JSON.parse(data) : [];
            } catch (e) {
                this.history = [];
            }
        },

        save() {
            localStorage.setItem(this.storageKey, JSON.stringify(this.history));
        },

        // 해당 세션 ID가 이미 기록에 있는지 확인
        hasSeen(sessionId) {
            if (!sessionId) return false;
            return this.history.includes(sessionId);
        },

        // 해당 세션 ID를 '봄'으로 처리하고 저장
        markAsSeen(sessionId) {
            if (!sessionId) return;
            if (!this.history.includes(sessionId)) {
                this.history.push(sessionId);
                this.save();
                console.log(`VN Engine: 세션(${sessionId}) 오프닝 시청 기록 저장됨.`);
            }
        }
    };

    // 스크립트 시작 시 기록 불러오기
    OpeningHistoryManager.load();

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
                transition: opacity 0.4s, transform 0.4s, left 0.4s ease-in-out, filter 0.4s ease-in-out;
                transform-origin: bottom center;
            }
            .vn-character-slot.speaking {
                transform: scale(1.05);
                z-index: 10;
            }
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
             characterStyles = `#${DOM_IDS.CHAR_CONTAINER} { ${posToCss(settings.characterContainerPos)} position: absolute; width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; pointer-events: none; z-index: 2; }
             .vn-character-cg { max-width: 100%; max-height: 100%; object-fit: contain; transition: opacity 0.3s ease-in-out, transform 0.3s ease-in-out; opacity: 0; transform: scale(0.95); }
             .vn-character-cg.visible { opacity: 1; transform: scale(1); }`;
        }

        return `
            /* [수정] 설정 모달을 최상단으로 올림 (탭 메뉴 가림 방지) */
            #${DOM_IDS.SETTINGS_MODAL} { z-index: 200000 !important; }

            /* [추가] 슬라이더(Range Input) 공통 스타일 */
            input[type=range] { -webkit-appearance: none; background: transparent; }
            input[type=range]:focus { outline: none; }

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
                top: -38px;
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
                display: none;
                position: absolute;
                bottom: 100%;
                left: 0;
                width: 100%;
                background-color: #2c2c2c;
                border: 1px solid #555;
                border-bottom: none;
                border-radius: 8px 8px 0 0;
                padding: 8px;
                box-sizing: border-box;
                z-index: 20;
                flex-direction: row;
                align-items: center;
                gap: 10px;
                box-shadow: 0 -4px 10px rgba(0,0,0,0.2);
            }
            .vn-input-modal-content { display: flex; flex-direction: row; width: 100%; gap: 10px; background: transparent; box-shadow: none; padding: 0; }
            .vn-input-modal-title { display: none; }
            .vn-modal-textarea {
                flex-grow: 1; height: 36px; box-sizing: border-box; padding: 8px 10px;
                background-color: #444; color: white; border: 1px solid #666; border-radius: 4px;
                resize: none; font-size: 0.95em; font-family: inherit; line-height: 1.2;
            }
            .vn-modal-textarea:focus { outline: 1px solid #1a73e8; }
            .vn-input-modal-buttons { display: flex; gap: 5px; flex-shrink: 0; }
            .vn-modal-button-cancel { background-color: #555; color: white; border: none; border-radius: 4px; padding: 0 12px; height: 36px; cursor: pointer; font-weight: bold; font-size: 13px; }
            .vn-modal-button-send { background-color: #1a73e8; color: white; border: none; border-radius: 4px; padding: 0 15px; height: 36px; cursor: pointer; font-weight: bold; font-size: 13px; }
            .vn-modal-button-send:hover { background-color: #1765c7; }
            .vn-modal-button-cancel:hover { background-color: #666; }

            #${DOM_IDS.LOG_BUTTON} {
                position: absolute; top: -38px; right: 95px; z-index: 5;
                background-color: #555; color: white; border: 1px solid #777; border-radius: 6px;
                padding: 6px 15px; font-size: 14px; font-weight: bold; cursor: pointer;
                box-shadow: 0 2px 5px rgba(0,0,0,0.3); transition: background-color 0.2s; pointer-events: auto;
            }
            #${DOM_IDS.LOG_BUTTON}:hover { background-color: #666; }

            #${DOM_IDS.LOADING_INDICATOR} {
                position: absolute; top: 15px; right: 20px; width: 24px; height: 24px;
                border: 3px solid rgba(255, 255, 255, 0.3); border-radius: 50%; border-top-color: #fff;
                animation: vn-spin 1s ease-in-out infinite; z-index: 4; display: none;
            }
            @keyframes vn-spin { to { transform: rotate(360deg); } }

            #${DOM_IDS.BACK_BUTTON} { position: absolute; bottom: 15px; right: 20px; font-size: 2em; color: #888; cursor: pointer; transition: color 0.2s; display: none; }
            #${DOM_IDS.BACK_BUTTON}:hover { color: #ccc; }
            .vn-ui-draggable { border: 2px dashed #00aaff !important; cursor: move !important; user-select: none; pointer-events: auto !important; }
            .vn-log-modal-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.7); z-index: 100002; justify-content: center; align-items: center; }
            .vn-log-modal-content { display: flex; flex-direction: column; background-color: #2c2c2c; padding: 25px; border-radius: 10px; width: 800px; max-width: 90%; height: 80vh; box-shadow: 0 5px 15px rgba(0,0,0,0.5); color: white; }
            .vn-log-modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
            .vn-log-modal-title { margin: 0; font-size: 1.5em; }
            .vn-log-modal-close { font-size: 2em; font-weight: bold; color: #aaa; cursor: pointer; }
            .vn-log-modal-body { flex-grow: 1; overflow-y: auto; padding-right: 15px; }
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
                30% { transform: rotate(-5deg); }
                50% { transform: rotate(5deg); }
                100% { transform: rotate(-90deg) translateY(10px); }
            }
            .vn-anim-fall-left {
                transform-origin: bottom center;
                animation: fall-left 2s ease-in forwards;
            }

            /* --- 토스트 알림 메시지 --- */
            #vn-toast-message {
                visibility: hidden;
                min-width: 250px;
                background-color: rgba(50, 50, 50, 0.9);
                color: #fff;
                text-align: center;
                border-radius: 50px;
                padding: 16px;
                position: fixed;
                z-index: 100001;
                left: 50%;
                bottom: 30px;
                transform: translateX(-50%);
                font-size: 15px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                border: 1px solid #1a73e8;
                opacity: 0;
                transition: opacity 0.5s, bottom 0.5s;
            }
            #vn-toast-message.show {
                visibility: visible;
                opacity: 1;
                bottom: 50px;
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
        type(element, text) {
            element.classList.add('typing-effect');
            this.isTyping = true;
            let i = 0;
            element.innerHTML = '';

            // [수정] 설정된 타이핑 속도 사용 (기본값 40)
            const speed = SettingsManager.settings.typingSpeed || 40;

            this.typingTimer = setInterval(() => {
                if (i < text.length) {
                    element.innerHTML += text.charAt(i);
                    i++;
                } else {
                    this.skipTyping();
                }
            }, speed);
        },
        skipTyping() { clearInterval(this.typingTimer); this.isTyping = false; const dialogueElement = UIManager.getDialogueTextElement(); if (dialogueElement) dialogueElement.classList.remove('typing-effect'); const cue = this.cueSheet[this.currentIndex]; if (cue && (cue.type === 'action' || cue.type === 'dialogue')) { dialogueElement.innerHTML = this.formatText(cue.content).replace(/\n/g, '<br>'); } },
        async processCue(cue) {
            switch (cue.type) {
                case 'character_update':
                    await UIManager.updateCharacter(cue.url, cue.characterId);
                    this.next();
                    break;
                case 'background_image':
                    UIManager.updateBackgroundImage(cue.url);
                    // 배경 변경 시 BGM 체크
                    AudioManager.checkAndPlay(cue.url);
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
        parsers: [
            { condition: () => SettingsManager.settings.characterMode === 'multi', regex: /^!\[([a-zA-Z0-9_]+)\]\((off)\)$/, handler: match => ({ type: 'character_update', url: 'off', characterId: match[1] }) },
            { condition: () => SettingsManager.settings.characterMode === 'multi', regex: /^!\[\]\((.*?)\)$/, handler: match => { const url = match[1].trim(); const { backgroundPattern, characterPattern } = SettingsManager.settings; if (backgroundPattern && url.includes(backgroundPattern)) return { type: 'background_image', url }; if (characterPattern && url.includes(characterPattern)) return { type: 'character_update', url }; return { type: 'character_update', url }; } },

            // [수정됨] 범용 모드: ![]() 뿐만 아니라 ![설명]() 포함 모든 마크다운 이미지를 잡아서 중앙에 띄움
            { condition: () => SettingsManager.settings.characterMode === 'single' || SettingsManager.settings.characterMode === 'internalImage', regex: /^!\[.*?\]\((.*?)\)$/, handler: match => { const url = match[1].trim(); return { type: 'character_update', url: url }; } },
            { regex: /^"?\*\*(.*?)\*\*\s*[|｜]\s*(.*?)"?$/, handler: match => ({ type: 'dialogue', character: match[1].trim(), content: match[2].trim() }) },
            { regex: /^\*(.*)\*$/, handler: match => ({ type: 'action', content: match[1].trim() }) }
        ],
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
        updateSingleCharacter(url) { const img = this.elements.cgSingle; if (!img) return; if (url.toLowerCase() === 'off') { img.classList.remove('visible'); setTimeout(() => { if (!img.classList.contains('visible')) img.src = ''; }, 300); } else { if (img.src !== url) { img.src = url; } if (!img.classList.contains('visible')) { img.classList.add('visible'); } AudioManager.checkAndPlay(url); } },
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
        showOpeningSelectionModal(scripts, onSelect) {
    // 기존 모달 제거 (중복 방지)
    const oldModal = document.getElementById('vn-opening-select-modal');
    if (oldModal) oldModal.remove();

    // 버튼 목록 생성
    let buttonsHtml = '';
    scripts.forEach((script, index) => {
        // 제목이 비어있으면 내용 앞부분을 잘라서 제목으로 사용
        const title = script.title || (script.content.substring(0, 20) + "...");
        buttonsHtml += `<button class="vn-opening-option-btn" data-index="${index}">${title}</button>`;
    });

    // 모달 HTML 구조
    const modalHtml = `
        <div id="vn-opening-select-modal" style="
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.85); z-index: 200001;
            display: flex; align-items: center; justify-content: center;
            flex-direction: column; color: white; font-family: 'Pretendard', sans-serif;">

            <div style="background: #2c2c2c; padding: 30px; border-radius: 12px; border: 1px solid #555; width: 400px; max-width: 90%; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                <h2 style="margin-top: 0; margin-bottom: 20px; color: #a2d2ff;">시작 설정 선택</h2>
                <p style="color: #ccc; margin-bottom: 20px; font-size: 0.9em;">원하는 오프닝 시나리오를 선택해주세요.</p>

                <div style="display: flex; flex-direction: column; gap: 10px; max-height: 300px; overflow-y: auto;">
                    ${buttonsHtml}
                </div>

                <hr style="border: 0; border-top: 1px solid #444; margin: 20px 0;">

                <button id="vn-opening-skip-btn" style="
                    background: transparent; border: 1px solid #666; color: #aaa;
                    padding: 8px 16px; border-radius: 6px; cursor: pointer; width: 100%;">
                    선택 안 함 (바로 시작)
                </button>
            </div>
        </div>
        <style>
            .vn-opening-option-btn {
                background: #444; color: white; border: none; padding: 12px;
                border-radius: 6px; cursor: pointer; font-size: 1.1em; text-align: left;
                transition: background 0.2s, transform 0.1s;
            }
            .vn-opening-option-btn:hover { background: #1a73e8; transform: translateX(5px); }
        </style>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = document.getElementById('vn-opening-select-modal');

    // 오프닝 버튼 클릭 이벤트
    modal.querySelectorAll('.vn-opening-option-btn').forEach(btn => {
        btn.onclick = () => {
            const index = parseInt(btn.dataset.index);
            modal.remove();
            onSelect(scripts[index]); // 선택된 스크립트 객체 전달
        };
    });

    // 스킵 버튼 클릭 이벤트
    document.getElementById('vn-opening-skip-btn').onclick = () => {
        modal.remove();
        onSelect(null); // 선택 없음
    };
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
    function authFetch(method, url, body) {
        return new Promise((resolve, reject) => {
            const headers = {
                'Authorization': `Bearer ${extractCookie("access_token")}`,
                'Content-Type': 'application/json'
            };

            GM_xmlhttpRequest({
                method: method,
                url: url,
                headers: headers,
                data: body ? JSON.stringify(body) : null,
                onload: function(response) {
                    if (response.status >= 200 && response.status < 300) {
                        try {
                            const result = JSON.parse(response.responseText);
                            resolve(result);
                        } catch (e) {
                            reject(new Error("JSON 파싱 실패"));
                        }
                    } else {
                        reject(new Error(`HTTP 요청 실패 (${response.status})`));
                    }
                },
                onerror: function(err) {
                    reject(new Error(`네트워크 오류: ${err.statusText || '알 수 없음'}`));
                }
            });
        });
    }
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
        }, 2000);
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
                // [VN 시작 상태]
                button.textContent = 'VN 종료';
                button.classList.add('active');

                // ★ [핵심 변경] 오프닝 여부와 상관없이 실시간 감지부터 즉시 시작합니다.
                // (오류로 오프닝이 멈춰도 감지기는 계속 돌아갑니다)
                console.log("VN Engine: 실시간 감지 루프를 즉시 시작합니다.");
                startRealtimeChecker();

                // --- 오프닝 재생 로직 (멀티 오프닝 대응) ---
                const openingScripts = SettingsManager.settings.openingScripts || [];
                const sessionId = getCurrentSessionId(); // 현재 세션 ID

                // 오프닝 재생 조건: 스크립트 있음 AND (세션ID 없거나 OR 안 본 세션임)
                const hasSeen = sessionId && OpeningHistoryManager.hasSeen(sessionId);

                // 오프닝 재생 헬퍼 함수
                const playOpening = (scriptContent) => {
                    console.log("VN Engine: 오프닝 재생 시작");
                    if (sessionId) OpeningHistoryManager.markAsSeen(sessionId); // 시청 기록 저장
                    StageManager.start(scriptContent);
                };

                if (openingScripts.length > 0 && !hasSeen) {
                    if (openingScripts.length === 1) {
                         // 1. 오프닝이 1개일 때 -> 기존처럼 바로 재생
                         playOpening(openingScripts[0].content);
                    } else {
                        // 2. 오프닝이 2개 이상일 때 -> 선택 모달 띄우기
                        UIManager.showOpeningSelectionModal(openingScripts, (selectedScript) => {
                            if (selectedScript) {
                                playOpening(selectedScript.content);
                            } else {
                                console.log("VN Engine: 오프닝 선택 취소 (바로 시작)");
                                // 선택 안 함을 눌러도, 다음에 또 묻지 않으려면 '본 것'으로 처리 (취향따라 삭제 가능)
                                if (sessionId) OpeningHistoryManager.markAsSeen(sessionId);
                            }
                        });
                    }
                } else {
                    console.log("VN Engine: 오프닝 없음 또는 이미 시청함 -> 스킵");
                }
                // [수정 끝] -----------------

            } else {
                // [VN 종료 상태]
                button.textContent = 'VN 시작';
                button.classList.remove('active');

                stopRealtimeChecker();
                StageManager.hide();
                AudioManager.stopAll(); // 음악도 같이 끔

                // [수정 시작] ---------------
                // 혹시 선택창이 떠 있다면 닫기
                const modal = document.getElementById('vn-opening-select-modal');
                if (modal) modal.remove();
                // [수정 끝] -----------------
            }
        }
    }

    // --- 스크립트 초기화 및 URL 감지 ---
    console.log("Visual Novel Engine V3 Beta 로드됨.");
    SettingsManager.load();
    UIManager.setup();

// --- URL 감지 및 자동 로드 ---
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            // [간결화된 ID 추출] URL에서 숫자+영어 24자리(ID)만 쏙 뽑아냅니다.
            const getId = (u) => (u.match(/[a-f0-9]{24}/) || [])[0];
            const oldId = getId(lastUrl);
            const newId = getId(url);

            lastUrl = url; // 주소 업데이트

            // [핵심 조건] 엔진이 켜져있고 + 이전 ID도 있었고 + 새 ID도 있는데 + 둘이 다르면? -> 방 이동으로 판단!
            if (isEngineActive && oldId && newId && oldId !== newId) {
                toggleVNEngine();
            }

            setTimeout(() => LibraryManager.checkAutoLoad(), 500);
        }
    }).observe(document.body, { subtree: true, childList: true });

})();
