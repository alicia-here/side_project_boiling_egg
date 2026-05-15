# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

**삶은달걀 (Boiled Egg)** — 하루 기록 & 회고 단일 페이지 웹앱.
슬로건: "천천히 익어가는 하루"

AI 연동 없이 순수 프론트엔드(HTML + CSS + Vanilla JS)로 구현. 외부 라이브러리 없음.

## 기술 스택

- HTML + CSS + Vanilla JavaScript
- 폰트: Pretendard (CDN)
- 데이터 저장: 로컬스토리지 (`storage.js`를 통해서만 접근)

## 파일 구조

```
boiled-egg/
├── index.html
├── style.css
├── main.js
├── storage.js   ← 데이터 레이어 (유일한 localStorage 접근 지점)
├── .env
├── .env.example
├── .gitignore
└── CLAUDE.md
```

## 개발 방법

별도 빌드 도구 없음. 브라우저에서 `index.html`을 직접 열거나 로컬 서버 사용:

```bash
# Python
python -m http.server 8080

# Node.js
npx serve .
```

## 아키텍처 핵심 규칙

### 데이터 레이어 (`storage.js`)
`main.js`에서 `localStorage`에 직접 접근 금지. 반드시 아래 인터페이스를 통해서만 접근:

```js
getTodos()          // 할 일 목록 반환
saveTodos(data)     // 할 일 목록 저장
getRecords()        // 회고 기록 목록 반환
saveRecord(data)    // 회고 기록 저장
```

함수 시그니처를 유지하면 내부 구현을 Supabase로 교체 가능.

### localStorage 키
- `sbe_todos` — 할 일 + 타임라인 데이터
- `sbe_records` — 날짜별 회고 기록

### 데이터 구조

**`sbe_todos`**
```json
[{ "id": "string", "text": "string", "done": false, "timeline": [{ "start": "ISO8601", "end": "ISO8601" }] }]
```

**`sbe_records`**
```json
[{ "date": "YYYY-MM-DD", "completedTasks": ["id"], "timelineSummary": "string", "reflectionTone": "coach|partner|counselor|friend", "reflectionText": "string", "savedAt": "ISO8601" }]
```

### 레이아웃

3단 고정 레이아웃 (데스크탑 전용, `min-width: 900px`). 반응형 불필요.

| 패널 | 너비 | 역할 |
|------|------|------|
| LEFT | 240px | 할 일 목록, 타임라인, 진행률 |
| CENTER | flex-1 | 메인 작업 공간 + 회고 플로우 |
| RIGHT | 280px | 회고 톤 선택 + 하루 마무리 |

공통 헤더: 좌측 로고(`🥚 삶은달걀`) + 우측 현재시간(1분마다 업데이트, `tabular-nums`)

### CENTER PANEL 상태 전환 (모달 없음)

```
기본 상태 → 작업 진행 중 → [하루 마무리하기] → Step1(오늘 요약) → Step2(회고 작성) → Step3(저장)
```

모든 플로우는 CENTER PANEL 내 상태 전환으로 처리. 모달/팝업 없음.

## 디자인 시스템

### 주요 색상
| 용도 | 값 |
|------|----|
| 페이지 배경 | `#FFFFFF` |
| 패널 구분선 | `#F0EFED` |
| 텍스트 주조 | `#1A1A1A` |
| 텍스트 보조 | `#888888` |
| 텍스트 힌트 | `#BBBBBB` |
| 노른자 포인트 | `#E8834A` (회고 완료 시만) |

### 계란 이모티콘 규칙
- 대기/빈 상태: `🥚` + 회색 원형 배경(`#F0EFED`, 80px)
- 회고 완료 시: 원형 배경 → `#E8834A`, "하루가 익었어요." 문구

### 애니메이션
`transition: 0.2s ease`만 허용. 그 외 애니메이션 최소화.

## 회고 톤별 안내 문구

| 톤 | 키 | 안내 문구 |
|----|-----|-----------|
| 👤 현명한 코치 | `coach` | "오늘 가장 잘 된 부분은 무엇인가요?" |
| 💬 실전형 파트너 | `partner` | "오늘 실제로 해낸 것 중 내일로 이어갈 게 있나요?" |
| 🫧 심리상담가 | `counselor` | "오늘 가장 마음에 남는 감정은 무엇인가요?" |
| 🌿 따뜻한 친구 | `friend` | "오늘 하루 어땠어? 편하게 얘기해봐." |

## 주의사항

- 아이콘: 외부 라이브러리 없이 이모티콘 또는 SVG 인라인만 사용
- 민감 정보(API 키, DB 접속 정보)는 소스코드에 하드코딩 금지 → `.env` 사용
- `.env`는 `.gitignore`에 포함, `.env.example`에는 키 이름만 기재(값 없음)
- [하루 마무리하기] 버튼은 완료된 할 일이 1개 이상일 때만 활성화
