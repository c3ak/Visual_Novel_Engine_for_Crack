# VN 엔진 카트리지 명세 — AI 작업용

이 문서는 카트리지 제작자가 ChatGPT·Claude 같은 AI에게 **통째로 주고** 카트리지 작업을 맡길 때 쓴다.
사람용 설명은 「VN 엔진 제작자 안내」 페이지에 있다. 이 문서는 AI가 틀리지 않게 규칙만 적는다.

- 기준: **VN 엔진 4.0**, 카트리지 형식 `formatVersion: 1`
- 함께 주면 좋은 것: `vncartridge-v1.schema.json`(manifest 검사용 JSON 스키마), 예제 카트리지 `example-cartridge.vncartridge`(동작하는 예제, §10). 둘 다 제작자 안내 페이지에서 받는다.

---

## 0. AI 작업 규칙

1. **이 문서에 없는 manifest 칸, 조건, 도우미 함수, 메시지 종류를 만들지 않는다.** 엔진은 모르는 칸을 무시하고, 장면(`presentation.scenes`)은 모르는 조건이 하나라도 있으면 그 장면을 통째로 버린다.
2. 정해지지 않은 값은 지어내지 말고 제작자에게 묻는다. 특히 그림 이름, 인물 ID, 핫스팟·방 화면의 `rect` 좌표(그림을 봐야 정할 수 있다), 이야기 문구가 그렇다.
3. `manifest.json` 과 `data/*.json` 은 순수 JSON 이다. 주석, 끝 쉼표, 작은따옴표 문자열을 쓰지 않는다.
4. `engineVersion` 은 `"4.0.0"` 으로 적는다.
5. 결과는 파일 경로마다 **전체 내용**으로 낸다. 일부만 고칠 때는 바꿀 자리와 바뀐 내용을 정확히 보인다.
6. 경로는 패키지 루트 기준, `/` 로 나누고, **대소문자를 가린다.**
7. 이미 저장된 값이 있는 카트리지에서 `id`(카트리지·모듈)를 바꾸지 않는다. 저장소 열쇠라서 바꾸면 플레이어의 저장 값이 사라진다.

---

## 1. 패키지

- `.vncartridge` = ZIP(무압축·압축 모두 된다) 또는 보호 파일. 루트에 `manifest.json`. 파일 이름은 UTF-8(한글 가능).
- 만들기: **스튜디오**(`vn-cartridge-studio.html`, 브라우저로 여는 파일 하나)에서 만들고 고치고 내보낸다. 엔진과 같은 판독기를 써서, 스튜디오에서 내보내지면 엔진도 받는다.
- 스튜디오 위쪽의 **보호**(기본 켬)를 켜고 내보내면 `<id>.vncartridge`(보호 파일, 압축 프로그램으로 열리지 않음)와 `<id>.source.vncartridge`(편집용 원본 ZIP)가 함께 저장된다. 보호 파일은 스튜디오에서 다시 열 수 없다. 편집은 원본으로 한다.
- 보호는 압축 프로그램으로 뜯어보는 것만 막는다. AI 에 보내는 글, 화면에 나온 그림, 실행 중인 모듈 코드는 플레이어가 볼 수 있다. 정말 숨길 값은 `dataFiles` 로 통째로 넘기지 말고 필요한 때 필요한 만큼만 넘기게 짠다.

엔진이 **가져오기를 거부**하는 경우:

- ZIP 이나 보호 파일이 아니거나, 루트에 `manifest.json` 이 없거나, JSON 이 깨짐
- `format` 이 `"vn-engine-cartridge"` 가 아니거나 `formatVersion` 이 `1` 이 아님
- `id` 또는 `name` 이 비어 있음
- `engineVersion` 이 설치된 엔진(4.0.0)보다 높음
- 모듈 `id` 가 없거나 겹침, `enabled` 가 true/false 가 아님
- 모듈의 `entry` · `styles` · `scripts` · `dataFiles` · `images` 가 가리키는 파일이 패키지에 없음
- `styles` · `scripts` 가 문자열 배열이 아니거나, `dataFiles` · `images` 가 객체가 아님
- `dataFiles` 중 `.json` 파일이 깨짐
- `images` 에 그림이 아닌 파일(확장자가 `png` `jpg` `jpeg` `gif` `webp` `avif` `bmp` `svg` 가 아님)

그 밖의 잘못(그림 표, 핫스팟, 장면, 방 화면, 테마, 스킨)은 거부하지 않는다. **그 항목만 버리고** 브라우저 콘솔에 `VN Engine:` 로 시작하는 경고를 남긴다.

---

## 2. manifest 최상위 칸

| 칸 | 형식 | 필수 | 설명 |
| --- | --- | --- | --- |
| `format` | `"vn-engine-cartridge"` | 예 | 고정값 |
| `formatVersion` | `1` | 예 | 고정값 |
| `id` | 문자열 | 예 | 카트리지 고유 ID. 공유 서랍·모듈 저장소의 열쇠 |
| `name` | 문자열 | 예 | 표시 이름 |
| `version` | 문자열 | 예* | 카트리지 버전. 없으면 `1.0.0` |
| `engineVersion` | `"4.0.0"` | 예* | 필요한 엔진 버전. 항상 `"4.0.0"` |
| `storyIds` | 문자열 배열 | 예* | 대상 작품 ID(크랙 주소 `/stories/{ID}` 의 24자리). 적으면 **그 작품 페이지에서만 적용**되고, 그 작품에 들어가면 저절로 적용된다. 여럿이면 하나만 맞아도 된다. 비우면 `[]` 어느 작품에서나 손으로 적용 |
| `author` · `description` | 문자열 | | |
| `coverUrl` | 문자열 | | 서재 카드에 쓰는 표지 그림. 패키지 안 경로(`assets/cover/cover.webp`)나 `https://` 주소. 패키지 안 그림은 설치할 때 따로 저장되어 카트리지를 풀지 않고 보이며, `![이름]` 그림 목록에는 들어가지 않는다. 경로를 적었는데 파일이 없으면 가져오기가 실패한다 |
| `presentation` | 객체 | 예* | §5 |
| `modules` | 배열 | 예* | §8 |
| `assets` | 객체 | 예* | §3.4 (`assets.images`) |
| `hotspots` | 객체 | | §6 |
| `home` | 객체 | | §7 |
| `theme` | 패키지 안 JSON 경로 또는 객체 | | §9 |
| `skin` | CSS 경로 문자열 또는 배열 | | §9 |

\* 엔진은 없어도 받지만 스키마는 요구한다. 항상 적는다.

---

## 3. 그림

### 3.1 색인과 이름

- 패키지 안의 `png` `jpg` `jpeg` `gif` `webp` `avif` `bmp` `svg` 파일은 **manifest 에 적지 않아도 모두 색인**된다.
- 호출 이름 = **확장자를 뗀 파일 이름**. `assets/c/mira01.webp` → `mira01`.
- 이름 비교는 앞뒤 공백을 지우고 영문을 소문자로 바꾼 뒤 **정확히 일치**해야 한다. 부분 일치는 없다.
- 폴더가 달라도 이름이 같으면 경로 정렬상 먼저인 하나만 남는다. 이름을 겹치지 않게 짓는다.

