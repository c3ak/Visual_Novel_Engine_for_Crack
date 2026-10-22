// ==UserScript==
// @name         Visual Novel Engine V4
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  Crack용 비주얼 노벨 UI의 로컬 확장 기반 버전입니다. 보호 카트리지(VNC2)와 압축 카트리지를 읽습니다. 원래 엔진과 같이 켜지 마세요.
// @author       agetion(c3ak), local modifications
// @match        *://crack.wrtn.ai/*
// @connect      crack-api.wrtn.ai
// @connect      raw.githubusercontent.com
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/c3ak/Visual_Novel_Engine_for_Crack/main/VN_Engine.user.js
// @downloadURL  https://raw.githubusercontent.com/c3ak/Visual_Novel_Engine_for_Crack/main/VN_Engine.user.js
// ==/UserScript==

(function() {
    'use strict';

    // --- 상수 정의 ---
    const DOM_IDS = {
        CONTAINER: 'vn-engine-container', BACKGROUND: 'vn-background-overlay', EVENT_CG: 'vn-event-cg-overlay',
        HOTSPOT_LAYER: 'vn-hotspot-layer', IMAGE_VIEWER: 'vn-image-viewer',
        IMAGE_VIEWER_IMG: 'vn-image-viewer-img', IMAGE_VIEWER_CAPTION: 'vn-image-viewer-caption',
        IMAGE_VIEWER_MISSING: 'vn-image-viewer-missing', IMAGE_VIEWER_CLOSE: 'vn-image-viewer-close',
        CHAR_CONTAINER: 'vn-character-container', STATUS_WINDOW: 'vn-status-window', DIALOGUE_BOX: 'vn-dialogue-box',
        CHAR_NAME: 'vn-character-name', DIALOGUE_TEXT: 'vn-dialogue-text', BACK_BUTTON: 'vn-back-button',
        SETTINGS_MODAL: 'vn-settings-modal', START_BUTTON: 'vn-start-button', DEMO_BUTTON: 'vn-demo-button', SETTINGS_BUTTON: 'vn-settings-button',
        INPUT_BUTTON: 'vn-input-button', INPUT_MODAL: 'vn-input-modal', LOG_BUTTON: 'vn-log-button', LOG_MODAL: 'vn-log-modal',
        LOADING_INDICATOR: 'vn-loading-indicator', MENU_BUTTON: 'vn-menu-button', MENU_MODAL: 'vn-menu-modal',
        MENU_TABS: 'vn-menu-tabs', MENU_BODY: 'vn-menu-body', MENU_CLOSE: 'vn-menu-close',
        MENU_SETTINGS_BUTTON: 'vn-menu-settings-button', MENU_EXIT_BUTTON: 'vn-menu-exit-button', MENU_PAUSE_BUTTON: 'vn-menu-pause-button',
        RESUME_BUTTON: 'vn-resume-button', PAUSE_EXIT_BUTTON: 'vn-pause-exit-button',
        AI_LOG_MODAL: 'vn-ai-log-modal', AI_LOG_BODY: 'vn-ai-log-body', AI_LOG_CLOSE: 'vn-ai-log-close', AI_LOG_CLEAR: 'vn-ai-log-clear',
        STAGE_OVERLAY: 'vn-stage-overlay', MODULE_OVERLAY: 'vn-module-overlay', SERVICE_HOST: 'vn-service-host',
        HOME_LAYER: 'vn-home-layer', HOME_FRAME_HOST: 'vn-home-frame-host', END_TALK_BUTTON: 'vn-end-talk-button',
        SCREEN_VEIL: 'vn-screen-veil', SCRIPT_CHOICES: 'vn-script-choices'

    };
    // 가로로 든 폰처럼 높이가 낮은 화면. 모바일 배치는 이 조건 하나로 켜진다.
    const COMPACT_SCREEN_QUERY = '(max-height: 500px)';
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
                // 규칙에 "loop": false 를 적으면 한 번만 튼다 (기본은 반복)
                this.play(match.audioUrl, { loop: match.loop !== false });
            }
        },

        // 주소, 또는 카트리지 안의 소리 파일 경로("assets/audio/x.mp3")를 재생할 수 있는 주소로 바꾼다.
        resolveSource(source) {
            const value = String(source === undefined || source === null ? '' : source).trim();
            if (!value) return null;
            if (/^(?:https?:\/\/|\/\/|blob:|data:audio\/)/i.test(value)) return value;
            if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;   // javascript: 같은 주소는 막는다
            const url = typeof CartridgeRuntime !== 'undefined' ? CartridgeRuntime.getAssetUrl(value.replace(/^\.?\//, '')) : null;
            if (!url) console.warn(`VN Engine: 카트리지에서 소리 파일을 찾을 수 없습니다 — ${value}`);
            return url;
        },

        // options.loop 이 false 면 한 번만 튼다. 같은 곡이 울리는 중이면 처음부터 다시 틀지 않는다.
        play(source, options = {}) {
            const url = this.resolveSource(source);
            if (!url) return false;
            if (this.currentUrl === url && this.currentAudio && !this.currentAudio.paused) return true;
            if (this.currentAudio) {
                this.fadeOutAndStop(this.currentAudio);
            }
            this.currentUrl = url;
            const newAudio = new Audio(url);
            newAudio.loop = options.loop !== false;
            newAudio.volume = 0;
            // 재생이 시작되기 전에도 '지금 트는 곡' 으로 본다 (대본의 ![music](wait))
            this.startingAudio = newAudio;
            const playPromise = newAudio.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    if (this.startingAudio === newAudio) this.startingAudio = null;
                    this.fadeIn(newAudio, SettingsManager.settings.globalVolume);
                    this.currentAudio = newAudio;
                }).catch(error => {
                    if (this.startingAudio === newAudio) this.startingAudio = null;
                    console.warn("VN Engine: BGM 재생 실패", error);
                });
            } else if (this.startingAudio === newAudio) {
                this.startingAudio = null;
                this.currentAudio = newAudio;
            }
            return true;
        },

        // 대본의 ![music](wait): 지금 울리는 곡이 끝날 때까지 기다린다.
        // 반복하는 곡이거나 아무것도 울리지 않으면 바로 넘어간다. 다른 곡으로 바뀌거나 꺼져도 더 기다리지 않는다.
        // VN 일시정지로 멈춘 동안은 끝나지 않았으므로 계속 기다린다.
        whenSilent() {
            const audio = this.startingAudio || this.currentAudio;
            if (!audio || audio.loop || audio.ended) return Promise.resolve();
            return new Promise(resolve => {
                let timer = null;
                const done = () => {
                    clearInterval(timer);
                    audio.removeEventListener('ended', done);
                    resolve();
                };
                audio.addEventListener('ended', done);
                timer = setInterval(() => {
                    if (audio.ended || (audio !== this.currentAudio && audio !== this.startingAudio)) done();
                }, 250);
            });
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

        // VN 일시정지: 곡을 끄지 않고 멈췄다가 돌아오면 그 자리에서 잇는다
        pause() {
            if (this.currentAudio && !this.currentAudio.paused) {
                this.currentAudio.pause();
                this.pausedByEngine = true;
            }
        },
        resume() {
            if (this.pausedByEngine && this.currentAudio) {
                this.currentAudio.play().catch(error => console.warn('VN Engine: BGM 재개 실패', error));
            }
            this.pausedByEngine = false;
        },

        // ★ [신규 추가] 모든 오디오 정지 함수
        stopAll() {
            this.pausedByEngine = false;
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

    // --- 카트리지 파일 형식 ---
    const CARTRIDGE_FORMAT = 'vn-engine-cartridge';
    const CARTRIDGE_FORMAT_VERSION = 1;
    const CARTRIDGE_EXTENSION = '.vncartridge';
    // 카트리지 화면 안에 함께 넣어주는 도우미. 제작자가 postMessage 배관을 직접 짜지 않아도 된다.
    const CARTRIDGE_HELPER_SOURCE = `
window.VNCartridge = (function () {
    'use strict';
    var context = window.VNCartridgeContext || {};
    var runtime = context.runtime || {};
    var shared = runtime.shared || {};
    var status = runtime.status || {};
    var ai = runtime.ai || { generating: false, reason: 'idle', lastArrivedAt: 0 };
    var images = context.images || {};
    var home = runtime.home || { active: false };
    // 지금 채팅방. 주소 끝의 ID 이고(작품 채팅이면 에피소드 ID), 채팅방을 옮기면 엔진이 새 값을 알린다 (3.35.0)
    var session = runtime.session || { id: null };
    // VN 이 켜져 있는지. 켜고 끌 때마다 엔진이 알린다 (3.37.0)
    var vn = runtime.vn || { active: false, opening: false };
    var listeners = { shared: [], event: [], status: [], ai: [], home: [], hotspot: [], script: [], session: [], vn: [] };
    var pending = {};
    var scripts = {};
    var sequence = 0;

    function send(type, body) {
        sequence += 1;
        var message = { source: 'vn-cartridge', type: type, requestId: type + '-' + Date.now() + '-' + sequence };
        for (var key in body) if (Object.prototype.hasOwnProperty.call(body, key)) message[key] = body[key];
        window.parent.postMessage(message, '*');
        return message.requestId;
    }

    function fire(channel, a, b) {
        listeners[channel].forEach(function (fn) {
            try { fn(a, b); } catch (error) { console.error('VNCartridge: ' + channel + ' 처리 중 오류', error); }
        });
    }

    window.addEventListener('message', function (event) {
        var message = event.data;
        if (!message || message.source !== 'vn-engine') return;
        if (message.type === 'shared-state:changed' || message.type === 'shared-state:saved' || message.type === 'shared-state:value') {
            shared = message.state || {};
            fire('shared', shared, message.from || null);
        } else if (message.type === 'module-event') {
            fire('event', message.event || {}, message.from || null);
        } else if (message.type === 'status:update') {
            status = message.status || {};
            fire('status', status);
        } else if (message.type === 'ai-activity') {
            ai = message.activity || ai;
            fire('ai', ai);
        } else if (message.type === 'home:state') {
            home = message.home || home;
            fire('home', home);
        } else if (message.type === 'hotspot:press') {
            // 배경 위 자리를 눌렀다. 무엇을 할지는 카트리지가 정한다. { id, background, label }
            fire('hotspot', message.hotspot || {});
        } else if (message.type === 'home:talk-result') {
            var settle = pending[message.requestId];
            if (settle) {
                delete pending[message.requestId];
                settle({ ok: message.ok === true, reason: message.reason || '' });
            }
        } else if (message.type === 'vn:state') {
            vn = message.vn || { active: false, opening: false };
            fire('vn', vn);
        } else if (message.type === 'chat:sent') {
            var settleChat = pending[message.requestId];
            if (settleChat) {
                delete pending[message.requestId];
                settleChat({ ok: message.ok === true, reason: message.reason || '' });
            }
        } else if (message.type === 'session:changed') {
            // 채팅방을 옮겼다. 공유 서랍도 그 범위의 것으로 바뀐다.
            session = message.session || { id: null };
            if (message.state) {
                shared = message.state;
                fire('shared', shared, null);
            }
            fire('session', session);
        } else if (message.type === 'script:ended') {
            // 부탁한 대본이 끝났다. finished = 마지막 줄을 넘겼다 / interrupted = 다른 응답이 끼어들었다
            // stopped = VN 을 껐다 / refused = 틀 수 없었다 (VN 이 꺼져 있음 · 빈 대본)
            var ended = { id: String(message.scriptId || ''), state: String(message.state || 'finished'), reason: message.reason || '' };
            var resolveScript = scripts[ended.id];
            if (resolveScript) {
                delete scripts[ended.id];
                resolveScript({ ok: ended.state === 'finished', state: ended.state, reason: ended.reason });
            }
            fire('script', ended);
        } else if (message.type === 'choice:chosen') {
            var settleChoice = pending[message.requestId];
            if (settleChoice) {
                delete pending[message.requestId];
                settleChoice({
                    ok: message.ok === true,
                    index: typeof message.index === 'number' ? message.index : -1,
                    text: typeof message.text === 'string' ? message.text : '',
                    reason: message.reason || ''
                });
            }
        }
    });

    return {
        context: context,
        get status() { return status; },
        get ai() { return ai; },
        // 방 화면 모듈일 때만 쓴다. active 가 false 면 대화 화면 뒤에 배경으로 깔려 있는 중이다.
        get home() { return home; },
        // { id }: 지금 채팅방 ID. 주소에서 못 읽으면 null. 채팅방마다 따로 기억할 것은 이 ID 를 열쇠로 쓴다 (3.35.0)
        get session() { return session; },
        // { active, opening }: VN 이 켜져 있는지, 켤 때 오프닝을 틀었는지 (3.37.0)
        get vn() { return vn; },
        // 크랙에 대화를 보낸다. 플레이어가 대화 입력으로 보낸 것과 같고, tellAi 로 넣어 둔 알림도 함께 붙는다 (3.37.0).
        // { ok, reason }. reason: inactive(VN 꺼짐) · empty · too-long · busy(다른 글을 보내는 중) · failed(입력창·전송 버튼을 못 찾음)
        sendChat: function (message) {
            return new Promise(function (resolve) {
                var id = send('chat:send', { text: String(message === undefined || message === null ? '' : message) });
                pending[id] = resolve;
            });
        },
        // manifest 모듈의 images 에 적은 그림. 이름 → data: 주소
        images: images,
        loadImage: function (name) {
            return new Promise(function (resolve, reject) {
                var source = images[name];
                if (!source) { reject(new Error('VNCartridge: 그림이 없습니다 — ' + name)); return; }
                var image = new Image();
                image.onload = function () { resolve(image); };
                image.onerror = function () { reject(new Error('VNCartridge: 그림을 읽지 못했습니다 — ' + name)); };
                image.src = source;
            });
        },
        // 방 화면 모듈에서 manifest home.characters 의 인물과 대화를 시작한다. choiceId 를 빼면 첫 talk 선택지.
        talkTo: function (characterId, choiceId) {
            return new Promise(function (resolve) {
                var id = send('home:talk', { characterId: String(characterId || ''), choiceId: choiceId ? String(choiceId) : '' });
                pending[id] = resolve;
                setTimeout(function () {
                    if (!pending[id]) return;
                    delete pending[id];
                    resolve({ ok: false, reason: 'timeout' });
                }, 3000);
            });
        },
        shared: {
            get all() { return shared; },
            get: function (key) { return shared[key]; },
            patch: function (patch) { send('shared-state:patch', { patch: patch }); },
            refresh: function () { send('shared-state:read', {}); }
        },
        state: {
            get all() { return runtime.state || {}; },
            replace: function (state) { send('module-state:replace', { state: state }); }
        },
        emit: function (type, payload) { send('module-event:emit', { event: { type: type, payload: payload } }); },
        // options.id 를 주면 그 이름으로 넣고, options.replace 가 true 면 같은 이름을 덮어쓴다.
        tellAi: function (title, text, options) {
            var opts = options || {};
            send('ai-context:enqueue', {
                event: {
                    id: opts.id ? String(opts.id) : String(Date.now()) + '-' + Math.random().toString(36).slice(2),
                    title: title,
                    text: text,
                    createdAt: Date.now(),
                    replace: opts.replace === true
                }
            });
        },
        // 넣어 둔 알림을 이름으로 걷어낸다. 같은 카트리지 안이면 다른 모듈이 넣은 것도 걷는다.
        withdrawAi: function (id) { send('ai-context:withdraw', { id: String(id) }); },
        close: function () { send('view:close', {}); },
        // 엔진만 할 수 있는 일을 부탁한다. 모두 이 카트리지의 모듈과 그림에만 작동한다.
        // 그 화면 모듈을 연다. 메뉴에서 숨겨 둔 화면도 열린다.
        // options.fullscreen: 창 머리줄 없이 화면 전체에 띄운다 (3.39.0). 닫기는 모듈의 close() 나 Esc
        openView: function (moduleId, options) { send('view:open', { moduleId: String(moduleId || ''), fullscreen: Boolean(options && options.fullscreen === true) }); },
        // 그림 창을 띄운다. 핫스팟 image 와 같은 창이고, 이름은 ![이름] 으로 부르는 그림 이름이다.
        showImage: function (name, label) {
            send('image:show', { name: String(name || ''), label: label === undefined || label === null ? '' : String(label) });
        },
        // 음악을 튼다. 카트리지 안의 소리 파일 경로(assets/audio/…)나 주소. { loop: false } 면 한 번만.
        playMusic: function (source, options) {
            var opts = options || {};
            send('music:play', { src: String(source || ''), loop: opts.loop !== false });
        },
        stopMusic: function () { send('music:stop', {}); },
        // VN 화면에서 대본을 튼다. 오프닝과 같은 문법이고, 대화 기록에도 AI 에게도 가지 않는다.
        // 줄 배열이나 글 하나. 끝나면 { ok: true, state: 'finished' } (마지막 줄을 넘겼을 때).
        // 다른 응답이 끼어들거나 VN 을 끄면 ok: false 와 그 까닭(state). 열려 있던 모듈 창은 엔진이 닫는다.
        playScript: function (content, options) {
            var opts = options || {};
            var body = Array.isArray(content) ? content.map(function (line) { return String(line === undefined || line === null ? '' : line); }).join(String.fromCharCode(10)) : String(content || '');
            sequence += 1;
            var scriptId = opts.id ? String(opts.id) : 'script-' + Date.now() + '-' + sequence;
            return new Promise(function (resolve) {
                scripts[scriptId] = resolve;
                send('script:play', { content: body, scriptId: scriptId });
            });
        },
        // VN 화면에 선택지를 띄운다. [{ text, input }] 또는 글 배열 → { ok, index, text }.
        // input: true 인 보기를 누르면 글을 적는 칸이 열리고, 적은 글이 text 로 온다.
        choose: function (options, settings) {
            var opts = settings || {};
            var list = (Array.isArray(options) ? options : []).map(function (option) {
                if (typeof option === 'string') return { text: option };
                var item = option || {};
                return { text: String(item.text || ''), input: item.input === true, placeholder: item.placeholder ? String(item.placeholder) : '' };
            });
            return new Promise(function (resolve) {
                var id = send('choice:show', { options: list, placeholder: opts.placeholder ? String(opts.placeholder) : '' });
                pending[id] = resolve;
            });
        },
        // 메뉴에 그 화면을 보이거나 숨긴다. 엔진이 이야기(채팅)마다 기억한다.
        menu: {
            show: function (moduleId) { send('menu:set', { moduleId: String(moduleId || ''), visible: true }); },
            hide: function (moduleId) { send('menu:set', { moduleId: String(moduleId || ''), visible: false }); }
        },
        // keepOpen: true 를 주면 창을 닫지 않고 보낸다. 이동 연출처럼 보낸 뒤에도
        // 화면이 계속 돌아야 할 때 쓴다. 다 끝나면 모듈이 close() 로 직접 닫는다.
        commitChat: function (options) { send('chat:commit', { options: (options && typeof options === 'object') ? options : {} }); },
        on: function (channel, handler) {
            if (!listeners[channel] || typeof handler !== 'function') return function () {};
            listeners[channel].push(handler);
            return function () {
                var index = listeners[channel].indexOf(handler);
                if (index > -1) listeners[channel].splice(index, 1);
            };
        }
    };
})();
`;
    // assets.images 에 적은 값이 외부 주소인지 패키지 안 경로인지 가린다.
    const EXTERNAL_IMAGE_SOURCE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
    // 이미지로 쓸 수 있는 주소만 허용한다. javascript: 같은 것은 막는다.
    const ALLOWED_IMAGE_SOURCE = /^(?:https?:\/\/|\/\/|data:image\/)/i;
    // 모듈의 images 에 넣을 수 있는 그림 파일
    const MODULE_IMAGE_PATTERN = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i;
    const ENGINE_VERSION = '4.0.0';
    // 보이는 모듈 화면(무대·메뉴 창·방 화면)의 격리 조건. 출처는 계속 없고(allow-same-origin 없음),
    // 1인칭 조작을 위해 마우스 고정(requestPointerLock)만 더 허락한다 — 누른 뒤에만 걸리고 Esc 로 풀린다 (3.36.0)
    const MODULE_FRAME_SANDBOX = 'allow-scripts allow-pointer-lock';

    // 파일 이름이 이 접두사로 시작하면 폴더와 무관하게 배경으로 봅니다. (bg_격납고.png)
    const BACKGROUND_NAME_PREFIX = 'bg_';

    // 이름 뒤쪽의 번호를 떼어 같은 인물을 하나로 묶습니다. (mira01 → mira)
    // 외부 URL 방식과 카트리지 내장 이미지가 같은 규칙을 쓰도록 여기 한 곳에만 둡니다.
    // 경로나 주소에서 카트리지 호출 이름을 뽑는다.
    //   /c/x1            -> x1
    //   assets/c/x1.webp -> x1
    //   https://cdn/g/35.png?v=2 -> 35
    function assetNameFromReference(value) {
        const text = String(value === undefined || value === null ? '' : value).split(/[?#]/)[0].trim();
        if (!text) return '';
        const lastSegment = text.slice(text.lastIndexOf('/') + 1);
        return lastSegment.replace(/\.[^.]+$/, '').trim();
    }

    // 핫스팟을 얼마나 드러낼지. 숨김은 테두리도 손 모양 커서도 없다.
    const HOTSPOT_REVEALS = ['always', 'hover', 'hidden'];
    // 방 화면 선택지가 할 수 있는 일. talk = 대화 화면으로 넘어가기, message = 짧은 알림
    const HOME_ACTIONS = ['talk', 'message'];
    // '대화하기' 가 AI 문맥 대기열에 넣는 알림의 이름. 보내지 않고 방으로 돌아오면 이 이름으로 걷는다
    const HOME_TALK_NOTE_ID = 'home-talk';

    // 오류 문구를 액자 문서(srcdoc)에 넣을 때 쓴다
    function escapeHtml(value) {
        return String(value === undefined || value === null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function characterIdFromBaseName(baseName) {
        const value = String(baseName || '');
        const match = value.match(/^([a-zA-Z_]+[a-zA-Z])([0-9_].*)?$/) || value.match(/^([a-zA-Z]+)([0-9_].*)?$/);
        return (match && match[1]) ? match[1] : value;
    }

    // 의존성 없이 읽을 수 있도록 v1 패키지는 ZIP의 STORE 방식(무압축)을 사용합니다.
    const ZipStore = {
        crcTable: null,

        getCrcTable() {
            if (this.crcTable) return this.crcTable;
            this.crcTable = Array.from({ length: 256 }, (_, index) => {
                let value = index;
                for (let bit = 0; bit < 8; bit++) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
                return value >>> 0;
            });
            return this.crcTable;
        },

        crc32(bytes) {
            const table = this.getCrcTable();
            let crc = 0xffffffff;
            for (const byte of bytes) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
            return (crc ^ 0xffffffff) >>> 0;
        },

        normalizePath(rawPath) {
            const normalized = String(rawPath || '').replace(/\\/g, '/');
            const segments = normalized.split('/');
            if (!normalized || normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized) || segments.includes('..')) {
                throw new Error(`안전하지 않은 카트리지 경로입니다: ${rawPath}`);
            }
            return normalized;
        },

        // 압축(deflate) 항목을 풀어야 해서 기다리는 함수다 (보호판 엔진).
        async read(input) {
            const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
            const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            if (bytes.byteLength < 22) throw new Error('ZIP 카트리지의 크기가 너무 작습니다.');

            let eocdOffset = -1;
            const searchStart = Math.max(0, bytes.byteLength - 65557);
            for (let offset = bytes.byteLength - 22; offset >= searchStart; offset--) {
                if (view.getUint32(offset, true) === 0x06054b50) { eocdOffset = offset; break; }
            }
            if (eocdOffset < 0) throw new Error('ZIP 중앙 디렉터리를 찾을 수 없습니다.');

            const entryCount = view.getUint16(eocdOffset + 10, true);
            const centralSize = view.getUint32(eocdOffset + 12, true);
            const centralOffset = view.getUint32(eocdOffset + 16, true);
            if (centralOffset + centralSize > bytes.byteLength) throw new Error('ZIP 중앙 디렉터리가 손상되었습니다.');

            const decoder = new TextDecoder('utf-8');
            const files = new Map();
            let offset = centralOffset;

            for (let index = 0; index < entryCount; index++) {
                if (offset + 46 > bytes.byteLength || view.getUint32(offset, true) !== 0x02014b50) {
                    throw new Error('ZIP 파일 항목이 손상되었습니다.');
                }
                const method = view.getUint16(offset + 10, true);
                const expectedCrc = view.getUint32(offset + 16, true);
                const compressedSize = view.getUint32(offset + 20, true);
                const uncompressedSize = view.getUint32(offset + 24, true);
                const nameLength = view.getUint16(offset + 28, true);
                const extraLength = view.getUint16(offset + 30, true);
                const commentLength = view.getUint16(offset + 32, true);
                const localOffset = view.getUint32(offset + 42, true);
                const nameEnd = offset + 46 + nameLength;
                if (nameEnd > bytes.byteLength) throw new Error('ZIP 파일명이 손상되었습니다.');
                const path = this.normalizePath(decoder.decode(bytes.subarray(offset + 46, nameEnd)));
                offset = nameEnd + extraLength + commentLength;

                if (path.endsWith('/')) continue;
                if (method !== 0 && method !== 8) throw new Error(`지원하지 않는 ZIP 압축 방식입니다: ${path}`);
                if (method === 0 && compressedSize !== uncompressedSize) throw new Error(`ZIP 항목 크기가 일치하지 않습니다: ${path}`);
                if (localOffset + 30 > bytes.byteLength || view.getUint32(localOffset, true) !== 0x04034b50) {
                    throw new Error(`ZIP 로컬 항목이 손상되었습니다: ${path}`);
                }
                const localNameLength = view.getUint16(localOffset + 26, true);
                const localExtraLength = view.getUint16(localOffset + 28, true);
                const dataStart = localOffset + 30 + localNameLength + localExtraLength;
                const dataEnd = dataStart + compressedSize;
                if (dataEnd > bytes.byteLength) throw new Error(`ZIP 항목 데이터가 손상되었습니다: ${path}`);
                let data = bytes.slice(dataStart, dataEnd);
                if (method === 8) {
                    try { data = await CartridgeProtect.inflateRaw(data); }
                    catch (error) { throw new Error(`ZIP 항목 압축을 풀 수 없습니다: ${path}`); }
                    if (data.length !== uncompressedSize) throw new Error(`ZIP 항목 크기가 일치하지 않습니다: ${path}`);
                }
                if (this.crc32(data) !== expectedCrc) throw new Error(`ZIP 항목 검증에 실패했습니다: ${path}`);
                if (files.has(path)) throw new Error(`중복된 카트리지 파일입니다: ${path}`);
                files.set(path, data);
            }
            return files;
        },

        create(inputEntries) {
            const encoder = new TextEncoder();
            const entries = Array.from(inputEntries instanceof Map ? inputEntries.entries() : Object.entries(inputEntries));
            return this.writeEntries(entries.map(([rawPath, rawData]) => {
                const data = rawData instanceof Uint8Array ? rawData : encoder.encode(String(rawData));
                return { path: rawPath, data, stored: data, method: 0 };
            }));
        },

        // 그림·소리처럼 이미 압축된 형식은 그대로 두고, 나머지는 줄어들 때만 deflate 로 넣는다.
        async createCompressed(inputEntries) {
            const encoder = new TextEncoder();
            const entries = Array.from(inputEntries instanceof Map ? inputEntries.entries() : Object.entries(inputEntries));
            const prepared = [];
            for (const [rawPath, rawData] of entries) {
                const data = rawData instanceof Uint8Array ? rawData : encoder.encode(String(rawData));
                let stored = data;
                let method = 0;
                if (CartridgeProtect.shouldCompress(rawPath)) {
                    const packed = await CartridgeProtect.deflateRaw(data);
                    if (packed.length < data.length) { stored = packed; method = 8; }
                }
                prepared.push({ path: rawPath, data, stored, method });
            }
            return this.writeEntries(prepared);
        },

        writeEntries(prepared) {
            const encoder = new TextEncoder();
            const localChunks = [];
            const centralChunks = [];
            let localOffset = 0;

            prepared.forEach(({ path: rawPath, data, stored, method }) => {
                const path = this.normalizePath(rawPath);
                const nameBytes = encoder.encode(path);
                const crc = this.crc32(data);
                const local = new Uint8Array(30 + nameBytes.length + stored.length);
                const localView = new DataView(local.buffer);
                localView.setUint32(0, 0x04034b50, true);
                localView.setUint16(4, 20, true);
                localView.setUint16(6, 0x0800, true);
                localView.setUint16(8, method, true);
                localView.setUint32(14, crc, true);
                localView.setUint32(18, stored.length, true);
                localView.setUint32(22, data.length, true);
                localView.setUint16(26, nameBytes.length, true);
                local.set(nameBytes, 30);
                local.set(stored, 30 + nameBytes.length);

                const central = new Uint8Array(46 + nameBytes.length);
                const centralView = new DataView(central.buffer);
                centralView.setUint32(0, 0x02014b50, true);
                centralView.setUint16(4, 20, true);
                centralView.setUint16(6, 20, true);
                centralView.setUint16(8, 0x0800, true);
                centralView.setUint16(10, method, true);
                centralView.setUint32(16, crc, true);
                centralView.setUint32(20, stored.length, true);
                centralView.setUint32(24, data.length, true);
                centralView.setUint16(28, nameBytes.length, true);
                centralView.setUint32(42, localOffset, true);
                central.set(nameBytes, 46);

                localChunks.push(local);
                centralChunks.push(central);
                localOffset += local.length;
            });

            const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0);
            const eocd = new Uint8Array(22);
            const eocdView = new DataView(eocd.buffer);
            eocdView.setUint32(0, 0x06054b50, true);
            eocdView.setUint16(8, prepared.length, true);
            eocdView.setUint16(10, prepared.length, true);
            eocdView.setUint32(12, centralSize, true);
            eocdView.setUint32(16, localOffset, true);

            const allChunks = [...localChunks, ...centralChunks, eocd];
            const totalSize = allChunks.reduce((sum, chunk) => sum + chunk.length, 0);
            const output = new Uint8Array(totalSize);
            let writeOffset = 0;
            allChunks.forEach(chunk => { output.set(chunk, writeOffset); writeOffset += chunk.length; });
            return output;
        }
    };

    // --- 보호 카트리지 (VNC2) ---
    // 남이 압축 프로그램이나 메모장으로 카트리지 내용을 뜯어보지 못하게 항목마다 따로 암호화한 형식이다.
    // tools/cartridge_protect.py 와 열쇠 만드는 법·형식이 같아야 한다. 형식 설명은 그 파일 머리에 있다.
    // 열쇠 재료가 이 엔진 안에 있으니 작정한 사람까지 막지는 못한다 — 쉽게 열어 보는 것만 막는다.
    const CartridgeProtect = {
        MAGIC: [0x56, 0x4e, 0x43, 0x32],
        CONTAINER_VERSION: 1,
        HEADER_SIZE: 40,
        STORED_PATTERN: /\.(png|jpe?g|webp|gif|avif|mp3|ogg|oga|opus|m4a|aac|mp4|webm|woff2?|zip|vncartridge)$/i,
        SEED_MASK: 0xA7,
        SEED_PARTS: [
            [134, 211, 59, 84, 152, 114, 106, 254, 140, 207, 249, 198, 228, 75, 80, 169],
            [94, 232, 50, 107, 23, 69, 44, 57, 163, 235, 40, 76, 249, 254, 177, 135]
        ],
        masterSecrets: new Map(),

        isProtected(bytes) {
            return bytes.length >= this.HEADER_SIZE && this.MAGIC.every((value, index) => bytes[index] === value);
        },

        shouldCompress(path) {
            return !this.STORED_PATTERN.test(String(path));
        },

        async pipeBytes(bytes, transform) {
            const stream = new Blob([bytes]).stream().pipeThrough(transform);
            return new Uint8Array(await new Response(stream).arrayBuffer());
        },

        inflateRaw(bytes) { return this.pipeBytes(bytes, new DecompressionStream('deflate-raw')); },
        deflateRaw(bytes) { return this.pipeBytes(bytes, new CompressionStream('deflate-raw')); },

        async getMasterSecret(generation) {
            if (this.masterSecrets.has(generation)) return this.masterSecrets.get(generation);
            if (generation !== 1) throw new Error(`이 카트리지는 더 새 엔진이 필요합니다 (보호 열쇠 ${generation}세대).`);
            const encoder = new TextEncoder();
            const label = encoder.encode('vn-engine/cartridge-protect/g1');
            const first = this.SEED_PARTS[0].map(value => value ^ this.SEED_MASK);
            const second = this.SEED_PARTS[1].slice().reverse().map(value => value ^ this.SEED_MASK);
            const material = new Uint8Array(label.length + 32);
            material.set(label, 0);
            material.set(first, label.length);
            material.set(second, label.length + 16);
            const secret = new Uint8Array(await crypto.subtle.digest('SHA-256', material));
            this.masterSecrets.set(generation, secret);
            return secret;
        },

        async deriveKey(salt, generation, usages) {
            const baseKey = await crypto.subtle.importKey('raw', await this.getMasterSecret(generation), 'HKDF', false, ['deriveKey']);
            return crypto.subtle.deriveKey(
                { name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode('vnc2-key') },
                baseKey, { name: 'AES-GCM', length: 256 }, false, usages
            );
        },

        toBase64(bytes) {
            let binary = '';
            for (let offset = 0; offset < bytes.length; offset += 0x8000) {
                binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + 0x8000));
            }
            return btoa(binary);
        },

        fromBase64(text) {
            const binary = atob(String(text));
            const bytes = new Uint8Array(binary.length);
            for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
            return bytes;
        },

        async open(input) {
            const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
            if (!this.isProtected(bytes)) throw new Error('보호 카트리지(VNC2)가 아닙니다.');
            const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            const containerVersion = bytes[4];
            if (containerVersion !== this.CONTAINER_VERSION) {
                throw new Error(`이 카트리지는 더 새 엔진이 필요합니다 (보호 형식 ${containerVersion}).`);
            }
            const generation = bytes[5];
            const salt = bytes.slice(8, 24);
            const indexIv = bytes.slice(24, 36);
            const indexLength = view.getUint32(36, true);
            const dataStart = this.HEADER_SIZE + indexLength;
            if (dataStart > bytes.length) throw new Error('보호 카트리지가 손상되었습니다.');
            const key = await this.deriveKey(salt, generation, ['decrypt']);

            let index;
            try {
                const plain = await crypto.subtle.decrypt(
                    { name: 'AES-GCM', iv: indexIv, additionalData: bytes.slice(0, this.HEADER_SIZE) },
                    key, bytes.slice(this.HEADER_SIZE, dataStart)
                );
                index = JSON.parse(new TextDecoder('utf-8').decode(plain));
            } catch (error) {
                throw new Error('보호 카트리지를 열 수 없습니다. 파일이 손상되었거나 다른 엔진용입니다.');
            }
            if (!index || !Array.isArray(index.entries)) throw new Error('보호 카트리지 목차가 올바르지 않습니다.');

            const encoder = new TextEncoder();
            const files = new Map();
            for (const entry of index.entries) {
                const path = ZipStore.normalizePath(entry.p);
                const start = dataStart + Number(entry.o);
                const end = start + Number(entry.n);
                if (!Number.isFinite(start) || end > bytes.length || end < start) throw new Error(`보호 카트리지 항목이 손상되었습니다: ${path}`);
                let data;
                try {
                    data = new Uint8Array(await crypto.subtle.decrypt(
                        { name: 'AES-GCM', iv: this.fromBase64(entry.iv), additionalData: encoder.encode(entry.p) },
                        key, bytes.slice(start, end)
                    ));
                    if (entry.m === 8) data = await this.inflateRaw(data);
                } catch (error) {
                    throw new Error(`보호 카트리지 항목을 풀 수 없습니다: ${path}`);
                }
                if (data.length !== entry.s) throw new Error(`보호 카트리지 항목 크기가 맞지 않습니다: ${path}`);
                if (files.has(path)) throw new Error(`중복된 카트리지 파일입니다: ${path}`);
                files.set(path, data);
            }
            return files;
        },

        // 스튜디오에서 보호해서 내보낼 때 쓴다. 주석 지우기는 하지 않는다 (Python 빌더만 한다).
        async seal(inputEntries) {
            const encoder = new TextEncoder();
            const entries = Array.from(inputEntries instanceof Map ? inputEntries.entries() : Object.entries(inputEntries));
            const salt = crypto.getRandomValues(new Uint8Array(16));
            const key = await this.deriveKey(salt, 1, ['encrypt']);
            const index = [];
            const chunks = [];
            let offset = 0;
            for (const [rawPath, rawData] of entries) {
                const path = ZipStore.normalizePath(rawPath);
                const data = rawData instanceof Uint8Array ? rawData : encoder.encode(String(rawData));
                let payload = data;
                let method = 0;
                if (this.shouldCompress(path)) {
                    const packed = await this.deflateRaw(data);
                    if (packed.length < data.length) { payload = packed; method = 8; }
                }
                const iv = crypto.getRandomValues(new Uint8Array(12));
                const encrypted = new Uint8Array(await crypto.subtle.encrypt(
                    { name: 'AES-GCM', iv, additionalData: encoder.encode(path) }, key, payload
                ));
                index.push({ p: path, o: offset, n: encrypted.length, s: data.length, m: method, iv: this.toBase64(iv) });
                chunks.push(encrypted);
                offset += encrypted.length;
            }

            const indexBytes = encoder.encode(JSON.stringify({ v: 1, entries: index }));
            const header = new Uint8Array(this.HEADER_SIZE);
            const headerView = new DataView(header.buffer);
            header.set(this.MAGIC, 0);
            header[4] = this.CONTAINER_VERSION;
            header[5] = 1;
            header.set(salt, 8);
            const indexIv = crypto.getRandomValues(new Uint8Array(12));
            header.set(indexIv, 24);
            headerView.setUint32(36, indexBytes.length + 16, true);
            const encryptedIndex = new Uint8Array(await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: indexIv, additionalData: header }, key, indexBytes
            ));

            const output = new Uint8Array(this.HEADER_SIZE + encryptedIndex.length + offset);
            output.set(header, 0);
            output.set(encryptedIndex, this.HEADER_SIZE);
            let writeOffset = this.HEADER_SIZE + encryptedIndex.length;
            chunks.forEach(chunk => { output.set(chunk, writeOffset); writeOffset += chunk.length; });
            return output;
        }
    };

    const CartridgeFormat = {
        isPlainObject(value) {
            return value !== null && typeof value === 'object' && !Array.isArray(value);
        },

        sanitizeId(value) {
            return String(value || 'manual').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'manual';
        },

        compareVersions(left, right) {
            const toParts = value => String(value).split('.').map(part => Number.parseInt(part, 10) || 0);
            const leftParts = toParts(left);
            const rightParts = toParts(right);
            const length = Math.max(leftParts.length, rightParts.length);
            for (let index = 0; index < length; index++) {
                const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
                if (difference !== 0) return difference;
            }
            return 0;
        },

        fromPackageManifest(packageManifest) {
            if (!this.isPlainObject(packageManifest)) throw new Error('manifest.json은 객체여야 합니다.');
            const moduleList = Array.isArray(packageManifest.modules) ? packageManifest.modules : [];
            const modules = {};
            moduleList.forEach(moduleDefinition => {
                if (!this.isPlainObject(moduleDefinition) || !String(moduleDefinition.id || '').trim()) {
                    throw new Error('모든 카트리지 모듈에는 id가 필요합니다.');
                }
                const moduleId = String(moduleDefinition.id).trim();
                if (modules[moduleId]) throw new Error(`중복된 모듈 ID입니다: ${moduleId}`);
                modules[moduleId] = { ...moduleDefinition, id: undefined, enabled: moduleDefinition.enabled !== false };
                delete modules[moduleId].id;
            });

            return this.normalize({
                format: packageManifest.format,
                formatVersion: packageManifest.formatVersion,
                manifest: {
                    id: packageManifest.id,
                    name: packageManifest.name,
                    version: packageManifest.version,
                    engineVersion: packageManifest.engineVersion,
                    author: packageManifest.author,
                    description: packageManifest.description,
                    storyIds: packageManifest.storyIds,
                    coverUrl: packageManifest.coverUrl
                },
                theme: packageManifest.theme,
                skin: packageManifest.skin,
                presentation: packageManifest.presentation || {},
                modules,
                assets: packageManifest.assets || {},
                hotspots: packageManifest.hotspots,
                home: packageManifest.home,
                initialState: {}
            });
        },

        toPackageManifest(cartridge) {
            const normalized = this.normalize(cartridge);
            return {
                format: normalized.format,
                formatVersion: normalized.formatVersion,
                ...normalized.manifest,
                presentation: normalized.presentation,
                modules: Object.entries(normalized.modules).map(([id, definition]) => ({ id, ...definition })),
                assets: normalized.assets,
                ...(normalized.hotspots ? { hotspots: normalized.hotspots } : {}),
                ...(normalized.home ? { home: normalized.home } : {}),
                theme: normalized.theme,
                skin: normalized.skin
            };
        },

        normalize(raw, fallback = {}) {
            if (!this.isPlainObject(raw)) throw new Error('카트리지 최상위 데이터는 객체여야 합니다.');
            if (raw.format !== CARTRIDGE_FORMAT) throw new Error(`지원하지 않는 카트리지 형식입니다: ${raw.format || '형식 없음'}`);
            if (Number(raw.formatVersion) !== CARTRIDGE_FORMAT_VERSION) {
                throw new Error(`지원하지 않는 카트리지 버전입니다: ${raw.formatVersion || '버전 없음'}`);
            }

            const manifest = this.isPlainObject(raw.manifest) ? raw.manifest : {};
            const id = String(manifest.id || '').trim();
            const name = String(manifest.name || fallback.name || '').trim();
            if (!id) throw new Error('카트리지 manifest.id가 필요합니다.');
            if (!name) throw new Error('카트리지 manifest.name이 필요합니다.');
            const requiredEngineVersion = String(manifest.engineVersion || ENGINE_VERSION);
            if (this.compareVersions(ENGINE_VERSION, requiredEngineVersion) < 0) {
                throw new Error(`이 카트리지는 VN Engine ${requiredEngineVersion} 이상이 필요합니다.`);
            }

            const storyIds = Array.isArray(manifest.storyIds)
                ? manifest.storyIds.map(value => String(value).trim()).filter(Boolean)
                : [];
            const presentation = this.isPlainObject(raw.presentation) ? raw.presentation : {};
            const modules = this.isPlainObject(raw.modules) ? raw.modules : {};

            Object.entries(modules).forEach(([moduleId, moduleDefinition]) => {
                if (!this.isPlainObject(moduleDefinition)) throw new Error(`modules.${moduleId}는 객체여야 합니다.`);
                if (moduleDefinition.enabled !== undefined && typeof moduleDefinition.enabled !== 'boolean') {
                    throw new Error(`modules.${moduleId}.enabled는 true 또는 false여야 합니다.`);
                }
            });

            return {
                format: CARTRIDGE_FORMAT,
                formatVersion: CARTRIDGE_FORMAT_VERSION,
                manifest: {
                    id,
                    name,
                    version: String(manifest.version || '1.0.0'),
                    engineVersion: requiredEngineVersion,
                    author: String(manifest.author || ''),
                    description: String(manifest.description || ''),
                    storyIds,
                    coverUrl: String(manifest.coverUrl || fallback.coverUrl || '')
                },
                presentation: {
                    animations: Array.isArray(presentation.animations) ? presentation.animations : [],
                    bgm: Array.isArray(presentation.bgm) ? presentation.bgm : [],
                    opening: Array.isArray(presentation.opening) || typeof presentation.opening === 'string' ? presentation.opening : [],
                    // 이야기 도중 조건이 맞으면 끼워 넣는 장면 (SceneDirector). 없으면 칸을 만들지 않는다.
                    ...(Array.isArray(presentation.scenes) && presentation.scenes.length > 0 ? { scenes: presentation.scenes } : {})
                },
                modules,
                assets: this.isPlainObject(raw.assets) ? raw.assets : {},
                // 배경 위의 누를 수 있는 자리. 여기서 빠뜨리면 실행기(buildHotspotIndex)가 볼 수 없다.
                hotspots: this.isPlainObject(raw.hotspots) ? raw.hotspots : null,
                // 대화하지 않을 때 머무는 방 화면. 실행기(buildHomeScene)가 읽는다.
                home: this.isPlainObject(raw.home) ? raw.home : null,
                // theme 은 manifest 안의 객체이거나 패키지 안 JSON 파일 경로 문자열이다.
                theme: typeof raw.theme === 'string' || this.isPlainObject(raw.theme) ? raw.theme : null,
                // skin 은 패키지 안 CSS 파일 경로 하나 또는 여러 개다.
                skin: typeof raw.skin === 'string' || Array.isArray(raw.skin) ? raw.skin : null,
                initialState: this.isPlainObject(raw.initialState) ? raw.initialState : {}
            };
        },

        fromLegacy(raw, fallback = {}) {
            const isAnimationArray = Array.isArray(raw);
            const meta = !isAnimationArray && this.isPlainObject(raw?.meta) ? raw.meta : {};
            const settings = !isAnimationArray && this.isPlainObject(raw?.settings) ? raw.settings : {};
            const storyId = String(meta.storyId || fallback.storyId || 'manual');
            const name = String(fallback.name || meta.name || `Legacy ${storyId}`);
            return this.normalize({
                format: CARTRIDGE_FORMAT,
                formatVersion: CARTRIDGE_FORMAT_VERSION,
                manifest: {
                    id: `legacy.${this.sanitizeId(storyId)}`,
                    name,
                    version: String(meta.version || '1.0.0'),
                    engineVersion: ENGINE_VERSION,
                    storyIds: storyId === 'manual' ? [] : [storyId],
                    coverUrl: String(meta.coverUrl || fallback.coverUrl || '')
                },
                presentation: {
                    animations: isAnimationArray ? raw : (settings.animations || raw.customAnimations || []),
                    bgm: isAnimationArray ? [] : (settings.bgm || raw.customBgmRules || []),
                    opening: isAnimationArray ? [] : (raw.opening || [])
                },
                modules: {},
                assets: {},
                initialState: {}
            }, fallback);
        },

        parse(text, fileName = '') {
            let raw;
            try { raw = JSON.parse(text); }
            catch (error) { throw new Error('카트리지 JSON 형식이 올바르지 않습니다.'); }

            const fallbackName = fileName.replace(/\.(vncartridge|json)$/i, '') || '가져온 카트리지';
            if (this.isPlainObject(raw) && raw.format === CARTRIDGE_FORMAT) {
                return this.normalize(raw, { name: fallbackName });
            }
            if (Array.isArray(raw) || (this.isPlainObject(raw) && raw.settings && raw.meta)) {
                return this.fromLegacy(raw, { name: fallbackName });
            }
            throw new Error('VN Engine 카트리지 또는 기존 설정 파일이 아닙니다.');
        },

        createTemplate({ name, storyId, coverUrl, animations, bgm, opening }) {
            const normalizedStoryId = String(storyId || 'manual');
            return this.normalize({
                format: CARTRIDGE_FORMAT,
                formatVersion: CARTRIDGE_FORMAT_VERSION,
                manifest: {
                    id: `cartridge.${this.sanitizeId(normalizedStoryId)}.${Date.now()}`,
                    name: name || '새 카트리지',
                    version: '1.0.0',
                    engineVersion: ENGINE_VERSION,
                    storyIds: normalizedStoryId === 'manual' ? [] : [normalizedStoryId],
                    coverUrl: coverUrl || ''
                },
                presentation: { animations: animations || [], bgm: bgm || [], opening: opening || [] },
                modules: {},
                assets: {},
                initialState: {}
            });
        }
    };

    const CartridgePackageReader = {
        // 압축을 풀고 보호 카트리지를 여는 데 기다려야 해서 기다리는 함수다 (보호판 엔진).
        // packageType 은 'zip' / 'protected' / 'legacy-json'. 'protected' 도 패키지라서 라이브러리에 그대로 저장된다.
        async readArrayBuffer(input, fileName = '') {
            const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
            const isZip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
            const isProtected = CartridgeProtect.isProtected(bytes);

            if (!isZip && !isProtected) {
                if (fileName.toLowerCase().endsWith(CARTRIDGE_EXTENSION)) {
                    throw new Error(`${CARTRIDGE_EXTENSION} 파일은 ZIP 패키지나 보호 카트리지여야 합니다.`);
                }
                const cartridge = CartridgeFormat.parse(new TextDecoder('utf-8').decode(bytes), fileName);
                return { cartridge, files: new Map(), bytes, packageType: 'legacy-json' };
            }

            const files = isProtected ? await CartridgeProtect.open(bytes) : await ZipStore.read(bytes);
            const manifestBytes = files.get('manifest.json');
            if (!manifestBytes) throw new Error('카트리지 루트에 manifest.json이 필요합니다.');
            let manifest;
            try { manifest = JSON.parse(new TextDecoder('utf-8').decode(manifestBytes)); }
            catch (error) { throw new Error('manifest.json 형식이 올바르지 않습니다.'); }

            const cartridge = CartridgeFormat.fromPackageManifest(manifest);
            Object.entries(cartridge.modules).forEach(([moduleId, moduleDefinition]) => {
                if (moduleDefinition.entry && !files.has(moduleDefinition.entry)) {
                    throw new Error(`모듈 파일을 찾을 수 없습니다: ${moduleId} → ${moduleDefinition.entry}`);
                }
                [['styles', '스타일'], ['scripts', '스크립트']].forEach(([fieldName, label]) => {
                    const resourcePaths = moduleDefinition[fieldName];
                    if (resourcePaths === undefined) return;
                    if (!Array.isArray(resourcePaths) || resourcePaths.some(resourcePath => typeof resourcePath !== 'string' || !resourcePath.trim())) {
                        throw new Error(`modules.${moduleId}.${fieldName}는 파일 경로 배열이어야 합니다.`);
                    }
                    resourcePaths.forEach(resourcePath => {
                        if (!files.has(resourcePath)) throw new Error(`모듈 ${label} 파일을 찾을 수 없습니다: ${moduleId} → ${resourcePath}`);
                    });
                });
                if (moduleDefinition.dataFiles !== undefined) {
                    if (!CartridgeFormat.isPlainObject(moduleDefinition.dataFiles)) {
                        throw new Error(`modules.${moduleId}.dataFiles는 이름과 파일 경로의 객체여야 합니다.`);
                    }
                    Object.entries(moduleDefinition.dataFiles).forEach(([dataName, dataPath]) => {
                        if (!dataName.trim() || typeof dataPath !== 'string' || !dataPath.trim()) {
                            throw new Error(`modules.${moduleId}.dataFiles 항목이 올바르지 않습니다.`);
                        }
                        if (!files.has(dataPath)) {
                            throw new Error(`모듈 데이터 파일을 찾을 수 없습니다: ${moduleId}.${dataName} → ${dataPath}`);
                        }
                        if (dataPath.toLowerCase().endsWith('.json')) {
                            try { JSON.parse(new TextDecoder('utf-8').decode(files.get(dataPath))); }
                            catch (error) { throw new Error(`모듈 JSON 데이터 형식이 올바르지 않습니다: ${dataPath}`); }
                        }
                    });
                }
                // 모듈 화면 안에서 쓸 그림. 화면은 격리된 액자라 엔진이 data: 주소로 바꿔 넘긴다.
                if (moduleDefinition.images !== undefined) {
                    if (!CartridgeFormat.isPlainObject(moduleDefinition.images)) {
                        throw new Error(`modules.${moduleId}.images는 이름과 그림 파일 경로의 객체여야 합니다.`);
                    }
                    Object.entries(moduleDefinition.images).forEach(([imageName, imagePath]) => {
                        if (!imageName.trim() || typeof imagePath !== 'string' || !imagePath.trim()) {
                            throw new Error(`modules.${moduleId}.images 항목이 올바르지 않습니다.`);
                        }
                        if (!MODULE_IMAGE_PATTERN.test(imagePath)) {
                            throw new Error(`모듈 그림은 이미지 파일이어야 합니다: ${moduleId}.${imageName} → ${imagePath}`);
                        }
                        if (!files.has(imagePath)) {
                            throw new Error(`모듈 그림 파일을 찾을 수 없습니다: ${moduleId}.${imageName} → ${imagePath}`);
                        }
                    });
                }
            });
            return { cartridge, files, bytes, packageType: isProtected ? 'protected' : 'zip' };
        }
    };

    const CartridgePackageStore = {
        databaseName: 'vnEngineCartridgePackages',
        storeName: 'packages',

        open() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.databaseName, 1);
                request.onupgradeneeded = () => {
                    if (!request.result.objectStoreNames.contains(this.storeName)) {
                        request.result.createObjectStore(this.storeName, { keyPath: 'id' });
                    }
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error || new Error('카트리지 저장소를 열 수 없습니다.'));
            });
        },

        async put(cartridgeId, bytes, fileName) {
            const database = await this.open();
            return new Promise((resolve, reject) => {
                const transaction = database.transaction(this.storeName, 'readwrite');
                transaction.objectStore(this.storeName).put({
                    id: cartridgeId,
                    fileName,
                    blob: new Blob([bytes], { type: 'application/vnd.vn-engine.cartridge+zip' }),
                    installedAt: new Date().toISOString()
                });
                transaction.oncomplete = () => { database.close(); resolve(); };
                transaction.onerror = () => { database.close(); reject(transaction.error || new Error('카트리지를 저장할 수 없습니다.')); };
            });
        },

        async get(cartridgeId) {
            const database = await this.open();
            return new Promise((resolve, reject) => {
                const transaction = database.transaction(this.storeName, 'readonly');
                const request = transaction.objectStore(this.storeName).get(cartridgeId);
                request.onsuccess = () => { database.close(); resolve(request.result || null); };
                request.onerror = () => { database.close(); reject(request.error || new Error('카트리지를 불러올 수 없습니다.')); };
            });
        },

        async delete(cartridgeId) {
            const database = await this.open();
            return new Promise((resolve, reject) => {
                const transaction = database.transaction(this.storeName, 'readwrite');
                transaction.objectStore(this.storeName).delete(cartridgeId);
                transaction.oncomplete = () => { database.close(); resolve(); };
                transaction.onerror = () => { database.close(); reject(transaction.error || new Error('카트리지를 삭제할 수 없습니다.')); };
            });
        }
    };

    // --- 카트리지 공유 서랍 ---
    // 모듈별 저장소와 달리 카트리지 하나에 서랍 하나다. 모듈들이 같은 값을 보고 쓴다.
    // 통째로 덮어쓰면 서로 지우게 되므로, 최상위 항목 단위로만 바꾼다(값이 null 이면 삭제).
    const CartridgeSharedStateStore = {
        storagePrefix: 'vnEngineSharedState',

        getScopeId() {
            return getCurrentTargetId()?.id || 'manual';
        },

        getKey(cartridgeId) {
            return `${this.storagePrefix}:${this.getScopeId()}:${cartridgeId}`;
        },

        normalize(state) {
            if (!state || typeof state !== 'object' || Array.isArray(state)) return {};
            const serialized = JSON.stringify(state);
            if (serialized.length > 250000) throw new Error('공유 상태가 저장 한도를 초과했습니다.');
            return JSON.parse(serialized);
        },

        load(cartridgeId) {
            try {
                const raw = localStorage.getItem(this.getKey(cartridgeId));
                return raw ? this.normalize(JSON.parse(raw)) : {};
            } catch (error) {
                console.warn('VN Engine: 공유 상태를 불러오지 못했습니다.', error);
                return {};
            }
        },

        patch(cartridgeId, patch) {
            const incoming = this.normalize(patch);
            const next = this.load(cartridgeId);
            Object.entries(incoming).forEach(([key, value]) => {
                if (value === null) delete next[key];
                else next[key] = value;
            });
            const normalized = this.normalize(next);
            localStorage.setItem(this.getKey(cartridgeId), JSON.stringify(normalized));
            return normalized;
        },

        clear(cartridgeId) {
            localStorage.removeItem(this.getKey(cartridgeId));
        }
    };

    // 메뉴에 어떤 화면 모듈을 보일지. 모듈이 VNCartridge.menu.show/hide 로 바꾼 값을 이야기(채팅)마다 기억한다.
    // 적힌 값이 없으면 manifest 의 "menu" 를 따른다 (false 면 숨김, 없으면 보임).
    const CartridgeMenuStore = {
        storagePrefix: 'vnEngineMenuState',

        getKey(cartridgeId) {
            return `${this.storagePrefix}:${getCurrentTargetId()?.id || 'manual'}:${cartridgeId}`;
        },

        load(cartridgeId) {
            try {
                const data = JSON.parse(localStorage.getItem(this.getKey(cartridgeId)) || '{}');
                return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
            } catch (error) {
                return {};
            }
        },

        set(cartridgeId, moduleId, visible) {
            const data = this.load(cartridgeId);
            data[moduleId] = visible === true;
            localStorage.setItem(this.getKey(cartridgeId), JSON.stringify(data));
            return data;
        },

        clear(cartridgeId) {
            localStorage.removeItem(this.getKey(cartridgeId));
        }
    };

    const CartridgeModuleStateStore = {
        storagePrefix: 'vnEngineModuleState',

        getScopeId() {
            return getCurrentTargetId()?.id || 'manual';
        },

        getKey(cartridgeId, moduleId) {
            return `${this.storagePrefix}:${this.getScopeId()}:${cartridgeId}:${moduleId}`;
        },

        normalize(state) {
            if (!state || typeof state !== 'object' || Array.isArray(state)) return {};
            const serialized = JSON.stringify(state);
            if (serialized.length > 250000) throw new Error('모듈 상태가 저장 한도를 초과했습니다.');
            return JSON.parse(serialized);
        },

        load(cartridgeId, moduleId) {
            try {
                const raw = localStorage.getItem(this.getKey(cartridgeId, moduleId));
                return raw ? this.normalize(JSON.parse(raw)) : {};
            } catch (error) {
                console.warn('VN Engine: 모듈 상태를 불러오지 못했습니다.', error);
                return {};
            }
        },

        save(cartridgeId, moduleId, state) {
            const normalized = this.normalize(state);
            localStorage.setItem(this.getKey(cartridgeId, moduleId), JSON.stringify(normalized));
            return normalized;
        }
    };

    const AiMessageContextQueue = {
        storagePrefix: 'vnEngineAiMessageContext',
        maximumItems: 50,
        maximumTextLength: 16000,

        getKey() {
            return `${this.storagePrefix}:${getCurrentTargetId()?.id || 'manual'}`;
        },

        load() {
            try {
                const parsed = JSON.parse(localStorage.getItem(this.getKey()) || '[]');
                return Array.isArray(parsed) ? parsed.filter(item => item && typeof item.id === 'string' && typeof item.text === 'string') : [];
            } catch (error) {
                console.warn('VN Engine: AI 문맥 대기열을 불러오지 못했습니다.', error);
                return [];
            }
        },

        save(items) {
            const normalized = Array.isArray(items) ? items.slice(-this.maximumItems) : [];
            localStorage.setItem(this.getKey(), JSON.stringify(normalized));
            return normalized;
        },

        enqueue(cartridgeId, moduleId, event) {
            if (!event || typeof event !== 'object') throw new Error('AI 문맥 이벤트가 올바르지 않습니다.');
            const text = String(event.text || '').trim();
            if (!text) throw new Error('AI에 전달할 문맥이 비어 있습니다.');
            if (text.length > this.maximumTextLength) throw new Error('AI 문맥이 허용 길이를 초과했습니다.');
            const localId = String(event.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`).slice(0, 160);
            const id = `${cartridgeId}:${moduleId}:${localId}`;
            const items = this.load();
            const existing = items.find(item => item.id === id);
            if (existing) {
                // 진행 상황처럼 계속 바뀌는 알림은 같은 자리를 덮어써서 마지막 것 하나만 남긴다.
                if (event.replace !== true) return existing;
                existing.title = String(event.title || existing.title).slice(0, 120);
                existing.text = text;
                existing.createdAt = Number.isFinite(event.createdAt) ? event.createdAt : Date.now();
                this.save(items);
                return existing;
            }
            const item = {
                id,
                cartridgeId,
                moduleId,
                title: String(event.title || moduleId).slice(0, 120),
                text,
                createdAt: Number.isFinite(event.createdAt) ? event.createdAt : Date.now()
            };
            items.push(item);
            this.save(items);
            return item;
        },

        compose(userMessage) {
            const items = this.load();
            const contextText = items.map(item => item.text).join('\n\n');
            return {
                finalMessage: contextText ? `${userMessage}\n\n${contextText}` : userMessage,
                items
            };
        },

        // 카트리지가 넣어 둔 알림을 이름으로 걷어낸다. 지도가 넣은 것을 상시 모듈이 걷을 수도 있게
        // 모듈은 가리지 않고, 같은 카트리지의 같은 이름이면 걷는다.
        withdraw(cartridgeId, localId) {
            const name = String(localId === undefined || localId === null ? '' : localId).trim();
            if (!cartridgeId || !name) return 0;
            const suffix = `:${name}`;
            const items = this.load();
            const kept = items.filter(item => !(item.cartridgeId === cartridgeId && item.id.endsWith(suffix)));
            if (kept.length !== items.length) this.save(kept);
            return items.length - kept.length;
        },

        consume(itemIds) {
            const consumed = new Set(Array.isArray(itemIds) ? itemIds : []);
            if (consumed.size === 0) return this.load();
            return this.save(this.load().filter(item => !consumed.has(item.id)));
        },

        clear() {
            this.save([]);
        }
    };

    const AiTransmissionLogStore = {
        storagePrefix: 'vnEngineAiTransmissionLog',
        maximumItems: 40,

        getKey() {
            return `${this.storagePrefix}:${getCurrentTargetId()?.id || 'manual'}`;
        },

        load() {
            try {
                const parsed = JSON.parse(localStorage.getItem(this.getKey()) || '[]');
                return Array.isArray(parsed) ? parsed : [];
            } catch (error) {
                console.warn('VN Engine: AI 전송 로그를 불러오지 못했습니다.', error);
                return [];
            }
        },

        record(entry) {
            const items = this.load();
            items.push({
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                timestamp: Date.now(),
                status: entry.status === 'sent' ? 'sent' : 'failed',
                userMessage: String(entry.userMessage || '').slice(0, 50000),
                finalMessage: String(entry.finalMessage || '').slice(0, 100000),
                contextTitles: Array.isArray(entry.contextTitles) ? entry.contextTitles.map(title => String(title).slice(0, 120)) : [],
                error: String(entry.error || '').slice(0, 500)
            });
            localStorage.setItem(this.getKey(), JSON.stringify(items.slice(-this.maximumItems)));
        },

        clear() {
            localStorage.setItem(this.getKey(), '[]');
        }
    };

    // --- UI 테마 관리자 ---
    // 카트리지가 준 값으로 generateStyles 의 :root 토큰만 덮어쓴다.
    // 선택자는 받지 않으므로 카트리지가 화면 구조를 건드릴 수는 없다.
    const THEME_TOKENS = [
        'font', 'accent', 'panelBg', 'panelText', 'panelBorder', 'backdrop', 'radius',
        'divider', 'sidebarBg', 'mutedText', 'tabText', 'tabHoverBg', 'accentBg', 'accentText',
        'actionBg', 'actionBorder', 'actionText', 'dangerBg', 'dangerBorder', 'dangerText',
        'dialogueBg', 'dialogueBorder', 'dialogueText', 'dialogueRadius',
        'nameBg', 'nameBorder', 'nameText', 'narrationText',
        'statusBg', 'statusBorder', 'statusText', 'statusAccent',
        'menuButtonBg', 'menuButtonBgHover', 'menuButtonText',
        'moduleBg', 'moduleBackdrop', 'moduleBorder', 'frameBg',
        'primary', 'primaryHover', 'controlBg'
    ];
    // 색, 길이, 글꼴 이름에 필요한 문자만 허용한다. 세미콜론과 중괄호가 없으므로 값 밖으로 나갈 수 없다.
    const THEME_VALUE_ALLOWED = /^[#a-zA-Z0-9\s,.()%'"\/+-]{1,120}$/;
    const THEME_VALUE_FORBIDDEN = /url\(|@import|expression|javascript:|image-set/i;

    const ThemeManager = {
        styleId: 'vn-cartridge-theme',
        activeTheme: null,

        toCssVariable(key) {
            return `--vn-${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`;
        },

        sanitize(theme) {
            const result = {};
            if (!theme || typeof theme !== 'object' || Array.isArray(theme)) return result;
            Object.entries(theme).forEach(([key, rawValue]) => {
                if (!THEME_TOKENS.includes(key)) {
                    console.warn(`VN Engine: 알 수 없는 테마 항목을 건너뜁니다 — ${key}`);
                    return;
                }
                const value = String(rawValue).trim();
                if (!THEME_VALUE_ALLOWED.test(value) || THEME_VALUE_FORBIDDEN.test(value)) {
                    console.warn(`VN Engine: 사용할 수 없는 테마 값을 건너뜁니다 — ${key}`);
                    return;
                }
                result[key] = value;
            });
            return result;
        },

        apply(theme) {
            const sanitized = this.sanitize(theme);
            this.activeTheme = Object.keys(sanitized).length > 0 ? sanitized : null;
            this.render();
        },

        clear() {
            this.activeTheme = null;
            this.render();
        },

        isEnabled() {
            const settings = (typeof SettingsManager !== 'undefined' && SettingsManager.settings) || {};
            return settings.useCartridgeTheme !== false;
        },

        render() {
            // 문서가 없는 환경(테스트 등)에서는 조용히 넘어간다.
            if (typeof document === 'undefined') return;
            const existing = document.getElementById(this.styleId);
            const entries = this.isEnabled() && this.activeTheme ? Object.entries(this.activeTheme) : [];
            if (entries.length === 0) {
                existing?.remove();
                return;
            }
            // html:root 는 :root 보다 우선순위가 높아, 기본 토큰이 나중에 다시 주입돼도 테마가 유지된다.
            const declarations = entries.map(([key, value]) => `${this.toCssVariable(key)}:${value};`).join('');
            const style = existing || document.createElement('style');
            style.id = this.styleId;
            style.textContent = `html:root{${declarations}}`;
            if (!existing) document.head.appendChild(style);
        }
    };

    // --- 카트리지 스킨 관리자 ---
    // 카트리지가 준 CSS 를 엔진 UI 안으로만 범위를 좁혀서 주입한다.
    // 선택자 앞에 엔진 루트를 강제로 붙이므로 Crack 페이지 본체에는 닿지 않는다.
    const SKIN_ROOTS = ['#vn-engine-container', '#vn-module-overlay', '.vn-control-panel'];
    const SKIN_MAX_LENGTH = 120000;
    const SKIN_FORBIDDEN = /@import|@charset|@namespace|expression\s*\(|behavior\s*:|-moz-binding|javascript:|<\/?script/i;

    const SkinManager = {
        styleId: 'vn-cartridge-skin',
        activeCss: null,

        splitSelectors(prelude) {
            const parts = [];
            let current = '';
            let depth = 0;
            let quote = null;
            for (const character of prelude) {
                if (quote) {
                    current += character;
                    if (character === quote) quote = null;
                    continue;
                }
                if (character === '"' || character === "'") { quote = character; current += character; continue; }
                if (character === '(' || character === '[') depth += 1;
                if (character === ')' || character === ']') depth -= 1;
                if (character === ',' && depth === 0) { parts.push(current); current = ''; continue; }
                current += character;
            }
            parts.push(current);
            return parts.map(part => part.trim()).filter(Boolean);
        },

        scopeSelector(selector) {
            // :root, html, body 처럼 엔진 밖을 노리는 선택자는 버린다.
            if (/^(:root|html|body)\b/i.test(selector)) {
                console.warn(`VN Engine: 스킨에서 범위를 벗어난 선택자를 건너뜁니다 — ${selector}`);
                return '';
            }
            return SKIN_ROOTS.map(root => `${root} ${selector}`).join(', ');
        },

        scope(css) {
            let result = '';
            let cursor = 0;
            while (cursor < css.length) {
                const open = css.indexOf('{', cursor);
                if (open < 0) break;
                const prelude = css.slice(cursor, open).trim();
                let depth = 1;
                let index = open + 1;
                while (index < css.length && depth > 0) {
                    if (css[index] === '{') depth += 1;
                    else if (css[index] === '}') depth -= 1;
                    index += 1;
                }
                const body = css.slice(open + 1, index - 1);
                cursor = index;
                if (!prelude) continue;

                if (prelude.startsWith('@')) {
                    const name = prelude.slice(1).split(/[\s({]/)[0].toLowerCase();
                    if (name === 'media' || name === 'supports' || name === 'layer') {
                        const inner = this.scope(body);
                        if (inner) result += `${prelude}{${inner}}`;
                    } else if (name.endsWith('keyframes')) {
                        // 키프레임 안은 선택자가 아니라 진행률이므로 그대로 둔다.
                        result += `${prelude}{${body}}`;
                    } else if (name === 'font-face') {
                        // 카트리지에 담은 글꼴 (엔진 3.34.0). url() 은 위에서 data: 만 남겼으므로 바깥 주소를 부르지 않는다.
                        result += `@font-face{${body}}`;
                    } else {
                        console.warn(`VN Engine: 스킨에서 지원하지 않는 규칙을 건너뜁니다 — ${prelude}`);
                    }
                    continue;
                }

                const selectors = this.splitSelectors(prelude).map(selector => this.scopeSelector(selector)).filter(Boolean);
                if (selectors.length === 0) continue;
                result += `${selectors.join(', ')}{${body}}`;
            }
            return result;
        },

        prepare(rawCss) {
            const text = String(rawCss || '');
            if (!text.trim()) return '';
            if (text.length > SKIN_MAX_LENGTH) {
                console.warn('VN Engine: 스킨 CSS 가 너무 큽니다. 적용하지 않습니다.');
                return '';
            }
            let css = text.replace(/\/\*[\s\S]*?\*\//g, '');
            if (SKIN_FORBIDDEN.test(css)) {
                console.warn('VN Engine: 스킨 CSS 에 허용되지 않는 구문이 있어 적용하지 않습니다.');
                return '';
            }
            // 외부 주소를 가리키는 url() 은 막는다. 패키지에 담긴 data: 는 허용한다.
            css = css.replace(/url\(\s*(['"]?)([^)'"]*)\1\s*\)/gi, (match, quote, target) =>
                /^data:/i.test(String(target).trim()) ? match : 'none');
            // !important 를 지워, 아래 보호 규칙이 항상 우선하도록 한다.
            css = css.replace(/!\s*important/gi, '');
            return this.scope(css);
        },

        // 카트리지가 무슨 짓을 해도 메뉴와 닫기 버튼만은 남겨, 카트리지를 뺄 길을 보장한다.
        // 스킨의 !important 는 모두 제거했으므로, 여기의 !important 가 특이도와 무관하게 이긴다.
        // 보장 훅만 쓰므로 이 함수는 DOM_IDS 같은 바깥 값에 기대지 않는다.
        guardCss() {
            const visible = 'visibility:visible!important;opacity:1!important;pointer-events:auto!important;';
            return [
                `[data-vn-part="menu-button"]{display:inline-block!important;${visible}}`,
                `[data-vn-part="menu-action"]{display:block!important;${visible}}`,
                `[data-vn-part="menu-actions"]{display:grid!important;${visible}}`,
                `[data-vn-part="menu-close"],[data-vn-part="module-close"]{display:inline-block!important;${visible}}`,
                `.vn-control-panel.vn-paused .vn-pause-only,.vn-drawer-toggle{display:inline-block!important;${visible}}`,
                // 좁은 화면에서 엔진이 쓰는 가로 배치를 보장 규칙이 덮지 않도록 같이 맞춘다.
                '@media (max-width: 720px){[data-vn-part="menu-actions"]{display:flex!important;}}',
                '@media (max-height: 500px){[data-vn-part="menu-actions"]{display:flex!important;}}'
            ].join('');
        },

        apply(css) {
            this.activeCss = this.prepare(css) || null;
            this.render();
        },

        clear() {
            this.activeCss = null;
            this.render();
        },

        render() {
            // 문서가 없는 환경(테스트 등)에서는 조용히 넘어간다.
            if (typeof document === 'undefined') return;
            const existing = document.getElementById(this.styleId);
            const settings = (typeof SettingsManager !== 'undefined' && SettingsManager.settings) || {};
            const enabled = settings.useCartridgeTheme !== false;
            if (!enabled || !this.activeCss) {
                existing?.remove();
                return;
            }
            const style = existing || document.createElement('style');
            style.id = this.styleId;
            style.textContent = `${this.activeCss}\n${this.guardCss()}`;
            if (!existing) document.head.appendChild(style);
        }
    };

    const CartridgeRuntime = {
        activeCartridge: null,
        packageFiles: new Map(),
        frameBindings: new WeakMap(),
        // WeakMap 은 순회가 안 되어 전체 통지를 못 한다. 살아 있는 액자 목록을 따로 들고 간다.
        liveFrames: [],
        imageAssets: new Map(),
        declaredImages: new Map(),
        speakerCharacterIds: new Map(),
        hotspots: new Map(),
        hotspotReveal: 'always',
        home: null,
        objectUrls: new Map(),
        dataUrls: new Map(),

        activate(cartridge, packageFiles = new Map()) {
            if (this.activeCartridge) this.deactivate();
            this.activeCartridge = cartridge;
            this.packageFiles = packageFiles || new Map();
            ThemeManager.apply(this.resolveTheme(cartridge));
            SkinManager.apply(this.resolveSkin(cartridge));
            this.buildImageAssetIndex();
            this.buildDeclaredImageIndex();
            this.buildSpeakerIndex();
            this.buildHotspotIndex();
            this.buildHomeScene();
            const enabledModules = Object.entries(cartridge.modules || {})
                .filter(([, definition]) => definition.enabled === true)
                .map(([moduleId]) => moduleId);
            try { ServiceHost.start(); }
            catch (error) { console.error('VN Engine: 상시 모듈 시작 실패', error); }
            window.dispatchEvent(new CustomEvent('vn-engine:cartridge-activated', {
                detail: { cartridgeId: cartridge.manifest.id, enabledModules }
            }));
            console.log(`VN Engine: cartridge activated (${cartridge.manifest.id})`, enabledModules);
        },

        deactivate() {
            if (!this.activeCartridge) return;
            const cartridgeId = this.activeCartridge.manifest.id;
            this.activeCartridge = null;
            this.packageFiles = new Map();
            ThemeManager.clear();
            SkinManager.clear();
            try { ServiceHost.stop(); }
            catch (error) { console.error('VN Engine: 상시 모듈 정리 실패', error); }
            this.releaseObjectUrls();
            this.imageAssets = new Map();
            this.declaredImages = new Map();
            this.speakerCharacterIds = new Map();
            this.hotspots = new Map();
            this.hotspotReveal = 'always';
            this.home = null;
            // 카트리지가 내려가면 그 카트리지의 액자는 명부에서 뺀다.
            this.liveFrames = this.liveFrames.filter(entry => entry.cartridgeId !== cartridgeId);
            window.dispatchEvent(new CustomEvent('vn-engine:cartridge-deactivated', { detail: { cartridgeId } }));
        },

        // --- 카트리지 내장 이미지 ---
        // 매칭 키는 "확장자를 뗀 파일 이름" 그대로입니다. (mira01.png → mira01)
        // AI가 ![mira01] 이라고 쓰면 그 파일을 화면에 띄웁니다. 폴더 위치는 이름에 영향을 주지 않습니다.

        normalizeAssetName(value) {
            return String(value === undefined || value === null ? '' : value).trim().toLowerCase();
        },

        // 배경/캐릭터 판정은 기존 URL 방식과 같은 신호를 카트리지 경로에 적용한 것입니다.
        //   - 파일 이름이 bg_ 로 시작   → 배경
        //   - 경로가 backgroundPattern(기본 /g/)을 포함 → 배경
        //   - 경로가 characterPattern(기본 /c/)을 포함  → 캐릭터
        //   - 아무 신호도 없으면 캐릭터
        // 배경 신호가 하나라도 있으면 배경입니다. 설정이 바뀌면 바로 반영되도록 꺼낼 때 판정합니다.
        assetKindForPath(path) {
            const normalized = `/${String(path).replace(/^\/+/, '')}`;
            const settings = (typeof SettingsManager !== 'undefined' && SettingsManager.settings) || {};
            const backgroundPattern = settings.backgroundPattern || '/g/';
            const characterPattern = settings.characterPattern || '/c/';
            const fileName = normalized.slice(normalized.lastIndexOf('/') + 1);
            if (fileName.toLowerCase().startsWith(BACKGROUND_NAME_PREFIX)) return 'background';
            if (backgroundPattern && normalized.includes(backgroundPattern)) return 'background';
            if (characterPattern && normalized.includes(characterPattern)) return 'character';
            return 'character';
        },

        mimeTypeForPath(path) {
            const value = String(path);
            const extension = value.slice(value.lastIndexOf('.') + 1).toLowerCase();
            return {
                png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
                webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', svg: 'image/svg+xml',
                // 카트리지 안의 소리 파일 (BGM 규칙 · VNCartridge.playMusic)
                mp3: 'audio/mpeg', ogg: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac'
            }[extension] || 'application/octet-stream';
        },

        buildImageAssetIndex() {
            this.releaseObjectUrls();
            this.imageAssets = new Map();
            const imagePattern = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i;
            // 모듈 화면 전용 그림(타일·스프라이트)은 ![이름] 으로 부르는 그림이 아니다
            const moduleImagePaths = new Set();
            Object.values(this.activeCartridge?.modules || {}).forEach(definition => {
                if (CartridgeFormat.isPlainObject(definition?.images)) Object.values(definition.images).forEach(path => moduleImagePaths.add(path));
            });
            const imagePaths = [...this.packageFiles.keys()]
                .filter(path => imagePattern.test(path) && !moduleImagePaths.has(path))
                .sort();

            imagePaths.forEach(path => {
                const fileName = path.slice(path.lastIndexOf('/') + 1);
                const baseName = fileName.replace(/\.[^.]+$/, '');
                const key = this.normalizeAssetName(baseName);
                if (!key) return;
                if (this.imageAssets.has(key)) {
                    console.warn(`VN Engine: 이미지 이름이 중복되어 무시합니다 (${path}). 먼저 등록됨: ${this.imageAssets.get(key).path}`);
                    return;
                }
                this.imageAssets.set(key, { name: baseName, path, characterId: characterIdFromBaseName(baseName) });
            });

            return this.imageAssets;
        },

        // manifest 의 assets.images 를 읽는다.
        //   "이름": "https://..."                      → 외부 주소
        //   "이름": "assets/g/bg.webp"                  → 패키지 안 파일
        //   "이름": { url|path, kind, characterId }     → 판정을 직접 지정
        // 이 표는 파일 색인보다 먼저 보므로, 같은 이름이면 표가 이긴다.
        buildDeclaredImageIndex() {
            this.declaredImages = new Map();
            const images = this.activeCartridge?.assets?.images;
            if (!images || typeof images !== 'object' || Array.isArray(images)) return this.declaredImages;

            Object.entries(images).forEach(([rawName, definition]) => {
                const name = String(rawName).trim();
                const key = this.normalizeAssetName(name);
                if (!key) return;

                const isObject = definition && typeof definition === 'object' && !Array.isArray(definition);
                const rawSource = typeof definition === 'string'
                    ? definition
                    : (isObject ? (definition.url || definition.path) : null);
                const source = String(rawSource || '').trim();
                if (!source) {
                    console.warn(`VN Engine: 이미지 선언에 주소나 경로가 없습니다 — ${name}`);
                    return;
                }

                const external = EXTERNAL_IMAGE_SOURCE.test(source);
                if (external && !ALLOWED_IMAGE_SOURCE.test(source)) {
                    console.warn(`VN Engine: 이미지에 쓸 수 없는 주소라 건너뜁니다 — ${name}`);
                    return;
                }

                const declaredKind = isObject ? definition.kind : null;
                const declaredCharacterId = isObject && typeof definition.characterId === 'string'
                    ? definition.characterId.trim()
                    : '';
                this.declaredImages.set(key, {
                    name,
                    source,
                    external,
                    kind: declaredKind === 'background' || declaredKind === 'character' ? declaredKind : null,
                    characterId: declaredCharacterId || null
                });
            });

            return this.declaredImages;
        },

        // manifest 의 hotspots 를 읽는다. 배경 그림 위에서 누를 수 있는 영역이다.
        //   "hotspots": {
        //     "reveal": "hidden",                       ← 전체 기본값 (always | hover | hidden)
        //     "areas": {
        //       "bg_teahouse": [{ "id": "menu-board", "rect": [0.06, 0.12, 0.2, 0.36], "image": "menu_board" }]
        //     }
        //   }
        // rect 는 배경 그림 기준 [가로위치, 세로위치, 너비, 높이] 를 0~1 비율로 적는다.
        buildHotspotIndex() {
            this.hotspots = new Map();
            this.hotspotReveal = 'always';
            const config = this.activeCartridge?.hotspots || this.activeCartridge?.manifest?.hotspots;
            if (!config || typeof config !== 'object' || Array.isArray(config)) return this.hotspots;
            if (HOTSPOT_REVEALS.includes(config.reveal)) this.hotspotReveal = config.reveal;

            const areas = config.areas && typeof config.areas === 'object' ? config.areas : {};
            Object.entries(areas).forEach(([rawName, list]) => {
                const key = this.normalizeAssetName(rawName);
                if (!key || !Array.isArray(list)) return;
                const parsed = list.map(item => this.readHotspot(item)).filter(Boolean);
                if (parsed.length > 0) this.hotspots.set(key, parsed);
                else console.warn(`VN Engine: 쓸 수 있는 핫스팟이 없습니다 — ${rawName}`);
            });
            return this.hotspots;
        },

        // [가로위치, 세로위치, 너비, 높이] (배경 그림 기준 0~1 비율). 핫스팟과 방 화면이 같이 쓴다.
        readRect(value) {
            const rect = Array.isArray(value) ? value.map(Number) : [];
            if (rect.length !== 4 || rect.some(number => !Number.isFinite(number))) return null;
            const [x, y, width, height] = rect;
            if (width <= 0 || height <= 0) return null;
            return { x, y, width, height };
        },

        readHotspot(item) {
            if (!item || typeof item !== 'object') return null;
            const rect = this.readRect(item.rect);
            if (!rect) return null;
            const tell = item.tellAi && typeof item.tellAi === 'object' ? item.tellAi : null;
            const tellText = tell ? String(tell.text || '').trim() : '';
            return {
                id: String(item.id || item.image || '').trim().slice(0, 80) || 'hotspot',
                rect,
                image: item.image ? String(item.image).trim() : '',
                label: item.label ? String(item.label).trim().slice(0, 120) : '',
                // 하나만 다르게 드러내고 싶으면 여기에 적는다. 없으면 카트리지 기본값을 따른다.
                reveal: HOTSPOT_REVEALS.includes(item.reveal) ? item.reveal : null,
                tellAi: tellText ? { title: String(tell.title || '').trim().slice(0, 120), text: tellText } : null
            };
        },

        hotspotsFor(name) {
            const key = this.normalizeAssetName(name);
            return (key && this.hotspots.get(key)) || [];
        },

        // manifest 의 home 을 읽는다. 대화하지 않을 때 머무는 방 화면이다.
        //   "home": {
        //     "background": "bg_room",                    ← 방 배경 그림 이름
        //     "endLabel": "대화 종료",                      ← 대사창에 붙는 돌아가기 버튼 글자 (생략 가능)
        //     "characters": [{
        //       "id": "friend", "name": "친구",
        //       "image": "home_roommate",                 ← 방 화면에 세워 둘 그림
        //       "rect": [0.3, 0.3, 0.14, 0.6],            ← 배경 그림 기준 0~1 비율 (핫스팟과 같다)
        //       "standing": "roommate01",                 ← 대화할 때 띄울 스탠딩
        //       "choices": [
        //         { "label": "대화하기", "action": "talk", "line": "...", "tellAi": "..." },
        //         { "label": "선물하기", "action": "message", "text": "아직 준비 중입니다." }
        //       ]
        //     }]
        //   }
        // line·tellAi·text 안의 {name} 은 캐릭터 이름으로 바뀐다.
        //
        // 그림 대신 모듈을 방 화면으로 쓸 수도 있다. 걸어 다니는 맵처럼 직접 그리는 화면이다.
        //   "home": { "module": "town-map", "characters": [{ "id": "neighbor", "name": "이웃", "choices": [...] }] }
        // 이때 background 와 캐릭터의 rect 는 없어도 된다. 모듈이 VNCartridge.talkTo(id) 로 대화를 건다.
        buildHomeScene() {
            this.home = null;
            const config = this.activeCartridge?.home;
            if (!config || typeof config !== 'object' || Array.isArray(config)) return null;
            const background = String(config.background || '').trim();
            const module = this.readHomeModule(config.module);
            if (!background && !module) {
                console.warn('VN Engine: 방 화면(home)에 background 도 module 도 없어 쓰지 않습니다.');
                return null;
            }
            const list = Array.isArray(config.characters) ? config.characters : [];
            this.home = {
                background,
                module,
                endLabel: String(config.endLabel || '').trim().slice(0, 20) || '대화 종료',
                characters: list.map((item, index) => this.readHomeCharacter(item, index, Boolean(module))).filter(Boolean)
            };
            return this.home;
        },

        // 방 화면으로 띄울 모듈 ID. 켜져 있는 view 모듈이어야 하고, 전체 화면 무대(stage)는 안 된다.
        readHomeModule(value) {
            if (value === undefined || value === null || value === '') return null;
            const id = String(value).trim();
            const definition = this.getModule(id);
            if (!definition || definition.enabled !== true || definition.type !== 'view' || !definition.entry) {
                console.warn(`VN Engine: 방 화면 모듈을 찾을 수 없어 쓰지 않습니다 — ${id} (켜져 있는 view 모듈이어야 합니다)`);
                return null;
            }
            if (definition.config && definition.config.stage === true) {
                console.warn(`VN Engine: 무대(stage) 모듈은 방 화면으로 쓸 수 없습니다 — ${id}`);
                return null;
            }
            return id;
        },

        readHomeCharacter(item, index, rectOptional = false) {
            if (!item || typeof item !== 'object') return null;
            // 모듈 방 화면에서는 모듈이 인물을 그리므로 rect 가 없어도 된다 (있으면 그림 위에 세운다)
            const rect = item.rect === undefined && rectOptional ? null : this.readRect(item.rect);
            if (!rect && (item.rect !== undefined || !rectOptional)) {
                console.warn(`VN Engine: 방 화면 캐릭터 ${index + 1}번의 rect 가 올바르지 않아 ${rectOptional ? '세우지 않습니다' : '뺍니다'}.`);
            }
            if (!rect && !rectOptional) return null;
            const id = String(item.id || '').trim().slice(0, 80) || `character-${index + 1}`;
            const choices = (Array.isArray(item.choices) ? item.choices : []).map((choice, order) => {
                const label = choice && typeof choice === 'object' ? String(choice.label || '').trim().slice(0, 40) : '';
                if (!label || !HOME_ACTIONS.includes(choice.action)) {
                    console.warn(`VN Engine: ${id} 의 선택지 ${order + 1}번은 label 이나 action(${HOME_ACTIONS.join(' | ')})이 없어 뺍니다.`);
                    return null;
                }
                return {
                    id: String(choice.id || '').trim().slice(0, 80) || `choice-${order + 1}`,
                    label,
                    action: choice.action,
                    line: String(choice.line || '').trim().slice(0, 500),
                    tellAi: String(choice.tellAi || '').trim().slice(0, 2000),
                    text: String(choice.text || '').trim().slice(0, 200)
                };
            }).filter(Boolean);
            return {
                id,
                name: String(item.name || '').trim().slice(0, 40) || id,
                image: String(item.image || '').trim(),
                standing: String(item.standing || '').trim(),
                rect,
                choices
            };
        },

        // 이미지 표에서 인물로 판정되는 항목은 그 이름을 화자 이름으로도 쓴다.
        //   "미라": { "path": "assets/c/mira01.webp", "characterId": "mira" }
        //   → 대사 "**미라** | ..." 가 나오면 화면의 mira 를 강조한다.
        // 인물 판정과 ID 는 resolveImageAsset 과 같은 규칙을 따른다.
        buildSpeakerIndex() {
            this.speakerCharacterIds = new Map();
            this.declaredImages.forEach((declared, key) => {
                const kind = declared.kind || this.assetKindForPath(declared.source);
                if (kind !== 'character') return;
                const idSource = /^data:/i.test(declared.source) ? declared.name : this.baseNameForSource(declared.source);
                const characterId = declared.characterId || characterIdFromBaseName(idSource);
                if (characterId) this.speakerCharacterIds.set(key, characterId);
            });
            return this.speakerCharacterIds;
        },

        // 화자 이름이 이미지 표에 있으면 그 인물 ID, 없으면 null.
        resolveSpeakerCharacterId(name) {
            const key = this.normalizeAssetName(name);
            return key ? (this.speakerCharacterIds.get(key) || null) : null;
        },

        // 주소나 경로에서 확장자와 질의 문자열을 떼고 이름만 남긴다.
        baseNameForSource(source) {
            const value = String(source).split(/[?#]/)[0];
            const fileName = value.slice(value.lastIndexOf('/') + 1);
            return fileName.replace(/\.[^.]+$/, '') || value;
        },

        getAssetUrl(path) {
            if (this.objectUrls.has(path)) return this.objectUrls.get(path);
            const bytes = this.packageFiles.get(path);
            if (!bytes) return null;
            try {
                const url = URL.createObjectURL(new Blob([bytes], { type: this.mimeTypeForPath(path) }));
                this.objectUrls.set(path, url);
                return url;
            } catch (error) {
                console.error('VN Engine: 이미지 자산 URL 생성 실패', path, error);
                return null;
            }
        },

        // ![이름] 의 이름을 카트리지 이미지 파일 이름과 대조합니다. 없으면 null.
        resolveImageAsset(name) {
            const key = this.normalizeAssetName(name);
            if (!key) return null;

            const declared = this.declaredImages?.get(key);
            if (declared) {
                const url = declared.external ? declared.source : this.getAssetUrl(declared.source);
                if (url) {
                    // data: 주소에는 파일 이름이 없으므로 선언한 이름으로 인물을 묶는다.
                    const idSource = /^data:/i.test(declared.source) ? declared.name : this.baseNameForSource(declared.source);
                    return {
                        name: declared.name,
                        path: declared.source,
                        url,
                        kind: declared.kind || this.assetKindForPath(declared.source),
                        characterId: declared.characterId || characterIdFromBaseName(idSource)
                    };
                }
                // 선언은 있는데 파일이 없으면 아래 파일 색인으로 넘어간다.
                console.warn(`VN Engine: 선언한 이미지를 찾을 수 없습니다 — ${declared.name} → ${declared.source}`);
            }

            const asset = this.imageAssets.get(key);
            if (!asset) return null;
            const url = this.getAssetUrl(asset.path);
            return url ? { ...asset, kind: this.assetKindForPath(asset.path), url } : null;
        },

        releaseObjectUrls() {
            this.objectUrls.forEach(url => {
                try { URL.revokeObjectURL(url); } catch (error) { /* 무시 */ }
            });
            this.objectUrls = new Map();
            this.dataUrls = new Map();
        },

        // theme 은 manifest 안의 객체이거나 패키지 안의 JSON 파일 경로일 수 있다.
        resolveTheme(cartridge) {
            const theme = cartridge?.theme;
            if (!theme) return null;
            if (typeof theme !== 'string') return theme;
            const text = this.getTextFile(theme);
            if (text === null) {
                console.warn(`VN Engine: 테마 파일을 찾을 수 없습니다 — ${theme}`);
                return null;
            }
            try {
                return JSON.parse(text);
            } catch (error) {
                console.warn(`VN Engine: 테마 파일 형식이 올바르지 않습니다 — ${theme}`);
                return null;
            }
        },

        // skin 은 패키지 안의 CSS 파일 경로다. 여러 개면 순서대로 이어 붙인다.
        resolveSkin(cartridge) {
            const skin = cartridge?.skin;
            if (!skin) return '';
            const paths = Array.isArray(skin) ? skin : [skin];
            return paths.map(path => {
                const text = this.getTextFile(String(path));
                if (text === null) {
                    console.warn(`VN Engine: 스킨 파일을 찾을 수 없습니다 — ${path}`);
                    return '';
                }
                return text;
            }).filter(Boolean).join('\n');
        },

        getModule(moduleId) {
            return this.activeCartridge?.modules?.[moduleId] || null;
        },

        // 상시 모듈은 메뉴에 나오지 않는다. 카트리지가 켜지는 순간 함께 뜬다.
        getServiceModules() {
            if (!this.activeCartridge) return [];
            return Object.entries(this.activeCartridge.modules || {})
                .filter(([, definition]) => definition.enabled === true && definition.type === 'service' && definition.entry)
                .map(([id, definition]) => ({ id, ...definition }));
        },

        getViewModules() {
            if (!this.activeCartridge) return [];
            return Object.entries(this.activeCartridge.modules || {})
                .filter(([, definition]) => definition.enabled === true && definition.type === 'view' && definition.entry)
                // config.stage 가 true 인 모듈은 전체 화면 무대로 띄우므로 메뉴 탭에는 넣지 않는다
                .filter(([, definition]) => !(definition.config && definition.config.stage === true))
                // 방 화면으로 쓰는 모듈도 메뉴 탭이 아니다 ('대화 종료' 로 돌아간다)
                .filter(([id]) => id !== this.home?.module)
                // 메뉴에서 숨긴 화면은 빠진다 (그 화면의 명령 토큰도 듣지 않는다)
                .filter(([id, definition]) => this.isInMenu(id, definition))
                .map(([id, definition]) => ({ id, ...definition }));
        },

        // 메뉴에 보일지. 모듈이 menu.show/hide 로 정한 값이 있으면 그것, 없으면 manifest 의 "menu" (false 면 숨김).
        isInMenu(moduleId, definition) {
            const cartridgeId = this.activeCartridge?.manifest?.id;
            const saved = cartridgeId ? CartridgeMenuStore.load(cartridgeId)[moduleId] : undefined;
            if (typeof saved === 'boolean') return saved;
            return definition?.menu !== false;
        },

        // VNCartridge.menu.show/hide 명령. 이 카트리지의 화면 모듈만 바꿀 수 있다.
        setMenuVisible(moduleId, visible) {
            const cartridgeId = this.activeCartridge?.manifest?.id;
            const definition = this.getModule(moduleId);
            if (!cartridgeId || !definition || definition.type !== 'view') return false;
            CartridgeMenuStore.set(cartridgeId, moduleId, visible === true);
            return true;
        },

        // VNCartridge.openView 명령이 여는 화면 모듈. 메뉴에서 숨겨 둔 화면도 연다.
        getOpenableModule(moduleId) {
            const definition = this.getModule(moduleId);
            if (!definition || definition.enabled !== true || definition.type !== 'view' || !definition.entry) return null;
            return { id: moduleId, ...definition };
        },

        // VN 시작과 동시에 전체 화면으로 띄울 모듈. manifest 의 config.stage 로 표시한다.
        getStageModule() {
            if (!this.activeCartridge) return null;
            const found = Object.entries(this.activeCartridge.modules || {})
                .find(([, definition]) => definition.enabled === true
                    && definition.type === 'view'
                    && definition.entry
                    && definition.config
                    && definition.config.stage === true);
            return found ? { id: found[0], ...found[1] } : null;
        },

        getTextFile(path) {
            const bytes = this.packageFiles.get(path);
            return bytes ? new TextDecoder('utf-8').decode(bytes) : null;
        },

        getModuleData(moduleDefinition) {
            const result = {};
            const dataFiles = moduleDefinition?.dataFiles;
            if (!dataFiles || typeof dataFiles !== 'object' || Array.isArray(dataFiles)) return result;
            Object.entries(dataFiles).forEach(([dataName, dataPath]) => {
                const text = this.getTextFile(dataPath);
                if (text === null) throw new Error(`카트리지 데이터 파일을 읽을 수 없습니다: ${dataPath}`);
                if (String(dataPath).toLowerCase().endsWith('.json')) {
                    try { result[dataName] = JSON.parse(text); }
                    catch (error) { throw new Error(`카트리지 JSON 데이터 형식이 올바르지 않습니다: ${dataPath}`); }
                } else {
                    result[dataName] = text;
                }
            });
            return result;
        },

        // 모듈 화면은 allow-same-origin 이 없는 액자라 엔진의 blob: 주소를 못 쓴다. data: 주소로 바꿔 넘긴다.
        getDataUrl(path) {
            if (this.dataUrls.has(path)) return this.dataUrls.get(path);
            const bytes = this.packageFiles.get(path);
            if (!bytes) return null;
            let binary = '';
            for (let offset = 0; offset < bytes.length; offset += 0x8000) {
                binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + 0x8000));
            }
            const url = `data:${this.mimeTypeForPath(path)};base64,${btoa(binary)}`;
            this.dataUrls.set(path, url);
            return url;
        },

        getModuleImages(moduleDefinition) {
            const result = {};
            const images = moduleDefinition?.images;
            if (!CartridgeFormat.isPlainObject(images)) return result;
            let totalBytes = 0;
            Object.entries(images).forEach(([imageName, imagePath]) => {
                const url = this.getDataUrl(imagePath);
                if (!url) {
                    console.warn(`VN Engine: 모듈 그림을 찾을 수 없습니다 — ${moduleDefinition.id}.${imageName} → ${imagePath}`);
                    return;
                }
                totalBytes += this.packageFiles.get(imagePath).length;
                result[imageName] = url;
            });
            // 화면 문서에 통째로 들어가므로 너무 크면 여는 데 오래 걸린다
            if (totalBytes > 4 * 1024 * 1024) {
                console.warn(`VN Engine: 모듈 그림이 ${(totalBytes / 1048576).toFixed(1)}MB 입니다. 화면이 늦게 열릴 수 있습니다 — ${moduleDefinition.id}`);
            }
            return result;
        },

        getRuntimeContext(moduleDefinition) {
            const cartridgeId = this.activeCartridge?.manifest?.id;
            if (!cartridgeId) return { state: {}, status: {} };
            const status = typeof StatusInfoManager !== 'undefined'
                ? StatusInfoManager.getRuntimeData()
                : {};
            // 창을 여는 순간 AI 가 이미 응답을 쓰고 있을 수 있다. 그 상태로 시작하게 한다.
            const ai = typeof AiActivityMonitor !== 'undefined'
                ? AiActivityMonitor.snapshot()
                : { generating: false, reason: 'idle', lastArrivedAt: 0 };
            const runtime = {
                state: CartridgeModuleStateStore.load(cartridgeId, moduleDefinition.id),
                shared: CartridgeSharedStateStore.load(cartridgeId),
                status,
                ai
            };
            // 방 화면 모듈은 들어오는 순간에 만들어지므로 처음에는 조작할 수 있는 상태다
            if (moduleDefinition.id && moduleDefinition.id === this.home?.module) runtime.home = { active: true };
            runtime.session = this.currentSession();
            runtime.vn = { active: typeof isEngineActive !== 'undefined' ? isEngineActive === true : false, opening: false };
            return runtime;
        },

        // 지금 채팅방 { id }. 주소 끝의 24자리 ID (작품 채팅이면 에피소드, 아니면 채팅방). 없으면 null.
        currentSession() {
            return { id: (typeof getCurrentSessionId === 'function' && getCurrentSessionId()) || null };
        },

        // 주소(채팅방)가 바뀌었다. 열린 액자마다 새 채팅방과 그 범위의 공유 서랍을 알린다 (엔진 3.35.0).
        // 상시 모듈은 채팅방을 옮겨도 그대로 살아 있으므로 이 알림으로 따라간다.
        announceSession() {
            const cartridgeId = this.activeCartridge?.manifest?.id;
            if (!cartridgeId) return 0;
            return this.broadcast(cartridgeId, {
                type: 'session:changed',
                session: this.currentSession(),
                state: CartridgeSharedStateStore.load(cartridgeId)
            });
        },

        // VN 을 켜거나 껐다. 열린 액자(상시 모듈 포함)에 알린다 (엔진 3.37.0).
        // opening: 켜면서 오프닝을 틀었거나 오프닝 고르는 창을 띄웠으면 true.
        announceVN(active, opening = false) {
            const cartridgeId = this.activeCartridge?.manifest?.id;
            if (!cartridgeId) return 0;
            return this.broadcast(cartridgeId, { type: 'vn:state', vn: { active: active === true, opening: opening === true } });
        },

        registerFrame(frame, moduleDefinition) {
            if (!frame?.contentWindow || !this.activeCartridge) return;
            const binding = {
                cartridgeId: this.activeCartridge.manifest.id,
                moduleId: moduleDefinition.id
            };
            this.frameBindings.set(frame.contentWindow, binding);
            this.liveFrames = this.liveFrames.filter(entry => entry.frame !== frame);
            this.liveFrames.push({ frame, ...binding });
        },

        // graceMs: 액자를 치우는 순간(pagehide)에 보낸 마지막 저장이 늦게 도착해도 받을 수 있게 잠시 기다렸다 지운다
        unregisterFrame(frame, graceMs = 0) {
            const target = frame?.contentWindow;
            if (target) {
                if (graceMs > 0) setTimeout(() => this.frameBindings.delete(target), graceMs);
                else this.frameBindings.delete(target);
            }
            this.liveFrames = this.liveFrames.filter(entry => entry.frame !== frame);
        },

        // 닫힌 액자는 걸러내고 살아 있는 것만 돌려준다.
        activeFrames() {
            this.liveFrames = this.liveFrames.filter(entry => entry.frame?.isConnected && entry.frame.contentWindow);
            return this.liveFrames;
        },

        // 같은 카트리지의 열린 액자들에 알린다. exceptWindow 는 보낸 당사자를 뜻한다.
        broadcast(cartridgeId, payload, exceptWindow = null) {
            let delivered = 0;
            this.activeFrames().forEach(entry => {
                if (entry.cartridgeId !== cartridgeId) return;
                const target = entry.frame.contentWindow;
                if (!target || target === exceptWindow) return;
                try {
                    target.postMessage({ source: 'vn-engine', ...payload, moduleId: entry.moduleId }, '*');
                    delivered += 1;
                } catch (error) {
                    console.warn('VN Engine: 모듈에 통지하지 못했습니다.', error);
                }
            });
            return delivered;
        },

        handleMessage(event) {
            const binding = this.frameBindings.get(event.source);
            const message = event.data;
            if (!binding || !message || message.source !== 'vn-cartridge') return;

            if (message.type === 'module-state:replace') {
                try {
                    const state = CartridgeModuleStateStore.save(binding.cartridgeId, binding.moduleId, message.state);
                    event.source?.postMessage({
                        source: 'vn-engine',
                        type: 'module-state:saved',
                        requestId: message.requestId || null,
                        state
                    }, '*');
                } catch (error) {
                    console.error('VN Engine: 모듈 상태 저장 실패', error);
                    event.source?.postMessage({
                        source: 'vn-engine',
                        type: 'module-state:error',
                        requestId: message.requestId || null,
                        message: error.message
                    }, '*');
                }
                return;
            }

            if (message.type === 'shared-state:patch') {
                try {
                    const state = CartridgeSharedStateStore.patch(binding.cartridgeId, message.patch);
                    event.source?.postMessage({
                        source: 'vn-engine',
                        type: 'shared-state:saved',
                        requestId: message.requestId || null,
                        state
                    }, '*');
                    // 같은 카트리지의 다른 창에도 바뀐 값을 알린다.
                    this.broadcast(binding.cartridgeId, {
                        type: 'shared-state:changed',
                        state,
                        from: binding.moduleId
                    }, event.source);
                } catch (error) {
                    console.error('VN Engine: 공유 상태 저장 실패', error);
                    event.source?.postMessage({
                        source: 'vn-engine',
                        type: 'shared-state:error',
                        requestId: message.requestId || null,
                        message: error.message
                    }, '*');
                }
                return;
            }

            if (message.type === 'module-event:emit') {
                const moduleEvent = message.event;
                if (!moduleEvent || typeof moduleEvent !== 'object' || !String(moduleEvent.type || '').trim()) {
                    event.source?.postMessage({
                        source: 'vn-engine',
                        type: 'module-event:error',
                        requestId: message.requestId || null,
                        message: '사건에는 type 이 필요합니다.'
                    }, '*');
                    return;
                }
                let payload = null;
                try {
                    // 글자로 옮길 수 있는 값만 건넨다. 함수나 순환 참조는 여기서 걸린다.
                    payload = moduleEvent.payload === undefined ? null : JSON.parse(JSON.stringify(moduleEvent.payload));
                } catch (error) {
                    event.source?.postMessage({
                        source: 'vn-engine',
                        type: 'module-event:error',
                        requestId: message.requestId || null,
                        message: '사건 내용을 전달할 수 없습니다.'
                    }, '*');
                    return;
                }
                const delivered = this.broadcast(binding.cartridgeId, {
                    type: 'module-event',
                    event: { type: String(moduleEvent.type).trim(), payload },
                    from: binding.moduleId
                }, event.source);
                event.source?.postMessage({
                    source: 'vn-engine',
                    type: 'module-event:sent',
                    requestId: message.requestId || null,
                    delivered
                }, '*');
                return;
            }

            if (message.type === 'shared-state:read') {
                event.source?.postMessage({
                    source: 'vn-engine',
                    type: 'shared-state:value',
                    requestId: message.requestId || null,
                    state: CartridgeSharedStateStore.load(binding.cartridgeId)
                }, '*');
                return;
            }

            if (message.type === 'stage:close') {
                StageOverlay.close();
                return;
            }

            // 방 화면 모듈이 인물에게 말을 건다. 방 화면이 떠 있을 때 그 모듈만 걸 수 있다.
            if (message.type === 'home:talk') {
                const result = HomeScene.talkFromModule(binding.moduleId, message.characterId, message.choiceId);
                event.source?.postMessage({
                    source: 'vn-engine',
                    type: 'home:talk-result',
                    requestId: message.requestId || null,
                    ...result
                }, '*');
                return;
            }

            // 카트리지가 VN 화면에 대본을 틀어 달라고 한다. 오프닝과 같은 재생기로 튼다 (엔진 3.34.0).
            // 끝나면 StageManager 가 같은 카트리지의 모든 창에 script:ended 를 알린다.
            if (message.type === 'script:play') {
                const scriptId = String(message.scriptId || '');
                const refuse = reason => event.source?.postMessage({ source: 'vn-engine', type: 'script:ended', scriptId, state: 'refused', reason }, '*');
                if (binding.cartridgeId !== this.activeCartridge?.manifest?.id) { refuse('cartridge'); return; }
                if (typeof isEngineActive !== 'undefined' && !isEngineActive) { refuse('inactive'); return; }
                const content = String(message.content || '');
                if (!content.trim()) { refuse('empty'); return; }
                // 지도처럼 열어 둔 창은 닫는다. 「\항해」 로 보류해 둔 글은 그대로 두었다가 카트리지가 commitChat 할 때 보낸다.
                if (ModuleOverlay.isOpen()) ModuleOverlay.close({ keepPending: true });
                StageManager.start(content, { cartridgeScript: { id: scriptId, cartridgeId: binding.cartridgeId } });
                return;
            }

            // VN 화면에 선택지를 띄운다. 고른 것은 부탁한 창에만 돌려준다 (엔진 3.34.0).
            if (message.type === 'choice:show') {
                const reply = result => event.source?.postMessage({ source: 'vn-engine', type: 'choice:chosen', requestId: message.requestId || null, ...result }, '*');
                if (binding.cartridgeId !== this.activeCartridge?.manifest?.id) { reply({ ok: false, reason: 'cartridge' }); return; }
                if (typeof isEngineActive !== 'undefined' && !isEngineActive) { reply({ ok: false, reason: 'inactive' }); return; }
                if (!UIManager.showScriptChoices(message.options, { placeholder: message.placeholder }, reply)) reply({ ok: false, reason: 'empty' });
                return;
            }

            // 카트리지가 크랙에 대화를 보내 달라고 한다. 엔진의 대화 입력과 같은 길로 보낸다 (엔진 3.37.0).
            // 명령 토큰(\항해 등)은 보지 않는다. 실패해도 경고창을 띄우지 않고 까닭을 돌려준다.
            if (message.type === 'chat:send') {
                const reply = (ok, reason = '') => event.source?.postMessage({ source: 'vn-engine', type: 'chat:sent', requestId: message.requestId || null, ok, reason }, '*');
                if (binding.cartridgeId !== this.activeCartridge?.manifest?.id) { reply(false, 'cartridge'); return; }
                if (typeof isEngineActive !== 'undefined' && !isEngineActive) { reply(false, 'inactive'); return; }
                const body = String(message.text || '').trim();
                if (!body) { reply(false, 'empty'); return; }
                if (body.length > 16000) { reply(false, 'too-long'); return; }
                if (UIManager.isSendingMessage) { reply(false, 'busy'); return; }
                Promise.resolve(UIManager.sendMessage({ fromPending: true, message: body, silent: true }))
                    .then(sent => reply(sent === true, sent === true ? '' : 'failed'), () => reply(false, 'failed'));
                return;
            }

            if (message.type === 'chat:commit') {
                const sent = UIManager.commitPendingChat(message.options);
                event.source?.postMessage({
                    source: 'vn-engine',
                    type: 'chat:committed',
                    requestId: message.requestId || null,
                    sent
                }, '*');
                return;
            }

            if (message.type === 'view:close') {
                ModuleOverlay.close();
                return;
            }

            // 카트리지가 엔진에 부탁하는 일 (openView · menu.show/hide · showImage · playMusic/stopMusic).
            // 지금 켜진 카트리지의 모듈만 부탁할 수 있고, 그 카트리지의 화면 · 그림 · 소리 파일에만 작동한다.
            const replyTypes = { 'view:open': 'view:opened', 'menu:set': 'menu:updated', 'image:show': 'image:shown', 'music:play': 'music:played', 'music:stop': 'music:stopped' };
            if (replyTypes[message.type]) {
                const reply = (type, ok) => event.source?.postMessage({
                    source: 'vn-engine', type, requestId: message.requestId || null, ok
                }, '*');
                if (binding.cartridgeId !== this.activeCartridge?.manifest?.id) {
                    reply(replyTypes[message.type], false);
                    return;
                }
                if (message.type === 'music:play') {
                    reply('music:played', AudioManager.play(String(message.src || ''), { loop: message.loop !== false }));
                    return;
                }
                if (message.type === 'music:stop') {
                    AudioManager.stopAll();
                    reply('music:stopped', true);
                    return;
                }
                if (message.type === 'view:open') {
                    const definition = this.getOpenableModule(String(message.moduleId || ''));
                    if (definition) ModuleOverlay.open(definition, { fullscreen: message.fullscreen === true });
                    else console.warn(`VN Engine: 열 수 있는 화면 모듈이 아닙니다 — ${message.moduleId}`);
                    reply('view:opened', Boolean(definition));
                } else if (message.type === 'menu:set') {
                    const ok = this.setMenuVisible(String(message.moduleId || ''), message.visible === true);
                    if (!ok) console.warn(`VN Engine: 메뉴에 둘 수 있는 화면 모듈이 아닙니다 — ${message.moduleId}`);
                    reply('menu:updated', ok);
                } else {
                    const ok = UIManager.showCartridgeImage(String(message.name || ''), String(message.label || ''));
                    reply('image:shown', ok);
                }
                return;
            }

            if (message.type === 'ai-context:withdraw') {
                const removed = AiMessageContextQueue.withdraw(binding.cartridgeId, message.id);
                event.source?.postMessage({
                    source: 'vn-engine',
                    type: 'ai-context:withdrawn',
                    requestId: message.requestId || null,
                    removed
                }, '*');
                return;
            }

            if (message.type === 'ai-context:enqueue') {
                try {
                    const item = AiMessageContextQueue.enqueue(binding.cartridgeId, binding.moduleId, message.event);
                    event.source?.postMessage({
                        source: 'vn-engine',
                        type: 'ai-context:queued',
                        requestId: message.requestId || null,
                        itemId: item.id
                    }, '*');
                } catch (error) {
                    console.error('VN Engine: AI 문맥 등록 실패', error);
                    event.source?.postMessage({
                        source: 'vn-engine',
                        type: 'ai-context:error',
                        requestId: message.requestId || null,
                        message: error.message
                    }, '*');
                }
            }
        },

        createViewDocument(moduleDefinition) {
            const html = this.getTextFile(moduleDefinition.entry);
            if (!html) return '<p style="color:white">모듈 화면 파일을 읽을 수 없습니다.</p>';
            const context = {
                cartridge: this.activeCartridge ? {
                    id: this.activeCartridge.manifest.id,
                    name: this.activeCartridge.manifest.name,
                    version: this.activeCartridge.manifest.version
                } : null,
                module: {
                    id: moduleDefinition.id,
                    title: moduleDefinition.title || moduleDefinition.id,
                    version: moduleDefinition.version,
                    config: moduleDefinition.config || {}
                },
                data: this.getModuleData(moduleDefinition),
                images: this.getModuleImages(moduleDefinition),
                runtime: this.getRuntimeContext(moduleDefinition)
            };
            const serialized = JSON.stringify(context)
                .replace(/</g, '\\u003c')
                .replace(/\u2028/g, '\\u2028')
                .replace(/\u2029/g, '\\u2029');
            const bootstrap = `<script>window.VNCartridgeContext=${serialized};<\/script>`
                + `<script>${CARTRIDGE_HELPER_SOURCE}<\/script>`;
            const styleTags = (Array.isArray(moduleDefinition.styles) ? moduleDefinition.styles : [])
                .map(stylePath => `<style data-cartridge-source="${stylePath}">${this.getTextFile(stylePath) || ''}</style>`)
                .join('');
            const scriptTags = (Array.isArray(moduleDefinition.scripts) ? moduleDefinition.scripts : [])
                .map(scriptPath => `<script data-cartridge-source="${scriptPath}">${(this.getTextFile(scriptPath) || '').replace(/<\/script/gi, '<\\/script')}<\/script>`)
                .join('');
            const headInjection = `${bootstrap}${styleTags}`;
            let documentHtml = /<head(?:\s[^>]*)?>/i.test(html)
                ? html.replace(/<head(?:\s[^>]*)?>/i, match => `${match}${headInjection}`)
                : `${headInjection}${html}`;
            if (scriptTags) {
                documentHtml = /<\/body>/i.test(documentHtml)
                    ? documentHtml.replace(/<\/body>/i, `${scriptTags}</body>`)
                    : `${documentHtml}${scriptTags}`;
            }
            return documentHtml;
        }
    };
    window.addEventListener('message', event => CartridgeRuntime.handleMessage(event));

    // --- 상시 모듈(service) 보관소 ---
    // 화면에 나오지 않지만 카트리지가 켜져 있는 동안 계속 살아 있는 액자다.
    // 게임 규칙과 상태를 여기서 관리하고, 보이는 화면(view)들은 공유 서랍으로 결과만 읽어 간다.
    const ServiceHost = {
        element: null,
        frames: [],

        ensureElement() {
            if (this.element && document.body.contains(this.element)) return this.element;
            const host = document.createElement('div');
            host.id = DOM_IDS.SERVICE_HOST;
            host.setAttribute('aria-hidden', 'true');
            document.body.appendChild(host);
            this.element = host;
            return host;
        },

        start() {
            this.stop();
            const modules = CartridgeRuntime.getServiceModules();
            if (modules.length === 0) return 0;
            const host = this.ensureElement();
            modules.forEach(moduleDefinition => {
                const frame = document.createElement('iframe');
                frame.className = 'vn-service-frame';
                frame.title = moduleDefinition.title || moduleDefinition.id;
                // 보이는 화면과 같은 격리 조건을 유지한다 (allow-same-origin 없음)
                frame.setAttribute('sandbox', 'allow-scripts');
                try {
                    frame.srcdoc = CartridgeRuntime.createViewDocument(moduleDefinition);
                } catch (error) {
                    console.error(`VN Engine: 상시 모듈을 열 수 없습니다 — ${moduleDefinition.id}`, error);
                    return;
                }
                host.appendChild(frame);
                CartridgeRuntime.registerFrame(frame, moduleDefinition);
                this.frames.push(frame);
            });
            if (this.frames.length > 0) {
                console.log('VN Engine: 상시 모듈 실행', this.frames.length);
            }
            return this.frames.length;
        },

        stop() {
            this.frames.forEach(frame => CartridgeRuntime.unregisterFrame(frame));
            this.frames = [];
            if (this.element) this.element.replaceChildren();
        }
    };

    // --- 전체 화면 무대 ---
    // 카트리지의 stage 모듈을 VN 시작과 동시에 전체 화면으로 띄우고,
    // 그동안 아래에 깔린 크랙 화면은 클릭도 선택도 되지 않게 잠근다.
    const StageOverlay = {
        element: null,
        frame: null,
        moduleDefinition: null,
        lockedElements: [],

        ensureElement() {
            if (this.element && document.body.contains(this.element)) return this.element;
            const overlay = document.createElement('div');
            overlay.id = DOM_IDS.STAGE_OVERLAY;
            overlay.setAttribute('role', 'application');
            document.body.appendChild(overlay);
            this.element = overlay;
            return overlay;
        },

        isOpen() {
            return Boolean(this.element && this.element.classList.contains('visible'));
        },

        // VN 일시정지: 무대를 지우지 않고 숨기며 크랙 화면 잠금을 푼다. 돌아오면 그대로 다시 띄운다.
        suspended: false,
        suspend() {
            if (!this.isOpen()) return;
            this.suspended = true;
            this.element.classList.remove('visible');
            this.unlockPage();
        },
        resume() {
            if (!this.suspended) return;
            this.suspended = false;
            if (this.element && this.frame) {
                this.element.classList.add('visible');
                this.lockPage();
            }
        },

        open() {
            const moduleDefinition = CartridgeRuntime.getStageModule();
            if (!moduleDefinition) return false;
            if (this.isOpen()) this.close();

            const overlay = this.ensureElement();
            const frame = document.createElement('iframe');
            frame.className = 'vn-stage-frame';
            frame.title = moduleDefinition.title || moduleDefinition.id;
            // 메뉴 탭과 같은 격리 조건을 유지한다 (allow-same-origin 없음)
            frame.setAttribute('sandbox', MODULE_FRAME_SANDBOX);
            try {
                frame.srcdoc = CartridgeRuntime.createViewDocument(moduleDefinition);
            } catch (error) {
                console.error('VN Engine: 무대 모듈 준비 실패', error);
                return false;
            }

            overlay.replaceChildren(frame);
            overlay.classList.add('visible');
            this.frame = frame;
            this.moduleDefinition = moduleDefinition;
            CartridgeRuntime.registerFrame(frame, moduleDefinition);
            this.lockPage();
            return true;
        },

        close() {
            this.suspended = false;
            this.unlockPage();
            if (this.frame) CartridgeRuntime.unregisterFrame(this.frame);
            if (this.element) {
                this.element.classList.remove('visible');
                this.element.replaceChildren();
            }
            this.frame = null;
            this.moduleDefinition = null;
        },

        // 무대가 떠 있는 동안 아래 페이지를 잠근다.
        // inert 는 클릭·포커스·텍스트 선택을 한 번에 막는다. 스크립트는 그대로 돈다.
        lockPage() {
            this.unlockPage();
            const keep = new Set([this.element, UIManager?.elements?.container]);
            Array.from(document.body.children).forEach(child => {
                if (keep.has(child)) return;
                if (child.id && String(child.id).startsWith('vn-')) return;
                if (child.classList && child.classList.contains('vn-control-panel')) return;
                if (child.tagName === 'SCRIPT' || child.tagName === 'STYLE') return;
                if (child.hasAttribute('inert')) return;
                child.setAttribute('inert', '');
                child.setAttribute('data-vn-stage-inert', '');
                this.lockedElements.push(child);
            });
            document.documentElement.classList.add('vn-stage-locked');
            document.body.classList.add('vn-stage-locked');
        },

        unlockPage() {
            this.lockedElements.forEach(child => {
                if (!child) return;
                child.removeAttribute('inert');
                child.removeAttribute('data-vn-stage-inert');
            });
            this.lockedElements = [];
            document.documentElement.classList.remove('vn-stage-locked');
            document.body.classList.remove('vn-stage-locked');
        }
    };

    // --- 카트리지 화면 전용 오버레이 ---
    // 지도처럼 넓은 화면이 필요한 모듈은 메뉴 모달 안이 아니라 이 창에서 연다.
    const ModuleOverlay = {
        element: null,
        frame: null,
        moduleDefinition: null,

        ensureElement() {
            if (this.element && document.body.contains(this.element)) return this.element;
            const overlay = document.createElement('div');
            overlay.id = DOM_IDS.MODULE_OVERLAY;
            overlay.dataset.vnPart = 'module-window';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.addEventListener('click', event => {
                // 전체 화면일 때는 바깥이 없다. 모듈 안을 누른 것으로 닫지 않는다
                if (event.target === overlay && !overlay.classList.contains('vn-module-fullscreen')) this.close();
            });
            document.body.appendChild(overlay);
            this.element = overlay;
            return overlay;
        },

        isOpen() {
            return Boolean(this.element && this.element.classList.contains('visible'));
        },

        // options.fullscreen: 머리줄(제목 · ×) 없이 화면 전체에 띄운다 (엔진 3.39.0). 카트리지가 openView(id, { fullscreen: true }) 로 부탁한다
        open(moduleDefinition, options = {}) {
            if (!moduleDefinition) return false;
            if (this.isOpen()) this.close();
            const overlay = this.ensureElement();
            overlay.classList.toggle('vn-module-fullscreen', options.fullscreen === true);
            overlay.dataset.vnModule = moduleDefinition.id || '';

            const panel = document.createElement('div');
            panel.className = 'vn-module-panel';
            panel.dataset.vnPart = 'module-panel';

            const header = document.createElement('div');
            header.className = 'vn-module-header';
            header.dataset.vnPart = 'module-header';
            const title = document.createElement('h3');
            title.className = 'vn-module-title';
            title.dataset.vnPart = 'module-title';
            title.textContent = moduleDefinition.title || moduleDefinition.id;
            const closeButton = document.createElement('button');
            closeButton.type = 'button';
            closeButton.className = 'vn-module-close';
            closeButton.dataset.vnPart = 'module-close';
            closeButton.setAttribute('aria-label', '닫기');
            closeButton.textContent = '×';
            closeButton.addEventListener('click', () => this.close());
            header.append(title, closeButton);

            const frame = document.createElement('iframe');
            frame.className = 'vn-module-overlay-frame';
            frame.dataset.vnPart = 'module-frame';
            frame.title = moduleDefinition.title || moduleDefinition.id;
            // 메뉴 탭과 같은 격리 조건을 유지한다 (allow-same-origin 없음)
            frame.setAttribute('sandbox', MODULE_FRAME_SANDBOX);
            try {
                frame.srcdoc = CartridgeRuntime.createViewDocument(moduleDefinition);
            } catch (error) {
                console.error('VN Engine: 모듈 화면 준비 실패', error);
                frame.srcdoc = `<p style="padding:20px;color:white">모듈을 열 수 없습니다: ${escapeHtml(error.message)}</p>`;
            }

            panel.append(header, frame);
            overlay.replaceChildren(panel);
            overlay.classList.add('visible');
            this.frame = frame;
            this.moduleDefinition = moduleDefinition;
            CartridgeRuntime.registerFrame(frame, moduleDefinition);
            closeButton.focus();
            return true;
        },

        // options.keepPending: 카트리지 대본이 화면을 넘겨받을 때. 보류한 글은 카트리지가 commitChat 할 때 나간다.
        close(options = {}) {
            // 할 일을 하지 않고 닫았다면 보류해 둔 글을 입력창에 돌려준다.
            if (PendingChat.isHeld() && !options.keepPending) {
                PendingChat.restore();
                UIManager.toggleInputModal(true);
            }
            if (this.frame) CartridgeRuntime.unregisterFrame(this.frame);
            if (this.element) {
                this.element.classList.remove('visible', 'vn-module-fullscreen');
                delete this.element.dataset.vnModule;
                this.element.replaceChildren();
            }
            this.frame = null;
            this.moduleDefinition = null;
        }
    };

    // --- 보류된 대화 ---
    // 입력에 모듈 명령 토큰(예: \항해)이 있으면 바로 보내지 않고 여기에 담아 둔다.
    // 그 모듈이 할 일을 끝내고 commitChat 을 부르면 그때 한꺼번에 내보낸다.
    const PendingChat = {
        message: null,
        moduleId: null,

        isHeld() {
            return this.message !== null;
        },

        hold(message, moduleId) {
            this.message = String(message === undefined || message === null ? '' : message);
            this.moduleId = moduleId || null;
        },

        take() {
            const message = this.message;
            this.message = null;
            this.moduleId = null;
            return message;
        },

        // 모듈이 아무것도 하지 않고 닫혔을 때. 글을 입력창에 돌려준다.
        restore() {
            if (!this.isHeld()) return false;
            const message = this.take();
            const textarea = document.getElementById('vn-modal-textarea');
            if (textarea) textarea.value = message;
            return true;
        }
    };

    // 모듈 정의의 command 를 읽어 토큰 목록을 만든다.
    //   "command": { "token": "\\항해" }  또는  { "token": ["\\항해", "\\이동"] }
    function moduleCommandTokens(moduleDefinition) {
        const command = moduleDefinition?.command;
        if (!command) return [];
        const raw = Array.isArray(command.token) ? command.token : [command.token];
        return raw.map(value => String(value || '').trim()).filter(Boolean);
    }

    // 본문에서 토큰을 찾아 떼어낸다. 찾으면 { moduleDefinition, rest } 를 돌려준다.
    function findModuleCommand(text) {
        const source = String(text || '');
        for (const moduleDefinition of CartridgeRuntime.getViewModules()) {
            for (const token of moduleCommandTokens(moduleDefinition)) {
                const at = source.indexOf(token);
                if (at < 0) continue;
                const rest = (source.slice(0, at) + source.slice(at + token.length)).replace(/\s+/g, ' ').trim();
                return { moduleDefinition, rest };
            }
        }
        return null;
    }

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
            const finalName = name || `Preset ${new Date().toLocaleDateString()}`;
            const fallback = { name: finalName, coverUrl, storyId: target?.id || 'manual' };
            let cartridge;

            if (data?.format === CARTRIDGE_FORMAT) {
                cartridge = CartridgeFormat.normalize(data, fallback);
            } else if (Array.isArray(data)) {
                cartridge = CartridgeFormat.fromLegacy(data, fallback);
            } else {
                cartridge = CartridgeFormat.fromLegacy({
                    ...data,
                    opening: data?.opening ?? SettingsManager.settings.openingScripts ?? []
                }, fallback);
            }

            const storyId = cartridge.manifest.storyIds[0] || 'manual';

            const newPreset = {
                id: Date.now().toString(),
                name: cartridge.manifest.name || finalName,
                storyId: storyId, // 이 ID가 나중에 자동 매칭의 기준이 됩니다.
                coverUrl: cartridge.manifest.coverUrl || coverUrl,
                data: {
                    animations: cartridge.presentation.animations,
                    bgm: cartridge.presentation.bgm,
                    opening: cartridge.presentation.opening
                },
                cartridge,
                createdAt: new Date().toISOString()
            };

            this.presets.unshift(newPreset);
            this.save();
            this.showToast(`✅ "${finalName}" 저장이 완료되었습니다.`);
            return newPreset;
        },

        async addPackage(packageData, fileName) {
            await CartridgePackageStore.put(packageData.cartridge.manifest.id, packageData.bytes, fileName);
            const preset = this.addPreset(packageData.cartridge, packageData.cartridge.manifest.name, packageData.cartridge.manifest.coverUrl);
            preset.packageId = packageData.cartridge.manifest.id;
            this.save();
            return preset;
        },

        async deletePreset(id) {
            if(confirm("정말 이 프리셋을 삭제하시겠습니까?")) {
                const preset = this.presets.find(item => item.id === id);
                if (preset?.packageId) await CartridgePackageStore.delete(preset.packageId).catch(error => console.warn(error));
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

    // 작품 ID 가 적힌 카트리지는 그 작품에서만 적용한다 (엔진 3.38.0). 맞지 않으면 까닭을 돌려준다.
    //   storyIds 가 비어 있으면 어느 작품에서나 적용한다.
    //   작품 페이지가 아니면(크랙 첫 화면 등) 막지 않는다. 작품에 들어가는 순간 checkAutoLoad 가 다시 가린다.
    storyMismatch(cartridge) {
        const storyIds = Array.isArray(cartridge?.manifest?.storyIds) ? cartridge.manifest.storyIds : [];
        if (storyIds.length === 0) return null;
        const target = getCurrentTargetId();
        if (!target?.id || storyIds.includes(target.id)) return null;
        return `이 카트리지는 다른 작품용입니다.\n카트리지의 작품 ID: ${storyIds.join(', ')}\n지금 ${target.name} ID: ${target.id}`;
    },

    // [핵심] 설정을 실제 엔진에 적용하는 내부 함수
    _applySettingsData(data, cartridge = null, packageFiles = new Map()) {
        const mismatch = cartridge ? this.storyMismatch(cartridge) : null;
        if (mismatch) throw new Error(mismatch);
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
        if (cartridge) CartridgeRuntime.activate(cartridge, packageFiles);
        // 엔진이 이미 돌고 있는 중에 카트리지를 갈아 끼우면 무대도 새 카트리지 것으로 바꾼다
        try {
            if (StageOverlay.isOpen()) StageOverlay.close();
            if (isEngineActive) StageOverlay.open();
            HomeScene.refresh(); // 방 화면도 새 카트리지 것으로 (없으면 대사창의 돌아가기 버튼을 감춘다)
        } catch (error) { /* 로드 시점에는 아직 엔진 상태가 없을 수 있다 */ }
    },

    _getCartridgeForPreset(preset) {
        if (preset.cartridge) return CartridgeFormat.normalize(preset.cartridge, { name: preset.name, coverUrl: preset.coverUrl });
        return CartridgeFormat.fromLegacy({
            meta: { storyId: preset.storyId, name: preset.name, coverUrl: preset.coverUrl },
            settings: { animations: preset.data?.animations || [], bgm: preset.data?.bgm || [] },
            opening: preset.data?.opening || []
        }, { name: preset.name, coverUrl: preset.coverUrl, storyId: preset.storyId });
    },

    async _loadPresetPackage(preset) {
        if (!preset.packageId) return { cartridge: this._getCartridgeForPreset(preset), files: new Map() };
        const storedPackage = await CartridgePackageStore.get(preset.packageId);
        if (!storedPackage?.blob) throw new Error('설치된 카트리지 패키지를 찾을 수 없습니다. 다시 가져와주세요.');
        const buffer = await storedPackage.blob.arrayBuffer();
        return await CartridgePackageReader.readArrayBuffer(buffer, storedPackage.fileName || `${preset.packageId}${CARTRIDGE_EXTENSION}`);
    },

    // UI에서 카트리지 클릭 시 호출 (수동 로드)
    async applyPreset(id) {
        const preset = this.presets.find(p => p.id === id);
        if (!preset) return;
        // 다른 작품용이면 묻기 전에 알린다 (엔진 3.38.0)
        let mismatch = null;
        try { mismatch = this.storyMismatch(this._getCartridgeForPreset(preset)); } catch (error) { /* 읽지 못하면 아래에서 오류로 알린다 */ }
        if (mismatch) {
            alert(`[${preset.name}] ${mismatch}\n\n이 페이지에는 적용할 수 없습니다. 그 작품에 들어가면 저절로 적용됩니다.`);
            return;
        }

        if (confirm(`[${preset.name}] 설정을 적용하시겠습니까?`)) {
            try {
                const loaded = await this._loadPresetPackage(preset);
                this._applySettingsData(loaded.cartridge.presentation, loaded.cartridge, loaded.files);
                this.lastLoadedId = preset.storyId; // 현재 로드된 ID 기억
                SettingsManager.close();
                this.showToast(`💿 "${preset.name}" 설정이 적용되었습니다.`);
            } catch (error) {
                console.error(error);
                alert(`카트리지를 적용할 수 없습니다.\n${error.message}`);
            }
        }
    },

    // [신규] URL 변경 시 자동 로드 체크 함수
    async checkAutoLoad() {
        this.load(); // 최신 목록 로드
        const target = getCurrentTargetId(); // 현재 페이지 ID 가져오기
        if (!target || !target.id) return;

        // 이미 이 ID로 로드한 적이 있다면 중복 실행 방지
        if (this.lastLoadedId === target.id) return;

        // 현재 페이지의 작품 ID와 일치하는 프리셋 찾기. 카트리지가 작품 ID 를 여럿 적었으면 그중 하나만 맞아도 된다 (엔진 3.38.0)
        const match = this.presets.find(p => p.storyId === target.id
            || (Array.isArray(p.cartridge?.manifest?.storyIds) && p.cartridge.manifest.storyIds.includes(target.id)));

        if (match) {
            // 1. 매칭되는 프리셋이 있으면 -> 적용
            console.log(`VN Engine: Auto-loading preset for ${target.id}`);
            try {
                const loaded = await this._loadPresetPackage(match);
                this._applySettingsData(loaded.cartridge.presentation, loaded.cartridge, loaded.files);
                this.showToast(`🔄 작품 ID 감지: "${match.name}" 설정이 적용되었습니다.`);
            } catch (error) {
                console.error('VN Engine: 카트리지 자동 로드 실패', error);
                this.showToast(`⚠️ "${match.name}" 카트리지를 불러오지 못했습니다.`);
            }
        } else {
            // 2. 매칭되는 프리셋이 없으면 -> ★ 콘텐츠 설정 초기화!
            // (이전 방에서 쓰던 설정이 넘어오지 않도록 방지)
            SettingsManager.resetContentSettings();
            CartridgeRuntime.deactivate();
            try { HomeScene.refresh(); } catch (error) { /* 엔진 화면이 아직 없을 수 있다 */ }

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
    window.VNEngineCartridge = {
        format: CARTRIDGE_FORMAT,
        formatVersion: CARTRIDGE_FORMAT_VERSION,
        extension: CARTRIDGE_EXTENSION,
        getActiveManifest: () => CartridgeRuntime.activeCartridge?.manifest || null,
        getModule: (moduleId) => CartridgeRuntime.getModule(moduleId)
    };

    // --- 설정 관리자 ---
    const SettingsManager = {
        defaults: {
            characterMode: 'multi', dialogueBoxPos: { bottom: '40px', left: '50%', transform: 'translateX(-50%)' },
            statusWindowPos: { top: '20px', right: '20px' }, characterContainerPos: { bottom: '0px', left: '0px' },
            backgroundPattern: '/g/', characterPattern: '/c/', customBackgroundUrl: '', customAnimations: [], customBgmRules: [],
            // globalVolume, typingSpeed 뒤에 openingScripts 배열로 변경
            globalVolume: 0.5, typingSpeed: 40,
            useCartridgeTheme: true,
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
            <div id="${DOM_IDS.SETTINGS_MODAL}">
                <div class="vn-modal-content">

                    <!-- 닫기 버튼 -->
                    <span id="vn-modal-close">&times;</span>

                    <!-- [왼쪽] 사이드바 탭 -->
                    <div class="vn-settings-sidebar">
                        <div class="vn-tab-btn active" data-tab="vn-tab-general">🛠 일반 설정</div>
                        <div class="vn-tab-btn" data-tab="vn-tab-system">⚙ 환경 설정</div>
                        <!-- 라이브러리 탭 버튼 추가 -->
                        <div class="vn-tab-btn" data-tab="vn-tab-library">📚 라이브러리</div>
                    </div>

                    <!-- [오른쪽] 컨텐츠 영역 -->
                    <div class="vn-settings-body">
                        <h2 class="vn-settings-title">VN 엔진 설정</h2>

                        <!-- 탭 1: 일반 설정 (기존 기능들) -->
                        <div id="vn-tab-general" class="vn-tab-content active">

                            <!-- BGM 설정 -->
                            <div id="vn-bgm-section" class="vn-setting-option">
                                <label class="vn-field-label vn-field-label-accent">♫ BGM 설정 (이미지 키워드 매칭)</label>
                                <div class="vn-rule-list-container">
                                    <ul id="vn-bgm-rules-list"></ul>
                                </div>
                                <div class="vn-inline-row">
                                    <input type="text" id="vn-bgm-trigger" placeholder="파일명 키워드 (예: rain)" class="vn-pattern-input">
                                    <input type="text" id="vn-bgm-url" placeholder="음악 URL (.mp3 등)" class="vn-pattern-input">
                                    <button id="vn-add-bgm-btn" class="vn-modal-button">추가</button>
                                </div>
                            </div>

                            <hr class="vn-section-divider">

                            <!-- 모드 선택 -->
                            <div class="vn-setting-option vn-option-gap">
                                <label class="vn-field-label">모드 선택</label>
                                <div class="vn-radio-row">
                                    <div><input type="radio" id="vn-char-mode-single" name="characterMode" value="single"> <label for="vn-char-mode-single">범용 모드</label></div>
                                    <div><input type="radio" id="vn-char-mode-multi" name="characterMode" value="multi"> <label for="vn-char-mode-multi">비주얼챗 모드</label></div>
                                </div>
                            </div>

                            <!-- 사용자 배경 (범용) -->
                            <div id="vn-custom-bg-section" class="vn-setting-option">
                                <label class="vn-field-label">사용자 지정 배경 (범용 모드용)</label>
                                <input type="text" id="vn-custom-bg-url-input" class="vn-pattern-input" placeholder="이미지 URL (https://...)">
                            </div>

                            <!-- URL 패턴 (멀티) -->
                            <div id="vn-multi-mode-section" class="vn-setting-option">
                                <label class="vn-field-label">URL 패턴 설정 (비주얼챗 모드 전용)</label>
                                <input type="text" id="vn-bg-pattern-input" class="vn-pattern-input" placeholder="배경 키워드 (/g/)">
                                <input type="text" id="vn-char-pattern-input" class="vn-pattern-input" placeholder="캐릭터 키워드 (/c/)">
                            </div>

                            <!-- 사용자 연출 (멀티) -->
                            <div id="vn-custom-anim-section" class="vn-setting-option">
                                <label class="vn-field-label">사용자 지정 연출 (비주얼챗 모드 전용)</label>
                                <div class="vn-anim-rule-list-container">
                                    <ul id="vn-animation-rules-list"></ul>
                                </div>
                                <div class="vn-anim-add-form">
                                    <input type="text" id="vn-anim-trigger-input" placeholder="이미지 키워드" class="vn-pattern-input">
                                    <select id="vn-anim-type-select" class="vn-pattern-input">${animationOptions}</select>
                                    <button id="vn-add-anim-rule-btn" class="vn-modal-button">규칙 추가</button>
                                </div>
                                <button id="vn-export-anim-btn" class="vn-modal-button">카트리지 내보내기</button>
                            </div>

                            <hr class="vn-section-divider">

                            <div class="vn-setting-option">
                                <label class="vn-field-label">UI 위치 편집</label>
                                <button id="vn-edit-ui-button" class="vn-modal-button">화면 UI 편집 모드 시작</button>
                            </div>
                        </div>

                        <!-- 탭 2: 환경 설정 (신규 기능) -->
                        <div id="vn-tab-system" class="vn-tab-content">

                            <!-- 볼륨 조절 -->
                            <div class="vn-setting-option vn-option-card">
                                <label class="vn-field-label vn-field-label-large">
                                     BGM 음량 <span id="vn-vol-display">50%</span>
                                </label>
                                <input type="range" id="vn-vol-slider" min="0" max="1" step="0.05">
                            </div>

                            <!-- 텍스트 속도 조절 -->
                            <div class="vn-setting-option vn-option-card">
                                <label class="vn-field-label vn-field-label-large">
                                     텍스트 출력 속도 <span id="vn-speed-display">보통</span>
                                </label>
                                <input type="range" id="vn-speed-slider" min="10" max="90" step="10">
                                <div class="vn-range-scale">
                                    <span>느림</span>
                                    <span>빠름</span>
                                </div>
                            </div>

                            <!-- 카트리지 테마 사용 여부 -->
                            <div class="vn-setting-option vn-option-card">
                                <label for="vn-cartridge-theme-toggle" class="vn-toggle-label">
                                    <input type="checkbox" id="vn-cartridge-theme-toggle">
                                    카트리지 외형 사용
                                </label>
                                <p class="vn-option-hint">
                                    카트리지가 색·글꼴·배치를 지정한 경우 그대로 따릅니다. 끄면 항상 엔진 기본 외형을 씁니다. (Ctrl+Alt+T 로도 끌 수 있습니다)
                                </p>
                            </div>

                        </div>
                        <!-- 탭 3: 라이브러리 (신규 추가) -->
                        <div id="vn-tab-library" class="vn-tab-content">
                            <div class="vn-library-header">
                                <h3 class="vn-library-title">📚 라이브러리</h3>
                                <button id="vn-library-add-btn" class="vn-modal-button">+ 새로 만들기</button>
                            </div>

                            <div id="vn-cartridge-drop-zone" class="vn-cartridge-drop-zone" role="button" tabindex="0" aria-label="카트리지 파일 가져오기">
                                <div class="vn-drop-icon" aria-hidden="true">⇩</div>
                                <div class="vn-drop-copy">
                                    <strong>카트리지 파일을 여기에 놓으세요</strong>
                                    <span>.vncartridge 또는 기존 .json 파일</span>
                                </div>
                                <button id="vn-import-anim-btn" class="vn-modal-button" type="button">파일 선택</button>
                                <input type="file" id="vn-import-anim-input" style="display:none;">
                            </div>

                            <!-- 라이브러리 목록 컨테이너 -->
                            <div id="vn-library-container">
                                <div class="vn-library-empty-initial">
                                    저장된 라이브러리가 없습니다.
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>

            <style>
                /* --- 설정 창 배치 ---
                   예전에는 마크업에 인라인으로 박혀 있던 값들이다. 화면 크기에 따라 덮어쓸 수 있도록 여기로 옮겼다.
                   모두 #설정창 아래로 묶어서, Crack 사이트의 전역 규칙(h2, label, hr 등)에 지지 않게 한다. */
                #${DOM_IDS.SETTINGS_MODAL} { display: none; position: fixed; z-index: 100000; left: 0; top: 0; width: 100%; height: 100%; overflow: hidden; background-color: rgba(0,0,0,0.6); align-items: center; justify-content: center; }
                #${DOM_IDS.SETTINGS_MODAL} .vn-modal-content { background-color: #2c2c2c; width: 850px; height: 650px; display: flex; border-radius: 10px; border: 1px solid #555; position: relative; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
                #${DOM_IDS.SETTINGS_MODAL} #vn-modal-close { position: absolute; top: 15px; right: 20px; color: #aaa; font-size: 28px; font-weight: bold; cursor: pointer; z-index: 20; }
                #${DOM_IDS.SETTINGS_MODAL} .vn-settings-sidebar { width: 180px; background-color: #222; border-right: 1px solid #444; padding-top: 60px; box-sizing: border-box; }
                #${DOM_IDS.SETTINGS_MODAL} .vn-settings-body { flex: 1; padding: 40px; overflow-y: auto; color: white; font-family: 'Pretendard', sans-serif; }
                #${DOM_IDS.SETTINGS_MODAL} .vn-settings-title { margin-top: 0; border-bottom: 1px solid #555; padding-bottom: 15px; margin-bottom: 25px; font-size: 24px; }
                #${DOM_IDS.SETTINGS_MODAL} .vn-field-label { display: block; margin-bottom: 10px; font-weight: bold; }
                #${DOM_IDS.SETTINGS_MODAL} .vn-field-label-accent { color: #a2d2ff; }
                #${DOM_IDS.SETTINGS_MODAL} .vn-field-label-large { margin-bottom: 15px; font-size: 1.1em; }
                #${DOM_IDS.SETTINGS_MODAL} .vn-rule-list-container,
                #${DOM_IDS.SETTINGS_MODAL} .vn-anim-rule-list-container { height: 120px; overflow-y: auto; background-color: #333; padding: 10px; border-radius: 5px; margin-bottom: 10px; border: 1px solid #555; }
                #${DOM_IDS.SETTINGS_MODAL} #vn-bgm-rules-list,
                #${DOM_IDS.SETTINGS_MODAL} #vn-animation-rules-list { list-style: none; margin: 0; padding: 0; }
                #${DOM_IDS.SETTINGS_MODAL} .vn-inline-row,
                #${DOM_IDS.SETTINGS_MODAL} .vn-anim-add-form { display: flex; gap: 10px; margin-bottom: 10px; }
                #${DOM_IDS.SETTINGS_MODAL} #vn-bgm-trigger,
                #${DOM_IDS.SETTINGS_MODAL} #vn-anim-type-select { flex: 1; }
                #${DOM_IDS.SETTINGS_MODAL} #vn-bgm-url,
                #${DOM_IDS.SETTINGS_MODAL} #vn-anim-trigger-input { flex: 2; }
                #${DOM_IDS.SETTINGS_MODAL} .vn-section-divider { border: 0; border-top: 1px solid #444; margin: 20px 0; }
                #${DOM_IDS.SETTINGS_MODAL} #vn-bgm-section { margin-bottom: 30px; }
                #${DOM_IDS.SETTINGS_MODAL} .vn-option-gap { margin-bottom: 20px; }
                #${DOM_IDS.SETTINGS_MODAL} .vn-radio-row { display: flex; gap: 20px; }
                #${DOM_IDS.SETTINGS_MODAL} #vn-custom-bg-section,
                #${DOM_IDS.SETTINGS_MODAL} #vn-multi-mode-section,
                #${DOM_IDS.SETTINGS_MODAL} #vn-custom-anim-section { margin-bottom: 20px; display: none; }
                #${DOM_IDS.SETTINGS_MODAL} #vn-bg-pattern-input { margin-bottom: 5px; }
                #${DOM_IDS.SETTINGS_MODAL} #vn-export-anim-btn { width: 100%; background-color: #444; }
                #${DOM_IDS.SETTINGS_MODAL} #vn-edit-ui-button { width: 100%; }
                #${DOM_IDS.SETTINGS_MODAL} .vn-option-card { margin-bottom: 40px; background: #333; padding: 20px; border-radius: 8px; }
                #${DOM_IDS.SETTINGS_MODAL} #vn-vol-display,
                #${DOM_IDS.SETTINGS_MODAL} #vn-speed-display { color: #a2d2ff; float: right; }
                #${DOM_IDS.SETTINGS_MODAL} #vn-vol-slider { width: 100%; cursor: pointer; }
                #${DOM_IDS.SETTINGS_MODAL} #vn-speed-slider { width: 100%; cursor: pointer; direction: rtl; }
                #${DOM_IDS.SETTINGS_MODAL} .vn-range-scale { display: flex; justify-content: space-between; font-size: 0.8em; color: #aaa; margin-top: 5px; }
                #${DOM_IDS.SETTINGS_MODAL} .vn-toggle-label { display: flex; align-items: center; gap: 10px; font-size: 1.1em; font-weight: bold; cursor: pointer; }
                #${DOM_IDS.SETTINGS_MODAL} #vn-cartridge-theme-toggle { width: 18px; height: 18px; cursor: pointer; }
                #${DOM_IDS.SETTINGS_MODAL} .vn-option-hint { margin: 10px 0 0; font-size: 0.85em; color: #aaa; line-height: 1.5; }
                #${DOM_IDS.SETTINGS_MODAL} .vn-library-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
                #${DOM_IDS.SETTINGS_MODAL} .vn-library-title { margin: 0; font-size: 1.2em; border-bottom: none; }
                #${DOM_IDS.SETTINGS_MODAL} #vn-library-add-btn { background-color: #28a745; }
                #${DOM_IDS.SETTINGS_MODAL} #vn-library-container { background-color: #333; border-radius: 8px; padding: 20px; min-height: 300px; display: flex; flex-direction: column; gap: 10px; border: 1px solid #555; }
                #${DOM_IDS.SETTINGS_MODAL} .vn-library-empty-initial { text-align: center; color: #888; margin-top: 100px; }

                .vn-tab-btn { padding: 15px 20px; color: #888; cursor: pointer; border-left: 4px solid transparent; transition: all 0.2s; font-weight: bold; font-size: 15px; margin-bottom: 5px; }
                .vn-tab-btn:hover { background-color: #2a2a2a; color: #ccc; }
                .vn-tab-btn.active { background-color: #2c2c2c; color: white; border-left: 4px solid #1a73e8; background: linear-gradient(90deg, rgba(26,115,232,0.1) 0%, rgba(0,0,0,0) 100%); }
                .vn-tab-content { display: none; }
                .vn-tab-content.active { display: block; animation: vn-slide-in 0.3s ease-out; }
                @keyframes vn-slide-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

                .vn-modal-button { background-color: #1a73e8; color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer; font-weight: bold; transition: background 0.2s; }
                .vn-modal-button:hover { background-color: #1765c7; }
                .vn-modal-button:disabled { opacity: .55; cursor: wait; }
                .vn-pattern-input { width: 100%; box-sizing: border-box; margin-top: 5px; padding: 8px; background-color: #444; color: white; border: 1px solid #666; border-radius: 4px; }

                .vn-cartridge-drop-zone {
                    display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 14px;
                    min-height: 88px; margin-bottom: 18px; padding: 16px 18px; border: 2px dashed #52616d;
                    border-radius: 10px; background: #292d31; cursor: pointer;
                    transition: border-color .18s, background-color .18s, box-shadow .18s, transform .18s;
                }
                .vn-cartridge-drop-zone:hover, .vn-cartridge-drop-zone:focus-visible { border-color: #579bdc; background: #293640; outline: none; }
                .vn-cartridge-drop-zone.drag-over { border-color: #66d9ff; background: #15374a; box-shadow: inset 0 0 0 1px rgba(102,217,255,.3), 0 0 22px rgba(50,160,210,.24); transform: scale(1.01); }
                .vn-cartridge-drop-zone.importing { border-style: solid; border-color: #6fd6a8; cursor: wait; }
                .vn-drop-icon { display: grid; place-items: center; width: 46px; height: 46px; border-radius: 50%; color: #9ce9ff; background: #173d52; font-size: 27px; font-weight: 800; }
                .vn-cartridge-drop-zone.drag-over .vn-drop-icon { color: #10242f; background: #66d9ff; }
                .vn-drop-copy { min-width: 0; }
                .vn-drop-copy strong { display: block; color: #f4fbff; font-size: 14px; }
                .vn-drop-copy span { display: block; margin-top: 5px; color: #9caab3; font-size: 12px; }
                @media (max-width: 680px) {
                    .vn-cartridge-drop-zone { grid-template-columns: auto 1fr; }
                    .vn-cartridge-drop-zone #vn-import-anim-btn { grid-column: 1 / -1; width: 100%; }
                }

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

            /* 낮은 화면(가로로 든 폰): 창이 화면 높이를 넘지 않게 하고, 넘치는 내용은 본문 안에서 넘긴다 */
            @media (max-height: 500px) {
                #${DOM_IDS.SETTINGS_MODAL} .vn-modal-content { width: min(850px, calc(100vw - 16px)); height: calc(100vh - 16px); height: calc(100dvh - 16px); }
                #${DOM_IDS.SETTINGS_MODAL} #vn-modal-close { top: 6px; right: 12px; font-size: 24px; }
                #${DOM_IDS.SETTINGS_MODAL} .vn-settings-sidebar { width: 136px; padding-top: 44px; }
                #${DOM_IDS.SETTINGS_MODAL} .vn-tab-btn { padding: 10px 14px; font-size: 13px; }
                #${DOM_IDS.SETTINGS_MODAL} .vn-settings-body { padding: 16px 20px; }
                #${DOM_IDS.SETTINGS_MODAL} .vn-settings-title { font-size: 17px; padding-bottom: 8px; margin-bottom: 12px; }
                #${DOM_IDS.SETTINGS_MODAL} .vn-option-card { margin-bottom: 14px; padding: 12px 14px; }
                #${DOM_IDS.SETTINGS_MODAL} .vn-section-divider { margin: 12px 0; }
                #${DOM_IDS.SETTINGS_MODAL} #vn-library-container { min-height: 160px; padding: 12px; }
                #${DOM_IDS.SETTINGS_MODAL} .vn-library-empty-initial { margin-top: 40px; }
                #${DOM_IDS.SETTINGS_MODAL} .vn-cartridge-drop-zone { min-height: 64px; padding: 10px 12px; }
            }
            </style>`;

            document.body.insertAdjacentHTML('beforeend', modalHTML); this.setupModalEventListeners();
        },

        setupModalEventListeners() {
            const self = this;
            document.getElementById('vn-modal-close').onclick = () => self.close();

            // 창 바깥(어두운 배경)을 누르면 닫는다. 닫기 버튼이 화면 밖에 있어도 빠져나갈 길을 둔다.
            // 창 안에서 누르기 시작해 바깥에서 뗀 경우(글자 선택 등)는 닫지 않는다.
            const settingsModal = document.getElementById(DOM_IDS.SETTINGS_MODAL);
            let pressedOnBackdrop = false;
            settingsModal?.addEventListener('pointerdown', (e) => { pressedOnBackdrop = e.target === settingsModal; });
            settingsModal?.addEventListener('click', (e) => {
                if (pressedOnBackdrop && e.target === settingsModal) self.close();
                pressedOnBackdrop = false;
            });

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

            // --- 카트리지 테마 사용 여부 ---
            const themeToggle = document.getElementById('vn-cartridge-theme-toggle');
            if (themeToggle) {
                themeToggle.onchange = (e) => {
                    self.settings.useCartridgeTheme = e.target.checked;
                    self.save();
                    ThemeManager.render();
                    SkinManager.render();
                };
            }

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
                const cartridgeName = prompt("내보낼 카트리지의 이름을 입력하세요:", "새 카트리지");
                if (cartridgeName === null) return;
                const coverUrl = prompt("내보낼 파일에 저장할 '커버 이미지 URL'을 입력하세요 (선택사항):", "") || "";

                const exportData = CartridgeFormat.createTemplate({
                    name: cartridgeName.trim() || '새 카트리지',
                    storyId: getCurrentTargetId()?.id || 'manual',
                    coverUrl,
                    animations: self.settings.customAnimations || [],
                    bgm: self.settings.customBgmRules || [],
                    opening: self.settings.openingScripts || []
                });

                const manifest = CartridgeFormat.toPackageManifest(exportData);
                const packageBytes = ZipStore.create(new Map([
                    ['manifest.json', JSON.stringify(manifest, null, 2)]
                ]));
                const blob = new Blob([packageBytes], { type: "application/vnd.vn-engine.cartridge+zip" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${CartridgeFormat.sanitizeId(exportData.manifest.name)}${CARTRIDGE_EXTENSION}`;
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
            const dropZone = document.getElementById('vn-cartridge-drop-zone');

            if (importBtn && importInput && dropZone) {
                // Safari 처럼 확장자를 가리는 환경 때문에 이름을 바꿔 들고 오는 경우가 있어 zip 도 받는다.
                // 실제 판별은 파일 내용으로 하므로 이름은 1차 거름망일 뿐이다.
                const supportedFilePattern = /\.(vncartridge|json|zip)$/i;
                const defaultDropTitle = '카트리지 파일을 여기에 놓으세요';
                const dropTitle = dropZone.querySelector('.vn-drop-copy strong');
                let dragDepth = 0;

                const setImporting = (isImporting, fileName = '') => {
                    dropZone.classList.toggle('importing', isImporting);
                    dropZone.setAttribute('aria-busy', String(isImporting));
                    importBtn.disabled = isImporting;
                    if (dropTitle) dropTitle.textContent = isImporting ? `${fileName} 읽는 중…` : defaultDropTitle;
                };

                const readFileAsArrayBuffer = (file) => {
                    if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
                    return new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = event => resolve(event.target.result);
                        reader.onerror = () => reject(reader.error || new Error('파일을 읽을 수 없습니다.'));
                        reader.readAsArrayBuffer(file);
                    });
                };

                const importCartridgeFile = async (file) => {
                    if (!file) return;
                    if (!supportedFilePattern.test(file.name)) {
                        alert('.vncartridge, .json, .zip 파일만 가져올 수 있습니다.');
                        return;
                    }

                    setImporting(true, file.name);
                    try {
                        const fileData = await readFileAsArrayBuffer(file);
                        const packageData = await CartridgePackageReader.readArrayBuffer(fileData, file.name);
                        const cartridge = packageData.cartridge;
                        const enabledModules = Object.entries(cartridge.modules)
                            .filter(([, definition]) => definition.enabled === true)
                            .map(([moduleId]) => moduleId);

                        // 다른 작품용이면 여기서는 적용하지 않는다. 라이브러리에 넣어 두면 그 작품에 들어갈 때 저절로 적용된다 (엔진 3.38.0).
                        const mismatch = LibraryManager.storyMismatch(cartridge);
                        if (mismatch) {
                            if (confirm(`${mismatch}\n\n이 페이지에는 적용할 수 없습니다.\n[확인] -> 라이브러리에 저장만 하기 (그 작품에 들어가면 저절로 적용)\n[취소] -> 그만두기`)) {
                                if (packageData.packageType !== 'legacy-json') await LibraryManager.addPackage(packageData, file.name);
                                else LibraryManager.addPreset(cartridge, cartridge.manifest.name, cartridge.manifest.coverUrl);
                                document.querySelector('[data-tab="vn-tab-library"]')?.click();
                            }
                        } else if (confirm(`카트리지를 확인했습니다.\n이름: ${cartridge.manifest.name}\n버전: ${cartridge.manifest.version}\n활성 모듈: ${enabledModules.join(', ') || '없음'}\n\n[확인] -> 라이브러리에 저장하고 적용\n[취소] -> 저장하지 않고 즉시 적용`)) {
                            if (packageData.packageType !== 'legacy-json') await LibraryManager.addPackage(packageData, file.name);
                            else LibraryManager.addPreset(cartridge, cartridge.manifest.name, cartridge.manifest.coverUrl);
                            LibraryManager._applySettingsData(cartridge.presentation, cartridge, packageData.files);
                            document.querySelector('[data-tab="vn-tab-library"]')?.click();
                        } else {
                            LibraryManager._applySettingsData(cartridge.presentation, cartridge, packageData.files);
                            alert(`카트리지가 적용되었습니다.\n활성 모듈: ${enabledModules.join(', ') || '없음'}`);
                        }
                    } catch (err) {
                        console.error(err);
                        alert('오류: ' + err.message);
                    } finally {
                        setImporting(false);
                        importInput.value = '';
                    }
                };

                importBtn.onclick = event => {
                    event.stopPropagation();
                    importInput.click();
                };
                importInput.onchange = event => importCartridgeFile(event.target.files?.[0]);
                dropZone.onclick = event => {
                    if (!event.target.closest('button')) importInput.click();
                };
                dropZone.onkeydown = event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        importInput.click();
                    }
                };

                dropZone.addEventListener('dragenter', event => {
                    event.preventDefault();
                    dragDepth += 1;
                    dropZone.classList.add('drag-over');
                });
                dropZone.addEventListener('dragover', event => {
                    event.preventDefault();
                    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
                });
                dropZone.addEventListener('dragleave', event => {
                    event.preventDefault();
                    dragDepth = Math.max(0, dragDepth - 1);
                    if (dragDepth === 0) dropZone.classList.remove('drag-over');
                });
                dropZone.addEventListener('drop', event => {
                    event.preventDefault();
                    dragDepth = 0;
                    dropZone.classList.remove('drag-over');
                    const files = Array.from(event.dataTransfer?.files || []);
                    const file = files.find(candidate => supportedFilePattern.test(candidate.name));
                    if (!file) {
                        alert('.vncartridge 또는 .json 파일을 이 영역에 놓아주세요.');
                        return;
                    }
                    importCartridgeFile(file);
                });
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

            const themeToggle = document.getElementById('vn-cartridge-theme-toggle');
            if (themeToggle) themeToggle.checked = this.settings.useCartridgeTheme !== false;

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
        // 편집 모드로 옮기면 위치가 top/left 로 저장된다. 그때는 가로 폰에서도 아래 여백을 바꾸지 않는다.
        const dialogueAtDefaultBottom = !!settings.dialogueBoxPos && Object.prototype.hasOwnProperty.call(settings.dialogueBoxPos, 'bottom');
        let characterStyles = '';
        if (settings.characterMode === 'multi') {
            characterStyles = `
            #${DOM_IDS.CHAR_CONTAINER} {
                ${posToCss(settings.characterContainerPos)}
                position: absolute;
                width: 100%;
                height: 95vh;
                pointer-events: none;
                z-index: 1; /* 이벤트 CG(2) 아래. CG 가 뜨면 스탠딩을 모두 덮는다 */
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
            /* --- UI 테마 토큰 ---
               기본값은 현재 외형 그대로다. 카트리지가 theme 을 주면 이 값만 덮어쓴다.
               세부 토큰은 핵심 토큰을 참조하므로, 핵심 몇 개만 바꿔도 전체가 따라온다. */
            :root {
                /* 핵심 */
                --vn-font: 'Pretendard', sans-serif;
                --vn-accent: #4fc1e8;
                --vn-panel-bg: rgba(20, 30, 38, 0.96);
                --vn-panel-text: #f4f8fa;
                --vn-panel-border: rgba(132, 201, 224, 0.45);
                --vn-backdrop: rgba(5, 12, 18, 0.72);
                --vn-radius: 14px;

                /* 창 내부 */
                --vn-divider: #3b4b55;
                --vn-sidebar-bg: rgba(12, 22, 29, 0.52);
                --vn-muted-text: #c8d4da;
                --vn-tab-text: #dce7ec;
                --vn-tab-hover-bg: #31434e;
                --vn-accent-bg: #174f65;
                --vn-accent-text: #8eddf6;

                /* 메뉴 하단 버튼 */
                --vn-action-bg: #293943;
                --vn-action-border: #52636d;
                --vn-action-text: #e9f1f4;
                --vn-danger-bg: rgba(119, 27, 27, 0.5);
                --vn-danger-border: rgba(230, 88, 88, 0.52);
                --vn-danger-text: #ffd9d9;

                /* 대사창 */
                --vn-dialogue-bg: rgba(0, 0, 0, 0.8);
                --vn-dialogue-border: #555;
                --vn-dialogue-text: white;
                --vn-dialogue-radius: 10px;
                --vn-name-bg: rgba(40, 40, 40, 0.9);
                --vn-name-border: #777;
                --vn-name-text: white;
                --vn-narration-text: #ccc;

                /* 레이아웃 — 화면 크기에 따라 엔진이 바꾸는 값이다. 카트리지 테마로는 바꿀 수 없지만,
                   스킨에서 var() 로 읽으면 모바일에서 엔진이 바꾼 값을 그대로 따라갈 수 있다. */
                --vn-ui-inset: 20px;
                --vn-dialogue-padding: 30px 60px;
                --vn-dialogue-font-size: 1.7em;
                --vn-dialogue-line-height: 1.6;
                --vn-dialogue-min-height: 80px;
                --vn-name-offset: 40px;
                --vn-name-font-size: 1.2em;
                --vn-name-padding: 5px 15px;

                /* 상단 정보 바 */
                --vn-status-bg: rgba(239, 249, 255, 0.9);
                --vn-status-border: rgba(80, 195, 222, 0.9);
                --vn-status-text: #15384a;
                --vn-status-accent: #087aa1;

                /* 메뉴 버튼 */
                --vn-menu-button-bg: rgba(27, 42, 51, 0.86);
                --vn-menu-button-bg-hover: rgba(43, 66, 78, 0.94);
                --vn-menu-button-text: white;

                /* 모듈 창(지도 등) — 따로 안 주면 패널 값을 따라간다 */
                --vn-module-bg: #0b1219;
                --vn-module-backdrop: rgba(2, 7, 12, 0.86);
                --vn-module-border: var(--vn-panel-border);
                --vn-frame-bg: #081018;

                /* 좌하단 제어판·입력창 */
                --vn-primary: #1a73e8;
                --vn-primary-hover: #1765c7;
                --vn-control-bg: #444;
            }

            /* [수정] 설정 모달을 최상단으로 올림 (탭 메뉴 가림 방지) */
            #${DOM_IDS.SETTINGS_MODAL} { z-index: 200000 !important; }

            /* [추가] 슬라이더(Range Input) 공통 스타일 */
            input[type=range] { -webkit-appearance: none; background: transparent; }
            input[type=range]:focus { outline: none; }

            /* 전체 화면 무대 — VN 화면(99990)보다 위, 조작 패널(99999)과 메뉴 모달(100010)보다 아래.
               항상 VN 종료와 메뉴로 빠져나올 수 있어야 하므로 그 둘은 무대 위에 남긴다. */
            #${DOM_IDS.STAGE_OVERLAY} { display: none; position: fixed; inset: 0; z-index: 99995; background: #0b0d13; pointer-events: auto; }
            #${DOM_IDS.STAGE_OVERLAY}.visible { display: block; }
            #${DOM_IDS.STAGE_OVERLAY} .vn-stage-frame { display: block; width: 100%; height: 100%; border: 0; background: #0b0d13; }
            html.vn-stage-locked, body.vn-stage-locked { overflow: hidden !important; }
            body.vn-stage-locked [data-vn-stage-inert] { user-select: none !important; }

            #${DOM_IDS.CONTAINER} { position: fixed !important; top: 0; left: 0; width: 100vw; height: 100vh; height: 100dvh; z-index: 99990; pointer-events: none; display: none; }
            #${DOM_IDS.CONTAINER}.visible { display: block !important; }
            #${DOM_IDS.BACKGROUND} { width: 100%; height: 100%; background-size: cover; background-position: center; transition: background-image 0.5s ease-in-out; z-index: 0; }
            /* 배경 그림이 떠 있는 동안에는 뒤쪽 크랙 화면으로 클릭이 새지 않게 막는다.
               VN 자기 위젯(대사창·메뉴·상태 바)은 더 위에서 pointer-events: auto 를 쓰므로 그대로 눌린다.
               엔진이 크랙 입력창을 조작하는 것은 프로그램 호출이라 이 막의 영향을 받지 않는다. */
            #${DOM_IDS.BACKGROUND}.has-image { pointer-events: auto; user-select: none; }
            /* 배경 위에서 누를 수 있는 자리. 인물(z-index 2)보다 아래라 인물이 앞을 가린다. */
            #${DOM_IDS.HOTSPOT_LAYER} { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1; pointer-events: none; }
            .vn-hotspot { position: absolute; margin: 0; padding: 0; border: 1px solid transparent; border-radius: 10px; background-color: transparent; pointer-events: auto; cursor: pointer; transition: border-color .18s ease, background-color .18s ease, box-shadow .18s ease; }
            .vn-hotspot[data-reveal="always"] { border-color: rgba(255,255,255,.5); box-shadow: inset 0 0 18px rgba(255,255,255,.18); }
            .vn-hotspot[data-reveal="always"]:hover, .vn-hotspot[data-reveal="hover"]:hover { border-color: rgba(255,255,255,.92); background-color: rgba(255,255,255,.12); box-shadow: inset 0 0 22px rgba(255,255,255,.26); }
            /* 완전히 숨김: 테두리도 커서 변화도 없다. 눌러야만 알 수 있다. */
            .vn-hotspot[data-reveal="hidden"] { cursor: default; }
            .vn-hotspot:focus-visible { outline: 2px solid #5bdcff; outline-offset: 2px; }
            .vn-image-viewer { position: absolute; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; padding: 24px; background-color: rgba(3,8,14,.82); pointer-events: auto; box-sizing: border-box; }
            .vn-image-viewer[hidden] { display: none; }
            .vn-image-viewer-sheet { position: relative; display: flex; flex-direction: column; align-items: center; gap: 10px; max-width: min(1200px, 92vw); max-height: 88vh; }
            .vn-image-viewer-sheet img { max-width: 100%; max-height: 78vh; border-radius: 10px; box-shadow: 0 18px 48px rgba(0,0,0,.55); }
            .vn-image-viewer-close { position: absolute; top: -14px; right: -14px; width: 34px; height: 34px; border: 1px solid rgba(255,255,255,.45); border-radius: 50%; color: #eaf8fd; background-color: rgba(10,18,26,.92); cursor: pointer; font-size: 15px; line-height: 1; }
            .vn-image-viewer-missing { margin: 0; padding: 48px 36px; border: 1px dashed rgba(255,255,255,.4); border-radius: 10px; color: #cdeefb; font-family: var(--vn-font); font-size: 14px; text-align: center; }
            .vn-image-viewer-caption { margin: 0; color: #eaf8fd; font-family: var(--vn-font); font-size: 14px; text-align: center; }
            .vn-image-viewer-caption:empty { display: none; }
            #${DOM_IDS.EVENT_CG} { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; background-color: #000; z-index: 2; opacity: 0; transition: opacity 0.5s ease-in-out; pointer-events: none; }
            #${DOM_IDS.EVENT_CG}.visible { opacity: 1; }
            /* 방 화면(home). 대화하지 않을 때는 대사창·스탠딩·CG 를 감추고 방 화면용 캐릭터를 세운다 */
            #${DOM_IDS.HOME_LAYER} { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2; display: none; pointer-events: none; }
            #${DOM_IDS.CONTAINER}.vn-home-mode #${DOM_IDS.HOME_LAYER} { display: block; }
            #${DOM_IDS.CONTAINER}.vn-home-mode #${DOM_IDS.DIALOGUE_BOX},
            #${DOM_IDS.CONTAINER}.vn-home-mode #${DOM_IDS.CHAR_CONTAINER},
            #${DOM_IDS.CONTAINER}.vn-home-mode #${DOM_IDS.EVENT_CG} { display: none !important; }
            /* 방 화면 모듈(home.module). 방 화면에서는 조작하고, 대화하는 동안에는 대사창 뒤에 배경으로 깔린다.
               숨길 때 display 대신 visibility 를 써서 액자 크기와 그 안의 화면을 그대로 둔다 */
            #${DOM_IDS.HOME_FRAME_HOST} { position: absolute; inset: 0; z-index: 1; visibility: hidden; pointer-events: none; background-color: #141821; }
            #${DOM_IDS.CONTAINER}.vn-home-mode #${DOM_IDS.HOME_FRAME_HOST}.has-frame,
            #${DOM_IDS.CONTAINER}.vn-home-backdrop #${DOM_IDS.HOME_FRAME_HOST}.has-frame { visibility: visible; pointer-events: auto; }
            #${DOM_IDS.HOME_FRAME_HOST} .vn-home-frame { display: block; width: 100%; height: 100%; border: 0; }
            #${DOM_IDS.CONTAINER}.vn-home-backdrop #${DOM_IDS.HOME_FRAME_HOST} .vn-home-frame { pointer-events: none; }
            /* 배경 그림이 없으면 뒤쪽 크랙 화면이 비쳐 눌리지 않게 방 화면이 직접 막는다 */
            #${DOM_IDS.HOME_LAYER}.vn-home-no-background { pointer-events: auto; background-color: #141821; }
            .vn-home-notice { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); margin: 0; padding: 14px 20px; border: 1px dashed rgba(255,255,255,.4); border-radius: 10px; color: #dfe8f0; font-family: var(--vn-font); font-size: 14px; white-space: nowrap; }
            .vn-home-character { position: absolute; margin: 0; padding: 0; border: 0; background: transparent; cursor: pointer; pointer-events: auto; transition: opacity .18s ease; }
            .vn-home-character img { display: block; width: 100%; height: 100%; object-fit: contain; object-position: center bottom; pointer-events: none; user-select: none; filter: drop-shadow(0 8px 10px rgba(0,0,0,.25)); transition: filter .18s ease; }
            .vn-home-character:hover img, .vn-home-character:focus-visible img, .vn-home-character.is-selected img { filter: drop-shadow(0 0 10px rgba(255,236,200,.95)) drop-shadow(0 8px 10px rgba(0,0,0,.25)); }
            .vn-home-character:focus-visible { outline: none; }
            #${DOM_IDS.HOME_LAYER}.has-selection .vn-home-character:not(.is-selected) { opacity: .6; }
            .vn-home-placeholder { display: flex; align-items: flex-end; justify-content: center; width: 100%; height: 100%; box-sizing: border-box; padding: 10px; border: 2px dashed rgba(255,255,255,.75); border-radius: 12px; background-color: rgba(16,20,28,.28); color: #fff; font-family: var(--vn-font); font-size: 13px; font-weight: 700; text-align: center; white-space: pre-line; text-shadow: 0 1px 3px rgba(0,0,0,.6); }
            .vn-home-choices { position: absolute; display: flex; flex-direction: column; gap: 6px; min-width: 190px; max-width: 260px; box-sizing: border-box; padding: 10px; border: 1px solid var(--vn-dialogue-border); border-radius: var(--vn-dialogue-radius); background-color: var(--vn-dialogue-bg); color: var(--vn-dialogue-text); font-family: var(--vn-font); box-shadow: 0 14px 36px rgba(0,0,0,.4); backdrop-filter: blur(8px); pointer-events: auto; }
            .vn-home-choices-title { padding: 2px 6px 4px; font-size: 13px; font-weight: 800; opacity: .75; }
            .vn-home-choice { width: 100%; padding: 10px 14px; border: 1px solid var(--vn-dialogue-border); border-radius: 8px; background-color: transparent; color: inherit; font-family: inherit; font-size: 15px; font-weight: 700; text-align: left; cursor: pointer; transition: background-color .15s ease; }
            .vn-home-choice:hover { background-color: rgba(255,255,255,.1); }
            .vn-home-choice:focus-visible { outline: 2px solid var(--vn-primary); outline-offset: 2px; }
            .vn-home-choice.primary { border-color: var(--vn-primary); background-color: var(--vn-primary); color: white; }
            .vn-home-choice.primary:hover { background-color: var(--vn-primary-hover); }
            .vn-home-toast { position: absolute; left: 50%; bottom: 40px; transform: translateX(-50%); margin: 0; padding: 8px 18px; border-radius: 999px; background-color: rgba(10,14,20,.85); color: #f2f5f8; font-family: var(--vn-font); font-size: 14px; opacity: 0; pointer-events: none; transition: opacity .2s ease; }
            .vn-home-toast.visible { opacity: 1; }
            ${characterStyles}
            /* 대본의 ![screen](…) 줄이 쓰는 화면 덮개. 배경·인물·CG 위, 대사창 아래 (엔진 3.34.0) */
            #${DOM_IDS.SCREEN_VEIL} { position: absolute; inset: 0; z-index: 2; opacity: 0; background-color: #ffffff; pointer-events: none; }
            /* 덮개를 기다리는 동안 대사창을 숨긴다. 다음 대사가 나오면 돌아온다 */
            #${DOM_IDS.DIALOGUE_BOX}.vn-veiled { opacity: 0; pointer-events: none; transition: opacity .6s ease; }
            /* 카트리지가 띄우는 선택지. 대사창과 같은 층이라 대사창을 눌러 넘기는 일은 막고, 메뉴와 정보 바는 그대로 눌린다 */
            #${DOM_IDS.SCRIPT_CHOICES} { position: absolute; inset: 0; z-index: 3; display: none; box-sizing: border-box; padding: 9vh 8vw 36vh; overflow-y: auto; pointer-events: auto; }
            #${DOM_IDS.SCRIPT_CHOICES}.visible { display: flex; }
            /* 가운데 정렬은 auto 여백으로 한다. 선택지가 화면보다 길어도 위쪽이 잘리지 않고 스크롤된다 (엔진 3.37.2) */
            .vn-script-choice-list, .vn-script-choice-form { display: flex; flex-direction: column; gap: 12px; width: min(720px, 100%); margin: auto; }
            #${DOM_IDS.SCRIPT_CHOICES} [hidden] { display: none; }
            .vn-script-choice { width: 100%; padding: 14px 20px; border: 1px solid var(--vn-dialogue-border); border-radius: var(--vn-dialogue-radius); background-color: var(--vn-dialogue-bg); color: var(--vn-dialogue-text); font-family: var(--vn-font); font-size: 17px; line-height: 1.5; text-align: left; cursor: pointer; backdrop-filter: blur(6px); transition: border-color .15s ease, background-color .15s ease; }
            .vn-script-choice:hover, .vn-script-choice:focus-visible { border-color: var(--vn-primary); outline: none; }
            .vn-script-choice-input { box-sizing: border-box; width: 100%; min-height: 96px; padding: 12px 16px; border: 1px solid var(--vn-dialogue-border); border-radius: var(--vn-dialogue-radius); background-color: var(--vn-dialogue-bg); color: var(--vn-dialogue-text); font-family: var(--vn-font); font-size: 16px; line-height: 1.5; resize: vertical; }
            .vn-script-choice-input:focus { outline: none; border-color: var(--vn-primary); }
            .vn-script-choice-submit { align-self: flex-end; min-width: 96px; padding: 10px 18px; border: 1px solid var(--vn-primary); border-radius: 8px; background-color: var(--vn-primary); color: white; font-family: var(--vn-font); font-size: 15px; font-weight: 700; cursor: pointer; }
            .vn-script-choice-submit:disabled { opacity: .45; cursor: default; }
            @media (max-height: 760px) {
                #${DOM_IDS.SCRIPT_CHOICES} { padding: 5vh 8vw 32vh; }
                .vn-script-choice-list, .vn-script-choice-form { gap: 8px; }
                .vn-script-choice { padding: 10px 18px; font-size: 15px; }
            }
            @media (max-height: 500px) {
                #${DOM_IDS.SCRIPT_CHOICES} { padding: 8px 6vw 44vh; }
                .vn-script-choice-list, .vn-script-choice-form { gap: 6px; }
                .vn-script-choice { padding: 8px 14px; font-size: 14px; }
                .vn-script-choice-input { min-height: 56px; font-size: 14px; }
            }
            #${DOM_IDS.DIALOGUE_BOX} { z-index: 3; position: absolute; ${posToCss(settings.dialogueBoxPos)} width: 95%; max-width: 1400px; background-color: var(--vn-dialogue-bg); border: 1px solid var(--vn-dialogue-border); border-radius: var(--vn-dialogue-radius); padding: var(--vn-dialogue-padding); color: var(--vn-dialogue-text); font-family: var(--vn-font); pointer-events: auto; box-sizing: border-box; cursor: pointer; }
            #${DOM_IDS.CHAR_NAME} { position: absolute; top: 0; left: var(--vn-name-offset); transform: translateY(-50%); background-color: var(--vn-name-bg); color: var(--vn-name-text); font-weight: bold; font-size: var(--vn-name-font-size); padding: var(--vn-name-padding); border-radius: 6px; border: 1px solid var(--vn-name-border); z-index: 1; }
            #${DOM_IDS.DIALOGUE_TEXT} { flex-grow: 1; font-size: var(--vn-dialogue-font-size); line-height: var(--vn-dialogue-line-height); min-height: var(--vn-dialogue-min-height); }
            #${DOM_IDS.DIALOGUE_TEXT}.typing-effect { user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; }
            .action-text { font-style: italic; color: var(--vn-narration-text); }
            #${DOM_IDS.STATUS_WINDOW} {
                z-index: 4; position: absolute; top: var(--vn-ui-inset); left: var(--vn-ui-inset);
                display: flex; align-items: center; justify-content: flex-start; flex-wrap: wrap; gap: 0;
                max-width: calc(100vw - 180px); min-height: 48px; box-sizing: border-box;
                background-color: var(--vn-status-bg); border: 1px solid var(--vn-status-border);
                border-radius: 8px; padding: 10px 16px; color: var(--vn-status-text);
                font-family: var(--vn-font); font-size: 14px; font-weight: 650;
                box-shadow: 0 4px 14px rgba(10, 45, 65, 0.18); backdrop-filter: blur(8px);
                pointer-events: auto;
            }
            .vn-status-field { display: inline-flex; align-items: center; white-space: nowrap; }
            .vn-status-field + .vn-status-field::before { content: ''; width: 1px; height: 14px; margin: 0 10px; background: rgba(21, 56, 74, 0.3); }
            .vn-status-location { color: var(--vn-status-accent); font-weight: 800; }
            #${DOM_IDS.MENU_BUTTON} {
                z-index: 5; position: absolute; top: var(--vn-ui-inset); right: var(--vn-ui-inset);
                min-height: 48px; padding: 0 18px; border: 1px solid rgba(255, 255, 255, 0.35);
                border-radius: 8px; background: var(--vn-menu-button-bg); color: var(--vn-menu-button-text);
                font-family: var(--vn-font); font-size: 15px; font-weight: 800;
                box-shadow: 0 4px 14px rgba(0, 0, 0, 0.24); backdrop-filter: blur(8px);
                cursor: pointer; pointer-events: auto; transition: background-color 0.2s, transform 0.2s;
            }
            #${DOM_IDS.MENU_BUTTON}:hover { background: var(--vn-menu-button-bg-hover); transform: translateY(-1px); }
            #${DOM_IDS.MENU_MODAL} {
                display: none; position: fixed; inset: 0; z-index: 100010;
                align-items: center; justify-content: center; padding: 24px; box-sizing: border-box;
                background: var(--vn-backdrop); pointer-events: auto;
            }
            .vn-menu-panel {
                display: flex; flex-direction: column; width: min(900px, 92vw); height: min(650px, 82vh);
                overflow: hidden; border: 1px solid var(--vn-panel-border); border-radius: var(--vn-radius);
                background: var(--vn-panel-bg); color: var(--vn-panel-text);
                font-family: var(--vn-font); box-shadow: 0 18px 60px rgba(0, 0, 0, 0.55);
            }
            .vn-menu-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid var(--vn-divider); }
            .vn-menu-title { margin: 0; font-size: 1.35rem; }
            #${DOM_IDS.MENU_CLOSE} { border: 0; background: transparent; color: var(--vn-muted-text); font-size: 30px; line-height: 1; cursor: pointer; }
            .vn-menu-layout { display: grid; grid-template-columns: 190px 1fr; min-height: 0; flex: 1; }
            .vn-menu-sidebar { display: flex; flex-direction: column; min-width: 0; min-height: 0; border-right: 1px solid var(--vn-divider); background: var(--vn-sidebar-bg); }
            #${DOM_IDS.MENU_TABS} { display: flex; flex: 1; flex-direction: column; gap: 8px; min-height: 0; padding: 18px; overflow-y: auto; }
            .vn-menu-tab {
                width: 100%; border: 1px solid transparent; border-radius: 8px; padding: 11px 13px;
                background: transparent; color: var(--vn-tab-text); font-size: 15px; font-weight: 700;
                text-align: left; cursor: pointer;
            }
            .vn-menu-tab:hover { background: var(--vn-tab-hover-bg); }
            .vn-menu-tab.active { border-color: var(--vn-accent); background: var(--vn-accent-bg); color: white; }
            .vn-menu-actions { display: grid; gap: 8px; flex: 0 0 auto; padding: 14px 18px 18px; border-top: 1px solid var(--vn-divider); }
            .vn-menu-action { width: 100%; min-height: 40px; border: 1px solid var(--vn-action-border); border-radius: 8px; padding: 9px 12px; color: var(--vn-action-text); background: var(--vn-action-bg); font-size: 14px; font-weight: 800; text-align: left; cursor: pointer; }
            .vn-menu-action:hover { border-color: #7a929f; background: #354a56; }
            .vn-menu-action.exit { border-color: var(--vn-danger-border); color: var(--vn-danger-text); background: var(--vn-danger-bg); }
            .vn-menu-action.exit:hover { border-color: #ee7777; background: rgba(151, 34, 34, 0.72); }
            #${DOM_IDS.MENU_BODY} { min-width: 0; padding: 26px 30px; overflow-y: auto; }
            .vn-menu-section-title { margin: 0 0 18px; color: var(--vn-accent-text); font-size: 1.35rem; }
            .vn-menu-section-content { margin: 0; color: #edf3f6; font-family: inherit; font-size: 1.05rem; line-height: 1.8; white-space: pre-wrap; overflow-wrap: anywhere; }
            .vn-module-view { display: flex; flex-direction: column; height: 100%; min-height: 0; }
            .vn-module-frame { flex: 1; width: 100%; min-height: 420px; border: 0; border-radius: 10px; background: #081018; }
            .vn-menu-tab.module { color: var(--vn-accent-text); }

            #${DOM_IDS.SERVICE_HOST} {
                position: fixed; left: -10000px; top: 0; width: 1px; height: 1px;
                overflow: hidden; opacity: 0; pointer-events: none; z-index: -1;
            }
            #${DOM_IDS.SERVICE_HOST} .vn-service-frame { width: 1px; height: 1px; border: 0; }

            #${DOM_IDS.MODULE_OVERLAY} {
                display: none; position: fixed; inset: 0; z-index: 100020;
                align-items: center; justify-content: center; padding: 16px; box-sizing: border-box;
                background: var(--vn-module-backdrop); pointer-events: auto;
            }
            #${DOM_IDS.MODULE_OVERLAY}.visible { display: flex; }
            #${DOM_IDS.MODULE_OVERLAY} .vn-module-panel {
                display: flex; flex-direction: column; width: min(1680px, 97vw); height: min(1020px, 94vh);
                overflow: hidden; border: 1px solid var(--vn-module-border); border-radius: var(--vn-radius);
                background: var(--vn-module-bg); color: var(--vn-panel-text);
                font-family: var(--vn-font); box-shadow: 0 22px 70px rgba(0, 0, 0, 0.6);
            }
            #${DOM_IDS.MODULE_OVERLAY} .vn-module-header {
                display: flex; flex: 0 0 auto; align-items: center; justify-content: space-between;
                padding: 12px 18px; border-bottom: 1px solid var(--vn-divider); background: var(--vn-sidebar-bg);
            }
            #${DOM_IDS.MODULE_OVERLAY} .vn-module-title { margin: 0; font-size: 1.05rem; letter-spacing: .04em; }
            #${DOM_IDS.MODULE_OVERLAY} .vn-module-close { border: 0; background: transparent; color: var(--vn-muted-text); font-size: 28px; line-height: 1; cursor: pointer; }
            #${DOM_IDS.MODULE_OVERLAY} .vn-module-close:hover { color: white; }
            #${DOM_IDS.MODULE_OVERLAY} .vn-module-overlay-frame { flex: 1; width: 100%; min-height: 0; border: 0; background: var(--vn-frame-bg); }
            /* 전체 화면 모듈 (openView 의 fullscreen, 엔진 3.39.0). 스킨이 창 모양을 바꿔도 화면 전체를 쓴다 */
            #${DOM_IDS.MODULE_OVERLAY}.vn-module-fullscreen { padding: 0 !important; background: #000 !important; }
            #${DOM_IDS.MODULE_OVERLAY}.vn-module-fullscreen .vn-module-panel { width: 100vw !important; height: 100vh !important; height: 100dvh !important; max-width: none !important; max-height: none !important; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; }
            #${DOM_IDS.MODULE_OVERLAY}.vn-module-fullscreen .vn-module-header { display: none !important; }
            @media (max-width: 900px) {
                #${DOM_IDS.MODULE_OVERLAY} { padding: 0; }
                #${DOM_IDS.MODULE_OVERLAY} .vn-module-panel { width: 100vw; height: 100vh; border: 0; border-radius: 0; }
            }
            @media (max-width: 720px) {
                #${DOM_IDS.STATUS_WINDOW} { top: 12px; left: 12px; max-width: calc(100vw - 120px); padding: 8px 10px; font-size: 12px; }
                #${DOM_IDS.MENU_BUTTON} { top: 12px; right: 12px; min-height: 42px; padding: 0 12px; font-size: 13px; }
                .vn-status-field + .vn-status-field::before { margin: 0 6px; }
                .vn-menu-layout { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
                .vn-menu-sidebar { flex-direction: row; border-right: 0; border-bottom: 1px solid var(--vn-divider); }
                #${DOM_IDS.MENU_TABS} { flex-direction: row; padding: 12px; overflow-x: auto; overflow-y: hidden; }
                .vn-menu-tab { width: auto; flex: 0 0 auto; }
                .vn-menu-actions { display: flex; padding: 10px 12px; border-top: 0; border-left: 1px solid var(--vn-divider); }
                .vn-menu-action { width: auto; min-width: 76px; text-align: center; }
                #${DOM_IDS.MENU_BODY} { padding: 22px; }
            }
            /* 왼쪽 아래 제어판. 화면 왼쪽 끝에 붙은 서랍이고, 오른쪽 손잡이로 접고 편다.
               VN 실행 중에는 숨고, 일시정지 중에는 돌아가기·종료만 보인다. */
            .vn-control-panel { position: fixed; left: 0; bottom: 20px; z-index: 99999; display: flex; align-items: center; gap: 6px; padding: 6px 0 6px 8px; background: rgba(18, 22, 30, 0.82); border-radius: 0 10px 10px 0; box-shadow: 2px 0 10px rgba(0, 0, 0, 0.35); transition: transform 0.3s ease-in-out; }
            .vn-control-panel.collapsed { transform: translateX(calc(-100% + 34px)); }
            .vn-control-panel.vn-session-active:not(.vn-paused) { display: none; }
            .vn-drawer-content { display: flex; gap: 8px; white-space: nowrap; }
            .vn-drawer-toggle { width: 34px; align-self: stretch; padding: 0; border: 0; background: transparent; color: #cfd8e3; font-size: 18px; cursor: pointer; }
            .vn-control-panel .vn-pause-only { display: none; }
            .vn-control-panel.vn-paused .vn-pause-only { display: inline-block; }
            .vn-control-panel.vn-paused .vn-idle-only { display: none; }
            #${DOM_IDS.RESUME_BUTTON} { background-color: var(--vn-primary); } #${DOM_IDS.RESUME_BUTTON}:hover { background-color: var(--vn-primary-hover); }
            #${DOM_IDS.PAUSE_EXIT_BUTTON} { background-color: #6b2a2a; padding-left: 12px; padding-right: 12px; } #${DOM_IDS.PAUSE_EXIT_BUTTON}:hover { background-color: #8a3030; }
            /* 일시정지: VN 화면을 지우지 않고 숨긴다. 크랙 화면을 그대로 누르고 쓸 수 있다 */
            #${DOM_IDS.CONTAINER}.visible.vn-paused { display: none !important; }
            .vn-control-button { background-color: var(--vn-control-bg); color: white; border: none; border-radius: 8px; padding: 10px 15px; font-size: 14px; font-weight: bold; cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.2); transition: background-color 0.2s; }
            #${DOM_IDS.START_BUTTON} { background-color: var(--vn-primary); } #${DOM_IDS.START_BUTTON}:hover { background-color: var(--vn-primary-hover); }
            #${DOM_IDS.START_BUTTON}.active { background-color: #c70000; } #${DOM_IDS.START_BUTTON}.active:hover { background-color: #a00000; }
            #${DOM_IDS.DEMO_BUTTON} { background-color: #0e7490; } #${DOM_IDS.DEMO_BUTTON}:hover { background-color: #0b5f76; }
            #${DOM_IDS.DEMO_BUTTON}.active { background-color: #b45309; } #${DOM_IDS.DEMO_BUTTON}.active:hover { background-color: #92400e; }
            #${DOM_IDS.SETTINGS_BUTTON}:hover { background-color: #555; }
            #${DOM_IDS.INPUT_BUTTON} {
                position: absolute;
                top: -38px;
                right: 0;
                z-index: 5;
                background-color: var(--vn-primary);
                color: white;
                border: 1px solid var(--vn-name-border);
                border-radius: 6px;
                padding: 6px 15px;
                font-size: 14px;
                font-weight: bold;
                cursor: pointer;
                box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                transition: background-color 0.2s;
                pointer-events: auto;
            }
            #${DOM_IDS.INPUT_BUTTON}:hover { background-color: var(--vn-primary-hover); }
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
            .vn-modal-textarea:focus { outline: 1px solid var(--vn-primary); }
            .vn-input-modal-buttons { display: flex; gap: 5px; flex-shrink: 0; }
            .vn-modal-button-cancel { background-color: #555; color: white; border: none; border-radius: 4px; padding: 0 12px; height: 36px; cursor: pointer; font-weight: bold; font-size: 13px; }
            .vn-modal-button-send { background-color: var(--vn-primary); color: white; border: none; border-radius: 4px; padding: 0 15px; height: 36px; cursor: pointer; font-weight: bold; font-size: 13px; }
            .vn-modal-button-send:hover { background-color: var(--vn-primary-hover); }
            .vn-modal-button-cancel:hover { background-color: #666; }

            #${DOM_IDS.LOG_BUTTON} {
                position: absolute; top: -38px; right: 95px; z-index: 5;
                background-color: #555; color: white; border: 1px solid #777; border-radius: 6px;
                padding: 6px 15px; font-size: 14px; font-weight: bold; cursor: pointer;
                box-shadow: 0 2px 5px rgba(0,0,0,0.3); transition: background-color 0.2s; pointer-events: auto;
            }
            #${DOM_IDS.LOG_BUTTON}:hover { background-color: #666; }
            /* 방 화면으로 돌아가는 버튼. 카트리지에 방 화면이 있을 때만 보인다 */
            #${DOM_IDS.END_TALK_BUTTON} {
                display: none; position: absolute; top: -38px; right: 172px; z-index: 5;
                background-color: #555; color: white; border: 1px solid #777; border-radius: 6px;
                padding: 6px 15px; font-size: 14px; font-weight: bold; cursor: pointer;
                box-shadow: 0 2px 5px rgba(0,0,0,0.3); transition: background-color 0.2s; pointer-events: auto;
            }
            #${DOM_IDS.CONTAINER}.vn-home-available #${DOM_IDS.END_TALK_BUTTON} { display: block; }
            #${DOM_IDS.END_TALK_BUTTON}:hover { background-color: #666; }

            #${DOM_IDS.AI_LOG_MODAL} { display: none; position: fixed; inset: 0; z-index: 100030; align-items: center; justify-content: center; padding: 24px; background: rgba(1, 7, 12, 0.82); pointer-events: auto; box-sizing: border-box; }
            .vn-ai-log-panel { display: flex; flex-direction: column; width: min(920px, 94vw); height: min(720px, 88vh); overflow: hidden; border: 1px solid rgba(91, 220, 255, 0.48); border-radius: 14px; color: #eaf8fd; background: #09131c; box-shadow: 0 20px 70px rgba(0, 0, 0, 0.68); }
            .vn-ai-log-header { display: flex; align-items: center; gap: 12px; padding: 17px 20px; border-bottom: 1px solid #263b47; }
            .vn-ai-log-header h2 { margin: 0; font-size: 19px; }
            .vn-ai-log-hint { color: #7294a5; font-size: 11px; }
            .vn-ai-log-header-actions { display: flex; gap: 8px; margin-left: auto; }
            .vn-ai-log-header button { min-height: 34px; border: 1px solid #415b68; border-radius: 7px; padding: 0 11px; color: #dbeaf0; background: #182934; cursor: pointer; }
            .vn-ai-log-header button:hover { border-color: #70cde9; color: white; }
            #${DOM_IDS.AI_LOG_BODY} { flex: 1; min-height: 0; overflow-y: auto; padding: 18px 20px 28px; }
            .vn-ai-pending { margin-bottom: 16px; padding: 13px; border: 1px solid rgba(255, 202, 106, 0.34); border-radius: 9px; color: #d9e8ee; background: rgba(80, 55, 17, 0.3); }
            .vn-ai-pending strong { display: block; margin-bottom: 7px; color: #ffca6a; font-size: 12px; }
            .vn-ai-pending pre { max-height: 180px; margin: 0; overflow: auto; color: #eaf3f6; font: 11px/1.55 Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
            .vn-ai-log-empty { padding: 50px 20px; color: #688493; text-align: center; }
            .vn-ai-log-entry { margin-bottom: 13px; border: 1px solid #263c48; border-radius: 9px; background: #0d1a24; }
            .vn-ai-log-entry summary { display: flex; align-items: center; gap: 9px; padding: 11px 13px; cursor: pointer; list-style: none; }
            .vn-ai-log-entry summary::-webkit-details-marker { display: none; }
            .vn-ai-log-status { flex: 0 0 auto; padding: 3px 7px; border-radius: 99px; color: #082018; background: #67ffd5; font-size: 9px; font-weight: 900; }
            .vn-ai-log-status.failed { color: #2b0909; background: #ff8f8f; }
            .vn-ai-log-time { color: #8ba7b5; font-size: 11px; }
            .vn-ai-log-count { margin-left: auto; color: #77a9bc; font-size: 10px; }
            .vn-ai-log-entry-body { padding: 0 13px 14px; border-top: 1px solid #21343e; }
            .vn-ai-log-entry-body h3 { margin: 12px 0 6px; color: #8eddf6; font-size: 11px; }
            .vn-ai-log-entry-body pre { margin: 0; padding: 11px; overflow: auto; border-radius: 7px; color: #e7f2f6; background: #071017; font: 11px/1.55 Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
            .vn-ai-log-error { margin: 9px 0 0; color: #ff9d9d; font-size: 11px; }

            #${DOM_IDS.LOADING_INDICATOR} {
                position: absolute; top: 15px; right: 20px; width: 24px; height: 24px;
                border: 3px solid rgba(255, 255, 255, 0.3); border-radius: 50%; border-top-color: #fff;
                animation: vn-spin 1s ease-in-out infinite; z-index: 4; display: none;
            }
            @keyframes vn-spin { to { transform: rotate(360deg); } }

            #${DOM_IDS.BACK_BUTTON} { position: absolute; bottom: 15px; right: 20px; font-size: 2em; color: #888; cursor: pointer; transition: color 0.2s; display: none; }
            #${DOM_IDS.BACK_BUTTON}:hover { color: #ccc; }
            .vn-ui-draggable { border: 2px dashed #00aaff !important; cursor: move !important; user-select: none; touch-action: none; pointer-events: auto !important; }
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

            /* 낮은 화면에서 연 입력창. 가상 키보드가 화면 아래 절반을 덮으므로 위쪽에 띄운다.
               --vn-viewport-top 은 키보드 때문에 보이는 영역이 밀렸을 때 엔진이 채운다. */
            #${DOM_IDS.INPUT_MODAL}.vn-input-floating {
                position: fixed; top: calc(var(--vn-viewport-top, 0px) + 8px); left: 8px; right: 8px; bottom: auto; width: auto;
                border-bottom: 1px solid #555; border-radius: 10px; z-index: 100005; pointer-events: auto;
                align-items: stretch; box-shadow: 0 8px 28px rgba(0, 0, 0, 0.55);
            }
            #${DOM_IDS.INPUT_MODAL}.vn-input-floating .vn-modal-textarea { height: 72px; font-size: 15px; line-height: 1.45; }
            #${DOM_IDS.INPUT_MODAL}.vn-input-floating .vn-input-modal-buttons { flex-direction: column; justify-content: center; }
            #${DOM_IDS.INPUT_MODAL}.vn-input-floating .vn-modal-button-cancel,
            #${DOM_IDS.INPUT_MODAL}.vn-input-floating .vn-modal-button-send { height: 34px; }

            /* --- 낮은 화면 (가로로 든 폰) ---
               폭은 넉넉하고 높이가 360~430px 밖에 안 되는 화면이다. 모바일 플레이의 기준 화면.
               크기와 여백만 줄인다. 사용자가 편집 모드로 옮긴 위치는 건드리지 않는다. */
            @media (max-height: 500px) {
                :root {
                    --vn-ui-inset: 8px;
                    --vn-dialogue-padding: 12px 25px;
                    --vn-dialogue-font-size: 1.2em;
                    --vn-dialogue-line-height: 1.5;
                    --vn-dialogue-min-height: 50px;
                    --vn-name-offset: 30px;
                    --vn-name-font-size: 1.1em;
                    --vn-name-padding: 4px 12px;
                }
                ${dialogueAtDefaultBottom ? `#${DOM_IDS.DIALOGUE_BOX} { bottom: 12px; }` : ''}
                /* 대사가 길면 대사창이 장면을 덮지 않고 안에서 넘긴다 */
                #${DOM_IDS.DIALOGUE_TEXT} { margin: 6px 0; max-height: 34vh; overflow-y: auto; overscroll-behavior: contain; }
                #${DOM_IDS.BACK_BUTTON} { bottom: 6px; right: 10px; font-size: 1.6em; }
                #${DOM_IDS.INPUT_BUTTON}, #${DOM_IDS.LOG_BUTTON}, #${DOM_IDS.END_TALK_BUTTON} { top: -15px; padding: 4px 12px; font-size: 13px; }
                #${DOM_IDS.INPUT_BUTTON} { right: 16px; }
                #${DOM_IDS.LOG_BUTTON} { right: 106px; }
                #${DOM_IDS.END_TALK_BUTTON} { right: 170px; }

                /* 정보 바는 한 줄로 유지한다. 넘치는 부분(긴 장소 이름)은 잘린다 */
                #${DOM_IDS.STATUS_WINDOW} { min-height: 32px; padding: 5px 12px; font-size: 12px; flex-wrap: nowrap; overflow: hidden; max-width: calc(100vw - 120px); border-radius: 6px; }
                .vn-status-field + .vn-status-field::before { height: 12px; margin: 0 7px; }
                .vn-status-location { min-width: 0; flex: 0 1 auto; overflow: hidden; }
                #${DOM_IDS.MENU_BUTTON} { min-height: 32px; padding: 0 12px; font-size: 13px; border-radius: 6px; }

                /* 메뉴 창은 화면 높이를 다 쓴다 */
                #${DOM_IDS.MENU_MODAL} { padding: 8px; }
                .vn-menu-panel { height: calc(100vh - 16px); height: calc(100dvh - 16px); }
                .vn-menu-header { padding: 8px 14px; min-height: 42px; box-sizing: border-box; }
                .vn-menu-title { font-size: 1.05rem; }
                #${DOM_IDS.MENU_CLOSE} { font-size: 26px; }
                .vn-menu-layout { grid-template-columns: 160px 1fr; }
                #${DOM_IDS.MENU_TABS} { padding: 10px; gap: 5px; }
                .vn-menu-tab { padding: 7px 11px; font-size: 13px; }
                /* 설정·종료 버튼을 머리줄로 올려, 탭 목록이 세로 공간을 다 쓰게 한다 */
                .vn-menu-panel { position: relative; }
                .vn-menu-actions { position: absolute; top: 7px; right: 50px; display: flex; flex-direction: row; gap: 6px; padding: 0; border: 0; }
                .vn-menu-action { width: auto; min-height: 28px; padding: 4px 12px; font-size: 12px; text-align: center; }
                #${DOM_IDS.MENU_BODY} { padding: 14px 18px; }
                .vn-menu-section-title { margin-bottom: 10px; font-size: 1.05rem; }
                .vn-menu-section-content { font-size: 0.92rem; line-height: 1.6; }

                /* 제어판 서랍을 작게 */
                .vn-control-panel { bottom: 12px; padding: 4px 0 4px 6px; }
                .vn-control-panel .vn-control-button { padding: 7px 11px; font-size: 13px; }

                /* 모듈 창(지도 등)은 여백 없이 화면 전체 */
                #${DOM_IDS.MODULE_OVERLAY} { padding: 0; }
                #${DOM_IDS.MODULE_OVERLAY} .vn-module-panel { width: 100vw; height: 100vh; height: 100dvh; border: 0; border-radius: 0; }
                #${DOM_IDS.MODULE_OVERLAY} .vn-module-header { padding: 5px 12px; }
                #${DOM_IDS.MODULE_OVERLAY} .vn-module-title { font-size: 0.92rem; }
                #${DOM_IDS.MODULE_OVERLAY} .vn-module-close { font-size: 24px; }
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

    // --- 상태 정보 관리자 ---
    const StatusInfoManager = {
        detailSections: ['소속', '관계', '소지품', '상황', '일정'],
        data: {
            environment: { date: '—', weekday: '—', time: '—', dayPeriod: '—', weather: '—', location: '—' },
            sections: {},
            rawText: ''
        },

        // 상태창 글을 나눠 읽기만 한다. 화면에 보이는 값(this.data)은 바꾸지 않는다. (장면 조건 확인에 쓴다)
        read(rawText) {
            const normalized = String(rawText || '').replace(/\r/g, '').trim();
            const lines = normalized.split('\n').map(line => line.trim()).filter(Boolean);
            const header = lines.shift() || '';
            const headerParts = header.split(/[|｜]/).map(part => part.trim());
            const environment = {
                date: headerParts[1] || '—',
                weekday: headerParts[2] || '—',
                time: headerParts[3] || '—',
                dayPeriod: headerParts[4] || '—',
                weather: headerParts[5] || '—',
                location: headerParts.slice(6).join('｜') || '—'
            };
            const sections = {};
            let currentSection = null;

            lines.forEach(line => {
                const sectionMatch = line.match(/^\[([^\]｜|]+)(?:[｜|](.*))?\]$/);
                if (sectionMatch) {
                    currentSection = sectionMatch[1].trim();
                    if (!sections[currentSection]) sections[currentSection] = [];
                    const inlineValue = (sectionMatch[2] || '').trim();
                    if (inlineValue && inlineValue !== '-') sections[currentSection].push(inlineValue);
                    return;
                }

                if (currentSection && line !== '-') sections[currentSection].push(line);
            });

            return { environment, sections, rawText: normalized };
        },

        parse(rawText) {
            this.data = this.read(rawText);
            return this.data;
        },

        // 메뉴에 보일 항목을 정한다.
        //   - AI 가 쓴 순서를 그대로 따른다. 그래서 상태창에 넣은 자리가 곧 탭 자리가 된다.
        //   - 기본 항목은 비어 있어도 남기고, 그 밖의 항목은 내용이 있을 때만 보여준다.
        //     (예: [현재위치] 처럼 표식만 있는 빈 항목으로 메뉴가 지저분해지지 않게)
        sectionNames() {
            const names = [];
            Object.entries(this.data.sections).forEach(([name, values]) => {
                const isDefault = this.detailSections.includes(name);
                if (!isDefault && (!Array.isArray(values) || values.length === 0)) return;
                if (!names.includes(name)) names.push(name);
            });
            this.detailSections.forEach(name => {
                if (!names.includes(name)) names.push(name);
            });
            return names;
        },

        getSectionText(sectionName) {
            const values = this.data.sections[sectionName] || [];
            return values.length > 0 ? values.join('\n') : '정보 없음';
        },

        getRuntimeData() {
            return {
                environment: { ...this.data.environment },
                sections: Object.fromEntries(Object.entries(this.data.sections).map(([name, values]) => [name, [...values]])),
                rawText: this.data.rawText
            };
        }
    };

    // --- 장면 연출 (presentation.scenes) ---
    // 카트리지에 미리 써 둔 장면(오프닝과 같은 문법)을, AI 응답이 조건에 맞으면 응답 사이에 끼워 넣는다.
    //   "scenes": [{
    //     "id": "old-letter", "title": "오래된 편지",
    //     "when": { "text": "편지", "in": "dialogue", "date": { "on": "2025년 05월 15일" }, "location": "찻집" },
    //     "repeat": "once",          ← once: 채팅방마다 한 번 / every: 조건이 맞을 때마다
    //     "play": "after",           ← 글자 조건이 있어도 응답이 끝난 뒤에 튼다 (안 적으면 그 줄 바로 뒤)
    //     "tellAi": "…",             ← 장면을 틀 때 다음 메시지에 붙여 보낼 글 (문자열 또는 { title, text })
    //     "content": "![bg_teahouse]\n*…*"    ← 문자열 또는 줄 배열
    //   }]
    // 조건은 모두 맞아야 한다. 상태창 조건만 있으면 응답이 끝난 뒤에 튼다.
    // 연출 목록을 만들기 전에 원문 줄 사이에 끼워 넣으므로, 장면은 AI 응답과 똑같은 규칙으로 해석된다.
    const SceneDirector = {
        storageKey: 'vnEngineSceneHistory',
        maximumSessions: 100,
        maximumMarks: 20,
        textScopes: ['all', 'dialogue', 'narration', 'status', 'hidden'],
        // 상태창 머리줄 값. contains 는 그 글자가 들어 있으면, equals 는 같으면 맞다.
        statusFields: { location: 'contains', weather: 'contains', time: 'equals', dayPeriod: 'equals', weekday: 'equals' },
        cache: null,

        // AI 응답 원문에 조건이 맞은 장면을 끼워 넣어 돌려준다. 맞은 것이 없거나 오류가 나면 원문 그대로.
        weave(rawText) {
            const text = String(rawText === undefined || rawText === null ? '' : rawText);
            try {
                return this.compose(text);
            } catch (error) {
                console.error('VN Engine: 장면을 끼워 넣다가 오류가 나 원문 그대로 재생합니다.', error);
                return text;
            }
        },

        compose(text) {
            const cartridge = typeof CartridgeRuntime !== 'undefined' ? CartridgeRuntime.activeCartridge : null;
            const scenes = this.scenesOf(cartridge);
            if (scenes.length === 0 || !text.trim()) return text;

            const lines = text.replace(/\r/g, '').split('\n');
            const kinds = this.classifyLines(lines);
            const status = this.readStatus(lines, kinds);
            const cartridgeId = cartridge?.manifest?.id || 'cartridge';
            const sessionKey = this.sessionKey();
            const messageKey = this.hash(text);
            const insertions = new Map();   // 줄 번호 → 그 줄 뒤에 넣을 장면들. 맨 끝은 Infinity
            const chosen = [];

            scenes.forEach(scene => {
                let at = Infinity;
                if (scene.when.text) {
                    const index = this.findTextLine(scene.when.text, lines, kinds);
                    if (index < 0) return;
                    if (scene.play === 'line') at = this.insertionLine(index, kinds);
                }
                if (!this.statusMatches(scene.when, status)) return;

                const historyKey = `${cartridgeId}:${scene.id}`;
                const marks = this.marks(sessionKey, historyKey);
                // 같은 응답을 다시 트는 중이면(재생성·삭제 뒤 다시 읽힘) 한 번짜리도 다시 보여 준다. 기록과 AI 알림은 다시 하지 않는다.
                const replay = marks.includes(messageKey);
                if (scene.repeat === 'once' && marks.length > 0 && !replay) return;
                if (!insertions.has(at)) insertions.set(at, []);
                insertions.get(at).push(scene);
                chosen.push({ scene, historyKey, replay });
            });
            if (chosen.length === 0) return text;

            chosen.forEach(({ scene, historyKey, replay }) => {
                if (replay) return;
                this.mark(sessionKey, historyKey, messageKey);
                this.tell(cartridgeId, scene);
            });
            console.log('VN Engine: 장면을 끼워 넣습니다 —', chosen.map(item => item.scene.title).join(', '));

            const output = [];
            const pushScene = scene => output.push('', scene.content, '');
            lines.forEach((line, index) => {
                output.push(line);
                (insertions.get(index) || []).forEach(pushScene);
            });
            (insertions.get(Infinity) || []).forEach(pushScene);
            return output.join('\n');
        },

        // 같은 카트리지면 한 번만 읽어 둔다. 잘못 적은 장면은 콘솔에 알리고 뺀다.
        scenesOf(cartridge) {
            if (!cartridge) return [];
            if (this.cache && this.cache.cartridge === cartridge) return this.cache.scenes;
            const list = Array.isArray(cartridge.presentation?.scenes) ? cartridge.presentation.scenes : [];
            const seen = new Set();
            const scenes = list.map((raw, index) => this.readScene(raw, index, seen)).filter(Boolean);
            this.cache = { cartridge, scenes };
            return scenes;
        },

        readScene(raw, index, seen) {
            const skip = reason => { console.warn(`VN Engine: 장면 #${index + 1} 을 건너뜁니다 — ${reason}`); return null; };
            if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return skip('객체가 아닙니다');
            const id = String(raw.id === undefined || raw.id === null ? '' : raw.id).trim();
            if (!id) return skip('id 가 없습니다');
            if (seen.has(id)) return skip(`id 가 겹칩니다 (${id})`);
            const content = (Array.isArray(raw.content) ? raw.content.map(line => String(line === undefined || line === null ? '' : line)).join('\n') : String(raw.content || '')).replace(/\r/g, '');
            if (!content.trim()) return skip(`내용(content)이 비었습니다 (${id})`);
            if (raw.repeat !== undefined && raw.repeat !== 'once' && raw.repeat !== 'every') return skip(`repeat 는 once 또는 every 입니다 (${id})`);
            if (raw.play !== undefined && raw.play !== 'after') return skip(`play 는 after 만 적을 수 있습니다 (${id})`);
            const when = this.readConditions(raw.when);
            if (typeof when === 'string') return skip(`${when} (${id})`);

            const tell = typeof raw.tellAi === 'string' ? { text: raw.tellAi } : (raw.tellAi && typeof raw.tellAi === 'object' ? raw.tellAi : null);
            const tellText = tell ? String(tell.text || '').trim() : '';
            seen.add(id);
            return {
                id,
                title: String(raw.title || id).trim().slice(0, 120),
                content,
                when,
                repeat: raw.repeat === 'every' ? 'every' : 'once',
                play: raw.play === 'after' ? 'after' : 'line',
                tellAi: tellText ? { title: String(tell.title || raw.title || id).trim().slice(0, 120), text: tellText } : null
            };
        },

        // 조건을 읽는다. 잘못되었으면 그 까닭(문자열)을 돌려준다.
        // 모르는 조건 이름은 오타일 수 있다. 조건이 빠진 채 아무 때나 터지지 않도록 장면을 뺀다.
        readConditions(when) {
            if (!when || typeof when !== 'object' || Array.isArray(when)) return '조건(when)이 없습니다';
            const words = value => (Array.isArray(value) ? value : [value])
                .map(item => String(item === undefined || item === null ? '' : item).trim()).filter(Boolean);
            const conditions = {};
            for (const [key, value] of Object.entries(when)) {
                if (key === 'text') {
                    const list = words(value);
                    if (list.length === 0) return 'text 가 비었습니다';
                    const scopes = when.in === undefined ? ['all'] : words(when.in);
                    if (scopes.length === 0 || scopes.some(scope => !this.textScopes.includes(scope))) {
                        return `in 은 ${this.textScopes.join(' / ')} 중에서 고릅니다`;
                    }
                    conditions.text = { words: list, scopes };
                } else if (key === 'in') {
                    if (when.text === undefined) return 'in 은 text 와 함께 씁니다';
                } else if (key === 'date') {
                    const date = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
                    const unknown = date ? Object.keys(date).filter(name => name !== 'on' && name !== 'from') : [];
                    const on = date && date.on !== undefined ? this.dateValue(date.on) : undefined;
                    const from = date && date.from !== undefined ? this.dateValue(date.from) : undefined;
                    if (!date || unknown.length > 0 || (on === undefined && from === undefined) || on === null || from === null) {
                        return 'date 는 { "on": "2025년 05월 15일" } 또는 { "from": "2025년 05월 15일" } 로 적습니다';
                    }
                    conditions.date = { on, from };
                } else if (key === 'section') {
                    if (!value || typeof value !== 'object' || Array.isArray(value)) return 'section 은 { "소지품": "열쇠" } 처럼 적습니다';
                    const entries = Object.entries(value).map(([name, wanted]) => [String(name).trim(), words(wanted)]);
                    if (entries.length === 0 || entries.some(([name, list]) => !name || list.length === 0)) return 'section 의 항목 이름이나 글자가 비었습니다';
                    conditions.section = Object.fromEntries(entries);
                } else if (this.statusFields[key]) {
                    const list = words(value);
                    if (list.length === 0) return `${key} 가 비었습니다`;
                    conditions[key] = list;
                } else {
                    return `모르는 조건입니다: ${key}`;
                }
            }
            if (Object.keys(conditions).length === 0) return '조건(when)이 비었습니다';
            return conditions;
        },

        // "2025년 05월 15일" → 20250515. 비교만 하면 되므로 달력 계산은 하지 않는다.
        dateValue(text) {
            const match = String(text === undefined || text === null ? '' : text).match(/(\d+)\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
            if (!match) return null;
            const month = Number(match[2]);
            const day = Number(match[3]);
            if (month < 1 || month > 12 || day < 1 || day > 31) return null;
            return Number(match[1]) * 10000 + month * 100 + day;
        },

        // 줄마다 어디에 속하는지 가른다. 연출 목록을 만드는 규칙(parseCueSheet)과 같은 기준이다.
        classifyLines(lines) {
            let inCode = false;
            return lines.map(line => {
                const trimmed = line.trim();
                if (trimmed.startsWith('```')) {
                    inCode = !inCode;
                    return { scope: 'status', fence: inCode ? 'open' : 'close' };
                }
                if (inCode) return { scope: 'status' };
                if (!trimmed) return { scope: 'blank' };
                if (trimmed.startsWith('[//]: #')) return { scope: 'hidden' };
                if (trimmed.startsWith('![')) return { scope: 'image' };
                if (/^(?:-{3,}|\*{3,}|_{3,}|={3,})$/.test(trimmed)) return { scope: 'break' };
                if (/^"?\*\*(.*?)\*\*\s*[|｜]\s*(.*?)"?$/.test(trimmed)) return { scope: 'dialogue' };
                return { scope: 'narration' };   // *지문* 과 * * 밖의 평문
            });
        },

        // 글자가 처음 나오는 줄. 대소문자만 무시한다.
        findTextLine(condition, lines, kinds) {
            const words = condition.words.map(word => word.toLowerCase());
            const everywhere = condition.scopes.includes('all');
            return lines.findIndex((line, index) => {
                const scope = kinds[index].scope;
                if (scope === 'blank') return false;
                if (!everywhere && !condition.scopes.includes(scope)) return false;
                const lower = line.toLowerCase();
                return words.some(word => lower.includes(word));
            });
        },

        // 상태창 안에서 찾았으면 상태창이 닫힌 뒤에 넣는다. 그 밖에는 그 줄 바로 뒤.
        insertionLine(index, kinds) {
            if (kinds[index].scope !== 'status') return index;
            for (let cursor = index; cursor < kinds.length; cursor++) {
                if (kinds[cursor].fence === 'close') return cursor;
            }
            return kinds.length - 1;
        },

        // 이 응답의 상태창(마지막 것). 없으면 지금 화면에 걸린 상태창 값을 쓴다.
        readStatus(lines, kinds) {
            let current = null;
            let last = null;
            lines.forEach((line, index) => {
                const fence = kinds[index].fence;
                if (fence === 'open') { current = []; return; }
                if (fence === 'close') { if (current) last = current.join('\n'); current = null; return; }
                if (current) current.push(line);
            });
            if (current && current.length > 0) last = current.join('\n');   // 닫히지 않은 블록도 엔진은 상태창으로 본다
            if (last !== null && last.trim()) return StatusInfoManager.read(last);
            const previous = StatusInfoManager.data;
            return previous && previous.rawText ? previous : null;
        },

        statusMatches(conditions, status) {
            const fields = Object.keys(this.statusFields).filter(field => conditions[field]);
            if (!conditions.date && !conditions.section && fields.length === 0) return true;
            if (!status) return false;
            const environment = status.environment || {};
            if (conditions.date) {
                const today = this.dateValue(environment.date);
                if (today === null) return false;
                if (conditions.date.on !== undefined && today !== conditions.date.on) return false;
                if (conditions.date.from !== undefined && today < conditions.date.from) return false;
            }
            for (const field of fields) {
                const actual = String(environment[field] || '').trim().toLowerCase();
                if (!actual || actual === '—') return false;
                const contains = this.statusFields[field] === 'contains';
                const hit = conditions[field].some(value => {
                    const wanted = value.toLowerCase();
                    return contains ? actual.includes(wanted) : actual === wanted;
                });
                if (!hit) return false;
            }
            if (conditions.section) {
                for (const [name, wanted] of Object.entries(conditions.section)) {
                    const values = status.sections ? status.sections[name] : null;
                    const text = (Array.isArray(values) ? values.join('\n') : '').toLowerCase();
                    if (!text || !wanted.some(word => text.includes(word.toLowerCase()))) return false;
                }
            }
            return true;
        },

        tell(cartridgeId, scene) {
            if (!scene.tellAi || typeof AiMessageContextQueue === 'undefined') return;
            try {
                AiMessageContextQueue.enqueue(cartridgeId, 'scene', {
                    id: `scene-${scene.id}`,
                    title: scene.tellAi.title,
                    text: scene.tellAi.text,
                    createdAt: Date.now()
                });
            } catch (error) {
                console.warn('VN Engine: 장면 문맥을 넣지 못했습니다.', error);
            }
        },

        // 채팅방마다 따로 센다. 오프닝 기록과 같은 기준(주소 끝의 ID)이다.
        sessionKey() {
            return (typeof getCurrentSessionId === 'function' && getCurrentSessionId()) || window.location.pathname || 'default';
        },

        hash(text) {
            let value = 0x811c9dc5;
            for (let index = 0; index < text.length; index++) {
                value ^= text.charCodeAt(index);
                value = Math.imul(value, 0x01000193) >>> 0;
            }
            return `${value.toString(16).padStart(8, '0')}:${text.length}`;
        },

        loadHistory() {
            try {
                const data = JSON.parse(localStorage.getItem(this.storageKey) || '{}');
                return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
            } catch (error) {
                return {};
            }
        },

        marks(sessionKey, historyKey) {
            const list = this.loadHistory()[sessionKey]?.[historyKey];
            return Array.isArray(list) ? list : [];
        },

        mark(sessionKey, historyKey, messageKey) {
            const history = this.loadHistory();
            const session = history[sessionKey] && typeof history[sessionKey] === 'object' ? history[sessionKey] : {};
            const list = Array.isArray(session[historyKey]) ? session[historyKey].filter(key => key !== messageKey) : [];
            list.push(messageKey);
            session[historyKey] = list.slice(-this.maximumMarks);
            // 최근에 쓴 채팅방을 뒤로 보내고, 너무 많으면 오래된 것부터 지운다.
            delete history[sessionKey];
            history[sessionKey] = session;
            const keys = Object.keys(history);
            keys.slice(0, Math.max(0, keys.length - this.maximumSessions)).forEach(key => delete history[key]);
            try {
                localStorage.setItem(this.storageKey, JSON.stringify(history));
            } catch (error) {
                console.warn('VN Engine: 장면 기록을 저장하지 못했습니다.', error);
            }
        }
    };

    // --- 대본 연출 줄 (엔진 3.34.0) ---
    // 카트리지 대본·오프닝·장면에 쓴다. 이미지 줄과 같은 모양이라 다른 글자로 찍히지 않는다.
    //   ![screen](white 35% 3s)          화면을 흰색 35% 로 3초에 걸쳐 덮는다. 기다리지 않고 다음 줄로 간다
    //   ![screen](white 1.8s wait 2.9s)  다 덮고(진하기를 안 적으면 100%), 2.9초 뒤 다음 줄로. 기다리는 동안 대사창을 숨긴다
    //   ![screen](clear 3.2s wait)       걷어 낸다. wait 뒤에 시간을 안 적으면 덮는 시간만큼 기다린다
    //   ![screen](black 2.6s) · ![screen](#203040 50% 1s) · 한글로 ![화면](흰색 35% 3초) · ![화면](걷기 2초 기다림)
    //   ![music](wait) · ![음악](기다림)    지금 울리는 곡이 끝날 때까지 기다린다 (반복 곡이면 바로 넘어간다)
    // 잘못 적은 줄은 콘솔에 까닭을 남기고 건너뛴다.
    const SCRIPT_DIRECTIVE_PATTERN = /^!\[(screen|화면|music|음악)\]\(\s*(.*?)\s*\)$/i;
    const SCREEN_COLORS = { white: '#ffffff', '흰색': '#ffffff', black: '#000000', '검은색': '#000000' };
    function parseScriptDirective(kind, args) {
        const name = String(kind || '').toLowerCase();
        const words = String(args || '').toLowerCase().split(/[\s,]+/).filter(Boolean);
        const skip = reason => {
            console.warn(`VN Engine: 연출 줄을 건너뜁니다 — ![${kind}](${args}) · ${reason}`);
            return { type: 'skip' };
        };
        const isWait = word => word === 'wait' || word === '기다림';
        if (name === 'music' || name === '음악') {
            return words.length === 1 && isWait(words[0]) ? { type: 'music_wait' } : skip('음악 줄은 wait 만 적습니다');
        }
        const durationOf = word => {
            const match = word.match(/^(\d+(?:\.\d+)?|\.\d+)(ms|s|초)$/);
            if (!match) return null;
            const seconds = match[2] === 'ms' ? Number(match[1]) / 1000 : Number(match[1]);
            return Math.min(60, seconds);
        };
        let color = null, opacity = null, fade = null, waiting = false, hold = null;
        for (const word of words) {
            if (isWait(word)) { waiting = true; continue; }
            const duration = durationOf(word);
            if (duration !== null) {
                if (waiting) hold = duration; else fade = duration;
                continue;
            }
            if (waiting) return skip('wait 뒤에는 시간만 적습니다');
            if (word === 'clear' || word === '걷기') { opacity = 0; continue; }
            if (SCREEN_COLORS[word]) { color = SCREEN_COLORS[word]; continue; }
            if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/.test(word)) { color = word; continue; }
            const percent = word.match(/^(\d+(?:\.\d+)?)%$/);
            if (percent && Number(percent[1]) <= 100) { opacity = Number(percent[1]) / 100; continue; }
            if (/^(?:0|1|0?\.\d+|1\.0+)$/.test(word)) { opacity = Number(word); continue; }
            return skip(`모르는 말입니다: ${word}`);
        }
        if (color === null && opacity === null) return skip('색(white · black · #색)이나 clear 를 적습니다');
        if (opacity === null) opacity = 1;
        const seconds = fade === null ? 1 : fade;
        return { type: 'screen', color, opacity, seconds, waitSeconds: waiting ? (hold === null ? seconds : hold) : null };
    }

    // --- 연출 관리자 ---
    const StageManager = {
        cueSheet: [], currentIndex: -1, firstTextCueIndex: -1, isTyping: false, typingTimer: null, isVisible: false, isFinished: true,
        // 연출 줄(![screen](… wait) · ![music](wait))을 기다리는 중이면 눌러도 넘어가지 않는다.
        // playToken 은 새 대본이 오면 바뀐다. 기다리던 일이 늦게 끝나도 지난 대본을 넘기지 않게 한다.
        isHolding: false, playToken: 0,
        // 카트리지가 playScript 로 부탁한 대본 { id, cartridgeId }. 끝나면 그 카트리지에 알린다.
        cartridgeScript: null,

        // options.cartridgeScript: 카트리지가 부탁한 대본. 화면 덮개를 이어받는다 (대본을 여러 번 나눠 틀어도 이어지게).
        // 그 밖의 대본(AI 응답 · 오프닝 · 화면 시험)은 덮개와 카트리지 선택지를 걷고 시작한다.
        start(rawText, options = {}) {
            if (this.cartridgeScript) this.endCartridgeScript('interrupted');
            this.cartridgeScript = options && options.cartridgeScript ? options.cartridgeScript : null;
            this.playToken += 1;
            this.isHolding = false;
            if (!this.cartridgeScript) {
                UIManager.closeScriptChoices('interrupted');
                UIManager.clearScreenVeil();
                UIManager.setDialogueVeiled(false);
            }
            UIManager.hideBackButton();

            // 1. 일단 텍스트를 분석해서 큐시트를 만듭니다.
            let parsedCues = this.parseCueSheet(rawText);

            if (SettingsManager.settings.characterMode === 'multi') {
                // 한 응답에 장면이 여러 개 들어올 수 있다. 장면이 바뀌는 자리마다 정리한다.
                parsedCues = this.insertSceneExits(parsedCues, UIManager.activeCharacters.map(char => char.id));
            }

            this.cueSheet = parsedCues;

            // 텍스트 시작 위치 설정 및 실행
            this.firstTextCueIndex = this.cueSheet.findIndex(c => c.type === 'dialogue' || c.type === 'action');
            if (this.cueSheet.length === 0) { this.isFinished = true; this.endCartridgeScript('finished'); return; }

            // 첫 배경은 미리 깔아 깜빡임을 막는다. 단, 그 앞에 화면 덮개 줄이 있으면 덮은 뒤에 바꿔야 하므로 차례를 기다린다.
            const bgIndex = this.cueSheet.findIndex(c => c.type === 'background_image');
            const screenIndex = this.cueSheet.findIndex(c => c.type === 'screen');
            const bgCue = bgIndex >= 0 && (screenIndex === -1 || bgIndex < screenIndex) ? this.cueSheet[bgIndex] : null;

            // 방 화면에 있었다면 대화 화면으로 넘어간다 (새 응답·오프닝·일시정지 중 모아 둔 응답)
            // 방 화면이 모듈이면 응답이 배경 그림을 가져오지 않는 한 그 화면을 대사창 뒤에 깔아 둔다
            HomeScene.leave({ keepBackdrop: !bgCue });
            UIManager.showAll();
            UIManager.applyCustomBackground();

            // 배경 이미지 즉시 적용 (깜빡임 방지)
            if (bgCue) UIManager.updateBackgroundImage(bgCue.url, bgCue.assetName);

            const statusCue = this.cueSheet.find(c => c.type === 'status_window');
            if(statusCue) UIManager.updateStatusWindow(statusCue.content);

            this.currentIndex = -1;
            this.isVisible = true;
            this.isFinished = false;
            this.next();
        },
        // 큐의 종류를 URL 로 바로잡고, 인물이면 그 id 를 돌려준다.
        // 파서가 배경을 인물로 잘못 분류했더라도 여기서 확정한다.
        sanitizeCue(cue) {
            if (!cue.url || cue.url === 'off') return null;
            // 카트리지 내장 이미지는 파일 이름으로 종류와 인물이 이미 정해져 있다. 손대지 않는다.
            if (cue.assetName) {
                return cue.type === 'character_update' ? (cue.characterId || null) : null;
            }
            if (cue.url.includes('/g/')) {
                cue.type = 'background_image';
                return null;
            }
            if (cue.url.includes('/c/')) {
                cue.type = 'character_update';
                return UIManager.parseCharacterInfoFromUrl(cue.url)?.id || null;
            }
            // /c/ 도 /g/ 도 없는데 인물이라면, 일단 이름에서 id 를 뽑아 본다.
            if (cue.type === 'character_update') {
                return UIManager.parseCharacterInfoFromUrl(cue.url)?.id || null;
            }
            return null;
        },

        // 장면이 바뀌는 자리에 퇴장 명령을 꽂는다.
        //   - 장면 경계는 '배경이 바뀌는 큐' 와 '구분선(---)' 이다
        //   - 그 장면에 이미지가 나오지 않는 인물은 장면이 시작될 때 나간다
        //   - 직접 적어 준 off 는 자동 퇴장에서 빼고, 적힌 자리에서 그대로 일어난다
        // 배경 줄이 없는 응답은 장면이 하나이므로 예전과 똑같이 동작한다.
        insertSceneExits(cues, onScreenIds) {
            const characterIds = cues.map(cue => this.sanitizeCue(cue));
            const isBoundary = cue => cue.type === 'background_image' || cue.type === 'scene_break';

            const sceneStarts = [];
            cues.forEach((cue, index) => {
                if (!isBoundary(cue)) return;
                // 구분선 바로 뒤에 배경이 오는 식으로 경계가 붙어 있으면 한 장면으로 본다.
                // 그래야 같은 인물이 사라졌다 다시 나타나며 깜빡이지 않는다.
                if (index > 0 && isBoundary(cues[index - 1])) return;
                sceneStarts.push(index);
            });
            if (sceneStarts[0] !== 0) sceneStarts.unshift(0);

            let onScreen = new Set(Array.isArray(onScreenIds) ? onScreenIds : []);
            const result = [];
            let cursor = 0;

            sceneStarts.forEach((start, order) => {
                const end = order + 1 < sceneStarts.length ? sceneStarts[order + 1] : cues.length;
                const sceneIds = new Set();
                const explicitOff = new Set();
                for (let index = start; index < end; index += 1) {
                    if (characterIds[index]) sceneIds.add(characterIds[index]);
                    if (cues[index].url === 'off' && cues[index].characterId) explicitOff.add(cues[index].characterId);
                }

                while (cursor < start) result.push(cues[cursor++]);
                // 이 장면에 없는 인물은 장면이 시작될 때 내보낸다.
                onScreen.forEach(id => {
                    if (sceneIds.has(id) || explicitOff.has(id)) return;
                    result.push({ type: 'character_update', url: 'off', characterId: id });
                });
                while (cursor < end) result.push(cues[cursor++]);

                // 장면이 끝나면 화면에 남는 사람은 그 장면에 나온 인물뿐이다.
                onScreen = new Set([...sceneIds].filter(id => !explicitOff.has(id)));
            });
            while (cursor < cues.length) result.push(cues[cursor++]);
            return result;
        },

        next() { if (this.isHolding) return; if (this.isTyping) { this.skipTyping(); return; } this.currentIndex++; if (this.currentIndex >= this.cueSheet.length) { this.isFinished = true; this.endCartridgeScript('finished'); return; } this.processCue(this.cueSheet[this.currentIndex]); if (this.firstTextCueIndex !== -1 && this.currentIndex >= this.firstTextCueIndex) { UIManager.showBackButton(); } },
        previous() { if (this.isHolding) return; if (this.isTyping) this.skipTyping(); if (this.currentIndex <= this.firstTextCueIndex) return; for (let i = this.currentIndex - 1; i >= 0; i--) { const cue = this.cueSheet[i]; if (cue.type === 'dialogue' || cue.type === 'action') { this.currentIndex = i; this.processCue(cue); if (this.currentIndex < this.firstTextCueIndex) UIManager.hideBackButton(); return; } } },
        hide() {
            this.playToken += 1;
            this.isHolding = false;
            this.endCartridgeScript('stopped');
            UIManager.closeScriptChoices('stopped');
            UIManager.clearScreenVeil();
            UIManager.setDialogueVeiled(false);
            if (!this.isVisible) return;
            UIManager.hideAll(); this.isVisible = false; this.isFinished = true;
        },

        // 연출 줄을 기다린다. 그사이 새 대본이 오면(playToken 이 바뀌면) 지난 대본은 넘기지 않는다.
        holdUntil(promise) {
            const token = this.playToken;
            this.isHolding = true;
            Promise.resolve(promise).catch(() => {}).then(() => {
                if (token !== this.playToken) return;
                this.isHolding = false;
                this.next();
            });
        },

        // 카트리지가 부탁한 대본이 끝났다. finished 일 때 대사창이 덮개 때문에 숨어 있었으면 비운 채 돌려놓는다.
        // 끊기거나(interrupted) 꺼졌으면(stopped) 보류해 둔 글을 입력창에 돌려준다.
        endCartridgeScript(state) {
            const script = this.cartridgeScript;
            if (!script) return;
            this.cartridgeScript = null;
            if (state === 'finished' && UIManager.isDialogueVeiled()) UIManager.setDialogueVeiled(false, { clear: true });
            if (state !== 'finished' && PendingChat.isHeld()) PendingChat.restore();
            try {
                CartridgeRuntime.broadcast(script.cartridgeId, { type: 'script:ended', scriptId: script.id, state });
            } catch (error) {
                console.warn('VN Engine: 대본이 끝났다고 알리지 못했습니다.', error);
            }
        },
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
                    await UIManager.updateCharacter(cue.url, cue.characterId, cue.assetName);
                    // 멀티 모드에서도 인물·CG 그림에 BGM 규칙을 건다 (단일 모드는 updateSingleCharacter 가 이미 건다)
                    if (SettingsManager.settings.characterMode === 'multi') AudioManager.checkAndPlay(cue.assetName || cue.url);
                    this.next();
                    break;
                case 'background_image':
                    UIManager.updateBackgroundImage(cue.url, cue.assetName);
                    // 배경 변경 시 BGM 체크 (카트리지 자산은 blob URL이므로 파일 이름으로 대조)
                    AudioManager.checkAndPlay(cue.assetName || cue.url);
                    // 배경 변경 시 단일 모드 캐릭터 숨김
                    if (SettingsManager.settings.characterMode !== 'multi') {
                        UIManager.updateSingleCharacter('off');
                    }
                    this.next();
                    break;
                case 'screen':
                    UIManager.setScreenVeil(cue);
                    if (cue.waitSeconds === null) { this.next(); break; }
                    UIManager.setDialogueVeiled(true);
                    this.holdUntil(new Promise(resolve => setTimeout(resolve, cue.waitSeconds * 1000)));
                    break;
                case 'music_wait':
                    this.holdUntil(AudioManager.whenSilent());
                    break;
                case 'skip':
                    this.next();
                    break;
                case 'action':
                    UIManager.setDialogueVeiled(false);
                    LogManager.add(null, cue.content);
                    // 나레이션: 아무도 강조하지 않음
                    UIManager.highlightSpeaker(null);
                    UIManager.updateDialogueBox(null, cue.content, true, (el, text) => this.type(el, text));
                    break;
                case 'dialogue':
                    UIManager.setDialogueVeiled(false);
                    LogManager.add(cue.character, cue.content);
                    // 대사: 말하는 사람 강조 (스마트 매핑)
                    UIManager.highlightSpeaker(cue.character);
                    UIManager.updateDialogueBox(cue.character, cue.content, false, (el, text) => this.type(el, text));
                    break;
                case 'scene_break':
                    // 장면이 바뀌었다는 표시일 뿐이다. 멈추지 않고 넘어간다.
                    this.next();
                    break;
                case 'status_window':
                    this.next();
                    break;
            }
        },
        parsers: [
            // 대본 연출 줄 (엔진 3.34.0). 이미지 줄보다 먼저 본다. 위의 parseScriptDirective 참고
            { regex: SCRIPT_DIRECTIVE_PATTERN, handler: match => parseScriptDirective(match[1], match[2]) },
            // [신규] 활성 카트리지에 같은 이름의 이미지가 있으면 그 이미지를 씁니다.
            // 대괄호 안의 이름뿐 아니라 괄호 안의 경로·주소도 봅니다.
            //   ![x1]  ![](/c/x1)  ![](assets/c/x1.webp)  ![설명](https://cdn/c/x1.png)
            // 일치하는 파일이 없으면 null을 돌려주어 아래 기존 규칙(외부 URL 방식)으로 넘깁니다.
            {
                regex: /^!\[([^\]]*)\](?:\s*\(\s*(.*?)\s*\))?$/,
                handler: match => {
                    const label = match[1].trim();
                    const inside = String(match[2] || '').trim();
                    if (inside.toLowerCase() === 'off') return null;   // 퇴장 규칙에 양보한다

                    // 괄호 안의 경로를 먼저 보고, 없으면 대괄호 안의 이름을 본다.
                    // 선언한 별칭이 슬래시를 포함할 수 있으므로 대괄호는 원문도 함께 시도한다.
                    const candidates = [];
                    if (inside) candidates.push(assetNameFromReference(inside));
                    if (label) {
                        candidates.push(label);
                        candidates.push(assetNameFromReference(label));
                    }

                    let asset = null;
                    for (const candidate of candidates) {
                        if (!candidate) continue;
                        asset = CartridgeRuntime.resolveImageAsset(candidate);
                        if (asset) break;
                    }
                    if (!asset) return null;
                    if (asset.kind === 'background') {
                        return { type: 'background_image', url: asset.url, assetName: asset.name };
                    }
                    return { type: 'character_update', url: asset.url, assetName: asset.name, characterId: asset.characterId };
                }
            },
            { condition: () => SettingsManager.settings.characterMode === 'multi', regex: /^!\[([a-zA-Z0-9_]+)\]\((off)\)$/, handler: match => ({ type: 'character_update', url: 'off', characterId: match[1] }) },
            { condition: () => SettingsManager.settings.characterMode === 'multi', regex: /^!\[\]\((.*?)\)$/, handler: match => { const url = match[1].trim(); const { backgroundPattern, characterPattern } = SettingsManager.settings; if (backgroundPattern && url.includes(backgroundPattern)) return { type: 'background_image', url }; if (characterPattern && url.includes(characterPattern)) return { type: 'character_update', url }; return { type: 'character_update', url }; } },

            // [수정됨] 범용 모드: ![]() 뿐만 아니라 ![설명]() 포함 모든 마크다운 이미지를 잡아서 중앙에 띄움
            { condition: () => SettingsManager.settings.characterMode === 'single' || SettingsManager.settings.characterMode === 'internalImage', regex: /^!\[.*?\]\((.*?)\)$/, handler: match => { const url = match[1].trim(); return { type: 'character_update', url: url }; } },
            // 장면 구분선. AI 가 장면을 끊는 신호이므로 글자로 찍지 않고 장면 경계로만 쓴다.
            { regex: /^(?:-{3,}|\*{3,}|_{3,}|={3,})$/, handler: () => ({ type: 'scene_break' }) },
            { regex: /^"?\*\*(.*?)\*\*\s*[|｜]\s*(.*?)"?$/, handler: match => ({ type: 'dialogue', character: match[1].trim(), content: match[2].trim() }) },
            { regex: /^\*(.*)\*$/, handler: match => ({ type: 'action', content: match[1].trim() }) }
        ],
        parseCueSheet(rawText) { const lines = rawText.split('\n'); const cueSheet = []; let inCodeBlock = false; let codeBlockContent = ''; for (const line of lines) { const trimmedLine = line.trim(); if (trimmedLine.startsWith('```')) { inCodeBlock = !inCodeBlock; if (!inCodeBlock && codeBlockContent) { cueSheet.push({ type: 'status_window', content: codeBlockContent.trim() }); codeBlockContent = ''; } continue; } if (inCodeBlock) { codeBlockContent += line + '\n'; continue; } if (trimmedLine === '' || trimmedLine.startsWith('[//]: #')) continue; let matched = false; for (const parser of this.parsers) { if (parser.condition && !parser.condition()) continue; const match = trimmedLine.match(parser.regex); if (!match) continue; const cue = parser.handler(match); if (!cue) continue; cueSheet.push(cue); matched = true; break; } if (!matched) { cueSheet.push({ type: 'action', content: trimmedLine }); } } if (codeBlockContent) { cueSheet.push({ type: 'status_window', content: codeBlockContent.trim() }); } return cueSheet; }
    };

    // --- 크랙 채팅 입력창 ---
    // 엔진의 입력창에 쓴 글은 크랙 원래 입력창에 넣고 크랙의 전송 버튼을 눌러 보낸다.
    // 크랙은 입력창을 바꾼 적이 있다 (textarea → Tiptap 편집기). 한 가지 표식에만 기대지 않는다.
    const CrackComposer = {
        isEngineElement(el) { return !!el.closest('[id^="vn-"], .vn-control-panel'); },
        isVisible(el) { return el.getClientRects().length > 0; },

        // 1순위 Tiptap(ProseMirror) 편집기, 2순위 예전 textarea, 3순위 그 밖의 편집 가능한 칸
        find() {
            const selectors = ['.ProseMirror[contenteditable="true"]', 'textarea[placeholder*="메시지"]', '[contenteditable="true"]'];
            for (const selector of selectors) {
                const found = [...document.querySelectorAll(selector)].find(el => !this.isEngineElement(el) && this.isVisible(el));
                if (found) return found;
            }
            return null;
        },

        readText(input) {
            return input.tagName === 'TEXTAREA' ? input.value : (input.innerText || input.textContent || '');
        },

        // React 가 관리하는 textarea 는 값을 직접 바꾸면 무시하므로 원래 setter 로 넣고 input 이벤트를 보낸다.
        // 편집기(contenteditable)는 붙여넣기로 넣는다. 편집기가 스스로 처리하므로 내부 상태와 화면이 어긋나지 않는다.
        setText(input, text) {
            if (input.tagName === 'TEXTAREA') {
                const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
                if (!setter) throw new Error('채팅 입력창 값 설정기를 찾을 수 없습니다.');
                setter.call(input, text);
                input.dispatchEvent(new Event('input', { bubbles: true }));
                return;
            }
            input.focus();
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(input);
            selection.removeAllRanges();
            selection.addRange(range);
            if (!text) {
                document.execCommand('delete');
                return;
            }
            const escape = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            // 줄마다 문단으로 넣는다. 빈 줄도 빈 문단으로 남겨 줄 간격을 지킨다.
            const html = text.split('\n').map(line => (line ? `<p>${escape(line)}</p>` : '<p></p>')).join('');
            const data = new DataTransfer();
            data.setData('text/plain', text);
            data.setData('text/html', html);
            input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
            // 붙여넣기를 받지 않는 편집기라면 글자 입력으로 다시 시도한다
            const squash = value => String(value).replace(/\s+/g, '');
            if (squash(this.readText(input)) !== squash(text)) {
                range.selectNodeContents(input);
                selection.removeAllRanges();
                selection.addRange(range);
                document.execCommand('insertText', false, text);
            }
        },

        // 입력창 가까이 있는 버튼들. 입력창에서 몇 단계 위까지만 본다 (페이지 전체의 버튼을 누르지 않게).
        nearbyButtons(input) {
            const buttons = new Set();
            let node = input.parentElement;
            for (let depth = 0; node && depth < 6; depth += 1, node = node.parentElement) {
                node.querySelectorAll('button').forEach(button => {
                    if (!input.contains(button) && !this.isEngineElement(button)) buttons.add(button);
                });
            }
            return [...buttons];
        },

        // 전송 버튼은 "글을 넣기 전엔 꺼져 있다가 넣은 뒤 켜진 버튼"으로 찾는다. 없으면 이름표로 찾는다.
        pickSendButton(buttons, wasDisabled) {
            const enabled = buttons.filter(button => !button.disabled && this.isVisible(button));
            const switchedOn = enabled.filter(button => wasDisabled.get(button) === true);
            if (switchedOn.length > 0) return switchedOn[switchedOn.length - 1];
            const labelled = enabled.filter(button => /전송|보내기|send/i.test(`${button.getAttribute('aria-label') || ''} ${button.title || ''} ${button.textContent || ''}`));
            if (labelled.length > 0) return labelled[labelled.length - 1];
            const submits = enabled.filter(button => button.type === 'submit');
            if (submits.length > 0) return submits[submits.length - 1];
            return null;
        }
    };

    // background-size: cover 로 깔린 배경 그림 위에 요소를 붙인다. 각 요소의 data-rect 는
    // 배경 그림 기준 0~1 비율({ x, y, width, height })이다. 핫스팟과 방 화면 캐릭터가 같이 쓴다.
    function placeOnCover(elements, layer, ratio) {
        const width = layer.clientWidth;
        const height = layer.clientHeight;
        if (width <= 0 || height <= 0) return;
        let drawWidth = width;
        let drawHeight = height;
        if (Number.isFinite(ratio) && ratio > 0) {
            // 넘치는 쪽이 잘린다. 그 잘린 만큼을 음수 여백으로 되돌린다.
            if (width / height > ratio) { drawWidth = width; drawHeight = width / ratio; }
            else { drawHeight = height; drawWidth = height * ratio; }
        }
        const offsetX = (width - drawWidth) / 2;
        const offsetY = (height - drawHeight) / 2;
        elements.forEach(element => {
            let rect = null;
            try { rect = JSON.parse(element.dataset.rect); } catch (error) { return; }
            element.style.left = `${offsetX + rect.x * drawWidth}px`;
            element.style.top = `${offsetY + rect.y * drawHeight}px`;
            element.style.width = `${rect.width * drawWidth}px`;
            element.style.height = `${rect.height * drawHeight}px`;
        });
    }

    // --- UI 관리자 ---
    const UIManager = {
        elements: {}, activeCharacters: [], dragInfo: {}, resizeInfo: {}, debugKeyState: { count: 0, lastAt: 0 },
    // [추가됨] 캐릭터 이름과 ID를 기억할 변수들
    characterMap: {},
    lastUpdatedCharId: null,

        setup() {
            GM_addStyle(generateStyles(SettingsManager.settings));
            const container = document.createElement('div'); container.id = DOM_IDS.CONTAINER;
            const characterContainerHTML = (SettingsManager.settings.characterMode === 'multi') ? `<div id="${DOM_IDS.CHAR_CONTAINER}"></div>` : `<div id="${DOM_IDS.CHAR_CONTAINER}"><img class="vn-character-cg" id="vn-cg-main"></div>`;
            container.innerHTML = `<div id="${DOM_IDS.BACKGROUND}"></div><div id="${DOM_IDS.HOME_FRAME_HOST}" data-vn-part="home-frame"></div><div id="${DOM_IDS.HOTSPOT_LAYER}" data-vn-part="hotspot-layer"></div><div id="${DOM_IDS.HOME_LAYER}" data-vn-part="home-layer"></div><div id="${DOM_IDS.IMAGE_VIEWER}" class="vn-image-viewer" data-vn-part="image-viewer" hidden><div class="vn-image-viewer-sheet"><button id="${DOM_IDS.IMAGE_VIEWER_CLOSE}" class="vn-image-viewer-close" type="button" aria-label="닫기">✕</button><img id="${DOM_IDS.IMAGE_VIEWER_IMG}" alt="" hidden /><p id="${DOM_IDS.IMAGE_VIEWER_MISSING}" class="vn-image-viewer-missing" hidden></p><p id="${DOM_IDS.IMAGE_VIEWER_CAPTION}" class="vn-image-viewer-caption"></p></div></div><img id="${DOM_IDS.EVENT_CG}" />${characterContainerHTML}<div id="${DOM_IDS.SCREEN_VEIL}" data-vn-part="screen-veil" aria-hidden="true"></div><button id="${DOM_IDS.MENU_BUTTON}" type="button" aria-expanded="false" data-vn-part="menu-button">☰ 메뉴</button><div id="${DOM_IDS.STATUS_WINDOW}" aria-label="현재 환경 정보" data-vn-part="status-bar"><span class="vn-status-field" data-status-field="date">—</span><span class="vn-status-field" data-status-field="weekday">—</span><span class="vn-status-field" data-status-field="time">—</span><span class="vn-status-field" data-status-field="dayPeriod">—</span><span class="vn-status-field" data-status-field="weather">—</span><span class="vn-status-field vn-status-location" data-status-field="location">—</span></div><div id="${DOM_IDS.DIALOGUE_BOX}" data-vn-part="dialogue"><div id="${DOM_IDS.CHAR_NAME}" data-vn-part="dialogue-name"></div><p id="${DOM_IDS.DIALOGUE_TEXT}" data-vn-part="dialogue-text"></p><div id="${DOM_IDS.BACK_BUTTON}" data-vn-part="dialogue-back">‹</div></div><div id="${DOM_IDS.SCRIPT_CHOICES}" data-vn-part="script-choices" role="group" aria-label="선택지"></div>`;
            document.body.appendChild(container);
            this.elements = { container: document.getElementById(DOM_IDS.CONTAINER), background: document.getElementById(DOM_IDS.BACKGROUND), hotspotLayer: document.getElementById(DOM_IDS.HOTSPOT_LAYER), homeLayer: document.getElementById(DOM_IDS.HOME_LAYER), homeFrameHost: document.getElementById(DOM_IDS.HOME_FRAME_HOST), imageViewer: document.getElementById(DOM_IDS.IMAGE_VIEWER), eventCG: document.getElementById(DOM_IDS.EVENT_CG), charContainer: document.getElementById(DOM_IDS.CHAR_CONTAINER), statusWindow: document.getElementById(DOM_IDS.STATUS_WINDOW), menuButton: document.getElementById(DOM_IDS.MENU_BUTTON), dialogueBox: document.getElementById(DOM_IDS.DIALOGUE_BOX), charName: document.getElementById(DOM_IDS.CHAR_NAME), dialogueText: document.getElementById(DOM_IDS.DIALOGUE_TEXT), backButton: document.getElementById(DOM_IDS.BACK_BUTTON), screenVeil: document.getElementById(DOM_IDS.SCREEN_VEIL), scriptChoices: document.getElementById(DOM_IDS.SCRIPT_CHOICES), cgSingle: (SettingsManager.settings.characterMode !== 'multi') ? document.getElementById('vn-cg-main') : null, };

            this.createMenuModal();
            this.elements.menuButton?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleMenuModal(true);
            });

            // 입력 버튼 코드
            this.createInputModal();
            this.watchCompactScreen();
            this.watchVisualViewport();
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
            const endTalkButton = document.createElement('button');
            endTalkButton.id = DOM_IDS.END_TALK_BUTTON;
            endTalkButton.type = 'button';
            endTalkButton.dataset.vnPart = 'end-talk';
            endTalkButton.textContent = '대화 종료';
            this.elements.dialogueBox.appendChild(endTalkButton);
            endTalkButton.addEventListener('click', (e) => {
                e.stopPropagation();
                HomeScene.enter();
            });

            const loadingIndicator = document.createElement('div');
            loadingIndicator.id = DOM_IDS.LOADING_INDICATOR;
            this.elements.dialogueBox.appendChild(loadingIndicator);

            window.addEventListener('resize', () => { this.positionHotspots(); HomeScene.position(); });
            // 방 화면에서 선택지 밖을 누르면 선택지를 닫는다 (캐릭터와 선택지는 스스로 전파를 막는다)
            container.addEventListener('click', () => HomeScene.closeChoices());
            // 선택지 층을 눌러도 대사창이 넘어가거나 방 화면 선택지가 닫히지 않게 한다
            this.elements.scriptChoices?.addEventListener('click', event => event.stopPropagation());
            this.elements.imageViewer?.addEventListener('click', event => {
                // 바깥이나 닫기 버튼을 누르면 닫는다. 그림 자체를 누르는 건 무시한다.
                if (event.target === this.elements.imageViewer || event.target.id === DOM_IDS.IMAGE_VIEWER_CLOSE) {
                    this.closeImageViewer();
                }
            });
            document.addEventListener('keydown', event => {
                if (event.key === 'Escape' && !this.elements.imageViewer?.hidden) this.closeImageViewer();
                if (event.key === 'Escape') HomeScene.closeChoices()?.focus({ preventScroll: true });
            });
            this.elements.dialogueBox?.addEventListener('click', (e) => { if (e.target.id !== DOM_IDS.BACK_BUTTON && !e.target.closest(`#${DOM_IDS.BACK_BUTTON}`)) StageManager.next(); });
            this.elements.backButton?.addEventListener('click', (e) => { e.stopPropagation(); StageManager.previous(); });
            const controlPanel = document.createElement('div'); controlPanel.className = 'vn-control-panel';
            controlPanel.innerHTML = `<div class="vn-drawer-content">`
                + `<button id="${DOM_IDS.START_BUTTON}" class="vn-control-button vn-idle-only">VN 시작</button>`
                + `<button id="${DOM_IDS.DEMO_BUTTON}" class="vn-control-button vn-idle-only">UI 테스트</button>`
                + `<button id="${DOM_IDS.SETTINGS_BUTTON}" class="vn-control-button vn-idle-only">설정</button>`
                + `<button id="${DOM_IDS.RESUME_BUTTON}" class="vn-control-button vn-pause-only" type="button">▶ VN으로 돌아가기</button>`
                + `<button id="${DOM_IDS.PAUSE_EXIT_BUTTON}" class="vn-control-button vn-pause-only" type="button" title="VN 종료" aria-label="VN 종료">✕</button>`
                + `</div><button class="vn-drawer-toggle" type="button"></button>`;
            document.body.appendChild(controlPanel);
            controlPanel.querySelector('.vn-drawer-toggle').addEventListener('click', () => setControlDrawerCollapsed(!controlPanel.classList.contains('collapsed')));
            // 폰에서는 접은 채로 시작한다. 크랙 입력창을 가리지 않게.
            setControlDrawerCollapsed(this.isCompactScreen() || (typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 720px)').matches));
            document.getElementById(DOM_IDS.START_BUTTON)?.addEventListener('click', toggleVNEngine);
            document.getElementById(DOM_IDS.DEMO_BUTTON)?.addEventListener('click', toggleUiDemo);
            document.getElementById(DOM_IDS.SETTINGS_BUTTON)?.addEventListener('click', () => SettingsManager.open());
            document.getElementById(DOM_IDS.RESUME_BUTTON)?.addEventListener('click', resumeVN);
            document.getElementById(DOM_IDS.PAUSE_EXIT_BUTTON)?.addEventListener('click', exitSession);
            SettingsManager.createModal();
            this.createLogModal();
            this.createAiTransmissionLogModal();
            syncRuntimeControls();
            console.log("VN Engine: 비주얼 노벨 UI 및 제어판이 준비되었습니다.");
        },

        async updateCharacter(url, characterId = null, assetName = null) { if (SettingsManager.settings.characterMode === 'multi') { await this._updateMultiCharacter(url, characterId, assetName); } else { this.updateSingleCharacter(url, assetName); } },
        async _updateMultiCharacter(url, characterIdForOff = null, assetName = null) {
            const charContainer = this.elements.charContainer; if (!charContainer) return;
            if (url === 'off') {
                const charId = characterIdForOff; if (!charId) return;
                const indexToRemove = this.activeCharacters.findIndex(char => char.id === charId);
                if (indexToRemove > -1) { const charToRemove = this.activeCharacters[indexToRemove]; if (charToRemove.element) { charToRemove.element.style.opacity = 0; setTimeout(() => charToRemove.element.remove(), 400); } if (this.elements.eventCG.dataset.ownerId === charId) this.hideEventCG(charId); this.activeCharacters.splice(indexToRemove, 1); this._updateCharacterOrder(); }
                return;
            }
            // 카트리지 자산(blob URL)은 URL에서 이름을 뽑을 수 없으므로 넘겨받은 값을 씁니다.
            const charInfo = (assetName && characterIdForOff)
                ? { id: characterIdForOff, fullId: assetName }
                : this.parseCharacterInfoFromUrl(url);
            if (!charInfo) return;
            this.lastUpdatedCharId = charInfo.id;
            const aspectRatio = await this.getImageAspectRatio(url).catch(() => 1); const newMode = aspectRatio > 1.2 ? 'event' : 'standing';
            const existingChar = this.activeCharacters.find(char => char.id === charInfo.id);
            if (existingChar) {
                const oldMode = existingChar.mode; existingChar.url = url; existingChar.mode = newMode;
                if (newMode === 'event') { this.showEventCG(url, charInfo.id); if (existingChar.element) existingChar.element.style.display = 'none'; }
                else {
                    if (oldMode === 'event') this.hideEventCG(charInfo.id);
                    // CG 로 처음 등장한 인물은 아직 스탠딩 요소가 없다. 새로 만들되 이미 화면에 있던 인물이므로
                    // 페이드인 없이 바로 보이게 한다 (스탠딩 → CG → 스탠딩 으로 돌아올 때와 같은 모습). 애니메이션 규칙은 건다.
                    const created = !existingChar.element;
                    if (created) {
                        existingChar.element = this._createCharacterElement(url);
                        existingChar.element.style.opacity = 1;
                        existingChar.element.style.transform = 'translateY(0)';
                        this.applyAnimation(existingChar.element.querySelector('.vn-character-cg'), url, assetName);
                    }
                    existingChar.element.style.display = 'flex';
                    const img = existingChar.element.querySelector('.vn-character-cg'); if (img.src !== url) { img.src = url; this.applyAnimation(img, url, assetName); }
                    // CG 에서 돌아오면 화면에 붙이고(새 요소) 자리를 다시 잡는다. CG 동안 들어온 인물과 겹치지 않게.
                    if (created || oldMode === 'event') this._updateCharacterOrder();
                }
            } else {
                const newChar = { id: charInfo.id, url, mode: newMode, element: null };
                if (newMode === 'standing') { newChar.element = this._createCharacterElement(url, false); this.applyAnimation(newChar.element.querySelector('.vn-character-cg'), url, assetName); }
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
        applyAnimation(imgElement, url, nameHint = null) {
            // 1. 기존에 적용된 애니메이션 클래스가 있다면 모두 초기화 (일어나게 하기 위함)
            const allAnimClasses = Object.keys(ANIMATION_TYPES).map(k => `vn-anim-${k}`);
            imgElement.classList.remove(...allAnimClasses);

            // 카트리지 자산은 blob URL이라 파일 이름이 없으므로 넘겨받은 이름으로 대조합니다.
            const filename = nameHint || url.substring(url.lastIndexOf('/') + 1);
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
        toggleUiEditMode(enable) { const targets = [this.elements.dialogueBox, this.elements.charContainer]; const editButton = document.getElementById('vn-edit-ui-button'); if (!editButton) return; if (enable) { this.showAll(); editButton.textContent = '편집 완료'; editButton.onclick = () => this.toggleUiEditMode(false); targets.forEach(el => { if(el) { el.classList.add('vn-ui-draggable'); el.onpointerdown = (e) => this.onDragStart(e, el); } }); } else { editButton.textContent = '편집 시작'; editButton.onclick = () => { SettingsManager.close(); this.toggleUiEditMode(true); }; targets.forEach(el => { if(el) { el.classList.remove('vn-ui-draggable'); el.onpointerdown = null; } }); if (!isEngineActive && !isDemoActive) { this.hideAll(); } } },
        // 마우스·손가락·펜을 한 코드로 받는다. 손가락이 요소 밖으로 나가도 계속 따라가도록 포인터를 붙잡는다.
        onDragStart(e, el) {
            if (typeof e.button === 'number' && e.button !== 0) return;
            e.preventDefault(); e.stopPropagation();
            const rect = el.getBoundingClientRect();
            this.dragInfo = { element: el, pointerId: e.pointerId, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
            try { el.setPointerCapture?.(e.pointerId); } catch (error) { /* 이미 끝난 포인터면 무시 */ }
            el.onpointermove = (ev) => { if (ev.pointerId === this.dragInfo.pointerId) this.onDragMove(ev); };
            el.onpointerup = el.onpointercancel = (ev) => { if (ev.pointerId === this.dragInfo.pointerId) this.onDragEnd(); };
        },
        onDragMove(e) { if (!this.dragInfo.element) return; const newLeft = e.clientX - this.dragInfo.offsetX; const newTop = e.clientY - this.dragInfo.offsetY; this.dragInfo.element.style.left = `${newLeft}px`; this.dragInfo.element.style.top = `${newTop}px`; this.dragInfo.element.style.right = 'auto'; this.dragInfo.element.style.bottom = 'auto'; this.dragInfo.element.style.transform = 'none'; },
        onDragEnd() { const draggedEl = this.dragInfo.element; if (!draggedEl) return; const newPos = { top: `${draggedEl.style.top}`, left: `${draggedEl.style.left}`, transform: 'none' }; if (draggedEl.id === DOM_IDS.DIALOGUE_BOX) SettingsManager.settings.dialogueBoxPos = newPos; else if (draggedEl.id === DOM_IDS.CHAR_CONTAINER) SettingsManager.settings.characterContainerPos = newPos; SettingsManager.save(); draggedEl.onpointermove = null; draggedEl.onpointerup = null; draggedEl.onpointercancel = null; try { draggedEl.releasePointerCapture?.(this.dragInfo.pointerId); } catch (error) { /* 무시 */ } this.dragInfo = {}; },
        showAll() { this.elements.container?.classList.add('visible'); },
        hideAll() { this.toggleMenuModal(false); this.elements.container?.classList.remove('visible'); if (SettingsManager.settings.characterMode === 'multi') { this.clearAllMultiCharacters(); } else { this.updateSingleCharacter('off'); } },
        showBackButton() { if(this.elements.backButton) this.elements.backButton.style.display = 'block'; },
        hideBackButton() { if(this.elements.backButton) this.elements.backButton.style.display = 'none'; },
        parseCharacterInfoFromUrl(url) { if (!url || url.toLowerCase() === 'off') return null; const filename = url.substring(url.lastIndexOf('/') + 1).split('.')[0]; return { id: characterIdFromBaseName(filename), fullId: filename }; },
        updateSingleCharacter(url, assetName = null) { const img = this.elements.cgSingle; if (!img) return; if (url.toLowerCase() === 'off') { img.classList.remove('visible'); setTimeout(() => { if (!img.classList.contains('visible')) img.src = ''; }, 300); } else { if (img.src !== url) { img.src = url; } if (!img.classList.contains('visible')) { img.classList.add('visible'); } AudioManager.checkAndPlay(assetName || url); } },
        applyCustomBackground() { const { characterMode, customBackgroundUrl } = SettingsManager.settings; if ((characterMode === 'single' || characterMode === 'internalImage') && customBackgroundUrl) this.updateBackgroundImage(customBackgroundUrl); },
        updateBackgroundImage(url, assetName = null) {
            const background = this.elements.background;
            if (!background) return;
            const value = url ? `url("${url}")` : '';
            if (background.style.backgroundImage !== value) background.style.backgroundImage = value;
            // 배경이 있을 때만 클릭 차단막을 켠다.
            background.classList.toggle('has-image', Boolean(url));
            this.backgroundUrl = url || '';
            // 핫스팟은 그림 이름으로 찾는다. 카트리지 그림이 아니면 주소에서 이름을 뽑는다.
            this.backgroundAssetName = url ? (assetName || assetNameFromReference(url)) : '';
            this.closeImageViewer();
            this.renderHotspots();
        },

        // 지금 배경에 걸린 핫스팟을 깐다. 없으면 조용히 비운다.
        async renderHotspots() {
            const layer = this.elements.hotspotLayer;
            if (!layer) return;
            layer.replaceChildren();
            this.backgroundAspect = null;
            const name = this.backgroundAssetName;
            const spots = name && typeof CartridgeRuntime !== 'undefined' ? CartridgeRuntime.hotspotsFor(name) : [];
            if (spots.length === 0 || !this.backgroundUrl) return;

            // cover 로 깔리므로 잘려 나간 만큼을 빼려면 원본 비율이 필요하다.
            const aspect = await this.getImageAspectRatio(this.backgroundUrl).catch(() => null);
            // 기다리는 사이에 배경이 또 바뀌었으면 버린다.
            if (this.backgroundAssetName !== name) return;
            this.backgroundAspect = aspect;

            const fallback = (typeof CartridgeRuntime !== 'undefined' && CartridgeRuntime.hotspotReveal) || 'always';
            spots.forEach(spot => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'vn-hotspot';
                button.dataset.reveal = spot.reveal || fallback;
                button.dataset.rect = JSON.stringify(spot.rect);
                // 숨김일 때는 이름도 흘리지 않는다.
                if (button.dataset.reveal !== 'hidden' && spot.label) {
                    button.title = spot.label;
                    button.setAttribute('aria-label', spot.label);
                } else {
                    button.setAttribute('aria-label', '숨겨진 자리');
                }
                button.addEventListener('click', () => this.activateHotspot(spot));
                layer.appendChild(button);
            });
            this.positionHotspots();
        },

        // 화면 크기에 맞춰 자리를 다시 잡는다. background-size: cover 를 그대로 흉내 낸다.
        positionHotspots() {
            const layer = this.elements.hotspotLayer;
            if (!layer || layer.childElementCount === 0) return;
            placeOnCover(Array.from(layer.children), layer, Number(this.backgroundAspect));
        },

        openImageViewer(spot) {
            const viewer = this.elements.imageViewer;
            if (!viewer || !spot) return;
            const image = document.getElementById(DOM_IDS.IMAGE_VIEWER_IMG);
            const missing = document.getElementById(DOM_IDS.IMAGE_VIEWER_MISSING);
            const caption = document.getElementById(DOM_IDS.IMAGE_VIEWER_CAPTION);
            const asset = spot.image && typeof CartridgeRuntime !== 'undefined'
                ? CartridgeRuntime.resolveImageAsset(spot.image)
                : null;

            if (asset?.url) {
                image.src = asset.url;
                image.alt = spot.label || spot.id;
                image.hidden = false;
                missing.hidden = true;
            } else {
                // 아직 그림을 안 넣었어도 자리가 제대로 잡혔는지는 확인할 수 있어야 한다.
                image.removeAttribute('src');
                image.hidden = true;
                missing.hidden = false;
                missing.textContent = spot.image
                    ? `그림이 아직 없습니다 — ${spot.image}`
                    : '이 자리에 띄울 그림이 정해지지 않았습니다.';
            }
            caption.textContent = spot.label || '';
            viewer.hidden = false;
            this.tellHotspot(spot);
        },

        // 핫스팟을 눌렀다. 엔진은 카트리지의 모듈들에 알리고, 그림이 적혀 있으면 그림 창을 띄울 뿐이다.
        // 그 밖에 무엇을 할지(얻기, 화면 열기 등)는 카트리지 코드가 VNCartridge.on('hotspot', …) 으로 정한다.
        activateHotspot(spot) {
            if (!spot) return;
            const runtime = typeof CartridgeRuntime !== 'undefined' ? CartridgeRuntime : null;
            const cartridgeId = runtime?.activeCartridge?.manifest?.id;
            if (cartridgeId) {
                runtime.broadcast(cartridgeId, {
                    type: 'hotspot:press',
                    hotspot: { id: spot.id, background: this.backgroundAssetName || '', label: spot.label || '' }
                });
            }
            if (spot.image) this.openImageViewer(spot);
            else this.tellHotspot(spot);
        },

        // 모듈이 VNCartridge.showImage 로 부탁한 그림 창. 핫스팟 그림 창과 같은 창이다.
        showCartridgeImage(name, label) {
            const imageName = String(name || '').trim();
            if (!imageName || !this.elements?.imageViewer) return false;
            this.openImageViewer({ id: imageName, image: imageName, label: String(label || ''), tellAi: null });
            return Boolean(CartridgeRuntime.resolveImageAsset(imageName));
        },

        // 적어 두었으면 AI 문맥에도 넣는다. 적지 않았으면 그림(또는 화면)만 보여 준다.
        tellHotspot(spot) {
            if (spot.tellAi && typeof AiMessageContextQueue !== 'undefined') {
                try {
                    AiMessageContextQueue.enqueue(
                        CartridgeRuntime.activeCartridge?.manifest?.id || 'cartridge',
                        'hotspot',
                        {
                            id: `hotspot-${this.backgroundAssetName}-${spot.id}`,
                            title: spot.tellAi.title || spot.label || spot.id,
                            text: spot.tellAi.text,
                            createdAt: Date.now()
                        });
                } catch (error) {
                    console.warn('VN Engine: 핫스팟 문맥을 넣지 못했습니다.', error);
                }
            }
        },

        closeImageViewer() {
            const viewer = this.elements.imageViewer;
            if (!viewer || viewer.hidden) return;
            viewer.hidden = true;
            const image = document.getElementById(DOM_IDS.IMAGE_VIEWER_IMG);
            if (image) image.removeAttribute('src');
        },
        updateStatusWindow(text) {
            const statusData = StatusInfoManager.parse(text);
            this.renderEnvironmentBar(statusData.environment);
            if (this.elements.menuModal?.style.display === 'flex') this.renderStatusMenu();
            // 열려 있는 카트리지 화면에도 새 상태를 흘려보낸다. 창을 닫았다 열지 않아도 갱신된다.
            const activeCartridgeId = CartridgeRuntime.activeCartridge?.manifest?.id;
            if (activeCartridgeId) {
                CartridgeRuntime.broadcast(activeCartridgeId, {
                    type: 'status:update',
                    status: StatusInfoManager.getRuntimeData()
                });
            }
        },
        updateDialogueBox(character, text, isAction, typeCallback) { const { charName, dialogueText } = this.elements; if (!charName || !dialogueText) return; if (character) { charName.textContent = character; charName.style.display = 'inline-block'; } else { charName.style.display = 'none'; } dialogueText.className = isAction ? 'action-text' : ''; typeCallback(dialogueText, text); },
        getDialogueTextElement() { return this.elements.dialogueText; },

        // --- 화면 덮개 (대본의 ![screen](…) 줄, 엔진 3.34.0) ---
        // 투명한 상태에서 덮기 시작하면 색은 바로 바꾸고 진하기만 천천히 올린다 (흰빛이 회색으로 번지지 않게).
        // 덮인 상태에서 다른 색을 주면 색이 그 색으로 천천히 바뀐다 (검은 어둠 → 흰빛).
        screenVeilOpacity: 0,
        setScreenVeil({ color = null, opacity = null, seconds = 1 } = {}) {
            const veil = this.elements.screenVeil;
            if (!veil) return;
            const ms = Math.max(0, Math.round(Number(seconds) * 1000) || 0);
            const target = opacity === null || opacity === undefined ? this.screenVeilOpacity : Math.min(1, Math.max(0, Number(opacity)));
            if (color && (this.screenVeilOpacity === 0 || ms === 0)) {
                veil.style.transition = 'none';
                veil.style.backgroundColor = color;
                void veil.offsetWidth;
                veil.style.transition = ms > 0 ? `opacity ${ms}ms ease` : 'none';
            } else {
                veil.style.transition = ms > 0 ? `opacity ${ms}ms ease, background-color ${ms}ms ease` : 'none';
                if (color) veil.style.backgroundColor = color;
            }
            veil.style.opacity = String(target);
            this.screenVeilOpacity = target;
        },
        clearScreenVeil() {
            const veil = this.elements.screenVeil;
            if (!veil) return;
            veil.style.transition = 'none';
            veil.style.opacity = '0';
            this.screenVeilOpacity = 0;
        },
        // 덮개를 기다리는 동안 대사창을 숨긴다. clear 면 다시 보일 때 지난 줄이 남지 않게 비운다.
        setDialogueVeiled(veiled, { clear = false } = {}) {
            const { dialogueBox, charName, dialogueText } = this.elements;
            if (!dialogueBox) return;
            dialogueBox.classList.toggle('vn-veiled', Boolean(veiled));
            if (clear) {
                if (charName) charName.style.display = 'none';
                if (dialogueText) dialogueText.innerHTML = '';
                this.highlightSpeaker(null);
            }
        },
        isDialogueVeiled() { return Boolean(this.elements.dialogueBox?.classList.contains('vn-veiled')); },

        // --- 카트리지 선택지 (VNCartridge.choose, 엔진 3.34.0) ---
        // 고르면 done({ ok: true, index, text }). 닫히면 done({ ok: false, reason }). 한 번에 하나만 띄운다.
        scriptChoice: null,
        showScriptChoices(rawOptions, settings = {}, done = () => {}) {
            const layer = this.elements.scriptChoices;
            if (!layer) return false;
            const options = (Array.isArray(rawOptions) ? rawOptions : []).slice(0, 8)
                .map(option => (typeof option === 'string' ? { text: option } : (option && typeof option === 'object' ? option : null)))
                .filter(option => option && String(option.text || '').trim());
            if (options.length === 0) return false;
            this.closeScriptChoices('replaced');
            if (StageManager.isTyping) StageManager.skipTyping();
            const finish = result => {
                if (!this.scriptChoice || this.scriptChoice.done !== done) return;
                this.scriptChoice = null;
                layer.classList.remove('visible');
                layer.replaceChildren();
                done(result);
            };
            const list = document.createElement('div');
            list.className = 'vn-script-choice-list';
            list.dataset.vnPart = 'script-choice-list';
            const form = document.createElement('form');
            form.className = 'vn-script-choice-form';
            form.dataset.vnPart = 'script-choice-form';
            form.hidden = true;
            const input = document.createElement('textarea');
            input.className = 'vn-script-choice-input';
            input.dataset.vnPart = 'script-choice-input';
            input.maxLength = 500;
            const submit = document.createElement('button');
            submit.type = 'submit';
            submit.className = 'vn-script-choice-submit';
            submit.dataset.vnPart = 'script-choice-submit';
            submit.textContent = '확인';
            submit.disabled = true;
            form.append(input, submit);
            let inputIndex = -1;
            input.addEventListener('input', () => { submit.disabled = !input.value.trim(); });
            input.addEventListener('keydown', event => {
                event.stopPropagation();
                if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); form.requestSubmit(); }
            });
            form.addEventListener('submit', event => {
                event.preventDefault();
                const value = input.value.trim();
                if (value) finish({ ok: true, index: inputIndex, text: value });
            });
            options.forEach((option, index) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'vn-script-choice';
                button.dataset.vnPart = 'script-choice';
                button.textContent = String(option.text).trim().slice(0, 200);
                button.addEventListener('click', () => {
                    if (option.input !== true) { finish({ ok: true, index, text: button.textContent }); return; }
                    inputIndex = index;
                    input.placeholder = String(option.placeholder || settings.placeholder || '').slice(0, 120);
                    list.hidden = true;
                    form.hidden = false;
                    input.focus({ preventScroll: true });
                });
                list.appendChild(button);
            });
            layer.replaceChildren(list, form);
            layer.classList.add('visible');
            this.scriptChoice = { done };
            list.querySelector('button')?.focus({ preventScroll: true });
            return true;
        },
        closeScriptChoices(reason = 'closed') {
            const current = this.scriptChoice;
            if (!current) return;
            this.scriptChoice = null;
            this.elements.scriptChoices?.classList.remove('visible');
            this.elements.scriptChoices?.replaceChildren();
            current.done({ ok: false, reason });
        },

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
    // 카트리지 이미지 표에 적힌 이름이면 그 인물로 확정한다. 표에 없을 때만 아래 학습·추측을 쓴다.
    let targetId = CartridgeRuntime.resolveSpeakerCharacterId(targetName) || this.characterMap[targetName];

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
        <div id="vn-opening-select-modal">

            <div class="vn-opening-box">
                <h2 class="vn-opening-title">시작 설정 선택</h2>
                <p class="vn-opening-desc">원하는 오프닝 시나리오를 선택해주세요.</p>

                <div class="vn-opening-list">
                    ${buttonsHtml}
                </div>

                <hr class="vn-opening-divider">

                <button id="vn-opening-skip-btn">
                    선택 안 함 (바로 시작)
                </button>
            </div>
        </div>
        <style>
            /* 예전에는 인라인으로 박혀 있던 값들. 화면 크기에 따라 덮어쓸 수 있도록 옮겼다. */
            #vn-opening-select-modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 200001; display: flex; align-items: center; justify-content: center; flex-direction: column; color: white; font-family: 'Pretendard', sans-serif; }
            #vn-opening-select-modal .vn-opening-box { background: #2c2c2c; padding: 30px; border-radius: 12px; border: 1px solid #555; width: 400px; max-width: 90%; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
            #vn-opening-select-modal .vn-opening-title { margin-top: 0; margin-bottom: 20px; color: #a2d2ff; }
            #vn-opening-select-modal .vn-opening-desc { color: #ccc; margin-bottom: 20px; font-size: 0.9em; }
            #vn-opening-select-modal .vn-opening-list { display: flex; flex-direction: column; gap: 10px; max-height: 300px; overflow-y: auto; }
            #vn-opening-select-modal .vn-opening-divider { border: 0; border-top: 1px solid #444; margin: 20px 0; }
            #vn-opening-select-modal #vn-opening-skip-btn { background: transparent; border: 1px solid #666; color: #aaa; padding: 8px 16px; border-radius: 6px; cursor: pointer; width: 100%; }
            .vn-opening-option-btn {
                background: #444; color: white; border: none; padding: 12px;
                border-radius: 6px; cursor: pointer; font-size: 1.1em; text-align: left;
                transition: background 0.2s, transform 0.1s;
            }
            .vn-opening-option-btn:hover { background: #1a73e8; transform: translateX(5px); }
            /* 낮은 화면: 창이 화면을 넘지 않고, 오프닝이 많으면 목록 안에서 넘긴다 */
            @media (max-height: 500px) {
                #vn-opening-select-modal .vn-opening-box { box-sizing: border-box; display: flex; flex-direction: column; max-height: calc(100vh - 16px); max-height: calc(100dvh - 16px); padding: 14px 18px; }
                #vn-opening-select-modal .vn-opening-title { margin-bottom: 8px; font-size: 1.2em; }
                #vn-opening-select-modal .vn-opening-desc { margin: 0 0 10px; }
                #vn-opening-select-modal .vn-opening-list { flex: 1 1 auto; min-height: 0; max-height: none; }
                #vn-opening-select-modal .vn-opening-divider { margin: 10px 0; }
                #vn-opening-select-modal .vn-opening-option-btn { padding: 9px 12px; font-size: 1em; }
            }
            /* 세로 폰: 90% 폭에 안쪽 여백이 더해져 화면 밖으로 나가던 문제 */
            @media (max-width: 720px) {
                #vn-opening-select-modal .vn-opening-box { box-sizing: border-box; }
            }
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

        createMenuModal() {
            document.getElementById(DOM_IDS.MENU_MODAL)?.remove();
            const modalHTML = `
                <div id="${DOM_IDS.MENU_MODAL}" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="vn-menu-title" data-vn-part="menu">
                    <div class="vn-menu-panel" data-vn-part="menu-panel">
                        <div class="vn-menu-header" data-vn-part="menu-header">
                            <h2 id="vn-menu-title" class="vn-menu-title" data-vn-part="menu-title">메뉴</h2>
                            <button id="${DOM_IDS.MENU_CLOSE}" type="button" aria-label="메뉴 닫기" data-vn-part="menu-close">&times;</button>
                        </div>
                        <div class="vn-menu-layout" data-vn-part="menu-layout">
                            <div class="vn-menu-sidebar" data-vn-part="menu-sidebar">
                                <nav id="${DOM_IDS.MENU_TABS}" aria-label="상세 정보" data-vn-part="menu-tabs"></nav>
                                <div class="vn-menu-actions" aria-label="엔진 동작" data-vn-part="menu-actions">
                                    <button id="${DOM_IDS.MENU_SETTINGS_BUTTON}" class="vn-menu-action" type="button" data-vn-part="menu-action" data-vn-variant="settings">⚙ 설정</button>
                                    <button id="${DOM_IDS.MENU_PAUSE_BUTTON}" class="vn-menu-action pause" type="button" data-vn-part="menu-action" data-vn-variant="pause">⏸ 일시정지</button>
                                    <button id="${DOM_IDS.MENU_EXIT_BUTTON}" class="vn-menu-action exit" type="button" data-vn-part="menu-action" data-vn-variant="exit">VN 종료</button>
                                </div>
                            </div>
                            <section id="${DOM_IDS.MENU_BODY}" aria-live="polite" data-vn-part="menu-body"></section>
                        </div>
                    </div>
                </div>`;
            this.elements.container?.insertAdjacentHTML('beforeend', modalHTML);
            this.elements.menuModal = document.getElementById(DOM_IDS.MENU_MODAL);

            document.getElementById(DOM_IDS.MENU_CLOSE)?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleMenuModal(false);
            });
            document.getElementById(DOM_IDS.MENU_SETTINGS_BUTTON)?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleMenuModal(false);
                SettingsManager.open();
            });
            document.getElementById(DOM_IDS.MENU_PAUSE_BUTTON)?.addEventListener('click', (e) => {
                e.stopPropagation();
                pauseVN();
            });
            document.getElementById(DOM_IDS.MENU_EXIT_BUTTON)?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleMenuModal(false);
                if (isDemoActive) stopUiDemo();
                else if (isEngineActive) toggleVNEngine();
                else this.hideAll();
            });
            this.elements.menuModal?.addEventListener('click', (e) => {
                if (e.target.id === DOM_IDS.MENU_MODAL) this.toggleMenuModal(false);
            });
            document.addEventListener('keydown', (e) => {
                // 카트리지 외형이 화면을 망가뜨렸을 때를 위한 비상 해제.
                // JS 단축키라 카트리지 CSS 로는 막을 수 없다.
                if (e.ctrlKey && e.altKey && (e.key === 't' || e.key === 'T')) {
                    e.preventDefault();
                    SettingsManager.settings.useCartridgeTheme = false;
                    SettingsManager.save();
                    ThemeManager.render();
                    SkinManager.render();
                    LibraryManager.showToast?.('카트리지 외형을 껐습니다. 설정에서 다시 켤 수 있습니다.');
                    console.log('VN Engine: 카트리지 외형을 비상 해제했습니다.');
                    return;
                }
                const settingsModal = document.getElementById(DOM_IDS.SETTINGS_MODAL);
                if (e.key === 'Escape' && settingsModal?.style.display === 'flex') {
                    e.stopPropagation();
                    SettingsManager.close();
                    return;
                }
                if (e.key === 'Escape' && ModuleOverlay.isOpen()) {
                    e.stopPropagation();
                    ModuleOverlay.close();
                    return;
                }
                const aiLogModal = document.getElementById(DOM_IDS.AI_LOG_MODAL);
                if (e.key === 'Escape' && aiLogModal?.style.display === 'flex') {
                    e.stopPropagation();
                    this.toggleAiTransmissionLog(false);
                    return;
                }
                if (e.key === 'Escape' && this.elements.menuModal?.style.display === 'flex') {
                    e.stopPropagation();
                    this.toggleMenuModal(false);
                    return;
                }
                this.handleMenuDebugKey(e);
            });
        },

        toggleMenuModal(show) {
            const modal = this.elements.menuModal || document.getElementById(DOM_IDS.MENU_MODAL);
            if (!modal) return;
            if (show) {
                syncRuntimeControls();
                const activeSection = document.querySelector(`#${DOM_IDS.MENU_TABS} .vn-menu-tab.active`)?.dataset.section;
                this.renderStatusMenu(activeSection);
                modal.style.display = 'flex';
                modal.setAttribute('aria-hidden', 'false');
                this.elements.menuButton?.setAttribute('aria-expanded', 'true');
                document.getElementById(DOM_IDS.MENU_CLOSE)?.focus();
            } else {
                modal.style.display = 'none';
                modal.setAttribute('aria-hidden', 'true');
                this.elements.menuButton?.setAttribute('aria-expanded', 'false');
            }
        },

        handleMenuDebugKey(event) {
            const menuOpen = this.elements.menuModal?.style.display === 'flex';
            const target = event.target;
            const isTypingTarget = target instanceof HTMLElement && (target.matches('input, textarea, select') || target.isContentEditable);
            if (!menuOpen || isTypingTarget || event.repeat || (event.code !== 'KeyL' && event.key.toLowerCase() !== 'l')) return;
            const now = Date.now();
            this.debugKeyState.count = now - this.debugKeyState.lastAt <= 700 ? this.debugKeyState.count + 1 : 1;
            this.debugKeyState.lastAt = now;
            if (this.debugKeyState.count < 5) return;
            this.debugKeyState = { count: 0, lastAt: 0 };
            event.preventDefault();
            event.stopPropagation();
            this.toggleAiTransmissionLog(true);
        },

        createAiTransmissionLogModal() {
            document.getElementById(DOM_IDS.AI_LOG_MODAL)?.remove();
            const modalHTML = `
                <div id="${DOM_IDS.AI_LOG_MODAL}" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="vn-ai-log-title">
                    <div class="vn-ai-log-panel">
                        <div class="vn-ai-log-header">
                            <h2 id="vn-ai-log-title">AI 전송 로그</h2>
                            <span class="vn-ai-log-hint">메뉴에서 L 키를 빠르게 5번 누르면 열립니다.</span>
                            <div class="vn-ai-log-header-actions">
                                <button id="${DOM_IDS.AI_LOG_CLEAR}" type="button">로그 비우기</button>
                                <button id="${DOM_IDS.AI_LOG_CLOSE}" type="button">닫기</button>
                            </div>
                        </div>
                        <div id="${DOM_IDS.AI_LOG_BODY}"></div>
                    </div>
                </div>`;
            this.elements.container?.insertAdjacentHTML('beforeend', modalHTML);
            const modal = document.getElementById(DOM_IDS.AI_LOG_MODAL);
            document.getElementById(DOM_IDS.AI_LOG_CLOSE)?.addEventListener('click', () => this.toggleAiTransmissionLog(false));
            document.getElementById(DOM_IDS.AI_LOG_CLEAR)?.addEventListener('click', () => {
                AiTransmissionLogStore.clear();
                this.renderAiTransmissionLog();
            });
            modal?.addEventListener('click', (event) => {
                if (event.target === modal) this.toggleAiTransmissionLog(false);
            });
        },

        toggleAiTransmissionLog(show) {
            const modal = document.getElementById(DOM_IDS.AI_LOG_MODAL);
            if (!modal) return;
            if (show) this.renderAiTransmissionLog();
            modal.style.display = show ? 'flex' : 'none';
            modal.setAttribute('aria-hidden', String(!show));
            if (show) document.getElementById(DOM_IDS.AI_LOG_CLOSE)?.focus();
        },

        renderAiTransmissionLog() {
            const body = document.getElementById(DOM_IDS.AI_LOG_BODY);
            if (!body) return;
            body.replaceChildren();
            const pendingItems = AiMessageContextQueue.load();
            const pending = document.createElement('section');
            pending.className = 'vn-ai-pending';
            const pendingTitle = document.createElement('strong');
            pendingTitle.textContent = `다음 메시지에 포함될 문맥 · ${pendingItems.length}건`;
            const pendingContent = document.createElement('pre');
            pendingContent.textContent = pendingItems.length > 0
                ? pendingItems.map(item => `[${item.title}]\n${item.text}`).join('\n\n')
                : '대기 중인 카트리지 문맥이 없습니다.';
            pending.append(pendingTitle, pendingContent);
            body.appendChild(pending);

            const entries = AiTransmissionLogStore.load().slice().reverse();
            if (entries.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'vn-ai-log-empty';
                empty.textContent = '아직 기록된 AI 전송이 없습니다.';
                body.appendChild(empty);
                return;
            }

            entries.forEach((entry, index) => {
                const details = document.createElement('details');
                details.className = 'vn-ai-log-entry';
                details.open = index === 0;
                const summary = document.createElement('summary');
                const status = document.createElement('span');
                status.className = `vn-ai-log-status${entry.status === 'sent' ? '' : ' failed'}`;
                status.textContent = entry.status === 'sent' ? '전송' : '실패';
                const time = document.createElement('span');
                time.className = 'vn-ai-log-time';
                time.textContent = new Date(entry.timestamp).toLocaleString('ko-KR');
                const count = document.createElement('span');
                count.className = 'vn-ai-log-count';
                count.textContent = entry.contextTitles?.length ? `추가 문맥 ${entry.contextTitles.length}건` : '추가 문맥 없음';
                summary.append(status, time, count);

                const content = document.createElement('div');
                content.className = 'vn-ai-log-entry-body';
                const userTitle = document.createElement('h3');
                userTitle.textContent = '사용자가 입력한 문장';
                const userText = document.createElement('pre');
                userText.textContent = entry.userMessage;
                const finalTitle = document.createElement('h3');
                finalTitle.textContent = '실제로 AI에 전달한 최종 문장';
                const finalText = document.createElement('pre');
                finalText.textContent = entry.finalMessage;
                content.append(userTitle, userText, finalTitle, finalText);
                if (entry.error) {
                    const error = document.createElement('p');
                    error.className = 'vn-ai-log-error';
                    error.textContent = entry.error;
                    content.appendChild(error);
                }
                details.append(summary, content);
                body.appendChild(details);
            });
        },

        renderEnvironmentBar(environment = StatusInfoManager.data.environment) {
            if (!this.elements.statusWindow) return;
            Object.entries(environment).forEach(([field, value]) => {
                const target = this.elements.statusWindow.querySelector(`[data-status-field="${field}"]`);
                if (target) target.textContent = value || '—';
            });
        },

        renderStatusMenu(activeSectionName) {
            const tabs = document.getElementById(DOM_IDS.MENU_TABS);
            const body = document.getElementById(DOM_IDS.MENU_BODY);
            if (!tabs || !body) return;
            tabs.replaceChildren();

            const sections = StatusInfoManager.sectionNames().map(sectionName => ({
                key: `status:${sectionName}`,
                title: sectionName,
                type: 'status',
                sectionName
            }));
            CartridgeRuntime.getViewModules().forEach(moduleDefinition => {
                sections.push({
                    key: `module:${moduleDefinition.id}`,
                    title: moduleDefinition.title || moduleDefinition.id,
                    type: 'module',
                    moduleDefinition
                });
            });

            const statusSections = sections.filter(section => section.type !== 'module');
            const initialSection = sections.some(section => section.key === activeSectionName && section.type !== 'module')
                ? activeSectionName
                : statusSections[0]?.key;
            const selectSection = (sectionKey) => {
                const selected = sections.find(section => section.key === sectionKey);
                if (!selected) return;

                // 지도처럼 넓은 화면이 필요한 모듈은 메뉴를 닫고 전용 창에서 연다.
                if (selected.type === 'module') {
                    this.toggleMenuModal(false);
                    ModuleOverlay.open(selected.moduleDefinition);
                    return;
                }

                tabs.querySelectorAll('.vn-menu-tab').forEach(tab => {
                    const isActive = tab.dataset.section === sectionKey;
                    tab.classList.toggle('active', isActive);
                    tab.dataset.vnState = isActive ? 'active' : 'idle';
                    tab.setAttribute('aria-selected', String(isActive));
                });

                const title = document.createElement('h3');
                title.className = 'vn-menu-section-title';
                title.dataset.vnPart = 'menu-section-title';
                title.textContent = selected.sectionName;
                const content = document.createElement('pre');
                content.className = 'vn-menu-section-content';
                content.dataset.vnPart = 'menu-section-content';
                content.textContent = StatusInfoManager.getSectionText(selected.sectionName);
                body.replaceChildren(title, content);
            };

            sections.forEach(section => {
                const tab = document.createElement('button');
                tab.type = 'button';
                tab.className = section.type === 'module' ? 'vn-menu-tab module' : 'vn-menu-tab';
                tab.dataset.section = section.key;
                tab.dataset.vnPart = 'menu-tab';
                tab.dataset.vnVariant = section.type === 'module' ? 'module' : 'status';
                tab.setAttribute('role', 'tab');
                tab.textContent = section.type === 'module' ? `${section.title} ↗` : section.title;
                tab.addEventListener('click', () => selectSection(section.key));
                tabs.appendChild(tab);
            });
            selectSection(initialSection);
        },

        createInputModal() {
            // 혹시라도 이전에 만들어진 모달이 남아있으면 삭제 (중복 방지)
            const oldModal = document.getElementById(DOM_IDS.INPUT_MODAL);
            if (oldModal) oldModal.remove();

    // 입력바 HTML 생성
    const modalHTML = `
        <div id="${DOM_IDS.INPUT_MODAL}"> <!-- 초기 숨김은 생성 CSS 의 #vn-input-modal 규칙이 맡는다 -->
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
        // 텍스트칸과 버튼 사이 여백을 눌러도 대사가 넘어가지 않게 입력창 전체에서 막는다
        document.getElementById(DOM_IDS.INPUT_MODAL)?.addEventListener('click', (e) => e.stopPropagation());
    } else {
        console.error("VN Engine Error: 대화창을 찾을 수 없어 입력창을 생성하지 못했습니다.");
    }
},

        // 모듈이 "이제 보내라" 고 알렸을 때. 보류해 둔 글과 쌓인 문맥을 함께 내보낸다.
        commitPendingChat(options = {}) {
            if (!PendingChat.isHeld()) return false;
            const message = PendingChat.take();
            // 창을 띄워 둔 채로 보내 달라고 하면(이동 연출 중) 창은 두고 페이지 잠금만 푼다.
            // 크랙 입력창이 contenteditable 이면 글을 넣을 때 포커스가 필요한데,
            // inert 가 걸려 있으면 포커스가 잡히지 않아 전송이 실패한다.
            if (options && options.keepOpen) ModuleOverlay.unlockPage();
            else ModuleOverlay.close();
            this.sendMessage({ fromPending: true, message });
            return true;
        },

        toggleInputModal(show) {
            const modal = document.getElementById(DOM_IDS.INPUT_MODAL);
            if (!modal) {
                // 모달이 없으면 다시 생성 시도
                this.createInputModal();
                return;
            }

            if (show) {
                this.placeInputModal(modal);
                modal.style.display = 'flex'; // 보이게 설정
                const t = document.getElementById('vn-modal-textarea');
                if (t) {
                    t.value = '';
                    t.focus();
                }
            } else {
                modal.style.display = 'none'; // 숨김
                this.dockInputModal(modal);
            }
        },

        // 입력창은 원래 대사창 안에 붙어 있다. 그 상태로는 대사창의 transform·backdrop-filter 때문에
        // 화면 기준으로 띄울 수 없어서, 낮은 화면에서 열 때만 밖으로 꺼냈다가 닫을 때 되돌린다.
        isCompactScreen() {
            return typeof window.matchMedia === 'function' && window.matchMedia(COMPACT_SCREEN_QUERY).matches;
        },
        placeInputModal(modal) {
            const container = this.elements.container;
            if (!modal || !container || !this.isCompactScreen()) return;
            if (modal.parentElement !== container) container.appendChild(modal);
            modal.classList.add('vn-input-floating');
        },
        dockInputModal(modal) {
            if (!modal || !modal.classList.contains('vn-input-floating')) return;
            modal.classList.remove('vn-input-floating');
            if (this.elements.dialogueBox && modal.parentElement !== this.elements.dialogueBox) {
                this.elements.dialogueBox.appendChild(modal);
            }
        },
        // 폰에서 키보드가 올라오면 '보이는 영역'이 페이지 위쪽에서 밀려 내려올 수 있다(특히 아이폰).
        // 그 거리를 --vn-viewport-top 에 적어 두면, 위쪽에 띄운 입력창이 키보드에 가리지 않는다.
        watchVisualViewport() {
            const viewport = window.visualViewport;
            const container = this.elements.container;
            if (!viewport || !container) return;
            const update = () => container.style.setProperty('--vn-viewport-top', `${Math.max(0, Math.round(viewport.offsetTop))}px`);
            viewport.addEventListener('resize', update);
            viewport.addEventListener('scroll', update);
            update();
        },
        // 입력창을 연 채로 폰을 돌리면 그 화면에 맞는 자리로 옮긴다.
        watchCompactScreen() {
            if (typeof window.matchMedia !== 'function') return;
            const query = window.matchMedia(COMPACT_SCREEN_QUERY);
            const onChange = () => {
                const modal = document.getElementById(DOM_IDS.INPUT_MODAL);
                if (!modal || modal.style.display !== 'flex') return;
                if (query.matches) this.placeInputModal(modal);
                else this.dockInputModal(modal);
            };
            if (typeof query.addEventListener === 'function') query.addEventListener('change', onChange);
            else if (typeof query.addListener === 'function') query.addListener(onChange);
        },
        async sendMessage(options = {}) {
            const textarea = document.getElementById('vn-modal-textarea');
            const held = options.fromPending === true;
            const userMessage = held ? String(options.message || '').trim() : (textarea?.value.trim() || '');
            if (this.isSendingMessage) return false;
            if (!userMessage && !held) return false;

            // 입력에 모듈 명령이 있으면 보내지 않고 그 모듈을 연다.
            // 모듈이 일을 끝내고 commitChat 을 부를 때 비로소 나간다.
            if (!held) {
                const command = findModuleCommand(userMessage);
                if (command) {
                    PendingChat.hold(command.rest, command.moduleDefinition.id);
                    if (textarea) textarea.value = '';
                    this.toggleInputModal(false);
                    this.toggleMenuModal(false);
                    ModuleOverlay.open(command.moduleDefinition);
                    return false;
                }
            }
            const transmission = AiMessageContextQueue.compose(userMessage);
            const message = transmission.finalMessage;
            const contextTitles = transmission.items.map(item => item.title);
            const recordTransmission = (status, error = '') => {
                AiTransmissionLogStore.record({ status, userMessage, finalMessage: message, contextTitles, error });
                if (document.getElementById(DOM_IDS.AI_LOG_MODAL)?.style.display === 'flex') this.renderAiTransmissionLog();
            };
            // 실패하면 false 를 돌려준다. options.silent 면 경고창 없이 (카트리지가 보낸 글은 카트리지가 처리한다)
            const fail = (error, notice) => {
                recordTransmission('failed', error);
                if (!options.silent) alert(`오류: ${notice || error}`);
                return false;
            };
            const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

            const crackInput = CrackComposer.find();
            if (!crackInput) {
                return fail('Crack 채팅 입력창을 찾을 수 없습니다.', '채팅 입력창을 찾을 수 없습니다.');
            }

            this.isSendingMessage = true;
            try {
                // 보내기 전에 기준점을 잡아 둔다. 그래야 이 글의 응답을 새 응답으로 알아본다
                await ensureMessageBaseline();
                // 먼저 비워서 전송 버튼이 꺼진 상태를 기록해 둔다. 그래야 글을 넣은 뒤 켜지는 버튼이 전송 버튼이다.
                CrackComposer.setText(crackInput, '');
                await wait(60);
                const buttons = CrackComposer.nearbyButtons(crackInput);
                const wasDisabled = new Map(buttons.map(button => [button, button.disabled]));

                CrackComposer.setText(crackInput, message);
                await wait(120);
                if (!CrackComposer.readText(crackInput).trim()) {
                    return fail('Crack 채팅 입력창에 글을 넣지 못했습니다.');
                }

                const sendButton = CrackComposer.pickSendButton(CrackComposer.nearbyButtons(crackInput), wasDisabled);
                if (!sendButton) {
                    // 엉뚱한 버튼을 누르지 않는다. 글은 크랙 입력창에 남아 있으니 직접 보내면 된다.
                    return fail('Crack 채팅 전송 버튼을 찾을 수 없습니다.', '전송 버튼을 찾지 못했습니다. 크랙 입력창에 글을 넣어 두었으니 직접 전송해 주세요.');
                }
                sendButton.click();
                AiMessageContextQueue.consume(transmission.items.map(item => item.id));
                recordTransmission('sent');
                this.toggleInputModal(false);
                return true;
            } catch (error) {
                return fail(error.message || String(error));
            } finally {
                this.isSendingMessage = false;
            }
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

    // --- 방 화면 (manifest 의 home) ---
    // 대화하지 않을 때 머무는 기본 화면이다. 방 배경 위에 방 화면용 캐릭터 그림을 세우고, 누르면 선택지를 띄운다.
    // 그동안 대사창·스탠딩은 감춰 두었다가 '대화하기' 를 고르면 원래 VN 화면(대사창 + 입력창 + 스탠딩)으로 넘어간다.
    // 대사창의 '대화 종료' 로 돌아오고, 새 AI 응답이 재생되면(StageManager.start) 저절로 대화 화면으로 넘어간다.
    //
    // home.module 이 있으면 그림 대신 그 모듈을 방 화면으로 띄운다 (걸어 다니는 맵 같은 화면).
    // 모듈 액자는 대화하는 동안 지우지 않고 대사창 뒤에 배경으로 깔아 둔다. 그래서 돌아오면 하던 자리 그대로다.
    // 새 응답이 자기 배경 그림을 가져오면 그때 걷는다. VN 을 끄거나 카트리지를 바꾸면 액자를 버린다.
    const HomeScene = {
        active: false,
        aspect: null,
        selected: null,     // { character, button, panel }
        toastTimer: null,
        frame: null,        // 방 화면 모듈 액자
        frameModuleId: null,

        config() {
            return (typeof CartridgeRuntime !== 'undefined' && CartridgeRuntime.home) || null;
        },

        usesModule() {
            return Boolean(this.config()?.module);
        },

        mountFrame() {
            const moduleId = this.config()?.module;
            const host = UIManager.elements.homeFrameHost;
            if (!moduleId || !host) return null;
            if (this.frame?.isConnected && this.frameModuleId === moduleId) return this.frame;
            this.unmountFrame();
            const definition = CartridgeRuntime.getModule(moduleId);
            if (!definition) return null;
            const moduleDefinition = { id: moduleId, ...definition };
            const frame = document.createElement('iframe');
            frame.className = 'vn-home-frame';
            frame.title = moduleDefinition.title || moduleId;
            // 다른 모듈 화면과 같은 격리 조건 (allow-same-origin 없음)
            frame.setAttribute('sandbox', MODULE_FRAME_SANDBOX);
            try {
                frame.srcdoc = CartridgeRuntime.createViewDocument(moduleDefinition);
            } catch (error) {
                console.error(`VN Engine: 방 화면 모듈을 열 수 없습니다 — ${moduleId}`, error);
                frame.srcdoc = `<p style="padding:20px;color:white">방 화면 모듈을 열 수 없습니다: ${escapeHtml(error.message)}</p>`;
            }
            host.appendChild(frame);
            host.classList.add('has-frame');
            CartridgeRuntime.registerFrame(frame, moduleDefinition);
            this.frame = frame;
            this.frameModuleId = moduleId;
            return frame;
        },

        unmountFrame() {
            const host = UIManager.elements.homeFrameHost;
            if (this.frame) {
                // 방 화면 모듈은 사라지면서 하던 것을 저장한다. 그 메시지가 도착할 시간을 준다
                CartridgeRuntime.unregisterFrame(this.frame, 1500);
                this.frame.remove();
            }
            this.frame = null;
            this.frameModuleId = null;
            host?.classList.remove('has-frame');
            this.setBackdrop(false);
        },

        // 대화하는 동안 방 화면 모듈을 대사창 뒤에 깔아 둘지
        setBackdrop(on) {
            UIManager.elements.container?.classList.toggle('vn-home-backdrop', Boolean(on && this.frame));
        },

        // 모듈에 지금 조작할 수 있는지 알린다 (대화 중에는 시계를 멈추는 식으로 쓴다)
        notifyFrame() {
            try {
                this.frame?.contentWindow?.postMessage({ source: 'vn-engine', type: 'home:state', home: { active: this.active } }, '*');
            } catch (error) { /* 액자가 사라지는 중 */ }
        },

        focusFrame() {
            if (!this.frame) return;
            // 부모 쪽 입력칸에 초점이 남아 있으면 키보드가 맵에 닿지 않는다
            setTimeout(() => { if (this.active && this.frame) this.frame.focus(); }, 0);
        },

        // 모듈이 VNCartridge.talkTo(characterId, choiceId) 로 말을 걸 때
        talkFromModule(moduleId, characterId, choiceId) {
            const config = this.config();
            if (!config?.module || moduleId !== config.module) return { ok: false, reason: 'not-home-module' };
            if (!this.active) return { ok: false, reason: 'not-home' };
            const character = config.characters.find(item => item.id === String(characterId || ''));
            if (!character) {
                console.warn(`VN Engine: 방 화면에 없는 인물입니다 — ${characterId}`);
                return { ok: false, reason: 'no-character' };
            }
            const choice = choiceId
                ? character.choices.find(item => item.id === String(choiceId))
                : character.choices.find(item => item.action === 'talk');
            if (!choice) return { ok: false, reason: 'no-choice' };
            this.choose(character, choice);
            return { ok: true, action: choice.action };
        },

        // 대사창의 돌아가기 버튼은 방 화면이 있는 카트리지에서만 보인다.
        sync() {
            const config = this.config();
            UIManager.elements.container?.classList.toggle('vn-home-available', Boolean(config));
            const button = document.getElementById(DOM_IDS.END_TALK_BUTTON);
            if (button && config) button.textContent = config.endLabel;
        },

        enter() {
            const config = this.config();
            const container = UIManager.elements.container;
            this.sync();
            if (!config || !container) return false;
            this.closeChoices();
            if (document.getElementById(DOM_IDS.INPUT_MODAL)?.style.display === 'flex') UIManager.toggleInputModal(false);
            // 읽던 대사는 접는다. 남겨 두면 대사창을 누를 때 지난 응답이 이어서 재생된다.
            if (StageManager.isTyping) StageManager.skipTyping();
            StageManager.cueSheet = [];
            StageManager.currentIndex = -1;
            StageManager.firstTextCueIndex = -1;
            StageManager.isFinished = true;
            StageManager.isVisible = false;
            UIManager.hideBackButton();
            if (SettingsManager.settings.characterMode === 'multi') UIManager.clearAllMultiCharacters();
            else UIManager.updateSingleCharacter('off');
            // 말을 걸어 놓고 보내지 않은 채 돌아왔다면 그 알림은 걷는다
            AiMessageContextQueue.withdraw(CartridgeRuntime.activeCartridge?.manifest?.id, HOME_TALK_NOTE_ID);

            const asset = config.background ? CartridgeRuntime.resolveImageAsset(config.background) : null;
            UIManager.updateBackgroundImage(asset ? asset.url : '', asset ? asset.name : null);
            if (config.module) this.mountFrame();
            this.setBackdrop(false);
            container.classList.add('vn-home-mode');
            this.active = true;
            UIManager.showAll();
            this.render();
            this.notifyFrame();
            this.focusFrame();
            return true;
        },

        // keepBackdrop: 방 화면 모듈을 대사창 뒤에 깔아 둔다 (말을 걸었거나, 배경 그림 없는 응답이 왔을 때).
        // 이미 걷힌 뒤에는 다시 깔지 않는다. 응답이 가져온 배경 그림이 다음 응답까지 남아 있어야 한다.
        leave(options = {}) {
            const showing = this.active || Boolean(UIManager.elements.container?.classList.contains('vn-home-backdrop'));
            this.setBackdrop(Boolean(options.keepBackdrop) && showing && this.usesModule());
            if (!this.active) return;
            this.active = false;
            this.closeChoices();
            UIManager.elements.container?.classList.remove('vn-home-mode');
            UIManager.elements.homeLayer?.replaceChildren();
            this.notifyFrame();
        },

        // VN 종료·테스트 종료. 방 화면에서는 대사가 돌고 있지 않아 StageManager.hide 가 화면을 내리지 않으므로 직접 내린다.
        exit() {
            const wasActive = this.active;
            this.leave();
            this.unmountFrame();
            if (wasActive) UIManager.hideAll();
        },

        // 카트리지를 갈아 끼웠을 때. 방 화면에 있었다면 새 카트리지의 방으로 다시 깐다.
        refresh() {
            this.sync();
            // 액자는 이전 카트리지의 것이다
            this.unmountFrame();
            if (!this.active) return;
            if (this.config()) this.enter();
            else this.leave();
        },

        async render() {
            const layer = UIManager.elements.homeLayer;
            const config = this.config();
            if (!layer || !config) return;
            layer.replaceChildren();
            const backgroundUrl = UIManager.backgroundUrl;
            // 방 화면 모듈이 있으면 그 액자가 화면을 덮고 클릭도 받는다
            const missingBackground = !backgroundUrl && !config.module;
            layer.classList.toggle('vn-home-no-background', missingBackground);
            if (missingBackground) {
                const notice = document.createElement('p');
                notice.className = 'vn-home-notice';
                notice.textContent = `방 배경 그림이 아직 없습니다 — ${config.background}`;
                layer.appendChild(notice);
            }

            config.characters.forEach(character => {
                if (!character.rect) return;     // 모듈이 직접 그리는 인물
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'vn-home-character';
                button.dataset.vnPart = 'home-character';
                button.dataset.characterId = character.id;
                button.dataset.rect = JSON.stringify(character.rect);
                button.setAttribute('aria-label', `${character.name} — 선택지 열기`);
                button.setAttribute('aria-haspopup', 'menu');
                button.setAttribute('aria-expanded', 'false');
                const asset = character.image ? CartridgeRuntime.resolveImageAsset(character.image) : null;
                if (asset?.url) {
                    const image = document.createElement('img');
                    image.src = asset.url;
                    image.alt = '';
                    image.draggable = false;
                    button.appendChild(image);
                } else {
                    // 그림을 넣기 전에도 자리와 선택지는 확인할 수 있어야 한다
                    const placeholder = document.createElement('span');
                    placeholder.className = 'vn-home-placeholder';
                    placeholder.textContent = character.image ? `${character.name}\n그림 없음 — ${character.image}` : character.name;
                    button.appendChild(placeholder);
                }
                button.addEventListener('click', event => {
                    event.stopPropagation();
                    if (this.selected?.button === button) this.closeChoices();
                    else this.openChoices(character, button);
                });
                layer.appendChild(button);
            });

            // cover 로 깔린 배경에 맞추려면 원본 비율이 필요하다 (핫스팟과 같은 계산)
            this.aspect = null;
            this.position();
            if (!backgroundUrl) return;
            const aspect = await UIManager.getImageAspectRatio(backgroundUrl).catch(() => null);
            if (!this.active || UIManager.backgroundUrl !== backgroundUrl) return;
            this.aspect = aspect;
            this.position();
        },

        position() {
            const layer = UIManager.elements.homeLayer;
            if (!this.active || !layer) return;
            placeOnCover(Array.from(layer.querySelectorAll('.vn-home-character')), layer, Number(this.aspect));
            this.placeChoices();
        },

        openChoices(character, button) {
            this.closeChoices();
            const layer = UIManager.elements.homeLayer;
            if (!layer) return;
            const panel = document.createElement('div');
            panel.className = 'vn-home-choices';
            panel.dataset.vnPart = 'home-choices';
            panel.setAttribute('role', 'menu');
            panel.setAttribute('aria-label', character.name);
            const title = document.createElement('div');
            title.className = 'vn-home-choices-title';
            title.textContent = character.name;
            panel.appendChild(title);
            character.choices.forEach(choice => {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = choice.action === 'talk' ? 'vn-home-choice primary' : 'vn-home-choice';
                item.dataset.vnPart = 'home-choice';
                item.dataset.choiceId = choice.id;
                item.setAttribute('role', 'menuitem');
                item.textContent = choice.label;
                item.addEventListener('click', event => {
                    event.stopPropagation();
                    this.choose(character, choice);
                });
                panel.appendChild(item);
            });
            panel.addEventListener('click', event => event.stopPropagation());
            layer.appendChild(panel);
            button.classList.add('is-selected');
            button.setAttribute('aria-expanded', 'true');
            layer.classList.add('has-selection');
            this.selected = { character, button, panel };
            this.placeChoices();
            panel.querySelector('.vn-home-choice')?.focus({ preventScroll: true });
        },

        // 캐릭터 오른쪽에 붙이고, 자리가 없으면 왼쪽으로 넘긴다. 화면 밖으로는 나가지 않는다.
        placeChoices() {
            if (!this.selected) return;
            const layer = UIManager.elements.homeLayer;
            const { button, panel } = this.selected;
            const gap = 12;
            const edge = 12;
            const width = panel.offsetWidth;
            const height = panel.offsetHeight;
            const left = button.offsetLeft;
            const top = button.offsetTop;
            let x = left + button.offsetWidth + gap;
            if (x + width > layer.clientWidth - edge) x = left - gap - width;
            x = Math.max(edge, Math.min(x, layer.clientWidth - width - edge));
            const y = Math.max(edge, Math.min(top + button.offsetHeight * 0.2, layer.clientHeight - height - edge));
            panel.style.left = `${x}px`;
            panel.style.top = `${y}px`;
        },

        closeChoices() {
            if (!this.selected) return null;
            const { button, panel } = this.selected;
            this.selected = null;
            panel.remove();
            button.classList.remove('is-selected');
            button.setAttribute('aria-expanded', 'false');
            UIManager.elements.homeLayer?.classList.remove('has-selection');
            return button;
        },

        choose(character, choice) {
            if (choice.action === 'talk') {
                this.talk(character, choice);
                return;
            }
            this.toast(choice.text ? choice.text.replace(/\{name\}/g, character.name) : '아직 준비 중입니다.');
        },

        // 대화 화면으로 넘어간다. 방 배경은 그대로 두고 대사창·입력창·스탠딩을 띄운다.
        async talk(character, choice) {
            const fill = text => text.replace(/\{name\}/g, character.name);
            if (choice.tellAi) {
                try {
                    AiMessageContextQueue.enqueue(CartridgeRuntime.activeCartridge?.manifest?.id || 'cartridge', 'home', {
                        id: HOME_TALK_NOTE_ID,
                        title: character.name,
                        text: fill(choice.tellAi),
                        createdAt: Date.now(),
                        replace: true
                    });
                } catch (error) {
                    console.warn('VN Engine: 방 화면 문맥을 넣지 못했습니다.', error);
                }
            }
            this.leave({ keepBackdrop: true });
            UIManager.showAll();
            // 대사창이 떠 있다고 알린다(종료할 때 StageManager.hide 가 화면을 내리도록). 재생할 대사는 없으니
            // 끝난 상태로 두어 새 응답 확인을 막지 않는다.
            StageManager.isVisible = true;
            StageManager.isFinished = true;
            UIManager.highlightSpeaker(null);
            // 대사창에 지난 대화가 남아 보이지 않게 새로 채운다. line 이 없으면 이름표만 단다.
            const { charName, dialogueText } = UIManager.elements;
            if (charName && dialogueText) {
                if (choice.line) {
                    charName.style.display = 'none';
                    dialogueText.className = 'action-text';
                    dialogueText.textContent = fill(choice.line);
                } else {
                    charName.textContent = character.name;
                    charName.style.display = 'inline-block';
                    dialogueText.className = '';
                    dialogueText.textContent = '';
                }
            }
            UIManager.toggleInputModal(true);
            if (!character.standing) return;
            const standing = CartridgeRuntime.resolveImageAsset(character.standing);
            if (standing?.url) await UIManager.updateCharacter(standing.url, standing.characterId, standing.name);
            else console.warn(`VN Engine: 스탠딩 그림을 찾을 수 없습니다 — ${character.standing}`);
        },

        toast(message) {
            const layer = UIManager.elements.homeLayer;
            if (!layer) return;
            let toast = layer.querySelector('.vn-home-toast');
            if (!toast) {
                toast = document.createElement('p');
                toast.className = 'vn-home-toast';
                toast.setAttribute('role', 'status');
                layer.appendChild(toast);
            }
            toast.textContent = message;
            toast.classList.add('visible');
            clearTimeout(this.toastTimer);
            this.toastTimer = setTimeout(() => toast.classList.remove('visible'), 1800);
        }
    };

    // --- 데이터 패쳐 및 전역 로직 ---
    class PlatformMessage { constructor(id, role, content) { this.id = id; this.role = role; this.content = content; } }
    function extractCookie(key) { const e = document.cookie.match(new RegExp(`(?:^|; )${key.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1")}=([^;]*)`)); return e ? decodeURIComponent(e[1]) : null; }
    function authFetch(method, url, body) {
        return new Promise((resolve, reject) => {
            const headers = {
                'Authorization': `Bearer ${extractCookie("access_token")}`,
                'Content-Type': 'application/json',
                // 크랙 사이트가 자기 API 에 붙이는 헤더 (엔진 3.37.2)
                'platform': 'web',
                'wrtn-locale': 'ko-KR'
            };
            const wrtnId = extractCookie('__w_id');
            if (wrtnId) headers['x-wrtn-id'] = wrtnId;

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
    // 크랙이 API 서버를 crack-api.wrtn.ai 로 옮겼다. 예전 contents-api.wrtn.ai 는 모든 요청에 503 을 낸다 (2026-10-17 확인, 엔진 3.37.2).
    // 사이트도 같은 /v3/chats/{id}/messages 를 crack-gen 아래에서 부른다. desc = 최근 것부터.
    class CrackMessageFetcher { constructor(chatId) { this.chatId = chatId; } async fetch(limit = 10) { const messages = []; const url = `https://crack-api.wrtn.ai/crack-gen/v3/chats/${this.chatId}/messages?limit=${limit}&sortOrder=desc`; const fetchResult = await authFetch("GET", url); if (fetchResult instanceof Error) throw fetchResult; const rawMessages = fetchResult.data?.list ?? fetchResult.data?.messages; if (!rawMessages) throw new Error("메시지를 가져오는 데 실패하였습니다."); for (let msg of rawMessages) { messages.push(new PlatformMessage(msg._id, msg.role, msg.content)); } return messages.reverse(); } }

    let lastMessageId = null, isChecking = false, isEngineActive = false, isDemoActive = false;
    // 일시정지 중인지, 그동안 도착해 돌아가면 재생할 응답
    let isPaused = false, pausedResponse = null;
    let generationStopTime = null;
    let pollingTimer = null, uiObserver = null;
    let stopDelayTimer = null;
    let isHighSpeedMode = false;
    // 생성이 끝난 뒤 응답이 들어올 때까지 조금 더 확인한다 (엔진 3.37.2). 크랙 서버가 생성 중에 503 을 내거나
    // 응답을 늦게 적으면 고속 모드가 끝난 뒤라 응답을 놓치고 화면이 그대로 멈췄다.
    let settleChecks = null;

    function syncRuntimeControls() {
        const sessionActive = isEngineActive || isDemoActive;
        const controlPanel = document.querySelector('.vn-control-panel');
        if (controlPanel) {
            controlPanel.classList.toggle('vn-session-active', sessionActive);
            controlPanel.classList.toggle('vn-paused', isPaused);
            const hidden = sessionActive && !isPaused;
            // 방금 누른 버튼에 포커스가 남은 채로 숨기면 브라우저가 경고한다
            if (hidden && controlPanel.contains(document.activeElement)) document.activeElement.blur();
            controlPanel.setAttribute('aria-hidden', String(hidden));
        }
        const exitButton = document.getElementById(DOM_IDS.MENU_EXIT_BUTTON);
        if (exitButton) exitButton.textContent = isDemoActive && !isEngineActive ? '테스트 종료' : 'VN 종료';
    }

    function setControlDrawerCollapsed(collapsed) {
        const controlPanel = document.querySelector('.vn-control-panel');
        if (!controlPanel) return;
        controlPanel.classList.toggle('collapsed', collapsed);
        const toggle = controlPanel.querySelector('.vn-drawer-toggle');
        if (toggle) {
            toggle.textContent = collapsed ? '›' : '‹';
            toggle.setAttribute('aria-label', collapsed ? '제어판 펼치기' : '제어판 접기');
            toggle.setAttribute('aria-expanded', String(!collapsed));
        }
    }

    // --- 일시정지 ---
    // VN 화면을 지우지 않고 숨겨서 크랙 화면을 쓸 수 있게 한다. 대사 위치·캐릭터·배경·무대는 그대로 남는다.
    // 그동안 도착한 AI 응답은 보여 주지 않고 모아 두었다가 돌아갈 때 재생한다.
    function pauseVN() {
        if (isPaused || !(isEngineActive || isDemoActive)) return;
        isPaused = true;
        if (StageManager.isTyping) StageManager.skipTyping(); // 숨긴 채로 글자가 계속 찍히지 않게 그 줄을 끝낸다
        UIManager.toggleMenuModal(false);
        if (document.getElementById(DOM_IDS.INPUT_MODAL)?.style.display === 'flex') UIManager.toggleInputModal(false);
        UIManager.toggleLogModal(false);
        UIManager.toggleAiTransmissionLog(false);
        if (ModuleOverlay.isOpen()) ModuleOverlay.close();
        UIManager.elements.container?.classList.add('vn-paused');
        StageOverlay.suspend();
        AudioManager.pause();
        setControlDrawerCollapsed(false); // 돌아가기 버튼이 바로 보이게
        syncRuntimeControls();
    }

    function resumeVN() {
        if (!isPaused) return;
        isPaused = false;
        UIManager.elements.container?.classList.remove('vn-paused');
        StageOverlay.resume();
        AudioManager.resume();
        syncRuntimeControls();
        if (pausedResponse) {
            const response = pausedResponse;
            pausedResponse = null;
            StageManager.start(SceneDirector.weave(response));   // 모아 둔 응답도 장면 조건을 본다
        }
    }

    // 종료할 때 일시정지 흔적을 지운다 (종료 경로마다 부른다)
    function clearPauseState() {
        isPaused = false;
        pausedResponse = null;
        UIManager.elements.container?.classList.remove('vn-paused');
    }

    // 일시정지 중의 ✕ 버튼. 메뉴의 VN 종료와 같다.
    function exitSession() {
        if (isDemoActive) stopUiDemo();
        else if (isEngineActive) toggleVNEngine();
        else { clearPauseState(); syncRuntimeControls(); }
    }

    const UI_DEMO_RESPONSE = [
        '*이 화면은 실제 대화를 보내지 않고 인터페이스를 확인하기 위한 테스트 장면입니다.*',
        '',
        '"**안내** | 우측 상단의 메뉴 버튼을 눌러 상태 메뉴와 활성 카트리지 화면을 확인하세요."',
        '',
        '```info',
        'T-0｜테스트 날짜｜테스트 요일｜12:00｜낮｜✨｜테스트 구역 - UI 미리보기',
        '[현재위치]',
        '[소속]',
        '테스트 사용자',
        '-',
        '[관계]',
        '└안내 시스템｜🙂',
        '-',
        '[상황｜VN Engine UI 테스트 진행 중]',
        '[일정｜인터페이스 확인]',
        '-',
        '[소지품]',
        '1,000 코인',
        '테스트 카트리지',
        '```'
    ].join('\n');

    function createUiDemoBackground() {
        const svg = [
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">',
            '<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#071426"/><stop offset="0.52" stop-color="#173a5c"/><stop offset="1" stop-color="#4d315f"/></linearGradient>',
            '<radialGradient id="glow"><stop stop-color="#6ee7f9" stop-opacity=".75"/><stop offset="1" stop-color="#6ee7f9" stop-opacity="0"/></radialGradient></defs>',
            '<rect width="1920" height="1080" fill="url(#bg)"/>',
            '<circle cx="1460" cy="210" r="340" fill="url(#glow)"/>',
            '<g fill="#fff" opacity=".8"><circle cx="180" cy="160" r="3"/><circle cx="390" cy="310" r="2"/><circle cx="710" cy="125" r="3"/><circle cx="1010" cy="360" r="2"/><circle cx="1320" cy="100" r="2"/><circle cx="1710" cy="470" r="3"/></g>',
            '<path d="M0 820 C420 650 690 860 1040 720 S1590 650 1920 790 V1080 H0Z" fill="#08111d" opacity=".72"/>',
            '<text x="960" y="500" text-anchor="middle" fill="#d9f7ff" font-family="sans-serif" font-size="58" font-weight="700" letter-spacing="12">VN ENGINE</text>',
            '<text x="960" y="560" text-anchor="middle" fill="#8eddf6" font-family="sans-serif" font-size="24" letter-spacing="7">UI PREVIEW</text>',
            '</svg>'
        ].join('');
        return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
    }

    function setUiDemoButtonState(active) {
        const button = document.getElementById(DOM_IDS.DEMO_BUTTON);
        if (button) {
            button.textContent = active ? '테스트 종료' : 'UI 테스트';
            button.classList.toggle('active', active);
        }
        syncRuntimeControls();
    }

    function stopUiDemo() {
        if (!isDemoActive) return;
        isDemoActive = false;
        clearPauseState();
        HomeScene.exit();
        StageManager.hide();
        AudioManager.stopAll();
        UIManager.updateBackgroundImage('');
        setUiDemoButtonState(false);
    }

    function toggleUiDemo() {
        if (isDemoActive) {
            stopUiDemo();
            return;
        }

        if (isEngineActive) toggleVNEngine();
        isDemoActive = true;
        LogManager.clear();
        StageManager.start(UI_DEMO_RESPONSE);
        UIManager.updateBackgroundImage(createUiDemoBackground());
        setUiDemoButtonState(true);
    }

    // AI 가 지금 응답을 쓰고 있는지, 새 응답이 방금 도착했는지를 카트리지 화면에 알린다.
    // 카트리지는 이 신호로 자기 연출의 길이를 응답 대기 시간에 맞출 수 있다.
    const AiActivityMonitor = {
        generating: false,
        reason: 'idle',
        lastArrivedAt: 0,

        snapshot() {
            return { generating: this.generating, reason: this.reason, lastArrivedAt: this.lastArrivedAt };
        },

        // 생성 버튼이 나타나면 true, 사라지고 유예 시간이 지나면 false.
        setGenerating(flag) {
            const next = Boolean(flag);
            if (this.generating === next) return;
            this.generating = next;
            this.publish(next ? 'generating' : 'idle');
        },

        // 새 응답이 실제로 들어왔을 때. 버튼이 사라지는 것보다 확실한 신호다.
        noteArrival() {
            this.lastArrivedAt = Date.now();
            this.generating = false;
            this.publish('arrived');
        },

        publish(reason) {
            this.reason = reason;
            if (typeof CartridgeRuntime === 'undefined') return;
            const cartridgeId = CartridgeRuntime.activeCartridge?.manifest?.id;
            if (!cartridgeId) return;
            CartridgeRuntime.broadcast(cartridgeId, { type: 'ai-activity', activity: this.snapshot() });
        }
    };

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
        AiActivityMonitor.setGenerating(true);

        // 혹시 "끄려고 예약해둔 타이머"가 있다면 취소 (다시 생성 시작했으므로)
        if (stopDelayTimer) {
            clearTimeout(stopDelayTimer);
            stopDelayTimer = null;
        }
        settleChecks = null;
    } else if (isHighSpeedMode && !stopDelayTimer) {
        // [상황 B] 버튼이 사라졌는데, 아직 고속 모드임 -> "2초 뒤에 꺼라" 예약
        stopDelayTimer = setTimeout(() => {
            isHighSpeedMode = false; // 2초 뒤에 비로소 꺼짐
            stopDelayTimer = null;
            settleChecks = { empty: 0, failed: 0 };
            // 응답이 들어오지 않고 멈춘 경우(중단·오류)에도 대기 상태를 풀어 준다.
            AiActivityMonitor.setGenerating(false);
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
    } else if (settleChecks) {
        // [마무리] 응답이 들어오거나, 확인이 5번 연달아 비거나, 10번 실패할 때까지 3초 간격.
        // 대사를 읽는 중이라 미룬 확인은 세지 않는다 (다 읽은 뒤 다시 본다).
        const result = await checkForNewMessages();
        if (settleChecks) {
            if (result === 'empty') settleChecks.empty++;
            if (result === 'failed') settleChecks.failed++;
            if (result === 'arrived' || settleChecks.empty >= 5 || settleChecks.failed >= 10) settleChecks = null;
        }
        if (pollingTimer) clearTimeout(pollingTimer);
        pollingTimer = setTimeout(adaptivePollingLoop, 3000);
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
    // 새 응답을 가릴 기준점. 아직 없으면 지금 메시지 목록의 끝을 기준으로 잡는다 (엔진 3.37.1).
    // 예전에는 AI 가 쓰기 시작할 때 처음 잡아서, VN 을 켜자마자 보낸 글의 응답이 이미 목록에 있으면 그것을
    // 기준으로 삼아 재생하지 않았다 (시작 설정처럼 켜자마자 보내는 경우). 메시지가 하나도 없으면 '' 로 잡는다.
    async function ensureMessageBaseline() {
        if (lastMessageId !== null) return true;
        const chatInfo = getChatInfoFromUrl();
        if (!chatInfo) return false;
        try {
            const latest = await new CrackMessageFetcher(chatInfo.id).fetch(10);
            if (lastMessageId === null) lastMessageId = latest.length > 0 ? latest[latest.length - 1].id : '';
            return true;
        } catch (error) {
            console.warn('VN Engine: 메시지 기준점을 잡지 못했습니다.', error);
            return false;
        }
    }

    // 돌려주는 값: 'arrived' 응답을 틀었다 · 'empty' 새 응답 없음 · 'failed' 가져오지 못함 · 'skipped' 확인을 미룸
    async function checkForNewMessages() {
        // 대사를 읽는 중에는 확인을 미룬다. 일시정지 중에는 화면이 멈춰 있으므로 계속 확인해서 모아 둔다.
        if (!isEngineActive || isChecking || (!isPaused && StageManager.isVisible && !StageManager.isFinished)) return 'skipped';
        isChecking = true;
        try {
            const chatInfo = getChatInfoFromUrl(); if (!chatInfo) return 'empty';
            const fetcher = new CrackMessageFetcher(chatInfo.id);
            const latestMessages = await fetcher.fetch(10);
            if (latestMessages.length === 0) { if (lastMessageId === null) lastMessageId = ''; return 'empty'; }
            if (lastMessageId === null) { lastMessageId = latestMessages[latestMessages.length - 1].id; return 'empty'; }
            const lastSeenIndex = latestMessages.findIndex(msg => msg.id === lastMessageId);
            let newMessages = latestMessages.slice(lastSeenIndex + 1);
            // 기억하던 메시지가 사라졌다 (재생성·삭제). 최근 10개를 전부 새 것으로 보지 않는다.
            // 맨 끝이 AI 응답이면 그 하나만 쓰고, 아니면(재생성 중이라 새 응답이 아직 없음) 아무것도 틀지 않고 기준점만 옮긴다.
            // 이전 응답을 다시 트는 일이 없도록 맨 끝 메시지만 본다.
            if (lastSeenIndex === -1) {
                const latest = latestMessages[latestMessages.length - 1];
                newMessages = latest.role === 'assistant' && latest.content && latest.content.trim() !== '' ? [latest] : [];
                lastMessageId = latest.id;
            }
            if (newMessages.length > 0) {
                const assistantMessages = newMessages.filter(msg => msg.role === 'assistant' && msg.content && msg.content.trim() !== '');
                if (assistantMessages.length > 0) {
                    const fullResponse = assistantMessages.map(m => m.content).join('\n\n');
                    if (isPaused) pausedResponse = pausedResponse ? `${pausedResponse}\n\n${fullResponse}` : fullResponse;
                    else StageManager.start(SceneDirector.weave(fullResponse));   // 조건이 맞은 장면을 끼워 넣는다
                    // 카트리지가 기다리고 있을 수 있다. 상태창 갱신과 별개로 도착 자체를 알린다.
                    AiActivityMonitor.noteArrival();
                    lastMessageId = newMessages[newMessages.length - 1].id;
                    return 'arrived';
                }
                lastMessageId = newMessages[newMessages.length - 1].id;
            }
            return 'empty';
        } catch (error) {
            console.error("VN Engine: 새 메시지 확인 중 오류:", error);
            return 'failed';
        } finally {
            isChecking = false;
        }
    }



    function startRealtimeChecker() {
    const chatInfo = getChatInfoFromUrl();
    if (chatInfo) {
        lastMessageId = null;
        ensureMessageBaseline(); // 켜는 순간의 메시지 목록을 기준으로
        startUiObserver();
        adaptivePollingLoop(); // 루프 시작
    }
}

    function stopRealtimeChecker() {
    if (pollingTimer) clearTimeout(pollingTimer);
    pollingTimer = null;
    if (uiObserver) { uiObserver.disconnect(); uiObserver = null; }
    lastMessageId = null; isChecking = false; settleChecks = null;
    AiActivityMonitor.setGenerating(false);
    StageManager.hide();
    UIManager.toggleLoadingIndicator(false);
    if (UIManager.elements.container) UIManager.elements.container.style.clipPath = 'none';
}

    function toggleVNEngine() {
        let openingShown = false;
        if (!isEngineActive && isDemoActive) stopUiDemo();
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

                // 카트리지에 stage 모듈이 있으면 시작과 동시에 전체 화면으로 띄운다
                if (StageOverlay.open()) {
                    console.log("VN Engine: 카트리지 무대를 전체 화면으로 열었습니다.");
                }
                // 방 화면이 있으면 거기서 시작한다. 오프닝이 재생되면 대화 화면으로 넘어갔다가 '대화 종료' 로 돌아온다.
                HomeScene.enter();

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

                openingShown = openingScripts.length > 0 && !hasSeen;
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
                clearPauseState();

                stopRealtimeChecker();
                HomeScene.exit();
                StageManager.hide();
                StageOverlay.close(); // 무대를 닫고 크랙 화면 잠금도 푼다
                AudioManager.stopAll(); // 음악도 같이 끔

                // [수정 시작] ---------------
                // 혹시 선택창이 떠 있다면 닫기
                const modal = document.getElementById('vn-opening-select-modal');
                if (modal) modal.remove();
                // [수정 끝] -----------------
            }
        }
        syncRuntimeControls();
        // 카트리지에 알린다. 시작할 때 선택지를 띄우는 카트리지가 이 알림을 듣는다
        try { CartridgeRuntime.announceVN(isEngineActive, openingShown); }
        catch (error) { console.warn('VN Engine: VN 상태를 알리지 못했습니다.', error); }
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
            // 카트리지 모듈에 새 채팅방을 알린다 (채팅방마다 따로 기억하는 카트리지를 위해)
            try { CartridgeRuntime.announceSession(); }
            catch (error) { console.warn('VN Engine: 채팅방이 바뀐 것을 알리지 못했습니다.', error); }

            // [핵심 조건] 엔진이 켜져있고 + 이전 ID도 있었고 + 새 ID도 있는데 + 둘이 다르면? -> 방 이동으로 판단!
            if (isEngineActive && oldId && newId && oldId !== newId) {
                toggleVNEngine();
            }

            setTimeout(() => LibraryManager.checkAutoLoad(), 500);
        }
    }).observe(document.body, { subtree: true, childList: true });

})();
