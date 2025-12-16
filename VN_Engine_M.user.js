// ==UserScript==
// @name         Visual Novel Engine V2.0_mobile
// @namespace    http://tampermonkey.net/
// @version      2.0-mobile-beta
// @description  향상된 몰입감을 위한 비주얼 노벨 UI 스크립트의 모바일 버전 입니다.
// @author       agetion(c3ak)
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
        'bounce': '통통 튀기', 'vibrate': '진동하기', 'fall-left': '왼쪽으로 털썩'
    };

    // [신규] 오디오 관리자
    const AudioManager = {
        currentAudio: null,
        currentUrl: null,
        rules: [],
        isUnlocked: false, // 오디오 잠금 해제 여부 확인용

        loadRules(rules) { this.rules = rules || []; },

        // ★ [핵심] 모바일 브라우저 오디오 잠금 해제 함수
        unlock() {
            if (this.isUnlocked) return;

            // 0.1초짜리 빈 소리를 만들어서 재생 시도
            const dummy = new Audio();
            // 아주 짧은 무음 데이터 URI
            dummy.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAGZGF0YQQAAAAAAA==';

            dummy.play().then(() => {
                this.isUnlocked = true;
                console.log("VN Engine: 모바일 오디오 시스템 잠금 해제됨");
            }).catch(e => {
                console.log("VN Engine: 오디오 잠금 해제 실패 (아직 터치 안함)", e);
            });
        },

        updateVolume() {
            if (this.currentAudio && !this.currentAudio.paused) {
                this.currentAudio.volume = SettingsManager.settings.globalVolume || 0.5;
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
            // 이미 같은 노래가 재생 중이면 무시
            if (this.currentUrl === url && this.currentAudio && !this.currentAudio.paused) return;

            // 기존 노래 끄기
            if (this.currentAudio) { this.fadeOutAndStop(this.currentAudio); }

            this.currentUrl = url;
            const newAudio = new Audio(url);
            newAudio.loop = true;
            newAudio.volume = 0;

            // ★ 재생 시도
            const playPromise = newAudio.play();

            if (playPromise !== undefined) {
                playPromise.then(() => {
                    this.fadeIn(newAudio, SettingsManager.settings.globalVolume || 0.5);
                    this.currentAudio = newAudio;
                }).catch(e => {
                    console.warn("BGM 재생 차단됨. (화면을 터치하면 해결될 수 있음)", e);
                    // 차단되었을 경우, 다음 터치 이벤트를 기다렸다가 재생 시도하는 로직 추가 가능
                });
            }
        },

        fadeIn(audio, targetVol) {
            let vol = 0;
            const timer = setInterval(() => {
                if (!audio || audio.paused) { clearInterval(timer); return; }
                vol += 0.05;
                if (vol >= targetVol) {
                    audio.volume = targetVol;
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
                    audio.volume = 0;
                    audio.pause();
                    audio.currentTime = 0;
                    clearInterval(timer);
                } else {
                    audio.volume = vol;
                }
            }, 100);
        },

        stopAll() {
            if (this.currentAudio) {
                this.fadeOutAndStop(this.currentAudio);
                this.currentAudio = null;
                this.currentUrl = null;
            }
        }
    };

    // [수정] URL 정보 추출 헬퍼 (강화됨)
    function getCurrentTargetId() {
        const path = window.location.pathname;
        // 1순위: 작품 ID
        const storyMatch = path.match(/\/stories\/([a-f0-9]{24})/);
        if (storyMatch) return { id: storyMatch[1], type: 'story' };

        // 2순위: 채팅방 ID
        const chatMatch = path.match(/\/(?:chats|c)\/([a-f0-9]{24})/);
        if (chatMatch) return { id: chatMatch[1], type: 'chat' };

        return { id: 'manual', type: 'unknown' };
    }
    // [수정] 라이브러리 매니저 (완성형)
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

        // 카트리지 추가
        addPreset(data, name = '', coverUrl = '') {
            const target = getCurrentTargetId();
            const finalName = name || `설정 ${new Date().toLocaleDateString()}`;

            const newPreset = {
                id: Date.now().toString(),
                name: finalName,
                storyId: target.id,
                coverUrl: coverUrl,
                data: {
                    animations: data.settings?.animations || [],
                    bgm: data.settings?.bgm || [],

                    // [추가] 오프닝 데이터 저장
                    opening: data.opening || ""
                },
                createdAt: new Date().toISOString()
            };

            // 목록 맨 앞에 추가
            this.presets.unshift(newPreset);
            this.save();
            // 토스트 메시지 (모바일은 alert보다 이게 나음)
            this.showToast(`💾 "${finalName}" 저장됨`);
        },

        deletePreset(id) {
            if(confirm("이 설정을 삭제하시겠습니까?")) {
                this.presets = this.presets.filter(p => p.id !== id);
                this.save();
            }
        },

        // 설정 적용 (수동/자동 공용)
        _applyData(data) {
            SettingsManager.settings.customAnimations = data.animations || [];
            SettingsManager.settings.customBgmRules = data.bgm || [];

            // [수정 시작] ---------------
            // 오프닝 데이터 파싱 로직 (문자열 -> 배열 호환성 처리)
            const rawOpening = data.opening;
            let finalScripts = [];

            if (Array.isArray(rawOpening)) {
                // 1. 배열 형태 (신규 V3 포맷)
                finalScripts = rawOpening;
            } else if (typeof rawOpening === 'string' && rawOpening.trim() !== "") {
                // 2. 문자열 형태 (구형 V1 포맷)
                finalScripts = [{ title: "기본 오프닝", content: rawOpening }];
            }
            // 3. 없으면 빈 배열

            SettingsManager.settings.openingScripts = finalScripts;
            // [수정 끝] -----------------

            SettingsManager.save();
            // UI 및 엔진 갱신
            SettingsManager.renderAnimationRules();
            SettingsManager.renderBgmRules();
            AudioManager.loadRules(SettingsManager.settings.customBgmRules);
        },

        // (수동) 로드 버튼 클릭 시
        applyPreset(id) {
            const preset = this.presets.find(p => p.id === id);
            if (!preset) return;

            if (confirm(`[${preset.name}] 설정을 불러올까요?`)) {
                this._applyData(preset.data);
                this.lastLoadedId = preset.storyId;
                SettingsManager.close();
                this.showToast(`💿 설정 로드 완료`);
            }
        },

        // (자동) URL 변경 시 호출됨
        checkAutoLoad() {
            this.load(); // 최신 목록 불러오기
            const target = getCurrentTargetId();
            if (!target.id || target.id === 'manual') return;

            // 이미 로드한 방이면 패스
            if (this.lastLoadedId === target.id) return;

            // 현재 방 ID와 일치하는 프리셋 찾기
            const match = this.presets.find(p => p.storyId === target.id);

            if (match) {
                console.log(`VN Engine: Auto-loading preset for ${target.id}`);
                this._applyData(match.data);
                this.showToast(`🔄 저장된 설정 불러옴: "${match.name}"`);
            } else {
                // 저장된 게 없으면? -> 이전 방 설정이 남지 않게 초기화!
                SettingsManager.settings.customAnimations = [];
                SettingsManager.settings.customBgmRules = [];
                SettingsManager.save();
                SettingsManager.renderAnimationRules();
                SettingsManager.renderBgmRules();
                AudioManager.loadRules([]);
                // this.showToast(` 새 방: 설정 초기화됨`);
            }
            this.lastLoadedId = target.id;
        },

        showToast(msg) {
            let toast = document.getElementById('vn-toast');
            if(!toast) {
                toast = document.createElement('div');
                toast.id = 'vn-toast';
                toast.style.cssText = 'position:fixed; bottom:80px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.8); color:white; padding:10px 20px; border-radius:20px; z-index:200000; font-size:14px; opacity:0; transition:0.3s; pointer-events:none; border:1px solid #555;';
                document.body.appendChild(toast);
            }
            toast.textContent = msg;
            toast.style.opacity = 1;
            setTimeout(() => { toast.style.opacity = 0; }, 2000);
        },

        render() {
            const container = document.getElementById('vn-library-container');
            if (!container) return;
            if (this.presets.length === 0) {
                container.innerHTML = '<div style="text-align:center; color:#888; padding:30px 0; font-size:13px;">저장된 카트리지가 없습니다.<br>현재 설정을 저장해보세요.</div>';
                return;
            }

            let html = '<div class="vn-library-grid">';
            this.presets.forEach(p => {
                // 커버 이미지가 없으면 기본 그라데이션
                const bgStyle = p.coverUrl ? `background-image: url('${p.coverUrl}');` : 'background: linear-gradient(135deg, #444, #222);';
                const icon = p.coverUrl ? '' : '<div style="font-size:24px;">💿</div>';

                html += `
                    <div class="vn-cartridge">
                        <div class="vn-cartridge-cover" style="${bgStyle}" data-action="load" data-id="${p.id}">
                            ${icon}
                            <div class="vn-cartridge-load-overlay">LOAD</div>
                        </div>
                        <div class="vn-cartridge-info">
                            <div class="vn-cartridge-title">${p.name}</div>
                            <div class="vn-cartridge-meta">${p.storyId.substring(0,6)}...</div>
                            <button class="vn-btn-del" data-action="delete" data-id="${p.id}">삭제</button>
                        </div>
                    </div>`;
            });
            html += '</div>';
            container.innerHTML = html;
        }
    };
    window.LibraryManager = LibraryManager; // 전역 접근 허용

    // [신규] 세션 ID 추출 헬퍼 (오프닝 기록용)
    function getCurrentSessionId() {
        const path = window.location.pathname;
        // 채팅방 ID (24자리)가 경로 맨 뒤에 있는지 확인
        const match = path.match(/\/([a-f0-9]{24})$/);
        return match ? match[1] : null;
    }

    // [신규] 오프닝 시청 기록 관리자
    const OpeningHistoryManager = {
        storageKey: 'vnOpeningHistory',
        history: [],
        load() {
            try {
                const data = localStorage.getItem(this.storageKey);
                this.history = data ? JSON.parse(data) : [];
            } catch (e) { this.history = []; }
        },
        save() { localStorage.setItem(this.storageKey, JSON.stringify(this.history)); },

        hasSeen(sessionId) {
            if (!sessionId) return false;
            return this.history.includes(sessionId);
        },
        markAsSeen(sessionId) {
            if (!sessionId) return;
            if (!this.history.includes(sessionId)) {
                this.history.push(sessionId);
                this.save();
                console.log(`VN Engine: 세션(${sessionId}) 오프닝 시청 기록 저장됨.`);
            }
        }
    };
    OpeningHistoryManager.load();

    // --- 설정 관리자 --- (변경 없음)
    const SettingsManager = {
        defaults: {
            characterMode: 'multi', dialogueBoxPos: { bottom: '40px', left: '50%', transform: 'translateX(-50%)' },
            statusWindowPos: { top: '20px', right: '20px' },
            statusTogglePos: { top: '20px', right: '20px' },
            characterContainerPos: { bottom: '0px', left: '0px' },
            backgroundPattern: '/g/', characterPattern: '/c/', clipRect: null, customBackgroundUrl: '', customAnimations: [],
            customBgmRules: [], // [추가됨]
            openingScript: "",
            globalVolume: 0.5, typingSpeed: 40,
            openingScripts: []
        },
        settings: {},
        load() {
            const savedSettings = localStorage.getItem('vnEngineSettings');
            this.settings = savedSettings ? JSON.parse(savedSettings) : { ...this.defaults };
            for (const key in this.defaults) { if (!this.settings.hasOwnProperty(key)) { this.settings[key] = this.defaults[key]; } }
            // [추가됨] 오디오 규칙 로드
            if (this.settings.customBgmRules) AudioManager.loadRules(this.settings.customBgmRules);
        },
        save() { localStorage.setItem('vnEngineSettings', JSON.stringify(this.settings)); },

        createModal() {
            const animationOptions = Object.entries(ANIMATION_TYPES).map(([value, name]) => `<option value="${value}">${name}</option>`).join('');

            // 탭 구조가 적용된 새로운 모달 HTML
            const modalHTML = `
            <div id="${DOM_IDS.SETTINGS_MODAL}" style="display: none; position: fixed; z-index: 100000; left: 0; top: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.8); align-items: center; justify-content: center;">
                <div class="vn-modal-content">
                    <span id="vn-modal-close">&times;</span>

                    <!-- 좌측 사이드바 탭 -->
                    <div class="vn-settings-sidebar">
                        <div class="vn-tab-btn active" data-tab="vn-tab-general">일반</div>
                        <div class="vn-tab-btn" data-tab="vn-tab-system">환경</div>
                        <div class="vn-tab-btn" data-tab="vn-tab-library">저장소</div>
                    </div>

                    <!-- 우측 컨텐츠 영역 -->
                    <div class="vn-settings-body">
                        <h2 style="margin-top:0; border-bottom:1px solid #444; padding-bottom:10px;">설정</h2>

                        <!-- [탭 1] 일반 설정 -->
                        <div id="vn-tab-general" class="vn-tab-content active">
                            <div class="vn-setting-option">
                                <label style="font-weight:bold;">모드 선택</label><br>
                                <input type="radio" id="vn-m-single" name="characterMode" value="single"> <label for="vn-m-single">범용</label>
                                <input type="radio" id="vn-m-multi" name="characterMode" value="multi" style="margin-left:10px;"> <label for="vn-m-multi">비주얼챗</label>
                            </div>

                            <div id="vn-custom-bg-section" class="vn-setting-option" style="display:none;">
                                <label>배경 URL</label>
                                <input type="text" id="vn-custom-bg-url-input" class="vn-pattern-input" placeholder="https://...">
                            </div>

                            <div id="vn-multi-mode-section" class="vn-setting-option" style="display:none;">
                                <label>감지 패턴</label>
                                <input type="text" id="vn-bg-pattern-input" class="vn-pattern-input" placeholder="배경 (/g/)">
                                <input type="text" id="vn-char-pattern-input" class="vn-pattern-input" placeholder="캐릭터 (/c/)" style="margin-top:5px;">
                            </div>

                            <div id="vn-custom-anim-section" class="vn-setting-option" style="display:none;">
                                <label>연출 규칙</label>
                                <div class="vn-anim-rule-list-container">
                                    <ul id="vn-animation-rules-list" style="padding-left:0; margin:0;"></ul>
                                </div>
                                <div style="display:flex; gap:5px; margin-top:5px;">
                                    <input type="text" id="vn-anim-trigger-input" placeholder="키워드" class="vn-pattern-input">
                                    <select id="vn-anim-type-select" class="vn-pattern-input" style="width:100px;">${animationOptions}</select>
                                    <button id="vn-add-anim-rule-btn" class="vn-modal-button">추가</button>
                                </div>
                            </div>
                            <!-- [추가] BGM 설정 섹션 -->
                            <div class="vn-setting-option">
                                <label class="vn-label">BGM 규칙 (배경 연동)</label>
                                <div class="vn-rule-list-wrapper">
                                    <ul id="vn-bgm-rules-list" style="padding:0; margin:0;"></ul>
                                </div>
                                <div style="display:flex; gap:5px; margin-top:5px; flex-direction: column;">
                                    <input type="text" id="vn-bgm-trigger" placeholder="배경 키워드 (예: school)" class="vn-pattern-input">
                                    <input type="text" id="vn-bgm-url" placeholder="음악 URL (.mp3)" class="vn-pattern-input">
                                    <button id="vn-add-bgm-btn" class="vn-modal-button" style="width:100%;">규칙 추가</button>
                                </div>
                            </div>

                            <div class="vn-setting-option" style="margin-top:20px;">
                                <button id="vn-edit-ui-button" class="vn-modal-button" style="width:100%;">UI 위치 편집</button>
                            </div>
                        </div>

                        <!-- [탭 2] 환경 설정 -->
                        <div id="vn-tab-system" class="vn-tab-content">
                            <div class="vn-setting-option">
                                <label>텍스트 속도 <span id="vn-speed-display" style="float:right; color:#a2d2ff;">40ms</span></label>
                                <input type="range" id="vn-speed-slider" min="10" max="90" step="10" style="width:100%;">
                            </div>
                            <!-- 볼륨 기능은 나중에 오디오 매니저 추가 시 작동 -->
                            <div class="vn-setting-option">
                                <label>볼륨 (준비중) <span id="vn-vol-display" style="float:right; color:#a2d2ff;">50%</span></label>
                                <input type="range" id="vn-vol-slider" min="0" max="1" step="0.1" style="width:100%;">
                            </div>
                        </div>

                        <!-- [탭 3] 라이브러리 -->
                        <div id="vn-tab-library" class="vn-tab-content">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                                <span>설정 저장소</span>
                                <button id="vn-library-add-btn" class="vn-modal-button small" style="background:#28a745;">+ 저장</button>
                            </div>
                            <div id="vn-library-container" style="background:#333; padding:10px; border-radius:5px; min-height:150px;"></div>

                            <!-- [추가] 파일 가져오기 섹션 -->
                            <div style="margin-top: 15px; border-top: 1px solid #444; padding-top: 15px;">
                                <label class="vn-label" style="color:#aaa;">외부 설정 파일 (.json)</label>
                                <button id="vn-import-file-btn" class="vn-modal-button" style="width:100%; background-color:#555;">설정 파일 불러오기</button>
                                <input type="file" id="vn-import-file-input" style="display:none;" accept=".json">
                            </div>
                        </div> <!-- vn-tab-library 닫는 태그 -->

                        </div>
                    </div>
                </div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHTML); this.setupModalEventListeners();
        },

        setupModalEventListeners() {
            const self = this;
            document.getElementById('vn-modal-close').onclick = () => self.close();

            // 탭 전환 로직
            document.querySelectorAll('.vn-tab-btn').forEach(btn => {
                btn.onclick = () => {
                    document.querySelectorAll('.vn-tab-btn').forEach(b => b.classList.remove('active'));
                    document.querySelectorAll('.vn-tab-content').forEach(c => c.classList.remove('active'));
                    btn.classList.add('active');
                    document.getElementById(btn.dataset.tab).classList.add('active');
                };
            });

            // 환경설정 슬라이더
            const speedSlider = document.getElementById('vn-speed-slider');
            speedSlider.oninput = (e) => {
                self.settings.typingSpeed = parseInt(e.target.value);
                document.getElementById('vn-speed-display').textContent = self.settings.typingSpeed + 'ms';
                self.save();
            };
            const volSlider = document.getElementById('vn-vol-slider');
            volSlider.oninput = (e) => {
                self.settings.globalVolume = parseFloat(e.target.value);
                document.getElementById('vn-vol-display').textContent = Math.round(self.settings.globalVolume*100) + '%';
                self.save();
                AudioManager.updateVolume(); // [추가] 즉시 볼륨 반영
            };

            // [추가] BGM 규칙 추가 버튼
            document.getElementById('vn-add-bgm-btn').onclick = () => {
                const trigger = document.getElementById('vn-bgm-trigger').value.trim();
                const url = document.getElementById('vn-bgm-url').value.trim();
                if (!trigger || !url) { alert("키워드와 URL을 모두 입력하세요"); return; }

                if (!self.settings.customBgmRules) self.settings.customBgmRules = [];
                self.settings.customBgmRules.push({ id: Date.now(), trigger, audioUrl: url });
                self.save();
                self.renderBgmRules();
                AudioManager.loadRules(self.settings.customBgmRules);

                document.getElementById('vn-bgm-trigger').value = '';
                document.getElementById('vn-bgm-url').value = '';
            };

            // 라이브러리 추가 시 (숨겨진 오프닝 데이터도 같이 저장)
            document.getElementById('vn-library-add-btn').onclick = () => {
                const name = prompt("설정 이름을 입력하세요:", "나의 설정");
                if(name) {
                    LibraryManager.addPreset({
                        settings: {
                            animations: self.settings.customAnimations,
                            bgm: self.settings.customBgmRules
                        },
                        // 현재 메모리에 있는 오프닝 스크립트를 같이 넘김
                        opening: self.settings.openingScript
                    }, name);
                }
            };

            // 기존 이벤트 연결
            document.querySelectorAll('input[name="characterMode"]').forEach(radio => { radio.onchange = (e) => { self.settings.characterMode = e.target.value; self.save(); self.toggleModalSections(); }; });
            document.getElementById('vn-edit-ui-button').onclick = () => { self.close(); UIManager.toggleUiEditMode(true); };
            document.getElementById('vn-custom-bg-url-input').oninput = (e) => { self.settings.customBackgroundUrl = e.target.value; self.save(); };
            document.getElementById('vn-bg-pattern-input').oninput = (e) => { self.settings.backgroundPattern = e.target.value; self.save(); };
            document.getElementById('vn-char-pattern-input').oninput = (e) => { self.settings.characterPattern = e.target.value; self.save(); };
            document.getElementById('vn-add-anim-rule-btn').onclick = () => { const trigger = document.getElementById('vn-anim-trigger-input').value.trim(); const animation = document.getElementById('vn-anim-type-select').value; if (!trigger) return; self.settings.customAnimations.push({ id: Date.now(), trigger, animation }); self.save(); self.renderAnimationRules(); document.getElementById('vn-anim-trigger-input').value = ''; };
        // [추가] 파일 가져오기 (Import) 로직
            const importInput = document.getElementById('vn-import-file-input');
            const importBtn = document.getElementById('vn-import-file-btn');

            if (importBtn && importInput) {
                importBtn.onclick = () => importInput.click();

                importInput.onchange = (e) => {
                    const file = e.target.files[0];
                    if (!file) return;

                    const reader = new FileReader();
                    reader.onload = (event) => {
                        try {
                            let importedData;
                            try { importedData = JSON.parse(event.target.result); }
                            catch (err) { throw new Error("JSON 형식이 아닙니다."); }

                            // 데이터 형식 판별 (V3 객체형 vs V1 배열형)
                            const isV3 = importedData.settings && importedData.meta;
                            const isV1 = Array.isArray(importedData);

                            if (!isV3 && !isV1) throw new Error("올바른 VN 설정 파일이 아닙니다.");

                            // 데이터 추출
                            let finalData = {
                                animations: [], bgm: [], opening: []
                            };

                            if (isV3) {
                                finalData.animations = importedData.settings.animations || [];
                                finalData.bgm = importedData.settings.bgm || [];
                                const rawOp = importedData.opening;
                                if (Array.isArray(rawOp)) finalData.opening = rawOp;
                                else if (typeof rawOp === 'string' && rawOp.trim() !== "") finalData.opening = [{title:"기본", content:rawOp}];
                            } else if (isV1) {
                                finalData.animations = importedData; // 구버전은 애니메이션만 있음
                            }

                            // 사용자 선택
                            if (confirm(`파일: ${file.name}\n\n[확인] -> '저장소'에 카트리지로 저장\n[취소] -> 저장 안 하고 '즉시 적용'`)) {
                                // 1. 라이브러리에 저장
                                const name = file.name.replace('.json', '');
                                LibraryManager.addPreset({
                                    settings: { animations: finalData.animations, bgm: finalData.bgm },
                                    opening: finalData.opening
                                }, name);
                            } else {
                                // 2. 즉시 적용
                                self.settings.customAnimations = finalData.animations;
                                self.settings.customBgmRules = finalData.bgm;
                                self.settings.openingScripts = finalData.opening; // [변경] openingScripts에 저장

                                self.save();
                                self.renderAnimationRules();
                                self.renderBgmRules();
                                AudioManager.loadRules(self.settings.customBgmRules);

                                alert("설정이 현재 화면에 적용되었습니다.");
                            }

                        } catch (err) {
                            alert('가져오기 실패: ' + err.message);
                        }
                    };
                    reader.readAsText(file);
                    importInput.value = ''; // 초기화
                };
            }
                        // 라이브러리 컨테이너 이벤트 위임 (삭제 및 로드 버튼 활성화)
            const libContainer = document.getElementById('vn-library-container');
            if (libContainer) {
                // 이벤트 중복 방지를 위해 기존 요소를 복제하여 교체
                const newLibContainer = libContainer.cloneNode(true);
                libContainer.parentNode.replaceChild(newLibContainer, libContainer);

                newLibContainer.addEventListener('click', (e) => {
                    // 삭제 버튼인지 확인
                    if (e.target.dataset.action === 'delete') {
                        LibraryManager.deletePreset(e.target.dataset.id);
                    }
                    // 로드(커버) 영역인지 확인
                    const loadTarget = e.target.closest('[data-action="load"]');
                    if (loadTarget) {
                        LibraryManager.applyPreset(loadTarget.dataset.id);
                    }
                });
            }
        },

        renderAnimationRules() {
            const listElement = document.getElementById('vn-animation-rules-list'); if (!listElement) return; listElement.innerHTML = '';
            this.settings.customAnimations.forEach(rule => { const li = document.createElement('li'); li.style.cssText = 'display: flex; justify-content: space-between; padding: 5px; border-bottom: 1px solid #444; font-size:13px;'; li.innerHTML = `<span><b>${rule.trigger}</b>: ${ANIMATION_TYPES[rule.animation]}</span><button class="vn-delete-rule-btn" data-id="${rule.id}" style="background:#c70000; color:white; border:none; border-radius:3px; cursor:pointer;">×</button>`; listElement.appendChild(li); });
            listElement.querySelectorAll('.vn-delete-rule-btn').forEach(btn => { btn.onclick = (e) => { const ruleId = Number(e.target.dataset.id); this.settings.customAnimations = this.settings.customAnimations.filter(r => r.id !== ruleId); this.save(); this.renderAnimationRules(); }; });
        },
        toggleModalSections() { const selectedMode = this.settings.characterMode; document.getElementById('vn-custom-bg-section').style.display = (selectedMode === 'single' || selectedMode === 'internalImage') ? 'block' : 'none'; document.getElementById('vn-multi-mode-section').style.display = (selectedMode === 'multi') ? 'block' : 'none'; document.getElementById('vn-custom-anim-section').style.display = (selectedMode === 'multi') ? 'block' : 'none'; },
        // [추가] BGM 목록 렌더링
        renderBgmRules() {
            const list = document.getElementById('vn-bgm-rules-list'); if(!list) return; list.innerHTML = '';
            const rules = this.settings.customBgmRules || [];
            rules.forEach(r => {
                const li = document.createElement('li');
                li.style.cssText = 'display:flex; justify-content:space-between; padding:5px; border-bottom:1px solid #444; font-size:13px;';
                li.innerHTML = `<span>🎵 <b>${r.trigger}</b></span><button class="vn-del-bgm-btn" data-id="${r.id}" style="background:#c70000; border:none; color:white; border-radius:3px;">×</button>`;
                list.appendChild(li);
            });
            list.querySelectorAll('.vn-del-bgm-btn').forEach(btn => {
                btn.onclick = (e) => {
                    const id = Number(e.target.dataset.id);
                    this.settings.customBgmRules = this.settings.customBgmRules.filter(x => x.id !== id);
                    this.save(); this.renderBgmRules(); AudioManager.loadRules(this.settings.customBgmRules);
                };
            });
        },

        open() {
            document.getElementById(DOM_IDS.SETTINGS_MODAL).style.display = 'flex';
            document.querySelector(`input[name="characterMode"][value="${this.settings.characterMode}"]`).checked = true;
            document.getElementById('vn-custom-bg-url-input').value = this.settings.customBackgroundUrl;
            document.getElementById('vn-bg-pattern-input').value = this.settings.backgroundPattern;
            document.getElementById('vn-char-pattern-input').value = this.settings.characterPattern;
            document.getElementById('vn-speed-slider').value = this.settings.typingSpeed || 40;
            document.getElementById('vn-vol-slider').value = this.settings.globalVolume || 0.5;
            document.getElementById('vn-speed-display').textContent = (this.settings.typingSpeed || 40) + 'ms';

            this.toggleModalSections();
            this.renderAnimationRules();
            this.renderBgmRules(); // [추가] BGM 목록 표시
            LibraryManager.load(); LibraryManager.render();
        },
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
        max-width: 110%;
        max-height: 100%;
        object-fit: contain;
        }`;
        } else {
             characterStyles = `#${DOM_IDS.CHAR_CONTAINER} { ${posToCss(settings.characterContainerPos)} position: absolute; width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; pointer-events: none; z-index: 2; } .vn-character-cg { max-width: 70%; max-height: 100%; object-fit: contain; transition: opacity 0.3s ease-in-out, transform 0.3s ease-in-out; opacity: 0; transform: scale(0.95); } .vn-character-cg.visible { opacity: 1; transform: scale(1); }`;
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
            @keyframes fall-left {
    0% { transform: rotate(0deg); }
    30% { transform: rotate(-5deg); }
    50% { transform: rotate(5deg); }
    100% { transform: rotate(-90deg) translateY(20px); }
}
.vn-anim-fall-left {
    transform-origin: bottom center;
    animation: fall-left 2s ease-in forwards;
}
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
            /* [신규] 설정 모달 탭 UI 스타일 */
            .vn-modal-content { display: flex; flex-direction: row; background-color: #2c2c2c; width: 95%; max-width: 650px; height: 80vh; border-radius: 10px; border: 1px solid #555; position: relative; overflow: hidden; color: white; }
            #vn-modal-close { position: absolute; top: 10px; right: 15px; color: #aaa; font-size: 28px; cursor: pointer; z-index: 20; }

            /* 좌측 사이드바 */
            .vn-settings-sidebar { width: 100px; background-color: #222; border-right: 1px solid #444; padding-top: 50px; flex-shrink: 0; }
            .vn-tab-btn { padding: 15px 10px; color: #888; cursor: pointer; font-size: 14px; font-weight: bold; text-align: center; border-left: 3px solid transparent; transition: 0.2s; }
            .vn-tab-btn.active { background-color: #2c2c2c; color: white; border-left: 3px solid #1a73e8; }

            /* 우측 컨텐츠 */
            .vn-settings-body { flex: 1; padding: 20px; overflow-y: auto; }
            .vn-tab-content { display: none; }
            .vn-tab-content.active { display: block; animation: vn-fade-in 0.3s; }
            @keyframes vn-fade-in { from { opacity: 0; } to { opacity: 1; } }

            .vn-setting-option { margin-bottom: 20px; }
            .vn-pattern-input { width: 100%; padding: 8px; margin-top: 5px; background: #444; border: 1px solid #666; color: white; border-radius: 4px; box-sizing: border-box; }
            .vn-modal-button { background: #1a73e8; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; }
            .vn-modal-button.small { padding: 4px 8px; font-size: 12px; }
            .vn-anim-rule-list-container { max-height: 120px; overflow-y: auto; background: #333; border: 1px solid #555; border-radius: 4px; }

            /* 슬라이더 */
            input[type=range] { -webkit-appearance: none; background: transparent; margin-top: 5px; }
            input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; height: 20px; width: 20px; border-radius: 50%; background: #1a73e8; cursor: pointer; margin-top: -8px; border: 2px solid white; }
            input[type=range]::-webkit-slider-runnable-track { width: 100%; height: 4px; cursor: pointer; background: #555; }

            /* [수정] 라이브러리 카트리지 스타일 (홀쭉한 포스터 비율 적용) */
            .vn-library-grid {
                display: grid;
                grid-template-columns: 1fr 1fr; /* 2열 배치 */
                gap: 15px;
                padding-bottom: 20px;
                /* ★ 핵심 1: 칸 안에서 카트리지를 가운데 정렬 */
                justify-items: center;
            }

            .vn-cartridge {
                background: #2a2a2a;
                border: 1px solid #444;
                border-radius: 8px;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                box-shadow: 0 4px 8px rgba(0,0,0,0.4);
                transition: transform 0.2s;

                /* ★ 핵심 2: 너비를 강제로 줄여서 홀쭉하게 만듦 */
                width: 100%;
                max-width: 160px; /* 이 숫자를 줄이면 더 홀쭉해집니다 (160px 추천) */
            }

            .vn-cartridge:active { transform: scale(0.98); }

            .vn-cartridge-cover {
                /* 높이는 그대로 유지 (2:3 비율 완성: 160px * 1.5 = 240px) */
                height: 240px;
                background-size: cover;
                background-position: center;
                position: relative;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                border-bottom: 1px solid #333;
            }

            /* (나머지 스타일은 동일) */
            .vn-cartridge-load-overlay {
                position: absolute; inset: 0; background: rgba(0,0,0,0.6);
                color: #fff; display: flex; align-items: center; justify-content: center;
                font-weight: bold; font-size: 1.2em; opacity: 0; transition: 0.2s;
                backdrop-filter: blur(2px);
            }
            .vn-cartridge-cover:active .vn-cartridge-load-overlay { opacity: 1; }

            .vn-cartridge-info {
                padding: 10px; display: flex; flex-direction: column;
                gap: 5px; flex: 1; width: 100%; box-sizing: border-box; /* 패딩 포함 너비 계산 */
            }
            .vn-cartridge-title {
                font-weight: bold; font-size: 13px; color: #fff;
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            }
            .vn-cartridge-meta {
                font-size: 11px; color: #888; font-family: monospace; margin-bottom: 5px;
            }

            .vn-btn-del {
                background: #c72c2c; border: none; color: white;
                border-radius: 4px; padding: 8px 0; font-size: 12px; font-weight: bold;
                cursor: pointer; width: 100%; margin-top: auto;
            }
        `;
    }

    // --- 연출 관리자 --- (변경 없음)
    const StageManager = {
        cueSheet: [], currentIndex: -1, firstTextCueIndex: -1, isTyping: false, typingTimer: null, isVisible: false, isFinished: true,
        start(rawText) {
            UIManager.hideBackButton();

            // 1. 텍스트 파싱
            let parsedCues = this.parseCueSheet(rawText);

            // 2. [중요] 모든 모드에서 URL을 검사해 배경과 캐릭터를 올바르게 교정합니다.
            parsedCues.forEach(cue => {
                if (cue.url && cue.url !== 'off') {
                    // URL에 '/g/'가 있으면 무조건 배경 이미지로 변경
                    if (cue.url.includes('/g/')) {
                        cue.type = 'background_image';
                    }
                    // URL에 '/c/'가 있으면 캐릭터로 변경
                    else if (cue.url.includes('/c/')) {
                        cue.type = 'character_update';
                    }
                }
            });

            // 3. 다중 모드일 경우에만 자동 퇴장 로직 수행
            if (SettingsManager.settings.characterMode === 'multi') {
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

            this.cueSheet = parsedCues;

            this.firstTextCueIndex = this.cueSheet.findIndex(c => c.type === 'dialogue' || c.type === 'action');
            if (this.cueSheet.length === 0) { this.isFinished = true; return; }

            UIManager.showAll();
            UIManager.applyCustomBackground();

            const bgCue = this.cueSheet.find(c => c.type === 'background_image');
            if (bgCue) {
                UIManager.updateBackgroundImage(bgCue.url);
                // 시작할 때 배경이 있으면 단일 캐릭터 숨김
                if (SettingsManager.settings.characterMode !== 'multi') {
                    UIManager.updateSingleCharacter('off');
                }
            }

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

            // ★ [수정] 설정된 속도 가져오기 (없으면 기본값 40)
            const speed = SettingsManager.settings.typingSpeed || 40;

            this.typingTimer = setInterval(() => {
                if (i < text.length) {
                    element.innerHTML += text.charAt(i);
                    i++;
                } else {
                    this.skipTyping();
                }
            }, speed); // ★ 여기에 변수 적용
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
                condition: () => SettingsManager.settings.characterMode === 'single', regex: /^!\[.*?\]\((.*?)\)$/, handler: match => { const url = match[1].trim(); return { type: 'character_update', url: url }; } },

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
        elements: {}, activeCharacters: [], dragInfo: {}, resizeInfo: {}, characterMap: {},
    lastUpdatedCharId: null,

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


        // [신규 기능] 오프닝 선택 모달 생성 및 표시
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
        updateBackgroundImage(url) { if (this.elements.background && this.elements.background.style.backgroundImage !== `url("${url}")`) { this.elements.background.style.backgroundImage = `url("${url}")`; AudioManager.checkAndPlay(url);} },
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
        getDialogueTextElement() { return this.elements.dialogueText; },

        highlightSpeaker(speakerName) {
            if (SettingsManager.settings.characterMode !== 'multi') return;

            // 1. 나레이션(이름 없음)일 때: 모두 어둡게 처리
            if (!speakerName) {
                this.activeCharacters.forEach(char => {
                    if (char.element) {
                        char.element.classList.remove('speaking');
                        char.element.classList.add('listening');
                    }
                });
                return;
            }

            const targetName = speakerName.trim();
            let targetId = this.characterMap[targetName];

            // 매핑 정보가 없고, 방금 등장한 캐릭터가 있다면 연결(학습)
            if (!targetId && this.lastUpdatedCharId) {
                this.characterMap[targetName] = this.lastUpdatedCharId;
                targetId = this.lastUpdatedCharId;
            }

            this.activeCharacters.forEach(char => {
                if (!char.element) return;

                // 1순위: 학습된 ID와 일치하는가?
                let isMatch = (char.id === targetId);

                // 2순위: 학습된 게 없으면 이름 포함 여부로 확인
                if (!targetId) {
                    const charIdLower = char.id.toLowerCase();
                    const nameLower = targetName.toLowerCase().replace(/\s+/g, '');
                    if (charIdLower.includes(nameLower) || nameLower.includes(charIdLower)) {
                        isMatch = true;
                        this.characterMap[targetName] = char.id;
                    }
                }

                if (isMatch) {
                    char.element.classList.add('speaking');
                    char.element.classList.remove('listening');
                } else {
                    char.element.classList.add('listening');
                    char.element.classList.remove('speaking');
                }
            });
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
    let stopDelayTimer = null;
    let isHighSpeedMode = false;

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
        // 버튼 누르는 순간 오디오 잠금 해제 시도
        AudioManager.unlock();
        isEngineActive = !isEngineActive;
        const button = document.getElementById(DOM_IDS.START_BUTTON);

        if (button) {
            if (isEngineActive) {
                // [ON] VN 시작
                button.textContent = 'VN 종료';
                button.classList.add('active');

                // 1. 실시간 감지 즉시 시작
                startRealtimeChecker();

                // 2. 오프닝 재생 로직 (PC V3 동일)
                // 설정창에는 없지만, JSON 불러오기나 라이브러리 로드로 값이 들어와 있을 수 있음
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

    // --- 스크립트 초기화 ---
    console.log("VN Engine V2.0_mobile 로드됨.");
    SettingsManager.load();
    UIManager.setup();
    // --- URL 감지 및 자동 로드 ---
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;

            // 0.5초 뒤에 자동 로드 시도 (페이지 로딩 시간 고려)
            setTimeout(() => {
                LibraryManager.checkAutoLoad();
            }, 500);
        }
    }).observe(document.body, { subtree: true, childList: true });

    // 스크립트 처음 실행 시에도 한 번 체크
    setTimeout(() => LibraryManager.checkAutoLoad(), 500);

})();