### 3.2 배경 / 인물 판정 (위에서부터 처음 맞는 것)

1. `assets.images` 항목의 `kind`(`background` · `character`)
2. 파일 이름이 `bg_` 로 시작 → 배경
3. 경로에 `/g/` → 배경 (플레이어 설정 `URL 패턴`으로 바뀔 수 있다)
4. 경로에 `/c/` → 인물 (설정으로 바뀔 수 있다)
5. 그 밖 → 인물

배경은 `bg_` 접두사를 붙이는 것이 가장 안전하다.

### 3.3 인물 ID

같은 인물 ID 의 그림은 새 인물을 세우지 않고 **표정만 바꾼다.**

- `assets.images` 의 `characterId` 가 있으면 그것.
- 없으면 이름에 정규식 `^([a-zA-Z_]+[a-zA-Z])([0-9_].*)?$`, 안 맞으면 `^([a-zA-Z]+)([0-9_].*)?$` 를 대어 첫 무리. 둘 다 안 맞으면 이름 전체.

| 그림 이름 | 인물 ID |
| --- | --- |
| `mira01` `mira02` | `mira` |
| `k22` | `k` |
| `mira_01` | `mira` |
| `mira_smile` | `mira_smile` (번호가 없으니 그대로) |
| `미라01` | `미라01` (영문이 아니면 장마다 다른 인물이 된다) |

### 3.4 이미지 표 `assets.images`

```json
"assets": {
  "images": {
    "찻집": "assets/g/bg_teahouse.webp",
    "미라": { "path": "assets/c/mira01.webp", "kind": "character", "characterId": "mira" },
    "k22": "https://cdn.example.com/h/k22.webp",
    "골목": { "url": "https://cdn.example.com/x7Kp2.png", "kind": "background" }
  }
}
```

- 키 = 호출 이름. 값 = 문자열(경로·주소) 또는 `{ path | url, kind?, characterId? }`.
- 값이 `https://` · `http://` · `//` · `data:image/` 로 시작하면 외부 주소. 그 밖의 `이름:` 형태(`javascript:`, `file:` 등)는 버린다. 나머지는 패키지 안 경로이고, 파일이 없으면 경고 후 파일 색인으로 넘어간다.
- **표가 파일 색인보다 우선한다.**
- 외부 주소에도 §3.2·§3.3 규칙이 그대로 걸린다. `/g/` 가 없는 배경 주소에는 `"kind": "background"`, 파일 이름이 임의 문자열인 인물 주소에는 `characterId` 를 반드시 적는다.
- 인물로 판정되는 항목의 **키는 화자 이름**으로도 쓰인다. 대사 `"**미라** | …"` 가 나오면 인물 `mira` 를 밝게, 나머지를 어둡게 한다.

### 3.5 화면에서의 동작

- 인물 그림의 **가로 ÷ 세로가 1.2 보다 크면** 스탠딩이 아니라 화면 전체를 덮는 이벤트 CG 로 뜬다(멀티 캐릭터 모드). CG 는 그 인물 ID 에 묶여, 같은 인물의 세로 그림이 오거나 그 인물이 퇴장하면 내려간다.
- 장면 경계(§4)에서, 새 장면에 그림이 나오지 않는 인물은 퇴장한다.
- `![인물ID](off)` 로 직접 퇴장시킨다. 괄호 앞은 **인물 ID** 이고 `[a-zA-Z0-9_]+` 만 된다. 한글을 쓰면 퇴장이 아니라 지문 글자로 찍힌다.

### 3.6 크기

`.vncartridge` 는 무압축이라 그림 크기가 그대로 패키지 크기다. 인물은 높이 1100px, 배경은 폭 1920px 의 WebP(품질 82~85)를 권한다. 큰 그림은 외부 주소(§3.4)로 빼도 된다.

---

## 4. 스크립트 문법

오프닝·장면의 `content` 와 AI 응답이 같은 규칙으로 해석된다. 한 줄씩, 앞뒤 공백을 지우고, **위에서부터 처음 맞는 규칙**을 쓴다.

