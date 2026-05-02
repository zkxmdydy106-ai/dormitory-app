# 기숙사 앱 v2 업그레이드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 벌점 이중계산 버그 수정 + 외박→외출 변환·사감 캘린더·특별활동 기능 추가 + SVG 아이콘·남녀 색상 + GitHub 자동배포 구조 구축

**Architecture:**
- GAS `Index.html`은 얇은 HTML 껍데기로 유지. JS/CSS는 `src/` 디렉터리로 이동해 GitHub에서 관리하고 jsDelivr CDN을 통해 로드.
- `google.script.run`은 그대로 동작 (JS가 GAS iframe 컨텍스트에서 실행되므로 CORS 문제 없음).
- GitHub Actions: push → jsDelivr CDN 커밋 해시 갱신 → clasp push → clasp deploy → 선생님 URL 변경 없이 자동 반영.
- `Code.gs` 백엔드 로직은 현행 유지, 버그 수정 및 신규 함수 추가.

**Tech Stack:** Google Apps Script, Vanilla JS, CSS3, clasp, GitHub Actions, jsDelivr CDN

---

## 파일 맵

| 상태 | 경로 | 역할 |
|------|------|------|
| 수정 | `Code.gs` | 버그 수정 + 외박전환·특별활동 서버 함수 |
| 수정 | `Index.html` | CDN 링크 로드하는 얇은 껍데기로 교체 |
| 삭제 | `JavaScript.html` | src/app.js 로 이동 후 제거 |
| 삭제 | `Stylesheet.html` | src/style.css 로 이동 후 제거 |
| 신규 | `src/app.js` | 전체 프론트엔드 JS (JavaScript.html 내용) |
| 신규 | `src/style.css` | 전체 CSS (Stylesheet.html 내용) |
| 신규 | `src/icons.js` | SVG 아이콘 라이브러리 |
| 신규 | `.clasp.json` | clasp 설정 |
| 신규 | `.gitignore` | git 제외 파일 |
| 신규 | `.github/workflows/deploy.yml` | 자동배포 워크플로 |
| 수정 | `Setup.gs` | APP_특별활동 시트 생성 추가 |

---

## Task 1: 벌점 이중계산 버그 수정

**Files:**
- Modify: `Code.gs` (getAppMonthlyData 함수, 약 310~345줄)

**버그 원인:**
`checkAndApplyOverPenalty()`가 "외출 초과 (N회)" 항목을 `APP_벌점로그`에 기록함.
`getAppMonthlyData()`가 `appPenalty`로 그 로그를 합산한 뒤, `outOverPenalty`로 같은 값을 또 더함 → 2배.

- [ ] **Step 1: 현재 이중계산 로직 확인**

`Code.gs` 330~345줄에서 아래 패턴을 찾는다:
```javascript
student.outOverPenalty = outOver * overPenalty;
student.stayOverPenalty = stayOver * overPenalty;
student.calculatedTotalPenalty = student.totalPenalty + appPenalty + student.outOverPenalty + student.stayOverPenalty;
```

- [ ] **Step 2: 이중계산 제거 — getAppMonthlyData 수정**

`Code.gs`의 `getAppMonthlyData` 함수에서 students.forEach 블록 내부를 다음으로 교체:

```javascript
students.forEach(student => {
  // APP 외출 횟수 (외박→외출전환 포함, 순수 외박 제외)
  const appOutCount = outLogs.filter(
    log => String(log[2]) === student.studentId &&
           (log[1] === '외출' || log[1] === '외박(외출전환)') &&
           String(log[6]).trim() === 'active'
  ).length;

  // APP 외박 횟수 (전환된 항목 제외)
  const appStayCount = outLogs.filter(
    log => String(log[2]) === student.studentId &&
           log[1] === '외박' &&
           String(log[6]).trim() === 'active'
  ).length;

  // APP 벌점 합계 (로그에 이미 초과벌점 포함되어 있으므로 그대로 사용)
  const appPenalty = penaltyLogs
    .filter(log => String(log[1]) === student.studentId)
    .reduce((sum, log) => sum + (Number(log[3]) || 0), 0);

  student.appOutCount = appOutCount;
  student.appStayCount = appStayCount;
  student.appPenalty = appPenalty;

  // 총 벌점: 원본 기초값 + APP 벌점 로그 합계
  // (초과벌점은 checkAndApplyOverPenalty가 APP_벌점로그에 이미 기록함 — 별도 계산 불필요)
  student.calculatedTotalPenalty = student.totalPenalty + appPenalty;

  // 징계 자동 판단
  student.calculatedDiscipline = calculateDiscipline(student.calculatedTotalPenalty, disciplineRules);
});
```

- [ ] **Step 3: checkAndApplyOverPenalty에서 외박→외출전환 제외 처리**

`Code.gs`의 `checkAndApplyOverPenalty` 함수에서 activeCount 계산 부분을 수정:

```javascript
// 이번달 해당 타입 active 건수 계산
let activeCount = 0;
if (logSheet.getLastRow() > 1) {
  const data = logSheet.getRange(2, 1, logSheet.getLastRow() - 1, 9).getValues();
  if (type === '외출') {
    // 외출 초과 계산 시: 외박(외출전환)은 벌점 면제이므로 순수 외출만 카운트
    activeCount = data.filter(row => {
      const d = new Date(row[0]);
      return d >= monthStart && d <= monthEnd &&
             String(row[1]).trim() === '외출' &&
             String(row[2]).trim() === studentId &&
             String(row[6]).trim() === 'active';
    }).length;
  } else {
    activeCount = data.filter(row => {
      const d = new Date(row[0]);
      return d >= monthStart && d <= monthEnd &&
             String(row[1]).trim() === type &&
             String(row[2]).trim() === studentId &&
             String(row[6]).trim() === 'active';
    }).length;
  }
}
```

- [ ] **Step 4: syncToOriginalSheet 동기화 수정**

`syncToOriginalSheet`에서 outCount 계산도 동일하게 외박(외출전환) 포함 처리:

```javascript
if (row[1] === '외출' || row[1] === '외박(외출전환)') {
  outCount++;
  outDates.push(dateStr);
}
if (row[1] === '외박') {
  stayCount++;
  stayDates.push(dateStr);
}
```

- [ ] **Step 5: 커밋**

```bash
git add Code.gs
git commit -m "fix: 벌점 이중계산 버그 수정 및 외박전환 타입 카운팅 기반 마련"
```

---

## Task 2: GitHub + clasp 설정

**Files:**
- Create: `.clasp.json`
- Create: `.gitignore`
- Create: `src/` 디렉터리

- [ ] **Step 1: clasp 전역 설치 확인**

```bash
npm install -g @google/clasp
clasp --version
```
Expected: `2.x.x`

- [ ] **Step 2: GAS 스크립트 ID 확인**

GAS 편집기 → 프로젝트 설정 → 스크립트 ID 복사 (예: `1BxYz...`)

- [ ] **Step 3: .clasp.json 생성**

```json
{
  "scriptId": "여기에_GAS_스크립트_ID_입력",
  "rootDir": ".",
  "filePushOrder": ["Setup.gs", "Code.gs", "Index.html"]
}
```

- [ ] **Step 4: .gitignore 생성**

```
.clasp.json
*.env
.superpowers/
node_modules/
```

- [ ] **Step 5: src 디렉터리 생성**

```bash
mkdir src
```

- [ ] **Step 6: clasp 로그인 (최초 1회)**

```bash
clasp login
```
브라우저에서 Google 계정 인증.

- [ ] **Step 7: 현재 GAS 코드 pull 확인**

```bash
clasp pull
```
Expected: 기존 파일들이 로컬과 일치하는지 확인.

- [ ] **Step 8: 커밋**

```bash
git init  # 아직 git repo가 없는 경우
git add .clasp.json .gitignore
git commit -m "chore: clasp 및 git 설정"
```

---

## Task 3: 프론트엔드 소스 src/ 로 이동 + Index.html CDN 방식 전환

**Files:**
- Create: `src/app.js` (JavaScript.html 내용 이동)
- Create: `src/style.css` (Stylesheet.html 내용 이동)
- Modify: `Index.html` (CDN 로드 방식으로 교체)

- [ ] **Step 1: src/style.css 생성**

`Stylesheet.html`의 `<style>...</style>` 사이 내용 전체를 `src/style.css`로 복사.
(Pure.css CDN 링크는 Index.html로 이동)

- [ ] **Step 2: src/app.js 생성**

`JavaScript.html`의 `<script>...</script>` 사이 내용 전체를 `src/app.js`로 복사.
`<script>` 태그는 제거.

- [ ] **Step 3: Index.html 얇은 껍데기로 교체**

기존 `Index.html`을 다음으로 완전 교체:

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <title>강경고등학교 기숙사 관리</title>
  <link rel="icon" type="image/svg+xml"
    href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🏫</text></svg>">

  <!-- Pure.css -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/purecss@3.0.0/build/pure-min.css">
  <!-- Google Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">

  <!-- 앱 스타일 (GitHub CDN) — 배포 시 자동 갱신됨 -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/GITHUB_USER/GITHUB_REPO@COMMIT_HASH/src/style.css">
</head>
<body>

  <div id="loading-overlay" class="loading-overlay">
    <div class="loading-spinner">
      <div class="spinner"></div>
      <p>기숙사 관리 시스템 로드 중...</p>
    </div>
  </div>

  <header id="app-header" class="app-header">
    <div class="header-left">
      <button id="btn-back" class="btn-icon btn-back" onclick="goBack()" style="display:none;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>
    </div>
    <h1 id="header-title" class="header-title">기숙사 관리</h1>
    <div class="header-right">
      <span id="user-email" class="user-email"></span>
      <select id="month-select" class="month-select" onchange="onMonthChange()">
        <option value="3월">3월</option>
      </select>
    </div>
  </header>

  <main id="main-content" class="main-content">
    <section id="page-student-list" class="page active">
      <div class="search-bar">
        <svg class="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input id="search-input" type="text" placeholder="학번, 이름, 호실로 검색..." oninput="filterStudents()">
        <button class="btn-icon btn-refresh" onclick="loadStudentList()" title="최신 명단 불러오기">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
        </button>
      </div>
      <div class="filter-chips">
        <button class="chip active" onclick="setFilter('all', this)">전체</button>
        <button class="chip chip-female" onclick="setFilter('female', this)">여학생</button>
        <button class="chip chip-male" onclick="setFilter('male', this)">남학생</button>
        <button class="chip chip-warning" onclick="setFilter('penalty', this)">벌점 있음</button>
        <button class="chip chip-danger" onclick="setFilter('discipline', this)">징계 대상</button>
      </div>
      <div id="student-list" class="student-list"></div>
    </section>

    <section id="page-student-detail" class="page">
      <div id="student-detail-content"></div>
    </section>

    <section id="page-penalty-items" class="page">
      <div class="search-bar">
        <svg class="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input id="penalty-search" type="text" placeholder="벌점 항목 검색..." oninput="filterPenaltyItems()">
      </div>
      <div id="penalty-items-list" class="penalty-items-list"></div>
    </section>

    <section id="page-cumulative" class="page">
      <div class="section-header">
        <h2>누가 기록</h2>
        <button class="btn-primary btn-sm" onclick="showAddRecordDialog()">+ 기록 추가</button>
      </div>
      <div id="cumulative-list" class="cumulative-list"></div>
    </section>

    <section id="page-suggestions" class="page">
      <div class="section-header">
        <h2>교사 건의사항</h2>
        <button class="btn-primary btn-sm" onclick="showAddSuggestionDialog()">+ 건의 작성</button>
      </div>
      <div id="suggestions-list" class="suggestions-list"></div>
    </section>

    <section id="page-duty" class="page">
      <!-- 캘린더 영역 (Task 6에서 채워짐) -->
      <div id="duty-calendar-wrap"></div>
      <!-- 기존 드롭다운 -->
      <div class="duty-filter">
        <label>교사 선택</label>
        <select id="duty-teacher-select" onchange="filterDutyByTeacher()">
          <option value="">전체 보기</option>
        </select>
      </div>
      <div id="duty-schedule-list" class="duty-schedule-list"></div>
    </section>

    <section id="page-settings" class="page">
      <div id="settings-content" class="settings-content"></div>
    </section>
  </main>

  <nav id="bottom-nav" class="bottom-nav">
    <button class="nav-item active" onclick="navigateTo('student-list', this)" data-page="student-list">
      <!-- 아이콘은 src/icons.js에서 주입 -->
      <span class="nav-icon" id="nav-icon-student-list"></span>
      <span>학생</span>
    </button>
    <button class="nav-item" onclick="navigateTo('cumulative', this)" data-page="cumulative">
      <span class="nav-icon" id="nav-icon-cumulative"></span>
      <span>누가기록</span>
    </button>
    <button class="nav-item" onclick="navigateTo('suggestions', this)" data-page="suggestions">
      <span class="nav-icon" id="nav-icon-suggestions"></span>
      <span>건의</span>
    </button>
    <button class="nav-item" onclick="navigateTo('duty', this)" data-page="duty">
      <span class="nav-icon" id="nav-icon-duty"></span>
      <span>사감</span>
    </button>
    <button class="nav-item" onclick="navigateTo('settings', this)" data-page="settings">
      <span class="nav-icon" id="nav-icon-settings"></span>
      <span>설정</span>
    </button>
  </nav>

  <div id="modal-overlay" class="modal-overlay" onclick="closeModal()">
    <div class="modal-content" onclick="event.stopPropagation()">
      <div class="modal-header">
        <h3 id="modal-title">제목</h3>
        <button class="btn-icon" onclick="closeModal()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div id="modal-body" class="modal-body"></div>
    </div>
  </div>

  <div id="toast-container" class="toast-container"></div>

  <footer class="app-footer">
    <div class="footer-logo">
      <div class="logo-placeholder">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          <polyline points="9 22 9 12 15 12 15 22"></polyline>
        </svg>
        <span class="logo-text">강경고등학교</span>
      </div>
    </div>
    <p class="footer-credit">Created by 김요한</p>
  </footer>

  <!-- 아이콘 라이브러리 (GitHub CDN) -->
  <script src="https://cdn.jsdelivr.net/gh/GITHUB_USER/GITHUB_REPO@COMMIT_HASH/src/icons.js"></script>
  <!-- 앱 로직 (GitHub CDN) -->
  <script src="https://cdn.jsdelivr.net/gh/GITHUB_USER/GITHUB_REPO@COMMIT_HASH/src/app.js"></script>