| 순서 | 줄 모양 | 뜻 |
| --- | --- | --- |
| 1 | ```` ``` ```` 로 시작 | 상태창 블록을 열고 닫는다. 블록 안은 상태창 |
| 2 | 빈 줄, `[//]: #` 로 시작 | 건너뜀. `[//]: # (표식)` 은 화면에 안 나오는 숨은 줄 |
| 3 | `![screen](…)` `![화면](…)` `![music](wait)` `![음악](기다림)` | 연출 줄 (§4.1). 잘못 적으면 건너뛴다 |
| 4 | `![이름]`, `![이름]()`, `![설명](경로나 주소)` | 그림. 괄호 안의 마지막 조각 → 대괄호 안 이름 순으로 찾는다 |
| 5 | `![인물ID](off)` | 퇴장 |
| 6 | `---` `***` `___` `===` (3자 이상) | 장면 경계. 글자로 찍지 않는다 |
| 7 | `"**이름** \| 대사"` (`｜` 도 됨, 따옴표는 생략 가능) | 대사 |
| 8 | `*글*` | 지문 |
| 9 | 그 밖 | 지문 |

### 4.1 연출 줄

오프닝 · 장면 · `playScript` 대본 어디에나 쓴다. AI 응답에 있어도 똑같이 작동한다.

| 줄 | 뜻 |
| --- | --- |
| `![screen](white 35% 3s)` | 화면을 흰색 35% 로 3초에 걸쳐 덮는다. **기다리지 않고** 다음 줄로 간다 |
| `![screen](white 1.8s wait 2.9s)` | 진하기를 안 적으면 100%. 덮기 시작하고 **2.9초 뒤** 다음 줄. 기다리는 동안 대사창을 숨기고 누름을 무시한다 |
| `![screen](clear 3.2s wait)` | 걷어 낸다. `wait` 뒤에 시간이 없으면 덮는 시간(3.2초)만큼 기다린다 |
| `![music](wait)` | 지금 울리는 곡이 끝날 때까지 그 줄에 머문다. 반복 곡이거나 아무것도 안 울리면 바로 넘어간다 |

- 낱말: 색 `white` `black` `#rgb` `#rrggbb` · `clear` · 진하기 `35%` 또는 `0.35` · 시간 `3s` `3초` `500ms`(60초까지) · `wait`. 한글 `흰색` `검은색` `걷기` `기다림`, `![화면](…)` `![음악](기다림)` 도 된다.
- 색이나 `clear` 가 없거나, 모르는 낱말이 있거나, `wait` 뒤에 시간 아닌 것이 오면 그 줄은 건너뛴다(콘솔 경고).
- 덮개는 배경·인물·CG 위, 대사창 아래. 투명한 데서 시작하면 색은 바로 정하고 진하기만 바뀐다. 덮인 데서 다른 색을 주면 색이 천천히 바뀐다.
- 흰빛 너머로 배경 바꾸기: `![screen](white 1.8s wait 2.9s)` → `![새배경]` → `![screen](clear 3.2s wait 1.6s)`. `wait` 시간이 덮는 시간보다 짧으면 바뀌는 순간이 보인다.
- AI 응답 · 오프닝 · 화면 시험이 시작되면 덮개는 걷힌다. `playScript` 대본끼리는 이어진다(§8.4).
- `screen` `화면` `music` `음악` 은 괄호와 함께 쓰면 연출 줄이 되므로 그림 이름으로 쓰지 않는다.

상태창 블록 형식:

```text
T-1｜2025년 05월 15일｜목요일｜15:20｜오후｜🌤️｜찻집 - 카운터
[소지품｜12 금화, 녹슨 열쇠]
[관계]
미라 - 호감도 38
```

첫 줄은 `｜` 로 나눈 `T-n · 날짜 · 요일 · 시각 · 시간대 · 날씨 · 위치`. 이어지는 `[항목｜값]` 이나 `[항목]` + 다음 줄들이 `sections` 가 된다(§8.4).

---

## 5. `presentation`

### 5.1 `opening` — VN 시작 때 재생

```json
"opening": [ { "title": "도착", "content": "![bg_teahouse]\n![mira01]\n*문이 열렸다.*" } ]
```

- `content` 는 **문자열만** 된다. 줄 배열을 주면 엔진이 오류를 내고 카트리지 적용이 멈출 수 있다. 비어 있는 항목은 버린다.
- 채팅방마다 한 번 재생한다. 두 개 이상이면 시작할 때 고르는 창이 뜬다.

### 5.2 `scenes` — 이야기 도중 조건이 맞으면 끼워 넣는 장면

```json
"scenes": [
  {
    "id": "old-letter",
    "title": "오래된 편지",
    "when": { "text": "편지", "in": ["dialogue", "narration"] },
    "repeat": "once",
    "tellAi": "카운터 밑에서 누렇게 바랜 편지를 발견했다.",
    "content": ["*봉투 하나가 미끄러져 나왔다.*", "![mira02]"]
  }
]
```

| 칸 | 형식 | 필수 | 뜻 |
| --- | --- | --- | --- |
| `id` | 문자열 | 예 | 카트리지 안에서 겹치면 안 된다. 한 번 튼 기록의 열쇠 |
| `title` | 문자열 | | 콘솔 기록·AI 알림 제목. 없으면 `id` |
| `when` | 객체 | 예 | 조건. **적은 것이 모두 맞아야** 튼다 |
| `repeat` | `"once"` \| `"every"` | | `once` 채팅방마다 한 번(기본), `every` 맞을 때마다 |
| `play` | `"after"` | | 글자 조건이 있어도 응답이 끝난 뒤에 튼다 |
| `tellAi` | 문자열 또는 `{ "title", "text" }` | | 장면을 틀 때 다음 메시지에 붙일 글. 없으면 AI 는 장면을 모른다 |
| `content` | 문자열 또는 줄 배열 | 예 | §4 문법의 스크립트 |

`when` 에 쓸 수 있는 조건 (이 밖의 이름은 **장면을 버린다**):

| 조건 | 값 | 맞는 때 |
| --- | --- | --- |
| `text` | 문자열 또는 배열 | 응답 원문에 그 글자가 있으면(배열이면 하나라도). 대소문자만 무시 |
| `in` | `all` `dialogue` `narration` `status` `hidden` 중 하나 또는 배열 | `text` 를 찾을 범위. `text` 와 함께만. 기본 `all` |
| `date` | `{ "on": "2025년 05월 15일" }` 또는 `{ "from": "…" }` | 상태창 날짜가 정확히 그날 / 그날이거나 그 뒤 |
| `location` · `weather` | 문자열 또는 배열 | 상태창 값에 그 글자가 들어 있으면 |
| `time` · `dayPeriod` · `weekday` | 문자열 또는 배열 | 상태창 값과 같으면 |
| `section` | `{ "소지품": "열쇠" }` (값은 문자열 또는 배열) | 상태창 그 항목에 그 글자가 있으면 |

- `in` 의 범위: `dialogue` 대사 줄, `narration` 지문(`*…*` 과 그 밖 평문), `status` 상태창 블록 안, `hidden` `[//]: #` 줄. `all` 은 그림 줄·구분선까지 포함한 전부.
- 날짜는 `년` `월` `일` 이 있는 형식이어야 한다. `0` 은 붙여도 안 붙여도 같다.
- 상태창 조건은 **그 응답의 상태창**을 본다. 응답에 상태창이 없으면 지금 화면에 걸린 값을 쓴다.

트는 자리와 순서:

- 글자 조건이 있으면 그 글자가 처음 나오는 줄 바로 뒤. 그 줄이 상태창 안이면 상태창 블록이 닫힌 뒤.
- 글자 조건이 없거나 `play: "after"` 면 응답이 끝난 뒤.
- 한 응답에서 여러 장면이 맞으면 나온 자리 순서대로, 같은 자리면 배열 순서대로 모두 튼다.
- 장면이 끝나면 그대로 이어간다. 장면이 배경을 바꾸면 그전 인물은 §3.5 규칙대로 퇴장한다.
- 같은 응답이 다시 재생되면(재생성·삭제 뒤) 한 번짜리 장면도 다시 보이지만, 기록과 `tellAi` 는 다시 하지 않는다.
- 오프닝과 UI 테스트 장면은 조건을 보지 않는다.

엔진이 장면을 버리는 경우: `id` 없음·겹침, `content` 비어 있음, `repeat` 가 `once`/`every` 가 아님, `play` 가 `after` 가 아님, `when` 이 없거나 비었거나 모르는 조건이 있음, `in` 만 있고 `text` 가 없음, `in` 값이 목록 밖, `date` 가 `{on}`/`{from}` 꼴이 아니거나 날짜 형식이 틀림, `section` 이 객체가 아니거나 빈 값.

### 5.3 `animations` · `bgm`

```json
"animations": [ { "trigger": "angry", "animation": "shake-horizontal" } ],
"bgm": [
  { "trigger": "bg_teahouse", "audioUrl": "https://cdn.example.com/teahouse.mp3" },
  { "trigger": "mira_dream", "audioUrl": "assets/audio/dream.mp3", "loop": false }
]
```

- 그림 이름에 `trigger` 글자가 **들어 있으면** 맞는다. BGM 은 배경 그림과 인물·CG 그림 모두에 걸린다.
- `animation`: `shake-vertical` `shake-horizontal` `flash` `bounce` `vibrate` `fall-left`. 인물이 나올 때 걸린다.
- `audioUrl` 은 외부 주소, 또는 **패키지 안 소리 파일 경로**(`assets/audio/x.mp3`). mp3 · ogg · wav · m4a · aac.
- `loop: false` 면 한 번만 튼다. 없으면 반복. 같은 곡이 울리는 중이면 처음부터 다시 틀지 않는다.
- 카트리지를 적용하면 플레이어 설정의 애니메이션·BGM 규칙이 카트리지 것으로 바뀐다.
- 그림이 아니라 일이 일어난 때(도착 등) 틀고 싶으면 모듈에서 `VNCartridge.playMusic` (§8.4).

---

## 6. `hotspots` — 배경 위 누르는 자리

```json
"hotspots": {
  "reveal": "hidden",
  "areas": {
    "bg_teahouse": [
      { "id": "menu-board", "rect": [0.06, 0.12, 0.2, 0.36], "image": "menu_board", "label": "오늘의 메뉴판",
        "tellAi": { "title": "메뉴판", "text": "벽에 걸린 메뉴판을 들여다봤다." } }
    ],
    "bg_cellar": [
      { "id": "old-chest", "rect": [0.455, 0.11, 0.09, 0.52], "label": "낡은 상자" }
    ]
  }
}
```

- `areas` 의 키 = **배경 그림의 호출 이름**. 그 배경이 떠 있을 때만 자리가 생긴다. 같은 그림을 다른 이름으로 돌려 쓰면 그 이름으로 따로 적는다.
- `rect` = 배경 그림 기준 `[왼쪽, 위, 너비, 높이]`, 0~1 비율, 숫자 4개, 너비·높이 > 0. 틀리면 그 자리를 버린다. 배경이 화면에 잘려 보여도 엔진이 맞춘다.
- `image` = 눌렀을 때 띄울 그림 이름. `assets/view/` 같은 별도 폴더에 둔다. 없으면 「그림이 아직 없습니다」 가 뜬다.
- `label` = 그림 창 아래 이름표(120자까지). `id` 가 없으면 `image`, 그것도 없으면 `hotspot`.
- `reveal`: `always` 은은한 테두리 / `hover` 마우스를 올리면 테두리 / `hidden` 표시 없음(손 모양 커서도 없음). 최상위 값이 기본이고 자리마다 덮어쓸 수 있다.
- `tellAi`: 누를 때 다음 메시지에 붙일 글. 같은 자리를 여러 번 눌러도 한 번만 쌓인다.
- **누르면 엔진은 알리기만 한다**: 그 카트리지의 모듈들(상시 모듈 + 열려 있는 화면)에 `hotspot` 신호 `{ id, background, label }` 를 보낸다. `image` 가 있으면 그림 창도 띄우고, `tellAi` 가 있으면 대기열에 넣는다. 그 밖에 **무엇을 할지(얻기, 화면 열기, 메뉴에 보이기 등)는 카트리지 코드**가 정한다. manifest 에 할 일을 적는 칸은 없다.
- 늘 받아야 하는 처리는 **상시 모듈**에 둔다. 화면 모듈은 열려 있을 때만 신호를 받는다.
- 인물이 앞에 서 있으면 그 부분은 눌리지 않는다.

```js
// 상시 모듈: 낡은 상자를 누르면 일기장을 얻고, 메뉴에 보이고, 펼친다 (일기장 화면은 manifest 에서 "menu": false)
VNCartridge.on('hotspot', function (spot) {
  if (spot.id !== 'old-chest') return;
  VNCartridge.shared.patch({ 일기장: true });
  VNCartridge.menu.show('diary-view');
  VNCartridge.openView('diary-view');
});
```

- 한 모듈이 보낸 부탁은 보낸 순서대로 처리된다. 위 예에서 일기장 화면이 열릴 때는 이미 `일기장: true` 가 공유 서랍에 있다.

---

## 7. `home` — 방 화면

```json
"home": {
  "background": "bg_room",
  "endLabel": "대화 종료",
  "characters": [
    {
      "id": "friend", "name": "친구", "image": "home_friend",
      "rect": [0.33, 0.36, 0.09, 0.5], "standing": "friend01",
      "choices": [
        { "id": "talk", "label": "대화하기", "action": "talk", "line": "{name}에게 말을 걸었다.", "tellAi": "{name}에게 말을 걸었다." },
        { "id": "gift", "label": "선물하기", "action": "message", "text": "아직 준비 중입니다." }
      ]
    }
  ]
}
```

- `background` 와 `module` 이 둘 다 없으면 방 화면을 쓰지 않는다. `background` 는 배경 판정을 받는 그림 이름이어야 한다.
- `endLabel` 20자까지, 기본 `대화 종료`.
- 캐릭터: 그림 방 화면에서는 `rect` 필수(§6 과 같은 규칙). `id` 기본 `character-N`, `name` 40자·기본 `id`, `image` 방 화면 그림, `standing` 대화 화면 스탠딩.
- 선택지: `label`(40자)과 `action`(`talk` 또는 `message`)이 없으면 버린다. `line` 500자, `tellAi` 2000자, `text` 200자. `{name}` 은 캐릭터 이름으로 바뀐다.
- 방 화면에서 새 AI 응답이 오면 대화 화면으로 넘어가 재생한다.

### 7.1 모듈 방 화면 `home.module`

그림 대신 모듈이 방 화면을 직접 그린다. 걸어 다니는 맵처럼 조작이 필요한 화면에 쓴다.

```json
"home": {
  "module": "town-map",
  "endLabel": "마을로",
  "characters": [
    { "id": "neighbor", "name": "리나",
      "choices": [ { "id": "talk", "label": "대화하기", "action": "talk", "line": "{name}에게 말을 걸었다.", "tellAi": "{name}에게 말을 걸었다." } ] }
  ]
}
```

- `module` 은 **켜져 있는 `view` 모듈**의 ID. 무대(`config.stage: true`)는 안 된다. 못 찾으면 콘솔 경고 후 무시한다.
- 이 모듈은 메뉴 탭에 나오지 않는다. 방 화면 자리(대화창·스탠딩 아래, 상단 정보 바·메뉴 버튼 아래)에 화면 가득 뜬다.
- `background` 는 생략한다. 캐릭터의 `rect` · `image` 도 생략한다(모듈이 인물을 그린다). `rect` 를 적으면 그 자리에 그림 버튼이 덧붙는다.
- 모듈이 `VNCartridge.talkTo(캐릭터 id, 선택지 id?)` 를 부르면 그 선택지를 고른 것과 같다(§8.4). 선택지 id 를 빼면 첫 `talk` 선택지.
- 대화하는 동안 모듈 액자는 **지우지 않고 대사창 뒤에 배경으로 깔린다.** 조작은 막히고 `home` 채널로 `{ active: false }` 가 온다. `endLabel` 버튼으로 돌아오면 `{ active: true }` 가 오고 하던 자리 그대로 이어진다.
- 대화 중 AI 응답이 배경 그림을 가져오면 모듈 배경을 걷고 그 그림을 띄운다. 다음 응답이 배경 없이 와도 다시 깔지 않는다(돌아오면 다시 보인다).
- VN 을 끄거나 카트리지를 바꾸면 액자를 버린다. 다시 켜면 새로 연다 — 이어 하려면 모듈이 `VNCartridge.state` 에 저장해 둔다. 액자가 사라질 때(`pagehide`) 보낸 마지막 `state.replace` 도 받는다.
- 키보드는 액자에 초점이 있을 때만 모듈에 닿는다. 엔진은 방 화면에 들어올 때 액자에 초점을 준다. 자판 위치는 `event.code`(`KeyW`)로 읽어야 한글 입력 상태에서도 된다.

---

## 8. 모듈

### 8.1 정의

```json
{
  "id": "ledger-view",
  "type": "view",
  "title": "장부",
  "enabled": true,
  "version": 1,
  "entry": "modules/ledger-view/index.html",
  "styles": ["modules/ledger-view/styles.css"],
  "scripts": ["modules/ledger-view/index.js"],
  "dataFiles": { "menu": "data/menu.json" },
  "images": { "stamp": "assets/ui/stamp.png" },
  "config": {},
  "command": { "token": "\\장부" }
}
```

| 칸 | 뜻 |
| --- | --- |
| `id` | 모듈 ID. 카트리지 안에서 유일. 모듈 저장소의 열쇠 |
| `type` | `view` 화면 · `service` 상시. 그 밖의 값은 엔진이 띄우지 않는다 |
| `title` | 메뉴 탭 이름 |
| `enabled` | `true` 여야 뜬다 |
| `version` | 1 이상의 정수 |
| `entry` | 모듈 HTML |
| `styles` · `scripts` | CSS · JS 경로 배열. 적은 순서대로 넣는다 |
| `dataFiles` | `{ 이름: 경로 }`. `.json` 은 파싱한 값, 그 밖은 글자로 `VNCartridge.context.data.이름` 에 들어간다 |
| `images` | `{ 이름: 그림 경로 }`. 엔진이 `data:` 주소로 바꿔 `VNCartridge.images.이름` 에 넣는다. `VNCartridge.loadImage(이름)` 로 `<img>` 를 받는다. 여기 적은 그림은 `![이름]` 색인에서 빠진다. 화면 문서에 통째로 들어가므로 모듈마다 합계 4MB 를 넘기지 않는다 |
| `config` | 자유 설정. `VNCartridge.context.module.config` 로 읽는다. `"stage": true` 면 무대 |
| `command` | `{ "token": "\\장부" }` 또는 배열. §8.6 |
| `menu` | `false` 면 처음엔 메뉴에서 숨긴다. 모듈이 `VNCartridge.menu.show/hide` 로 바꾸면 엔진이 이야기마다 기억한다. 숨은 동안 `command` 토큰도 듣지 않는다. `openView` 로는 숨어 있어도 열린다 |

### 8.2 종류

| 종류 | 조건 | 동작 |
| --- | --- | --- |
| 화면 | `type: "view"` | 메뉴에서 열 때만 존재. 닫으면 코드가 멈춘다 |
| 상시 | `type: "service"` | 카트리지가 켜진 동안 늘 돈다. 화면 없음, 메뉴에 없음 |
| 무대 | `type: "view"` + `config.stage: true` | `VN 시작` 과 동시에 전체 화면. 메뉴 탭에 없음. 여럿이면 첫 번째만 |
| 방 화면 | `type: "view"` + `home.module` 이 이 ID | 방 화면 자리에 뜬다. 메뉴 탭에 없음. 대화 중에는 대사창 뒤에 깔린다 (§7.1) |

규칙과 상태는 상시 모듈이 들고, 화면 모듈은 공유 서랍에서 읽어 그리게 한다.

엔진은 **일이 일어났다고 알리고**(`on` 채널: `status` · `hotspot` …) **엔진만 할 수 있는 일을 해 줄 뿐**이다(명령: `openView` · `menu.show/hide` · `showImage` · `tellAi` …). 그 사이의 규칙(무엇을 얻고, 언제 무엇을 여는지)은 모두 카트리지 코드에 둔다. 새 기능을 위해 manifest 칸을 지어내지 않는다.

### 8.3 모듈 문서와 실행 환경

- 엔진은 `entry` HTML 의 `<head>` 바로 뒤에 `window.VNCartridgeContext`, `window.VNCartridge` 도우미, `styles`(인라인 `<style>`)를 넣고, `scripts` 는 `</body>` 바로 앞에 인라인으로 넣는다. `entry` 에 `<script src>` 로 패키지 파일을 걸지 말고 `scripts` 에 적는다.
- 화면 모듈(메뉴 창·무대·방 화면)은 `<iframe sandbox="allow-scripts allow-pointer-lock">`, 상시 모듈은 `<iframe sandbox="allow-scripts">` 안에서 돈다(둘 다 출처가 없는 격리 액자). 그래서:
  - 크랙 페이지나 엔진 화면(`window.parent.document`)에 닿을 수 없다.
  - `localStorage` · 쿠키 · IndexedDB 를 쓸 수 없다. 저장은 `VNCartridge.state` 와 `VNCartridge.shared` 로 한다.
  - 패키지 그림을 `<img src="assets/…">` 로 띄울 수 없다. 모듈의 `images` 에 적고 `VNCartridge.loadImage(이름)` 로 받는다. `data:` 그림은 캔버스에 그린 뒤 `getImageData` 로 픽셀을 읽어도 된다.
- 화면 모듈은 마우스 고정(`요소.requestPointerLock()`)을 쓸 수 있다. 1인칭 시점처럼 마우스를 움직인 양(`event.movementX`·`movementY`)만큼 돌릴 때 쓴다.
  - 사용자가 화면을 누른 `mousedown`·`click` 처리 안에서 요청해야 걸린다. 화면을 연 직후 코드로 요청하면 거부된다.
  - `Esc` 를 누르면 브라우저가 푼다. `document` 의 `pointerlockchange` 에서 `document.pointerLockElement` 로 풀렸는지 보고 게임을 멈춘다.
  - 브라우저가 거부하면 `pointerlockerror` 가 온다. 커서 위치로 하는 대체 조작을 함께 둔다.
- `requestAnimationFrame` 은 숨은 탭에서 멈춘다. 게임 시계는 프레임 사이 경과 시간을 상한(예: 0.05초)으로 잘라 쓴다.
- 상시 모듈은 보이지 않는 곳에서 돌아 타이머가 느려질 수 있다. 시간 계산은 `Date.now()` 경과로 한다.

`VNCartridgeContext` 모양:

```js
{
  cartridge: { id, name, version },
  module: { id, title, version, config },
  data: { /* dataFiles 이름: 값 */ },
  images: { /* images 이름: 'data:image/png;base64,…' */ },
  runtime: {
    state: {},            // 이 모듈의 저장 값 (연 순간)
    shared: {},           // 공유 서랍 (연 순간)
    status: { environment: {...}, sections: {...}, rawText: '' },
    ai: { generating: false, reason: 'idle', lastArrivedAt: 0 },
    home: { active: true } // 방 화면 모듈일 때만 있다
  }
}
```

### 8.4 도우미 `window.VNCartridge`

| 호출 | 설명 |
| --- | --- |
| `context` | 위 `VNCartridgeContext` |
| `status` | 최신 상태창. `{ environment: { date, weekday, time, dayPeriod, weather, location }, sections: { 항목이름: 문자열[] }, rawText }`. 값이 없으면 `'—'` |
| `ai` | `{ generating, reason, lastArrivedAt }`. `reason` 은 `'generating'` `'arrived'` `'idle'` |
| `shared.all` · `shared.get(key)` | 공유 서랍 전체 · 한 항목 |
| `shared.patch(object)` | 최상위 항목 단위로 덮어쓴다. 값이 `null` 이면 그 항목을 지운다 |
| `shared.refresh()` | 지금 값을 다시 받아 `shared` 채널로 알린다 |
| `state.all` | 이 모듈의 저장 값. **창을 연 순간의 값**이고 `replace` 뒤에도 바뀌지 않는다. 모듈이 사본을 들고 있어야 한다 |
| `state.replace(object)` | 이 모듈의 저장 값을 통째로 바꾼다. 일반 객체만(배열·원시값은 `{}` 로 저장) |
| `emit(type, payload)` | 같은 카트리지의 **열려 있는 다른** 액자(상시 모듈 포함)에 쪽지. 보낸 액자에는 안 온다. `payload` 는 JSON 으로 옮길 수 있어야 한다 |
| `tellAi(title, text, { id, replace })` | AI 문맥 대기열에 넣는다. §8.5 |
| `withdrawAi(id)` | 대기열에서 그 `id` 를 걷어낸다. 같은 카트리지면 다른 모듈이 넣은 것도 걷는다 |
| `commitChat({ keepOpen })` | 입력창 명령으로 보류한 글을 지금 보낸다. 보류한 글이 없으면 아무 일도 없다. `keepOpen` 이 없으면 엔진이 창을 닫는다 |
| `close()` | 자기 화면 창을 닫는다 |
| `openView(moduleId, { fullscreen })` | 이 카트리지의 화면 모듈을 연다. 메뉴에서 숨긴 화면도 열린다. 상시 모듈도 부를 수 있다. `fullscreen: true` 면 머리줄(제목 · ×) 없이 화면 전체에 띄운다. 바깥 누르기로 닫히지 않으니 모듈이 `close()` 로 닫는다 (Esc 는 닫힌다). 엔진은 닫혔다고 알리지 않는다 |
| `menu.show(moduleId)` · `menu.hide(moduleId)` | 메뉴에 그 화면을 보이기·숨기기. 엔진이 이야기(채팅)마다 기억한다. 숨은 동안 그 화면의 `command` 토큰도 듣지 않는다 |
| `showImage(name, label?)` | 그림 창을 띄운다. 핫스팟 `image` 와 같은 창, `name` 은 `![이름]` 으로 부르는 그림 이름 |
| `playMusic(source, { loop })` · `stopMusic()` | 음악을 튼다 · 끈다. `source` 는 패키지 안 소리 파일 경로(`assets/audio/x.mp3`)나 외부 주소. `loop: false` 면 한 번만. BGM 규칙과 같은 재생기라 다른 곡이 오면 바뀐다 |
| `images` | 모듈 `images` 의 `{ 이름: data: 주소 }` |
| `loadImage(name)` | 그 그림을 불러 `Promise<HTMLImageElement>`. 없거나 못 읽으면 거부 |
| `home` | 방 화면 모듈이면 `{ active }`. `false` 면 대사창 뒤에 깔린 중 — 시계·조작을 멈춘다 |
| `talkTo(characterId, choiceId?)` | 방 화면 모듈에서 `home.characters` 의 인물과 대화를 건다. `Promise<{ ok, reason }>`. 방 화면 모듈이 아니거나 방 화면이 아닐 때·인물이 없을 때 `ok: false`, 3초 안에 답이 없으면 `reason: 'timeout'`(엔진 밖 미리보기) |
| `playScript(lines, { id })` | VN 화면에서 대본을 오프닝처럼 튼다. `lines` 는 §4 문법의 줄 배열이나 글 하나. `Promise<{ ok, state, reason }>`: 마지막 줄을 넘기면 `ok: true, state: 'finished'`. 그 밖은 `ok: false` 와 `state` = `interrupted`(다른 대본·AI 응답이 끼어듦) · `stopped`(VN 을 끔) · `refused`(VN 꺼짐 · 빈 대본). 대화 기록에도 AI 에게도 안 간다. 열린 모듈 창은 엔진이 닫고, `command` 로 보류한 글은 그대로 두었다가 `commitChat()` 때 나간다(끊기면 입력창에 돌려준다) |
| `choose(options, { placeholder })` | VN 화면에 선택지를 띄운다. `options` 는 글 배열 또는 `{ text, input, placeholder }` 배열(8개까지). `Promise<{ ok, index, text, reason }>`. `input: true` 인 보기는 글 적는 칸을 열고 적은 글이 `text`. VN 을 끄거나 새 대본·응답이 오면 `ok: false`. 엔진은 고른 것을 저장하지 않는다 |
| `session` | `{ id }` 지금 채팅방 ID. 주소 끝의 24자리(작품 채팅이면 에피소드). 못 읽으면 `null`. 채팅방을 옮기면 바뀐다 |
| `vn` | `{ active, opening }` VN 이 켜져 있는지, 켤 때 오프닝을 틀었는지 |
| `sendChat(text)` | 크랙에 대화를 보낸다. 플레이어가 대화 입력으로 보낸 것과 같고 `tellAi` 대기열도 함께 나간다. 명령 토큰은 보지 않는다. `Promise<{ ok, reason }>`: `inactive` · `empty` · `too-long`(16,000자) · `busy` · `failed`. 경고창은 띄우지 않으니 실패 처리는 모듈이 한다 |
| `on(channel, fn)` | 구독. 해제 함수를 돌려준다 |

`on` 채널과 처리 함수의 인자:

| 채널 | 인자 | 오는 때 |
| --- | --- | --- |
| `shared` | `(state, from)` | 다른 모듈이 서랍을 고쳤을 때(`from` = 그 모듈 ID), 내가 `patch` 한 뒤(`from` = null), `refresh()` 뒤 |
| `event` | `({ type, payload }, from)` | 다른 액자가 `emit` 했을 때 |
| `status` | `(status)` | AI 응답이 와서 상태창이 바뀌었을 때 |
| `ai` | `(activity)` | AI 가 쓰기 시작·도착·멈춤 |
| `home` | `({ active })` | 방 화면 모듈: 대화 화면으로 넘어갈 때 `false`, 방 화면으로 돌아올 때 `true` |
| `hotspot` | `({ id, background, label })` | 배경 위 자리를 눌렀을 때. 상시 모듈과 그때 열려 있는 화면에 온다. 늘 받아야 하면 상시 모듈에서 받는다 (§6) |
| `script` | `({ id, state, reason })` | `playScript` 대본이 끝났을 때. 같은 카트리지의 모든 액자에 온다 |
| `vn` | `({ active, opening })` | VN 을 켜거나 껐을 때. 시작할 때 무언가를 띄우려면 상시 모듈에서 `active: true` 를 받는다. 오프닝을 튼 뒤면 `opening: true` |
| `session` | `({ id })` | 채팅방(주소)이 바뀌었을 때. 공유 서랍도 새 범위의 값으로 바뀌어 `shared` 채널이 먼저 온다 |

엔진에 부탁하는 명령(`openView`, `menu.show/hide`, `showImage`, `playMusic`, `stopMusic`, `playScript`, `choose`)은 **지금 켜진 카트리지의 모듈**만 보낼 수 있고, 그 카트리지의 화면과 그림에만 작동한다. 결과는 `view:opened` · `menu:updated` · `image:shown` 메시지의 `ok` 로, `playScript` · `choose` 는 돌려받는 Promise 로 온다.

여러 대본을 이어 트는 일(음악 기다리기 · 선택지 갈래 · 끝나면 AI 알림)은 **상시 모듈**에서 한다. `playScript` 가 시작되면 화면 모듈 창은 닫히므로 거기서 부르면 결과를 받을 수 없다. 화면 모듈은 `emit` 으로 상시 모듈에 알린다.

무대 모듈 닫기는 도우미에 없다. `window.parent.postMessage({ source: 'vn-cartridge', type: 'stage:close' }, '*')` 를 보낸다.

오류 응답이 필요하면 `window.addEventListener('message', …)` 에서 `event.data.source === 'vn-engine'` 인 것 중 `module-state:error` `shared-state:error` `module-event:error` `ai-context:error` 를 본다(`message` 칸에 까닭).

### 8.5 한도와 저장 범위

| 항목 | 한도 |
| --- | --- |
| 공유 서랍 전체 (JSON) | 250,000자 |
| 모듈 저장 값 (JSON) | 250,000자 |
| `tellAi` 글 하나 | 비어 있으면 안 됨, 16,000자 |
| 대기열 | 50개. 넘으면 오래된 것부터 빠진다 |

- 저장 값은 **작품(채팅 대상) × 카트리지 ID**(모듈 저장은 × 모듈 ID)마다 따로 보관된다. 주소에 작품 ID 가 있으면 같은 작품의 채팅방끼리 같은 값을 본다.
- 채팅방마다 따로 기억할 것은 `session.id` 를 열쇠로 공유 서랍 안에 나눠 적는다 (예: `{ "장소": [채팅방 ID, …] }`). 브라우저 저장소라 기기·브라우저마다 따로다.
- `tellAi` 글은 플레이어가 다음에 보내는 메시지 뒤에 붙어 나가고, 보낸 뒤 지워진다. 같은 `id` 를 `replace` 없이 다시 넣으면 처음 것이 남는다. 계속 바뀌는 알림은 `{ id, replace: true }` 로 하나만 남긴다. `id` 는 모듈마다 따로 센다.
- 플레이어는 메뉴를 연 채 `L` 키를 0.7초 안에 5번 눌러 실제로 붙어 나갈 글을 볼 수 있다.

### 8.6 입력창 명령 `command`

- `token` 이 든 메시지는 바로 나가지 않고 그 모듈이 먼저 열린다. 토큰은 문장 어디에 있어도 되고, 보낼 때 떼어낸다.
- 모듈이 일을 마치면 `commitChat()` 을 부른다. 그때 보류한 글과 대기열 글이 함께 나간다.
- 모듈이 아무것도 하지 않고 닫히면 글을 입력창에 돌려준다.

### 8.7 값의 주인

AI 가 상태창에 쓰는 값(위치, 시각, 돈, 호감도 등)은 **모듈이 읽기만** 한다. 모듈이 맡는 값은 모듈만 고친다. 같은 값을 둘이 고치면 어긋난다. 모듈이 무언가를 바꿨으면 `tellAi` 로 AI 에게 알려 상태창에 반영되게 한다.

---

## 9. `theme` · `skin`

### 9.1 테마

- `theme` = 객체 또는 패키지 안 JSON 경로. 항목만 받고 선택자는 받지 않는다.
- 항목(이 밖은 무시): `font` `accent` `panelBg` `panelText` `panelBorder` `backdrop` `radius` `divider` `sidebarBg` `mutedText` `tabText` `tabHoverBg` `accentBg` `accentText` `actionBg` `actionBorder` `actionText` `dangerBg` `dangerBorder` `dangerText` `dialogueBg` `dialogueBorder` `dialogueText` `dialogueRadius` `nameBg` `nameBorder` `nameText` `narrationText` `statusBg` `statusBorder` `statusText` `statusAccent` `menuButtonBg` `menuButtonBgHover` `menuButtonText` `moduleBg` `moduleBackdrop` `moduleBorder` `frameBg` `primary` `primaryHover` `controlBg`
- 값은 정규식 `^[#a-zA-Z0-9\s,.()%'"\/+-]{1,120}$` 에 맞아야 한다. **한글 글꼴 이름은 쓸 수 없다**(영문 이름을 쓴다). `url(` `@import` `expression` `javascript:` `image-set` 이 있으면 버린다.

### 9.2 스킨

- `skin` = CSS 경로 하나 또는 배열. 이어 붙여 적용한다. 12만 자까지.
- 선택자는 `[data-vn-part="…"]` 만 쓴다. 내부 클래스(`.vn-…`)는 예고 없이 바뀐다.
  - 대사창 `dialogue` `dialogue-name` `dialogue-text` `dialogue-back` · 정보 바 `status-bar` · 메뉴 버튼 `menu-button`
  - 메뉴 `menu` `menu-panel` `menu-header` `menu-title` `menu-close` `menu-layout` `menu-sidebar` `menu-tabs` `menu-actions` `menu-body` `menu-tab` `menu-action` `menu-section-title` `menu-section-content`
  - 모듈 창 `module-window` `module-panel` `module-header` `module-title` `module-close` `module-frame`
  - 방 화면 `home-layer` `home-character` `home-choices` `home-choice` `end-talk`
  - 대본 연출 `screen-veil` `script-choices` `script-choice-list` `script-choice` `script-choice-form` `script-choice-input` `script-choice-submit`
  - 상태: `data-vn-state="active"`, `data-vn-variant` (`module` `status` `settings` `pause` `exit`)
- 엔진이 모든 선택자 앞에 엔진 화면 범위를 붙인다. `:root` `html` `body` 로 시작하는 선택자, `!important` 는 버린다.
- `@import` `expression(` `behavior:` `-moz-binding` `javascript:` 가 하나라도 있으면 **파일 전체를 버린다.**
- `@media` `@supports` `@layer` `@keyframes` `@font-face` 만 된다. `url()` 은 `data:` 만 된다.
- 글꼴: `@font-face { font-family: "이름"; src: url('data:font/woff;base64,…') format('woff'); unicode-range: …; }` 를 스킨 파일에 넣고 `[data-vn-part="dialogue-name"] { font-family: "이름", var(--vn-font); }` 처럼 건다. 특수 문자에만 쓸 글꼴이면 `unicode-range` 로 범위를 좁힌다. 외형을 끄면 글꼴도 빠진다.
- 메뉴 버튼과 창 닫기 버튼은 숨길 수 없다.
- 테마 변수(`var(--vn-accent)`)와 배치 변수(`--vn-dialogue-padding` 등)를 쓸 수 있다. 폰 가로 화면은 `@media (max-height: 500px)`.

---

## 10. 예제

예제 카트리지(`example-cartridge.vncartridge`)가 이 명세대로 만든 작은 카트리지다. 엔진 판독기와 스키마 검사를 통과한다. 스튜디오로 열면 아래 파일이 보인다.

```text
example-cartridge/
├─ manifest.json                 오프닝, 장면 2개(글자 조건·상태창 조건), 핫스팟 2개(그림 창 · 코드가 받는 자리), 이미지 표, 모듈 2개
├─ assets/g/bg_teahouse.svg      배경 (bg_ 접두사). 카운터의 LEDGER 를 누르면 장부 관리자가 받아 장부 화면을 메뉴에 보이고 연다
├─ assets/c/mira01.svg · mira02.svg   인물 mira 의 표정 둘
├─ assets/view/menu_board.svg    핫스팟을 누르면 뜨는 그림
├─ data/menu.json                화면 모듈의 dataFiles
├─ modules/ledger/               상시 모듈: 상태창 [소지품] 의 "N 금화" → 공유 서랍 '장부'. on('hotspot') 으로 장부 자리를 받아 menu.show + openView
└─ modules/ledger-view/          화면 모듈: 공유 서랍 읽기, \장부 명령, tellAi + commitChat. "menu": false — 장부를 찾기 전엔 메뉴에 없다
```

---

## 11. 자주 하는 실수

| 실수 | 결과 | 바른 방법 |
| --- | --- | --- |
| 장면 조건에 목록 밖 이름(`place`, `keyword` 등) | 장면 통째로 무시 | §5.2 표의 이름만 |
| 오프닝 `content` 를 줄 배열로 | 오류가 나 카트리지 적용이 멈출 수 있음 | 문자열 하나 (`\n` 으로 줄바꿈). 줄 배열은 장면 `content` 만 된다 |
| `![미라](off)` 처럼 한글로 퇴장 | 퇴장 대신 글자로 찍힘 | `![mira](off)` 인물 ID |
| 인물 그림을 한글 이름으로 짓고 `characterId` 를 안 적음 | 장마다 다른 인물로 나란히 섬 | 영문+번호, 또는 이미지 표에 `characterId` |
| `/g/` 없는 외부 배경 주소 | 인물로 판정 | `"kind": "background"` |
| 스탠딩 그림을 가로로 길게 | 이벤트 CG 로 뜸 | 세로형 (가로 ÷ 세로 ≤ 1.2) |
| 모듈에서 `localStorage`, `<img src="assets/…">`, `parent.document` | 오류 또는 빈 화면 | `VNCartridge.state` / 모듈 `images` + `loadImage` / 도우미 |
| 방 화면 모듈에서 `event.key === 'w'` 로 이동 키를 읽음 | 한글 입력 상태에서 안 움직임 | `event.code === 'KeyW'` |
| 방 화면 모듈이 `home` 채널을 안 들음 | 대화하는 동안에도 게임 시계가 흐름 | `active: false` 면 멈춤 |
| `entry` HTML 에 `<script src="index.js">` | 파일을 못 찾음 | `scripts` 배열에 적기 |
| 마우스 고정을 화면을 연 직후 코드로 요청 | 거부됨 (`pointerlockerror`) | 사용자가 누른 `mousedown` 처리 안에서 요청 |
| 마우스 고정이 `Esc` 로 풀렸는데 게임이 계속 돎 | 커서가 풀린 채 시점이 안 돌고 조작이 꼬임 | `pointerlockchange` 에서 일시정지 |
| 마우스 고정만 믿고 대체 조작이 없음 | 거부되면 시점을 못 돌림 | `pointerlockerror` 면 커서 조작으로 |
| `state.all` 을 `replace` 뒤에 다시 읽음 | 옛 값 | 모듈이 사본을 들고 갱신 |
| 진행 상황을 매번 새 `tellAi` 로 | 대기열이 쌓여 같은 말이 여러 번 나감 | 같은 `id` + `replace: true` |
| 테마 글꼴에 한글 이름 | 그 항목 무시 | 영문 글꼴 이름 |
| 스킨에서 `.vn-…` 클래스 · `!important` | 언젠가 깨짐 · 무시됨 | `data-vn-part` 선택자 |
| 핫스팟 `areas` 키를 파일 경로로 | 자리가 안 생김 | 배경의 호출 이름 (`"bg_teahouse"`) |
| 핫스팟에 할 일을 manifest 칸으로 적음 (`open`, `grant` 등) | 무시됨 | 상시 모듈에서 `on('hotspot')` 으로 받아 `openView` · `menu.show` 등 |
| 핫스팟 처리를 화면 모듈에만 둠 | 그 화면이 닫혀 있으면 아무 일도 없음 | 상시 모듈에서 받기 |
| 처음부터 숨길 화면을 코드로만 숨김 (`menu.hide`) | 상시 모듈이 돌기 전·새 이야기에서 잠깐 보임 | manifest `"menu": false` |
| 이미 배포한 카트리지의 `id` 변경 | 플레이어 저장 값이 사라짐 | `id` 는 고정, `version` 만 올림 |
| 보호 파일만 남기고 `.source.vncartridge` 를 버림 | 다시 고칠 수 없음 | 편집용 원본을 따로 보관 |
| 연출 장면을 화면 모듈 안에 따로 그림 | VN 화면과 따로 노는 창이 뜸 | `playScript` 로 VN 화면에서 (§8.4) |
| `playScript` 를 화면 모듈에서 부르고 결과를 기다림 | 대본이 시작되면 그 창이 닫혀 결과를 못 받음 | 화면 모듈은 `emit`, 상시 모듈이 `playScript` |
| `playScript` 의 `ok` 를 안 봄 | 끊겼는데도 다음 대본 · `tellAi` 가 나감 | `if (!result.ok) return;` |
| 흰빛 덮기의 `wait` 를 덮는 시간보다 짧게 | 다 덮이기 전에 배경이 바뀌어 보임 | `![screen](white 1.8s wait 2.9s)` 처럼 기다림 ≥ 덮는 시간 |
| 연출 줄을 `![screen](흰색으로 3초)` 처럼 풀어 씀 | 건너뜀 | §4.1 낱말만 |