</body>
</html>
```

> **주의:** `GITHUB_USER`, `GITHUB_REPO`, `COMMIT_HASH`는 GitHub 저장소 설정 후 실제 값으로 교체. GitHub Actions가 자동으로 갱신.

- [ ] **Step 4: Stylesheet.html, JavaScript.html 내용 비우기 (GAS 참조 제거)**

GAS는 `include()`를 통해 이 파일들을 로드하는데, Index.html에서 더 이상 `<?!= include(...) ?>`를 사용하지 않으므로 두 파일을 빈 파일로 유지 (삭제 불가 — GAS 프로젝트 구조상):

`Stylesheet.html`:
```html
<!-- 스타일은 src/style.css로 이동. GitHub CDN을 통해 Index.html에서 로드됩니다. -->
```

`JavaScript.html`:
```html
<!-- JS는 src/app.js로 이동. GitHub CDN을 통해 Index.html에서 로드됩니다. -->
```

- [ ] **Step 5: 커밋**

```bash
git add src/ Index.html Stylesheet.html JavaScript.html
git commit -m "refactor: 프론트엔드 코드 src/로 이동, Index.html CDN 방식 전환"
```

---

## Task 4: SVG 아이콘 라이브러리 + 남녀 색상 구분

**Files:**
- Create: `src/icons.js`
- Modify: `src/app.js` (이모지 → SVG 아이콘 교체)
- Modify: `src/style.css` (여학생/남학생 CSS 변수 추가)

- [ ] **Step 1: src/icons.js 생성**

```javascript
// 아이콘 초기화 — DOMContentLoaded 후 네비게이션 아이콘 주입
(function initIcons() {
  const NAV_ICONS = {
    'student-list': `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    'cumulative': `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
    'suggestions': `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    'duty': `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    'settings': `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`
  };

  // 인라인 사용 가능한 아이콘 (함수로 export)
  window.ICONS = {
    room: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
    id: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
    out: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
    stay: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
    convert: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`,
    phone: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.3C1.6 2.18 2.43 1.23 3.55 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.59a16 16 0 0 0 6.29 6.29l.86-.86a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
    sms: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    penalty: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    refresh: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,
    check: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    activity: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`,
    today: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`
  };

  document.addEventListener('DOMContentLoaded', () => {
    Object.entries(NAV_ICONS).forEach(([page, svg]) => {
      const el = document.getElementById('nav-icon-' + page);
      if (el) el.innerHTML = svg;
    });
  });
})();
```

- [ ] **Step 2: src/style.css에 남녀 색상 변수 추가**

`:root` 블록에 다음 추가:

```css
/* 남녀 구분 색상 */
--female-bg: #fdf2f8;
--female-border: #f9a8d4;
--female-avatar-bg: #fce7f3;
--female-avatar-color: #be185d;
--female-accent: #ec4899;

--male-bg: #eff6ff;
--male-border: #93c5fd;
--male-avatar-bg: #dbeafe;
--male-avatar-color: #1d4ed8;
--male-accent: #3b82f6;
```

`.student-card`에 남녀 스타일 추가:

```css
.student-card.gender-female {
  border-left: 3.5px solid var(--female-accent);
}
.student-card.gender-female .student-avatar {
  background: var(--female-avatar-bg);
  color: var(--female-avatar-color);
}
.student-card.gender-male {
  border-left: 3.5px solid var(--male-accent);
}
.student-card.gender-male .student-avatar {
  background: var(--male-avatar-bg);
  color: var(--male-avatar-color);
}

.detail-avatar.gender-female {
  background: linear-gradient(135deg, var(--female-accent), #be185d);
}
.detail-avatar.gender-male {
  background: linear-gradient(135deg, var(--primary), var(--primary-dark));
}

/* 여학생 필터칩 */
.chip-female.active { background: var(--female-accent); border-color: var(--female-accent); }
.chip-male.active { background: var(--male-accent); border-color: var(--male-accent); }
```

- [ ] **Step 3: src/app.js — 성별 판별 헬퍼 함수 추가**

`src/app.js` 상단 유틸리티 섹션에 추가:

```javascript
function getGender(room) {
  const first = String(room || '').trim().charAt(0);
  if (first === '1') return 'female';
  if (first === '2') return 'male';
  return 'unknown';
}
```

- [ ] **Step 4: renderStudentList에서 gender 클래스 적용**

`renderStudentList`의 student-card div 라인 수정:

```javascript
const gender = getGender(s.room);
return `
<div class="student-card gender-${gender}" id="student-card-${s.studentId}" onclick="openStudentDetail('${s.studentId}')">
  <div class="student-avatar">${initial}</div>
  ...
```

- [ ] **Step 5: renderStudentDetailHTML에서 gender 클래스 적용**

detail-avatar에 gender 클래스 추가:
```javascript
const gender = getGender(s.room);
// detail-avatar 라인:
<div class="detail-avatar gender-${gender}">${initial}</div>
```

- [ ] **Step 6: 이모지 아이콘 교체 (app.js 내)**

`src/app.js`에서 다음 이모지들을 ICONS 오브젝트의 SVG로 교체:

| 기존 | 교체 |
|------|------|
| `🏠` | `${ICONS.room}` |
| `📝` | `${ICONS.id}` |
| `⚡ 벌점 부여하기` | `${ICONS.penalty} 벌점 부여하기` |
| `🚶` (외출 미기록) | `${ICONS.out}` |
| `✅` (외출 기록됨) | `${ICONS.check}` |
| `🌙` (외박 미기록) | `${ICONS.stay}` |
| `📞 전화` | `${ICONS.phone} 전화` |
| `💬 문자` | `${ICONS.sms} 문자` |

- [ ] **Step 7: 필터칩에 여학생/남학생 필터 추가 (app.js)**

`filterStudents()` 함수에 케이스 추가:
```javascript
} else if (APP.currentFilter === 'female') {
  filtered = filtered.filter(s => getGender(s.room) === 'female');
} else if (APP.currentFilter === 'male') {
  filtered = filtered.filter(s => getGender(s.room) === 'male');
}
```

- [ ] **Step 8: 커밋**

```bash
git add src/icons.js src/app.js src/style.css
git commit -m "feat: SVG 아이콘 교체 및 남녀 색상 구분 적용"
```

---

## Task 5: 외박 → 외출 변환 기능

**Files:**
- Modify: `Code.gs` (convertStayToOut 함수 추가)
- Modify: `src/app.js` (변환 UI 추가)
- Modify: `src/style.css` (변환 버튼 스타일)

- [ ] **Step 1: Code.gs에 convertStayToOut 함수 추가**

`toggleOutStay` 함수 아래에 추가:

```javascript
/**
 * 외박을 외출로 전환하여 사용
 * - 기존 외박 active 기록이 있으면 '외박(외출전환)'으로 타입 변경
 * - 없으면 새로 '외박(외출전환)' 기록 추가
 * - 외출 횟수에 카운트되지만 초과 벌점 면제
 */
function convertStayToOut(studentId, studentName, room, month, recordDate) {
  try {
    const appDb = SpreadsheetApp.openById(getAppDbSheetId());
    const logSheet = appDb.getSheetByName('APP_외출외박로그');
    const targetDate = recordDate ? String(recordDate).trim() : Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
    const now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
    const user = getCurrentUser();

    let existingStayRow = -1;
    let existingConvertRow = -1;

    if (logSheet.getLastRow() > 1) {
      const data = logSheet.getRange(2, 1, logSheet.getLastRow() - 1, 9).getValues();
      for (let i = 0; i < data.length; i++) {
        let rowDate = data[i][0];
        if (rowDate instanceof Date) {
          rowDate = Utilities.formatDate(rowDate, 'Asia/Seoul', 'yyyy-MM-dd');
        } else {
          rowDate = String(rowDate).trim();
        }
        if (rowDate !== targetDate || String(data[i][2]).trim() !== studentId) continue;
        if (String(data[i][1]).trim() === '외박' && String(data[i][6]).trim() === 'active') {
          existingStayRow = i + 2;
        }
        if (String(data[i][1]).trim() === '외박(외출전환)' && String(data[i][6]).trim() === 'active') {
          existingConvertRow = i + 2;
        }
      }
    }

    let action = '';
    if (existingConvertRow > -1) {
      // 이미 전환됨 → 취소 (removed)
      logSheet.getRange(existingConvertRow, 7).setValue('removed');
      logSheet.getRange(existingConvertRow, 9).setValue(now);
      action = '외박→외출전환 취소';
    } else if (existingStayRow > -1) {
      // 외박 기록이 있으면 타입 변경
      logSheet.getRange(existingStayRow, 2).setValue('외박(외출전환)');
      logSheet.getRange(existingStayRow, 9).setValue(now);
      action = '외박→외출전환';
    } else {
      // 외박 기록이 없어도 전환 기록 추가
      logSheet.appendRow([
        targetDate, '외박(외출전환)', studentId, studentName, room, '', 'active', user.email, now
      ]);
      action = '외박→외출전환 (신규)';
    }

    syncToOriginalSheet(studentId, month);
    addAuditLog(user.email, action, studentId + ' ' + studentName, targetDate);
    clearAppCache(month);

    return { success: true, action: action };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}
```

- [ ] **Step 2: src/style.css에 변환 버튼 스타일 추가**

```css
.btn-convert-stay {
  width: 100%;
  padding: var(--space-md);
  border: 2px dashed var(--warning);
  border-radius: var(--radius-md);
  background: var(--warning-bg);
  color: var(--warning);
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition);
  margin-bottom: var(--space-md);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.btn-convert-stay:active {
  transform: scale(0.98);
  background: var(--warning);
  color: white;
}
.btn-convert-stay.converted {
  border-style: solid;
  background: #fff8e1;
  border-color: #f59e0b;
  color: #92400e;
}
.badge-converted {
  background: #fef9c3;
  color: #a16207;
  border: 1px solid #fde68a;
}
```

- [ ] **Step 3: src/app.js — 외출 횟수 표시에 전환 포함 개수 반영**

`updateDetailStatsUI`에서 outCount 표시 부분 수정:

```javascript
const convertedCount = s.outLogs
  ? s.outLogs.filter(l => l.type === '외박(외출전환)' && l.status === 'active').length
  : 0;
const rawOutCount = isRecent ? (s.appOutCount || 0) : Math.max(s.appOutCount || 0, s.outCount || 0);

const elOut = document.getElementById('stat-out');
if (elOut) {
  elOut.innerHTML = `${rawOutCount}<span style="font-size:14px;color:var(--text-secondary);">/${maxOut}</span>`;
  if (convertedCount > 0) {
    elOut.insertAdjacentHTML('afterend',
      `<div style="font-size:10px;color:var(--warning);margin-top:-4px;">(전환 ${convertedCount}회 포함)</div>`
    );
  }
}
```

- [ ] **Step 4: src/app.js — 변환 버튼 추가 (renderStudentDetailHTML)**

외출/외박 토글 버튼 아래에 변환 버튼 추가:

```javascript
<!-- 외박→외출 전환 버튼 -->
<button class="btn-convert-stay" id="btn-convert-stay" onclick="convertStayToOut()">
  ${ICONS.convert} 외박을 외출로 전환하여 사용
</button>
```

- [ ] **Step 5: src/app.js — convertStayToOut 클라이언트 함수 추가**

`toggleOutStay` 함수 아래에:

```javascript
function convertStayToOut() {
  const s = APP.selectedStudent;
  if (!s) return;

  const recordDate = document.getElementById('record-date-input')?.value || new Date().toISOString().split('T')[0];

  // Optimistic UI
  const existing = s.outLogs && s.outLogs.find(
    l => String(l.date).startsWith(recordDate) && l.type === '외박(외출전환)' && l.status === 'active'
  );

  if (existing) {
    existing.status = 'removed';
    s.appOutCount = Math.max(0, (s.appOutCount || 0) - 1);
  } else {
    const newLog = {
      date: recordDate, type: '외박(외출전환)', studentId: s.studentId,
      name: s.name, room: s.room, returnTime: '', status: 'active',
      recorder: APP.user?.email || '', timestamp: new Date().toISOString()
    };
    if (!s.outLogs) s.outLogs = [];
    s.outLogs.unshift(newLog);
    s.appOutCount = (s.appOutCount || 0) + 1;
  }

  s.lastModifiedLocal = Date.now();
  updateDetailStatsUI(s);

  const baseStudent = APP.students.find(x => x.studentId === s.studentId);
  if (baseStudent) { Object.assign(baseStudent, s); updateStudentCardUI(baseStudent); }

  callServer('convertStayToOut', s.studentId, s.name, s.room, APP.currentMonth, recordDate)
    .catch(e => showToast('오류: ' + e, 'error'));
}
```

- [ ] **Step 6: 외출/외박 로그 렌더링에서 변환 표시**

`renderContactAndLogs`의 로그 목록 렌더링 부분 수정:

```javascript
${s.outLogs.filter(l => l.status === 'active').map(l => {
  const isConverted = l.type === '외박(외출전환)';
  const typeLabel = isConverted ? '외박→외출전환' : l.type;
  const badgeClass = l.type === '외출' ? 'badge-out' : isConverted ? 'badge-converted' : 'badge-stay';
  return `
  <div class="contact-row">
    <div>
      <span class="badge ${badgeClass}">${typeLabel}</span>
      <span style="font-size:13px; margin-left:8px;">${l.date}</span>
      ${l.returnTime ? `<span style="font-size:12px; color:var(--text-secondary);"> 귀사: ${l.returnTime}</span>` : ''}
    </div>
  </div>`;
}).join('')}
```

- [ ] **Step 7: 학생 카드 뱃지에 전환 표시**

`renderStudentList`의 뱃지 부분 수정:

```javascript
const convertedCnt = (s.outLogs || []).filter(l => l.type === '외박(외출전환)' && l.status === 'active').length;
// 기존 outCount 뱃지 아래에 추가:
${convertedCnt > 0 ? `<span class="badge badge-converted" style="font-size:10px;">전환${convertedCnt}</span>` : ''}
```

- [ ] **Step 8: 커밋**

```bash
git add Code.gs src/app.js src/style.css
git commit -m "feat: 외박→외출 전환 기능 추가"
```

---

## Task 6: 사감 근무 캘린더

**Files:**
- Modify: `src/app.js` (캘린더 렌더링 함수 추가)
- Modify: `src/style.css` (캘린더 CSS)

- [ ] **Step 1: src/style.css에 캘린더 스타일 추가**

```css
/* ─── 사감 캘린더 ─── */
.duty-calendar {
  background: var(--surface);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  box-shadow: var(--shadow-sm);
  margin-bottom: var(--space-md);
}
.duty-calendar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-md);
}
.duty-calendar-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}
.duty-cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}
.duty-cal-dow {
  text-align: center;
  font-size: 10px;
  font-weight: 700;
  color: var(--text-tertiary);
  padding: 4px 0;
  letter-spacing: 0.5px;
}
.duty-cal-dow.sun { color: #e53935; }
.duty-cal-dow.sat { color: #1565c0; }
.duty-cal-cell {
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background var(--transition);
  position: relative;
  font-size: 13px;
  font-weight: 500;
}
.duty-cal-cell:hover { background: var(--primary-light); }
.duty-cal-cell.today {
  background: var(--primary);
  color: white;
  font-weight: 700;
}
.duty-cal-cell.today:hover { background: var(--primary-dark); }
.duty-cal-cell.has-duty::after {
  content: '';
  position: absolute;
  bottom: 3px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--primary);
}
.duty-cal-cell.today.has-duty::after { background: white; }
.duty-cal-cell.empty { cursor: default; }
.duty-cal-cell.other-month { color: var(--text-tertiary); }
.duty-cal-popup {
  background: var(--primary);
  color: white;
  font-size: 11px;
  font-weight: 600;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  margin-top: var(--space-sm);
  text-align: center;
  min-height: 28px;
}
```

- [ ] **Step 2: src/app.js에 캘린더 렌더링 함수 추가**

`renderDutySchedule` 함수 위에 추가:

```javascript
function renderDutyCalendar(dutyData, monthStr) {
  const wrap = document.getElementById('duty-calendar-wrap');
  if (!wrap) return;

  const monthNum = parseInt(String(monthStr).replace('월', ''));
  const year = new Date().getFullYear();
  const firstDay = new Date(year, monthNum - 1, 1);
  const lastDay = new Date(year, monthNum, 0);
  const today = new Date();

  // dutyData에서 날짜→사감 맵 생성
  const dutyMap = {};
  (dutyData || []).forEach(entry => {
    const nums = String(entry.date).match(/\d+/g);
    if (!nums) return;
    const day = parseInt(nums[nums.length - 1], 10);
    if (!dutyMap[day]) dutyMap[day] = [];
    dutyMap[day].push(entry.name);
  });

  const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
  let html = `
    <div class="duty-calendar">
      <div class="duty-calendar-header">
        <span class="duty-calendar-title">${monthNum}월 사감 근무 캘린더</span>
      </div>
      <div class="duty-cal-grid">
        ${DAYS.map((d, i) => `<div class="duty-cal-dow ${i===0?'sun':i===6?'sat':''}">${d}</div>`).join('')}
  `;

  // 첫 주 빈칸
  for (let i = 0; i < firstDay.getDay(); i++) {
    html += `<div class="duty-cal-cell empty"></div>`;
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const isToday = (today.getFullYear() === year && today.getMonth() + 1 === monthNum && today.getDate() === d);
    const hasDuty = !!dutyMap[d];
    const dow = new Date(year, monthNum - 1, d).getDay();
    const colorStyle = dow === 0 ? 'color:#e53935;' : dow === 6 ? 'color:#1565c0;' : '';
    html += `
      <div class="duty-cal-cell${isToday?' today':''}${hasDuty?' has-duty':''}"
           style="${(!isToday && colorStyle) ? colorStyle : ''}"
           onclick="showDutyOnDay(${d})">${d}</div>`;
  }

  html += `</div>
    <div class="duty-cal-popup" id="duty-cal-popup">날짜를 클릭하면 해당일 사감이 표시됩니다</div>
  </div>`;

  wrap.innerHTML = html;
  APP._dutyMap = dutyMap;
}

function showDutyOnDay(day) {
  const popup = document.getElementById('duty-cal-popup');
  if (!popup) return;
  const duties = (APP._dutyMap || {})[day];
  if (duties && duties.length > 0) {
    popup.textContent = `${day}일 사감: ${duties.join(', ')}`;
    popup.style.background = 'var(--primary)';
  } else {
    popup.textContent = `${day}일: 사감 데이터 없음`;
    popup.style.background = 'var(--text-tertiary)';
  }
}
```

- [ ] **Step 3: navigateTo의 'duty' 케이스에 캘린더 렌더링 호출 추가**

```javascript
case 'duty':
  updateHeaderTitle('사감 근무 조회');
  document.getElementById('btn-back').style.display = 'none';
  renderDutyCalendar(APP.dutyData || [], APP.currentMonth);  // 추가
  renderDutySchedule(APP.dutyData || [], APP.dutyTeachers || []);
  break;
```

- [ ] **Step 4: 커밋**

```bash
git add src/app.js src/style.css
git commit -m "feat: 사감 근무 캘린더 뷰 추가"
```

---

## Task 7: 특별활동 기능 (학원/악기/야간방과후/오케스트라)

**Files:**
- Modify: `Code.gs` (getSpecialActivities, saveSpecialActivity, deleteSpecialActivity)
- Modify: `Setup.gs` (APP_특별활동 시트 생성)
- Modify: `src/app.js` (학생 카드 + 상세에 표시, 설정에서 관리)
- Modify: `src/style.css` (특별활동 뱃지)
- Modify: `Index.html` (initApp에 특별활동 추가)

- [ ] **Step 1: Setup.gs에 APP_특별활동 시트 초기화 추가**

`setupAppSheets` 함수(또는 마지막 부분)에 추가:

```javascript
// APP_특별활동
if (!ss.getSheetByName('APP_특별활동')) {
  const actSheet = ss.insertSheet('APP_특별활동');
  actSheet.appendRow(['학번', '이름', '호실', '활동종류', '요일', '시작시간', '종료시간', '비고', '등록자', '등록시각']);
  actSheet.setFrozenRows(1);
}
```

- [ ] **Step 2: Code.gs에 특별활동 조회 함수 추가**

```javascript
/**
 * 특별활동 목록 가져오기
 */
function getSpecialActivities() {
  try {
    const appDb = SpreadsheetApp.openById(getAppDbSheetId());
    const sheet = appDb.getSheetByName('APP_특별활동');
    if (!sheet || sheet.getLastRow() < 2) return { success: true, data: [] };

    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues();
    const items = data.filter(row => row[0]).map((row, i) => ({
      rowIndex: i + 2,
      studentId: String(row[0]),
      name: String(row[1]),
      room: String(row[2]),
      activityType: String(row[3]),  // 학원|악기|야간방과후|오케스트라
      days: String(row[4]),           // "월,수,금" 형식
      startTime: String(row[5]),      // "17:30"
      endTime: String(row[6]),        // "20:00"
      note: String(row[7])
    }));
    return JSON.parse(JSON.stringify({ success: true, data: items }));
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * 특별활동 저장 (추가 또는 수정)
 */
function saveSpecialActivity(rowIndex, studentId, studentName, room, activityType, days, startTime, endTime, note) {
  try {
    const appDb = SpreadsheetApp.openById(getAppDbSheetId());
    const sheet = appDb.getSheetByName('APP_특별활동');
    const user = getCurrentUser();
    const now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
    const rowData = [studentId, studentName, room, activityType, days, startTime, endTime, note || '', user.email, now];

    if (rowIndex && rowIndex > 1) {
      sheet.getRange(rowIndex, 1, 1, 10).setValues([rowData]);
    } else {
      sheet.appendRow(rowData);
    }
    addAuditLog(user.email, '특별활동 저장', studentId + ' ' + studentName, activityType + ' ' + days);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * 특별활동 삭제
 */
function deleteSpecialActivity(rowIndex) {
  try {
    const appDb = SpreadsheetApp.openById(getAppDbSheetId());
    const sheet = appDb.getSheetByName('APP_특별활동');
    sheet.deleteRow(rowIndex);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}
```

- [ ] **Step 3: initApp에 특별활동 데이터 추가**

`Code.gs`의 `initApp` 함수에 추가:

```javascript
// 9) 특별활동
let specialActivities = null;
try { specialActivities = getSpecialActivities(); } catch(e) {}

return JSON.parse(JSON.stringify({
  ...기존 필드...,
  specialActivities: specialActivities
}));
```

- [ ] **Step 4: src/app.js — APP 전역 상태에 특별활동 추가**

```javascript
const APP = {
  ...기존 필드...,
  specialActivities: []   // 특별활동 목록
};
```

`init()` 함수에서:
```javascript
if (data.specialActivities && data.specialActivities.success) {
  APP.specialActivities = data.specialActivities.data || [];
}
```

- [ ] **Step 5: src/app.js — 오늘의 특별활동 반환 헬퍼 추가**

```javascript
const DAY_MAP = { 0: '일', 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토' };

function getTodayActivities(studentId) {
  const todayDow = DAY_MAP[new Date().getDay()];
  return (APP.specialActivities || []).filter(a => {
    if (String(a.studentId) !== String(studentId)) return false;
    return a.days.split(',').map(d => d.trim()).includes(todayDow);
  });
}
```

- [ ] **Step 6: src/app.js — 학생 카드에 특별활동 뱃지 추가**

`renderStudentList`의 뱃지 영역에:

```javascript
const todayActs = getTodayActivities(s.studentId);
${todayActs.map(a =>
  `<span class="badge badge-activity">${ICONS.activity}${a.activityType} ${a.startTime}</span>`
).join('')}
```

- [ ] **Step 7: src/style.css에 특별활동 뱃지 추가**

```css
.badge-activity {
  background: #f0fdf4;
  color: #16a34a;
  border: 1px solid #bbf7d0;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
```

- [ ] **Step 8: src/app.js — 학생 상세에 이번주 특별활동 섹션 추가**

`renderContactAndLogs` 함수 하단에:

```javascript
const acts = (APP.specialActivities || []).filter(a => String(a.studentId) === String(s.studentId));
if (acts.length > 0) {
  html += `<div class="contact-section" style="margin-top:var(--space-md);">
    <h3>${ICONS.activity} 특별활동 일정</h3>
    ${acts.map(a => `
      <div class="contact-row">
        <div>
          <span class="badge badge-activity">${a.activityType}</span>
          <span style="font-size:13px;margin-left:8px;">${a.days} ${a.startTime}~${a.endTime}</span>
          ${a.note ? `<span style="font-size:12px;color:var(--text-secondary);"> / ${escapeHtml(a.note)}</span>` : ''}
        </div>
      </div>`).join('')}
  </div>`;
}
```

- [ ] **Step 9: src/app.js — 설정 화면에 특별활동 관리 섹션 추가**

`renderSettings` 함수 내 설정 그룹 목록 마지막에:

```javascript
<div class="setting-group">
  <h3>${ICONS.activity} 특별활동 관리</h3>
  <p style="font-size:12px;color:var(--text-secondary);margin-bottom:var(--space-sm);">
    학원, 악기, 야간방과후, 오케스트라 등 정기 외부활동을 등록합니다.
  </p>
  <div id="special-activities-list"></div>
  <button class="btn-primary btn-sm" style="margin-top:8px;" onclick="showAddActivityDialog()">
    + 특별활동 추가
  </button>
</div>
```

`renderSettings` 함수 마지막에 추가:
```javascript
renderSpecialActivitiesList();
```

`renderSettings` 아래에 새 함수 추가:
```javascript
function renderSpecialActivitiesList() {
  const container = document.getElementById('special-activities-list');
  if (!container) return;
  const items = APP.specialActivities || [];
  if (items.length === 0) {
    container.innerHTML = '<p style="font-size:12px;color:var(--text-tertiary);">등록된 특별활동이 없습니다.</p>';
    return;
  }
  container.innerHTML = items.map(a => `
    <div style="display:flex;align-items:center;padding:6px 0;border-bottom:1px solid var(--border-light);gap:8px;">
      <div style="flex:1;font-size:13px;">
        <strong>${escapeHtml(a.name)}</strong>
        <span style="color:var(--text-secondary);font-size:11px;"> ${escapeHtml(a.room)}호 · ${escapeHtml(a.activityType)}</span><br>
        <span style="font-size:11px;color:var(--text-tertiary);">${escapeHtml(a.days)} ${escapeHtml(a.startTime)}~${escapeHtml(a.endTime)}</span>
      </div>
      <button class="btn-status" style="color:var(--danger);" onclick="deleteActivity(${a.rowIndex})">삭제</button>
    </div>
  `).join('');
}

function showAddActivityDialog() {
  showModal('특별활동 추가', `
    <div class="form-group"><label>학번</label><input type="text" id="act-student-id" placeholder="학번"></div>
    <div class="form-group"><label>이름</label><input type="text" id="act-student-name" placeholder="이름"></div>
    <div class="form-group"><label>호실</label><input type="text" id="act-room" placeholder="101"></div>
    <div class="form-group">
      <label>활동 종류</label>
      <select id="act-type">
        <option>학원</option><option>악기</option><option>야간방과후</option><option>오케스트라</option>
      </select>
    </div>
    <div class="form-group"><label>요일 (예: 월,수,금)</label><input type="text" id="act-days" placeholder="월,수,금"></div>
    <div class="form-group"><label>시작 시간</label><input type="time" id="act-start" value="17:00"></div>
    <div class="form-group"><label>종료 시간</label><input type="time" id="act-end" value="20:00"></div>
    <div class="form-group"><label>비고 (선택)</label><input type="text" id="act-note" placeholder="예: 수학학원"></div>
    <button class="btn-modal-submit" onclick="submitActivity()">저장</button>
  `);
}

async function submitActivity() {
  const sid = document.getElementById('act-student-id').value.trim();
  const sname = document.getElementById('act-student-name').value.trim();
  const room = document.getElementById('act-room').value.trim();
  const type = document.getElementById('act-type').value;
  const days = document.getElementById('act-days').value.trim();
  const start = document.getElementById('act-start').value;
  const end = document.getElementById('act-end').value;
  const note = document.getElementById('act-note').value.trim();
  if (!sid || !sname || !days) { showToast('학번, 이름, 요일은 필수입니다.', 'warning'); return; }
  closeModal();
  const result = await callServer('saveSpecialActivity', null, sid, sname, room, type, days, start, end, note);
  if (result.success) {
    showToast('저장되었습니다.', 'success');
    const r = await callServer('getSpecialActivities');
    if (r.success) { APP.specialActivities = r.data; renderSpecialActivitiesList(); }
  } else {
    showToast('오류: ' + result.error, 'error');
  }
}

async function deleteActivity(rowIndex) {
  if (!confirm('삭제하시겠습니까?')) return;
  const result = await callServer('deleteSpecialActivity', rowIndex);
  if (result.success) {
    showToast('삭제되었습니다.', 'success');
    const r = await callServer('getSpecialActivities');
    if (r.success) { APP.specialActivities = r.data; renderSpecialActivitiesList(); }
  } else {
    showToast('오류: ' + result.error, 'error');
  }
}
```

- [ ] **Step 10: 커밋**

```bash
git add Code.gs Setup.gs src/app.js src/style.css Index.html
git commit -m "feat: 특별활동(학원/악기/방과후/오케스트라) 등록 및 표시 기능 추가"
```

---

## Task 8: GitHub 저장소 생성 + clasp 자동배포 설정

**Files:**
- Create: `.github/workflows/deploy.yml`
- Modify: `Index.html` (실제 GitHub 정보로 COMMIT_HASH 교체)

- [ ] **Step 1: GitHub 저장소 생성**

GitHub.com 에서 새 repository 생성 (예: `dormitory-app`).
Private 또는 Public 선택.

```bash
git remote add origin https://github.com/GITHUB_USER/dormitory-app.git
git branch -M main
git push -u origin main
```

- [ ] **Step 2: clasp 인증 토큰 GitHub Secrets에 등록**

```bash
# 로컬에서 clasp login 후 토큰 파일 내용 확인
cat ~/.clasprc.json
```

GitHub 저장소 → Settings → Secrets and variables → Actions → New secret:
- `CLASP_TOKEN`: `~/.clasprc.json` 파일 내용 전체
- `GAS_DEPLOYMENT_ID`: GAS 배포 ID (GAS 편집기 → 배포 관리 → 배포 ID)

- [ ] **Step 3: GitHub Actions 워크플로 생성**

```bash
mkdir -p .github/workflows
```

`.github/workflows/deploy.yml`:

```yaml
name: Deploy to Google Apps Script

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install clasp
        run: npm install -g @google/clasp

      - name: Setup clasp credentials
        run: echo '${{ secrets.CLASP_TOKEN }}' > ~/.clasprc.json

      - name: Get commit hash
        id: hash
        run: echo "hash=$(git rev-parse HEAD)" >> $GITHUB_OUTPUT

      - name: Update CDN hash in Index.html
        run: |
          sed -i 's|@[A-Za-z0-9]\{40\}|@${{ steps.hash.outputs.hash }}|g' Index.html

      - name: Push to GAS
        run: clasp push --force

      - name: Deploy
        run: clasp deploy --deploymentId "${{ secrets.GAS_DEPLOYMENT_ID }}" --description "Auto-deploy ${{ steps.hash.outputs.hash }}"
```

- [ ] **Step 4: Index.html 초기 COMMIT_HASH 실제값으로 교체**

현재 HEAD 커밋 해시 확인:
```bash
git rev-parse HEAD
```

`Index.html`에서 `COMMIT_HASH`를 실제 해시로, `GITHUB_USER`와 `GITHUB_REPO`를 실제 값으로 교체:
```
https://cdn.jsdelivr.net/gh/실제유저/실제저장소@실제해시/src/style.css
```

- [ ] **Step 5: 최종 push 및 자동배포 확인**

```bash
git add .github/ Index.html
git commit -m "chore: GitHub Actions 자동배포 설정"
git push
```

GitHub → Actions 탭에서 워크플로 성공 확인.
GAS 배포 URL에서 앱 정상 동작 확인.

---

## 최종 검증 체크리스트

- [ ] 벌점 이중계산 수정 확인: 외출 3회(초과 1회) → 벌점 5점만 증가
- [ ] 여학생(1xx호) 카드 왼쪽 핑크 테두리 표시
- [ ] 남학생(2xx호) 카드 왼쪽 파란 테두리 표시
- [ ] 이모지 없이 SVG 아이콘 정상 표시
- [ ] 외박→외출 전환 버튼 동작, 전환 후 "(전환 N회 포함)" 표시
- [ ] 사감 캘린더 날짜 클릭 시 사감 이름 팝업
- [ ] 기존 교사 선택 드롭다운 정상 동작
- [ ] 특별활동 설정에서 등록 후 오늘 해당 요일 학생 카드에 뱃지 표시
- [ ] GitHub push 후 GitHub Actions 자동배포 성공
- [ ] 자동배포 후 GAS URL에서 변경사항 반영 확인
