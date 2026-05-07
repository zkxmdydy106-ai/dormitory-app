function getGender(room) {
  var first = String(room || '').trim().charAt(0);
  if (first === '1') return 'female';
  if (first === '2') return 'male';
  return 'unknown';
}
  /**
   * ============================================================
   * 기숙사 업무 최적화 웹앱 — 클라이언트 JavaScript
   * ============================================================
   * 
   * SPA 라우팅, API 호출(google.script.run), 화면 렌더링 전체 담당
   */

  // ─── 전역 상태 ──────────────────────────────────────────
  const APP = {
    currentPage: 'student-list',   // 현재 활성 페이지
    currentMonth: '',              // 현재 선택된 월
    students: [],                  // 학생 리스트 캐시
    selectedStudent: null,         // 선택된 학생 상세
    penaltyItems: [],              // 벌점 항목 목록 캐시
    penaltyTargetStudent: null,    // 벌점 부여 대상 학생
    currentFilter: 'all',          // 학생 리스트 필터
    navigationHistory: [],         // 뒤로가기 히스토리
    settings: {},                  // 앱 설정값
    user: null,                    // 현재 사용자 정보
    specialActivities: []          // 특별활동 목록
  };

  // ─── 초기화 ─────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    init();
  });

  async function init() {
    try {
      // 서버 호출 1회로 모든 초기 데이터를 한번에 로드 (로딩 속도 최적화)
      const data = await callServer('initApp', '');

      if (!data) {
        showToast('초기화 실패: 서버 응답 없음', 'error');
        document.getElementById('loading-overlay').classList.add('hidden');
        return;
      }

      // 1. 사용자 정보
      APP.user = data.user || { email: 'unknown' };
      document.getElementById('user-email').textContent = APP.user.email;

      // 2. 월 탭
      const months = data.months || [];
      if (months.length > 0) {
        const select = document.getElementById('month-select');
        select.innerHTML = '';
        months.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m;
          opt.textContent = m;
          select.appendChild(opt);
        });
        // 서버에서 결정한 현재 월 적용
        select.value = data.currentMonth || months[0];
        APP.currentMonth = select.value;
      } else {
        APP.currentMonth = '3월';
      }

      // 3. 설정값
      APP.settings = data.settings || { MAX_OUT_COUNT: '2', MAX_STAY_COUNT: '2' };

      // 4. 전역 데이터 캐시 저장 (SPA 1초 로딩 구현 핵심)
      if (data.dutyData && data.dutyData.success) {
        APP.dutyData = data.dutyData.data || [];
        APP.dutyTeachers = data.dutyData.teachers || [];
      } else {
        APP.dutyData = [];
        APP.dutyTeachers = [];
      }

      if (data.suggestions && data.suggestions.success) {
        APP.suggestions = data.suggestions.data || [];
      } else {
        APP.suggestions = [];
      }

      if (data.cumulativeRecords && data.cumulativeRecords.success) {
        APP.cumulativeRecords = data.cumulativeRecords.data || [];
      } else {
        APP.cumulativeRecords = [];
      }

      if (data.specialActivities && data.specialActivities.success) {
        APP.specialActivities = data.specialActivities.data || [];
      }

      // 5. 학생 리스트 렌더링
      if (data.studentList && data.studentList.success) {
        APP.students = data.studentList.data;
        renderStudentList(APP.students);
      } else {
        const listContainer = document.getElementById('student-list');
        listContainer.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>${data.studentList ? data.studentList.error : '학생 데이터를 불러올 수 없습니다.'}</p></div>`;
      }

      // 로딩 오버레이 숨기기
      document.getElementById('loading-overlay').classList.add('hidden');

    } catch (e) {
      console.error('초기화 오류:', e);
      showToast('초기화 오류: ' + e, 'error');
      document.getElementById('loading-overlay').classList.add('hidden');
    }
  }

  // ─── 서버 호출 헬퍼 ─────────────────────────────────────
  /**
   * google.script.run을 Promise로 감싸는 헬퍼
   * @param {string} functionName - 서버 함수명
   * @param {...any} args - 함수 인자들
   */
  function callServer(functionName, ...args) {
    return new Promise((resolve, reject) => {
      const runner = google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject);
      runner[functionName](...args);
    });
  }

  // ─── 네비게이션 / 라우팅 ─────────────────────────────────
  function navigateTo(pageName, navBtn) {
    // 네비게이션 버튼 활성화 상태 변경
    if (navBtn) {
      document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
      navBtn.classList.add('active');
    }

    // 히스토리에 현재 페이지 저장
    if (APP.currentPage !== pageName) {
      APP.navigationHistory.push(APP.currentPage);
    }

    // 페이지 전환
    showPage(pageName);

    // 페이지별 데이터 로드 (캐시 사용으로 서버 호출 최소화)
    switch (pageName) {
      case 'student-list':
        updateHeaderTitle('기숙사 관리');
        document.getElementById('btn-back').style.display = 'none';
        // 학생리스트는 자주 바뀌므로 기본적으로 수동/자동 캐시 병행. 여기서는 이미 있는 APP.students 사용
        renderStudentList(APP.students);
        break;
      case 'student-detail':
        document.getElementById('btn-back').style.display = 'flex';
        break;
      case 'penalty-items':
        updateHeaderTitle('벌점 항목 선택');
        document.getElementById('btn-back').style.display = 'flex';
        loadPenaltyItems(); // 거의 변동 없고 크기 작음
        break;
      case 'cumulative':
        updateHeaderTitle('누가 기록');
        document.getElementById('btn-back').style.display = 'none';
        renderCumulativeRecords(APP.cumulativeRecords || []);
        break;
      case 'suggestions':
        updateHeaderTitle('교사 건의사항');
        document.getElementById('btn-back').style.display = 'none';
        renderSuggestions(APP.suggestions || []);
        break;
      case 'duty':
        updateHeaderTitle('사감 근무 조회');
        document.getElementById('btn-back').style.display = 'none';
        renderDutyCalendar(APP.dutyData || [], APP.currentMonth);
        renderDutySchedule(APP.dutyData || [], APP.dutyTeachers || []);
        break;
      case 'settings':
        updateHeaderTitle('설정');
        document.getElementById('btn-back').style.display = 'none';
        renderSettings();
        break;
    }
  }

  function showPage(pageName) {
    APP.currentPage = pageName;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const page = document.getElementById('page-' + pageName);
    if (page) page.classList.add('active');
  }

  function goBack() {
    if (APP.navigationHistory.length > 0) {
      const prevPage = APP.navigationHistory.pop();
      showPage(prevPage);

      // 네비게이션 버튼 상태 복원
      const navBtn = document.querySelector(`[data-page="${prevPage}"]`);
      if (navBtn) {
        document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
        navBtn.classList.add('active');
      }

      if (prevPage === 'student-list') {
        updateHeaderTitle('기숙사 관리');
        document.getElementById('btn-back').style.display = 'none';
        renderStudentList(APP.students);
      }
    }
  }

  function updateHeaderTitle(title) {
    document.getElementById('header-title').textContent = title;
  }

  async function onMonthChange() {
    APP.currentMonth = document.getElementById('month-select').value;
    const listContainer = document.getElementById('student-list');
    listContainer.innerHTML = '<div class="empty-state"><div class="spinner"></div><p>월별 데이터 불러오는 중...</p></div>';

    try {
      // 1회의 API 호출로 모든 데이터 갱신 (서버 중복 호출 최적화)
      const data = await callServer('initApp', APP.currentMonth);
      if (data) {
        if (data.studentList && data.studentList.success) APP.students = data.studentList.data;
        if (data.dutyData && data.dutyData.success) {
          APP.dutyData = data.dutyData.data;
          APP.dutyTeachers = data.dutyData.teachers;
        }
        if (data.suggestions && data.suggestions.success) APP.suggestions = data.suggestions.data;
        if (data.cumulativeRecords && data.cumulativeRecords.success) APP.cumulativeRecords = data.cumulativeRecords.data;

        // 현재 선택된 화면 렌더링 업데이트
        navigateTo(APP.currentPage, null);
      }
    } catch (e) {
      listContainer.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><p>오류: ${e}</p></div>`;
    }
  }

  // ─── 공통 데이터 리프레시 버튼 핸들러 ────────────────────
  async function forceRefreshData() {
    showToast('새로고침 중...', 'info');
    document.getElementById('header-title').textContent = '로딩중...';
    try {
      const data = await callServer('forceInitApp', APP.currentMonth);
      if (data) {
        if (data.studentList && data.studentList.success) APP.students = data.studentList.data;
        if (data.dutyData && data.dutyData.success) {
          APP.dutyData = data.dutyData.data;
          APP.dutyTeachers = data.dutyData.teachers;
        }
        if (data.suggestions && data.suggestions.success) APP.suggestions = data.suggestions.data;
        if (data.cumulativeRecords && data.cumulativeRecords.success) APP.cumulativeRecords = data.cumulativeRecords.data;

        // 현재 열려있는 페이지 다시 렌더링
        navigateTo(APP.currentPage, null);
        showToast('최신 정보로 갱신되었습니다.', 'success');
      }
    } catch (e) {
      showToast('새로고침 실패', 'error');
    }
  }

  // ─── 학생 리스트 ────────────────────────────────────────
  async function loadStudentList() {
    const listContainer = document.getElementById('student-list');
    listContainer.innerHTML = '<div class="empty-state"><div class="spinner"></div><p>학생 목록 불러오는 중...</p></div>';

    try {
      const result = await callServer('getStudentList', APP.currentMonth);
      if (!result.success) {
        listContainer.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>${result.error}</p></div>`;
        return;
      }

      APP.students = result.data;
      renderStudentList(APP.students);
    } catch (e) {
      listContainer.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><p>오류: ${e}</p></div>`;
    }
  }

  var DAY_MAP = {0:'일',1:'월',2:'화',3:'수',4:'목',5:'금',6:'토'};
  function getTodayActivities(studentId) {
    var todayDow = DAY_MAP[new Date().getDay()];
    return (APP.specialActivities || []).filter(function(a) {
      if (String(a.studentId) !== String(studentId)) return false;
      return String(a.days || '').split(',').map(function(d) { return d.trim(); }).indexOf(todayDow) !== -1;
    });
  }

  function renderStudentList(students) {
    const listContainer = document.getElementById('student-list');

    if (!students || students.length === 0) {
      listContainer.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>학생 데이터가 없습니다.</p></div>';
      return;
    }

    listContainer.innerHTML = students.map(s => {
      const isRecent = s.lastModifiedLocal && (Date.now() - s.lastModifiedLocal < 5000);
      const totalP = s.calculatedTotalPenalty || s.totalPenalty || 0;
      const outCount = isRecent ? (s.appOutCount || 0) : Math.max(s.appOutCount || 0, s.outCount || 0);
      const stayCount = isRecent ? (s.appStayCount || 0) : Math.max(s.appStayCount || 0, s.stayCount || 0);
      const initial = s.name ? s.name.charAt(0) : '?';
      const gender = getGender(s.room);

      return `
      <div class="student-card gender-${gender}" id="student-card-${s.studentId}" onclick="openStudentDetail('${s.studentId}')">
        <div class="student-avatar">${initial}</div>
        <div class="student-info">
          <div class="student-name">${escapeHtml(s.name)}</div>
          <div class="student-meta">
            <span>${(window.ICONS && ICONS.room) || '🏠'} ${escapeHtml(s.room)}</span>
            <span>${(window.ICONS && ICONS.id) || '📝'} ${escapeHtml(s.studentId)}</span>
          </div>
        </div>
        <div class="student-badges" id="badges-${s.studentId}">
          ${outCount > 0 ? `<span class="badge badge-out">외출${outCount}</span>` : ''}
          ${stayCount > 0 ? `<span class="badge badge-stay">외박${stayCount}</span>` : ''}
          ${(s.cumulativePenalty > 0 || totalP > 0) ? `<span class="badge badge-penalty">${s.cumulativePenalty || totalP}점</span>` : ''}
        </div>
      </div>
    `;
    }).join('');
  }

  // ─── 학생 카드 뱃지 부분 업데이트 ─────────────────────────
  function updateStudentCardUI(s) {
    const badgesContainer = document.getElementById('badges-' + s.studentId);
    if (!badgesContainer) return;

    const totalP = s.cumulativePenalty !== undefined ? s.cumulativePenalty : (s.calculatedTotalPenalty || s.totalPenalty || 0);
    const outCount = s.appOutCount || s.outCount || 0;
    const stayCount = s.appStayCount || s.stayCount || 0;

    badgesContainer.innerHTML = `
      ${outCount > 0 ? `<span class="badge badge-out">외출${outCount}</span>` : ''}
      ${stayCount > 0 ? `<span class="badge badge-stay">외박${stayCount}</span>` : ''}
      ${totalP > 0 ? `<span class="badge badge-penalty">${totalP}점</span>` : ''}
    `;
  }

  function filterStudents() {
    const query = document.getElementById('search-input').value.toLowerCase().trim();
    let filtered = APP.students;

    // 텍스트 검색
    if (query) {
      filtered = filtered.filter(s =>
        s.name.toLowerCase().includes(query) ||
        s.studentId.toLowerCase().includes(query) ||
        s.room.toLowerCase().includes(query)
      );
    }

    // 필터 칩
    if (APP.currentFilter === 'penalty') {
      filtered = filtered.filter(s => (s.calculatedTotalPenalty || s.totalPenalty || 0) > 0);
    } else if (APP.currentFilter === 'discipline') {
      filtered = filtered.filter(s => {
        const d = s.calculatedDiscipline || s.discipline || '';
        return d && d !== '없음';
      });
    } else if (APP.currentFilter === 'female') {
      filtered = filtered.filter(function(s) { return getGender(s.room) === 'female'; });
    } else if (APP.currentFilter === 'male') {
      filtered = filtered.filter(function(s) { return getGender(s.room) === 'male'; });
    }

    renderStudentList(filtered);
  }

  function setFilter(filter, btn) {
    APP.currentFilter = filter;
    document.querySelectorAll('.filter-chips .chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    filterStudents();
  }

  // ─── 학생 상세 ──────────────────────────────────────────
  function openStudentDetail(studentId) {
    const baseStudent = APP.students.find(s => s.studentId === studentId);
    navigateTo('student-detail');

    const container = document.getElementById('student-detail-content');

    if (baseStudent) {
      APP.selectedStudent = baseStudent;

      // UI 골격 렌더링 (최초 1회만 화면 덮어쓰기)
      renderStudentDetailHTML(baseStudent);

      // 기록 데이터가 아직 서버에서 수신되지 않았다면 빈 스피너 공간 확보
      if (!baseStudent.outLogs) {
        document.getElementById('detail-bottom-section').innerHTML = '<div style="text-align:center; padding: 20px;"><div class="spinner" style="width:20px;height:20px;margin:0 auto;border-color:var(--primary) transparent transparent transparent;"></div></div>';
      }
    } else {
      container.innerHTML = '<div class="empty-state"><div class="spinner"></div><p>학생 정보 불러오는 중...</p></div>';
    }

    const requestTime = Date.now();
    // 서버에서 상세 데이터(연락처, 외출외박로그) 백그라운드 보강 (await 없이 백그라운드 실행)
    callServer('getStudentDetail', studentId, APP.currentMonth).then(result => {
      if (result && result.success) {

        // 현재 클라이언트에 실행 대기(디바운스 중) 또는 진행 중인 토글이 있다면, 서버 스냅샷(과거)으로 덮어쓰지 않도록 보호
        APP.pendingToggles = APP.pendingToggles || {};
        APP.isSyncing = APP.isSyncing || {};
        const isPending = Object.keys(APP.pendingToggles).some(k => k.startsWith(studentId + '_')) || APP.isSyncing[studentId] > 0;

        // requestTime 이후에 클라이언트(사용자)가 직접 조작한 흔적이 있다면 서버에서 온 구식 데이터로 덮어쓰지 않음
        const isLocalNewer = baseStudent && baseStudent.lastModifiedLocal && baseStudent.lastModifiedLocal > requestTime;

        if ((isPending || isLocalNewer) && baseStudent) {
          result.data.todayOut = baseStudent.todayOut;
          result.data.todayStay = baseStudent.todayStay;
          result.data.appOutCount = baseStudent.appOutCount;
          result.data.appStayCount = baseStudent.appStayCount;
          result.data.outLogs = baseStudent.outLogs;
        }

        if (baseStudent) {
          Object.assign(baseStudent, result.data); // 메모리 캐시 갱신
          APP.selectedStudent = baseStudent;
        } else {
          APP.selectedStudent = result.data;
          renderStudentDetailHTML(result.data); // 골격 렌더링
        }

        // 현재 상세 페이지인 경우 깜빡임 없이 부분 DOM 업데이트 실행
        if (APP.currentPage === 'student-detail' && APP.selectedStudent.studentId === studentId) {
          updateDetailStatsUI(APP.selectedStudent);
        }
      } else if (!baseStudent) {
        container.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>${result ? result.error : '학생 정보를 불러올 수 없습니다.'}</p></div>`;
      }
    }).catch(e => {
      if (!baseStudent) container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><p>오류: ${e}</p></div>`;
    });
  }

  function renderStudentDetailHTML(s) {
    const container = document.getElementById('student-detail-content');
    const initial = s.name ? s.name.charAt(0) : '?';
    const gender = getGender(s.room);

    container.innerHTML = `
    <!-- 프로필 헤더 -->
    <div class="detail-header">
      <div class="detail-avatar gender-${gender}">${initial}</div>
      <h2 class="detail-name">${escapeHtml(s.name)}</h2>
      <div class="detail-sub">${(window.ICONS && ICONS.room) || '🏠'} ${escapeHtml(s.room)} &nbsp;|&nbsp; ${(window.ICONS && ICONS.id) || '📝'} ${escapeHtml(s.studentId)}</div>
    </div>
    
    <!-- 통계 카드 -->
    <div class="stats-grid">
      <div class="stat-card out">
        <div class="stat-value" id="stat-out"></div>
        <div class="stat-label">외출 횟수</div>
      </div>
      <div class="stat-card stay">
        <div class="stat-value" id="stat-stay"></div>
        <div class="stat-label">외박 횟수</div>
      </div>
      <div class="stat-card penalty" onclick="showPenaltyBreakdown(APP.selectedStudent)" style="cursor:pointer;" title="클릭하면 월별 벌점 내역 확인">
        <div class="stat-value" id="stat-penalty"></div>
        <div class="stat-label">누적 벌점 ▸</div>
      </div>
      <div class="stat-card discipline">
        <div class="stat-value" id="stat-discipline" style="font-size:14px; color: var(--warning);"></div>
        <div class="stat-label">징계 상태</div>
      </div>
    </div>
    
    <!-- 날짜 선택 기능 -->
    <div class="return-time-section visible" style="margin-bottom: var(--space-md); padding: 12px; border: 1px solid var(--border); background: var(--surface);">
      <label style="margin-bottom:4px;display:flex;align-items:center;gap:4px;">${(window.ICONS && ICONS.today) || '📅'} 적용 날짜 (과거 기록용)</label>
      <input type="date" id="record-date-input" value="${APP.selectedDate || new Date().toISOString().split('T')[0]}" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: var(--radius-sm);">
    </div>

    <!-- 외출/외박 토글 버튼 -->
    <div class="action-buttons">
      <button class="btn-action" id="btn-toggle-out" onclick="toggleOutStay('외출')"></button>
      <button class="btn-action" id="btn-toggle-stay" onclick="toggleOutStay('외박')"></button>
    </div>

    <!-- 외박→외출 전환 버튼 -->
    <button class="btn-convert-stay" onclick="convertStayToOut()">↔ 외박을 외출로 전환하여 사용</button>
    
    <!-- 귀사 시간 입력 (외출 시) -->
    <div class="return-time-section" id="return-time-section">
      <label style="display:flex;align-items:center;gap:4px;">${(window.ICONS && ICONS.clock) || '🕐'} 귀사 예정 시간</label>
      <input type="time" id="return-time-input" value="${s.todayOut ? (s.todayOut.returnTime || '') : ''}" onchange="updateReturnTime()">
    </div>
    
    <!-- 벌점 부여 버튼 -->
    <button class="btn-penalty-add" onclick="openPenaltySelection('${s.studentId}', '${escapeHtml(s.name)}')" style="display:flex;align-items:center;justify-content:center;gap:6px;">
      ${(window.ICONS && ICONS.bolt) || '⚡'} 벌점 부여하기
    </button>
    
    <!-- 유동적 연락처 및 기록 렌더링 영역 -->
    <div id="detail-bottom-section"></div>
    `;

    updateHeaderTitle(s.name);
    updateDetailStatsUI(s); // 틀을 채운 후 값을 즉시 반영
  }

  // 화면 일부분만 업데이트하는 핵심 함수 (깜빡임 차단)
  function updateDetailStatsUI(s) {
    const maxOut = APP.settings.MAX_OUT_COUNT || 2;
    const maxStay = APP.settings.MAX_STAY_COUNT || 2;

    // 조작 직후(5초 내)에는 사용자가 만든 0 등의 falsy 값을 절대적으로 신뢰 (팝백 방지)
    // 시간이 지나면, 기존처럼 시트 수동 작성값(outCount)으로 fallback 허용 (연동성 복구)
    const isRecent = s.lastModifiedLocal && (Date.now() - s.lastModifiedLocal < 5000);
    const outCount = isRecent ? (s.appOutCount || 0) : Math.max(s.appOutCount || 0, s.outCount || 0);
    const stayCount = isRecent ? (s.appStayCount || 0) : Math.max(s.appStayCount || 0, s.stayCount || 0);

    const totalP = s.calculatedTotalPenalty || s.totalPenalty || 0;
    const disc = s.calculatedDiscipline || s.discipline || '없음';

    const elOut = document.getElementById('stat-out');
    if (elOut) {
      elOut.textContent = `${outCount}/${maxOut}`;
      elOut.style.color = 'var(--info)';
      var convertedCount = s.outLogs ? s.outLogs.filter(function(l) { return l.type === '외박(외출전환)' && l.status === 'active'; }).length : 0;
      var elOutNote = elOut.parentElement.querySelector('.converted-note');
      if (convertedCount > 0) {
        if (!elOutNote) {
          elOutNote = document.createElement('div');
          elOutNote.className = 'converted-note';
          elOutNote.style.cssText = 'font-size:10px;color:#f59e0b;margin-top:-4px;';
          elOut.parentElement.appendChild(elOutNote);
        }
        elOutNote.textContent = '(전환 ' + convertedCount + '회 포함)';
      } else if (elOutNote) {
        elOutNote.remove();
      }
    }
    const elStay = document.getElementById('stat-stay');
    if (elStay) {
      elStay.textContent = `${stayCount}/${maxStay}`;
      elStay.style.color = 'var(--success)';
    }
    const elPen = document.getElementById('stat-penalty');
    if (elPen) {
      const cumP = s.cumulativePenalty !== undefined ? s.cumulativePenalty : totalP;
      elPen.textContent = `${cumP}점`;
      elPen.style.color = 'var(--danger)';
    }
    const elDisc = document.getElementById('stat-discipline');
    if (elDisc) elDisc.textContent = disc;

    const todayOutActive = s.todayOut ? true : false;
    const todayStayActive = s.todayStay ? true : false;

    const btnOut = document.getElementById('btn-toggle-out');
    if (btnOut) {
      btnOut.className = `btn-action ${todayOutActive ? 'active' : ''}`;
      btnOut.innerHTML = `
        <span class="action-icon">${todayOutActive ? (ICONS && ICONS.check || '✅') : (ICONS && ICONS.out || '🚶')}</span>
        <span>외출${todayOutActive ? ' (오늘 기록됨)' : ''}</span>
        <span class="action-sub">${outCount >= maxOut ? '⚠ 초과 시 벌점 부과' : '이번달 ' + outCount + '/' + maxOut}</span>
      `;
    }

    const btnStay = document.getElementById('btn-toggle-stay');
    if (btnStay) {
      btnStay.className = `btn-action ${todayStayActive ? 'active' : ''}`;
      btnStay.innerHTML = `
        <span class="action-icon">${todayStayActive ? (ICONS && ICONS.check || '✅') : (ICONS && ICONS.moon || '🌙')}</span>
        <span>외박${todayStayActive ? ' (오늘 기록됨)' : ''}</span>
        <span class="action-sub">${stayCount >= maxStay ? '⚠ 초과 시 벌점 부과' : '이번달 ' + stayCount + '/' + maxStay}</span>
      `;
    }

    const retSec = document.getElementById('return-time-section');
    if (retSec) retSec.className = `return-time-section ${todayOutActive ? 'visible' : ''}`;

    const bottomSec = document.getElementById('detail-bottom-section');
    if (bottomSec && s.outLogs) {
      bottomSec.innerHTML = renderContactAndLogs(s);
    }
  }

  function renderContactAndLogs(s) {
    let html = '<div class="contact-section"><h3>📞 연락처</h3>';
    if (s.studentPhone) {
      html += `
        <div class="contact-row">
          <div>
            <div class="contact-label">학생 전화</div>
            <div class="contact-value">${escapeHtml(s.studentPhone)}</div>
          </div>
          <div class="contact-actions">
            <a href="tel:${s.studentPhone}" target="_top" class="btn-contact btn-call">📞 전화</a>
            <button class="btn-contact btn-sms" onclick="openSms('${s.studentPhone}', '${escapeHtml(s.name)}')">💬 문자</button>
          </div>
        </div>
      `;
    }
    if (s.parentPhone) {
      html += `
        <div class="contact-row">
          <div>
            <div class="contact-label">학부모 전화</div>
            <div class="contact-value">${escapeHtml(s.parentPhone)}</div>
          </div>
          <div class="contact-actions">
            <a href="tel:${s.parentPhone}" target="_top" class="btn-contact btn-call">📞 전화</a>
            <button class="btn-contact btn-sms" onclick="openSms('${s.parentPhone}', '${escapeHtml(s.name)}')">💬 문자</button>
          </div>
        </div>
      `;
    }
    if (!s.studentPhone && !s.parentPhone) {
      html += `
        <p style="color:var(--text-tertiary);font-size:13px;">연락처가 등록되지 않았습니다.</p>
        <button class="btn-primary btn-sm" onclick="showContactEditDialog('${s.studentId}', '${escapeHtml(s.name)}')">연락처 등록</button>
      `;
    } else {
      html += `<button class="btn-primary btn-sm" style="margin-top:8px" onclick="showContactEditDialog('${s.studentId}', '${escapeHtml(s.name)}')">연락처 수정</button>`;
    }
    html += '</div>';

    if (s.outLogs && s.outLogs.length > 0) {
      html += `<div class="contact-section" style="margin-top: var(--space-md);">
        <h3>📅 이번달 외출/외박 기록</h3>
        ${s.outLogs.filter(l => l.status === 'active').map(l => `
          <div class="contact-row">
            <div>
              <span class="badge ${l.type === '외출' ? 'badge-out' : 'badge-stay'}">${l.type}</span>
              <span style="font-size:13px; margin-left:8px;">${l.date}</span>
              ${l.returnTime ? `<span style="font-size:12px; color:var(--text-secondary);"> 귀사: ${l.returnTime}</span>` : ''}
            </div>
          </div>
        `).join('')}
      </div>`;
    }
    return html;
  }

  // ─── 외출/외박 토글 최적화 (Optimistic UI & Debounce) ────────────────────────────────────
  APP.pendingToggles = APP.pendingToggles || {};
  APP.isSyncing = APP.isSyncing || {};

  function toggleOutStay(type) {
    const s = APP.selectedStudent;
    if (!s) return;

    s.lastModifiedLocal = Date.now(); // 사용자가 조작한 최신 시점 기록

    const returnTime = type === '외출' ? document.getElementById('return-time-input')?.value || '' : '';
    const recordDate = document.getElementById('record-date-input')?.value || new Date().toISOString().split('T')[0];
    APP.selectedDate = recordDate;

    // 조작 횟수 기록 (디바운스 판별용)
    const key = `${s.studentId}_${type}_${recordDate}`;
    if (!APP.pendingToggles[key]) {
      APP.pendingToggles[key] = { count: 0, timer: null };
    }
    APP.pendingToggles[key].count++;

    // 즉각적인 UI 반영을 위한 캐시 변경 (Optimistic Update)
    const today = new Date().toISOString().split('T')[0];
    const isToday = recordDate === today;

    if (!s.outLogs) s.outLogs = [];

    const newLog = {
      date: recordDate,
      type: type,
      studentId: s.studentId,
      name: s.name,
      room: s.room,
      returnTime: returnTime,
      status: 'active',
      recorder: APP.user && APP.user.email ? APP.user.email : '',
      timestamp: new Date().toISOString()
    };

    let actionText = '';
    if (type === '외출') {
      // 이미 오늘 외출 기록이 활성화되어 있다면 -> 취소 동작
      const existingOut = s.outLogs.find(l => String(l.date).startsWith(recordDate) && l.type === '외출' && l.status === 'active');
      if (existingOut) {
        existingOut.status = 'removed';
        if (s.todayOut && String(s.todayOut.date).startsWith(recordDate)) s.todayOut.status = 'removed';
        s.appOutCount = Math.max(0, (s.appOutCount || 0) - 1);
        actionText = '외출 취소 완료';
        if (isToday) s.todayOut = null;
      } else {
        // 새로 추가 동작
        s.todayOut = newLog;
        s.appOutCount = (s.appOutCount || 0) + 1;
        s.outLogs.unshift(newLog);
        actionText = '외출 기록 완료';
      }
    } else {
      // 외박 토글
      const existingStay = s.outLogs.find(l => String(l.date).startsWith(recordDate) && l.type === '외박' && l.status === 'active');
      if (existingStay) {
        existingStay.status = 'removed';
        if (s.todayStay && String(s.todayStay.date).startsWith(recordDate)) s.todayStay.status = 'removed';
        s.appStayCount = Math.max(0, (s.appStayCount || 0) - 1);
        actionText = '외박 취소 완료';
        if (isToday) s.todayStay = null;
      } else {
        s.todayStay = newLog;
        s.appStayCount = (s.appStayCount || 0) + 1;
        s.outLogs.unshift(newLog);
        actionText = '외박 기록 완료';
      }
    }

    // 메인화면 목록용 학생 데이터 즉각 변경
    const baseStudent = APP.students.find(x => x.studentId === s.studentId);
    if (baseStudent) {
      Object.assign(baseStudent, s);
      updateStudentCardUI(baseStudent); // 리스트 화면 뱃지 업데이트
    }

    // 현재 열려있는 탭 일부분만 즉시 변경 (깜빡임 차단, 알림 메시지 제거)
    updateDetailStatsUI(s);

    // 이전 타이머 지우기 (Debounce)
    if (APP.pendingToggles[key].timer) clearTimeout(APP.pendingToggles[key].timer);

    // 1.5초 동안 추가 입력이 없으면 서버 전송
    APP.pendingToggles[key].timer = setTimeout(() => {
      const finalCount = APP.pendingToggles[key].count;
      delete APP.pendingToggles[key]; // 큐에서 삭제

      // 홀수 번 클릭(상태 변경) 시에만 서버 전송, 짝수 번(원상 복구)은 통신 생략
      if (finalCount % 2 !== 0) {
        APP.isSyncing[s.studentId] = (APP.isSyncing[s.studentId] || 0) + 1; // 동기화 중 플래그 온

        callServer('toggleOutStay', s.studentId, s.name, s.room, type, returnTime, APP.currentMonth, recordDate)
          .catch(e => {
            showToast('통신 오류 발생: ' + e, 'error');
          })
          .finally(() => {
            if (APP.isSyncing[s.studentId] > 0) APP.isSyncing[s.studentId]--;
          });
      }
    }, 1500);
  }

  function convertStayToOut() {
    var s = APP.selectedStudent;
    if (!s) return;

    var dateInput = document.getElementById('record-date-input');
    var recordDate = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];
    var existing = s.outLogs && s.outLogs.find(function(l) {
      return String(l.date).startsWith(recordDate) && l.type === '외박(외출전환)' && l.status === 'active';
    });

    if (existing) {
      existing.status = 'removed';
      s.appOutCount = Math.max(0, (s.appOutCount || 0) - 1);
    } else {
      var newLog = {
        date: recordDate,
        type: '외박(외출전환)',
        studentId: s.studentId,
        name: s.name,
        room: s.room,
        returnTime: '',
        status: 'active',
        recorder: APP.user && APP.user.email ? APP.user.email : '',
        timestamp: new Date().toISOString()
      };
      if (!s.outLogs) s.outLogs = [];
      s.outLogs.unshift(newLog);
      s.appOutCount = (s.appOutCount || 0) + 1;
    }

    s.lastModifiedLocal = Date.now();
    updateDetailStatsUI(s);

    var baseStudent = APP.students && APP.students.find(function(x) { return x.studentId === s.studentId; });
    if (baseStudent) {
      Object.assign(baseStudent, s);
      updateStudentCardUI(baseStudent);
    }

    callServer('convertStayToOut', s.studentId, s.name, s.room, APP.currentMonth, recordDate)
      .catch(function(e) { console.error(e); });
  }

  async function updateReturnTime() {
    // 귀사 시간이 바뀌면 서버에 업데이트 (기존 active 기록의 귀사시간 갱신)
    // 간단히 토글 취소 후 다시 기록하는 로직은 번거로우므로,
    // 여기서는 사용자가 문자로 보낼 때 실시간 반영되도록 프론트에만 보관
  }

  // ─── 벌점 부여 ──────────────────────────────────────────
  function openPenaltySelection(studentId, studentName) {
    APP.penaltyTargetStudent = { studentId, name: studentName };
    navigateTo('penalty-items');
  }

  async function loadPenaltyItems() {
    const container = document.getElementById('penalty-items-list');

    // 앱 시작 시 한 번 로드했다면 캐시된 내용을 즉시 렌더링
    if (APP.penaltyItems && APP.penaltyItems.length > 0) {
      renderPenaltyItems(APP.penaltyItems);
      return;
    }

    container.innerHTML = '<div class="empty-state"><div class="spinner"></div><p>벌점 항목 로드 중...</p></div>';

    try {
      const result = await callServer('getPenaltyItems');
      if (!result.success) {
        container.innerHTML = `<div class="empty-state"><p>${result.error}</p></div>`;
        return;
      }

      APP.penaltyItems = result.data;
      renderPenaltyItems(result.data);
    } catch (e) {
      container.innerHTML = `<div class="empty-state"><p>오류: ${e}</p></div>`;
    }
  }

  function renderPenaltyItems(items) {
    const container = document.getElementById('penalty-items-list');

    if (!items || items.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>벌점 항목이 없습니다.</p></div>';
      return;
    }

    // 점수 오름차순 정렬 (0점=즉시퇴사는 맨 마지막)
    const sorted = [...items].sort((a, b) => {
      if (a.points === 0 && b.points === 0) return 0;
      if (a.points === 0) return 1;  // 즉시퇴사는 맨 뒤
      if (b.points === 0) return -1;
      return a.points - b.points;    // 낮은 점수부터
    });

    let html = '';
    sorted.forEach(item => {
      const pointsDisplay = item.points === 0 ? '즉시퇴사' : item.points + '점';
      const pointsClass = item.points === 0 ? 'style="color:var(--danger);font-size:13px;font-weight:700;"' : '';
      html += `
        <div class="penalty-item-card" onclick="selectPenaltyItem(${item.index}, '${escapeHtml(item.name)}', ${item.points})">
          <div class="penalty-item-info">
            <h4>${escapeHtml(item.name)}</h4>
            <p>${escapeHtml(item.description)}</p>
            <span class="badge" style="background:var(--surface-variant);color:var(--text-secondary);font-size:11px;">${escapeHtml(item.category || '기타')}</span>
          </div>
          <div class="penalty-points" ${pointsClass}>${pointsDisplay}</div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  function filterPenaltyItems() {
    const query = document.getElementById('penalty-search').value.toLowerCase().trim();
    if (!query) {
      renderPenaltyItems(APP.penaltyItems);
      return;
    }

    const filtered = APP.penaltyItems.filter(item =>
      item.name.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query) ||
      item.category.toLowerCase().includes(query)
    );
    renderPenaltyItems(filtered);
  }

  function selectPenaltyItem(index, itemName, points) {
    if (!APP.penaltyTargetStudent) {
      showToast('대상 학생을 먼저 선택하세요.', 'warning');
      return;
    }

    const student = APP.penaltyTargetStudent;
    const pointsLabel = points === 0 ? '즉시퇴사 대상' : points + '점';

    showModal('벌점 부여 확인', `
    <div style="margin-bottom:var(--space-md);">
      <p><strong>${escapeHtml(student.name)}</strong> 학생에게</p>
      <p style="font-size:18px;font-weight:700;color:var(--danger);margin:8px 0;">${escapeHtml(itemName)} (${pointsLabel})</p>
      <p>벌점을 부여합니다.</p>
    </div>
    <div class="form-group">
      <label>누가기록 메모 (선택)</label>
      <textarea id="penalty-memo" placeholder="사유나 메모를 입력하세요..."></textarea>
    </div>
    <button class="btn-modal-submit btn-modal-danger" onclick="confirmPenalty('${student.studentId}', '${escapeHtml(itemName)}', ${points})">
      벌점 부여
    </button>
  `);
  }

  async function confirmPenalty(studentId, itemName, points) {
    const memo = document.getElementById('penalty-memo')?.value || '';
    closeModal();
    showToast('벌점 부여 중...', 'info');

    try {
      const result = await callServer('addPenalty', studentId, itemName, points, memo);
      if (result && result.success) {
        showToast('벌점이 부여되었습니다.', 'success');
        goBack(); // 학생 상세로 돌아가기
        // 약간의 딜레이 후 상세 새로고침
        setTimeout(() => openStudentDetail(studentId), 300);
      } else if (result && result.error) {
        showToast('오류: ' + result.error, 'error');
      } else {
        showToast('벌점 처리 완료', 'success');
        goBack();
        setTimeout(() => openStudentDetail(studentId), 300);
      }
    } catch (e) {
      showToast('오류: ' + e, 'error');
    }
  }

  // ─── 문자/전화 연락 ────────────────────────────────────
  async function openSms(phone, studentName) {
    const s = APP.selectedStudent;

    // 외출/외박 상태에 따라 템플릿 유형 결정
    let type = '외출'; // 기본값
    if (s && s.todayStay) type = '외박';

    try {
      const result = await callServer('getSmsTemplate', type);
      let body = result.success ? result.data : '';

      // 변수 치환
      const today = new Date();
      const dateStr = (today.getMonth() + 1) + '월 ' + today.getDate() + '일';
      const returnTime = document.getElementById('return-time-input')?.value || '미정';

      body = body.replace(/\{이름\}/g, studentName || '');
      body = body.replace(/\{날짜\}/g, dateStr);
      body = body.replace(/\{귀사시간\}/g, returnTime);

      // SMS 딥링크 (iOS: sms:번호&body=... / Android: sms:번호?body=...)
      const encodedBody = encodeURIComponent(body);
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      const separator = isIOS ? '&' : '?';
      const smsUrl = `sms:${phone}${separator}body=${encodedBody}`;

      window.top.location.href = smsUrl;
    } catch (e) {
      // 템플릿 로드 실패 시 빈 문자로 열기
      window.top.location.href = `sms:${phone}`;
    }
  }

  // ─── 연락처 수정 다이얼로그 ─────────────────────────────
  function showContactEditDialog(studentId, studentName) {
    const s = APP.selectedStudent;
    showModal('연락처 등록/수정', `
    <div class="form-group">
      <label>학생명</label>
      <input type="text" id="contact-name" value="${escapeHtml(studentName)}" readonly style="background:var(--surface-variant);">
    </div>
    <div class="form-group">
      <label>학생 전화번호</label>
      <input type="tel" id="contact-student-phone" placeholder="010-0000-0000" value="${s?.studentPhone || ''}">
    </div>
    <div class="form-group">
      <label>학부모 전화번호</label>
      <input type="tel" id="contact-parent-phone" placeholder="010-0000-0000" value="${s?.parentPhone || ''}">
    </div>
    <button class="btn-modal-submit" onclick="saveContact('${studentId}', '${escapeHtml(studentName)}')">저장</button>
  `);
  }

  async function saveContact(studentId, studentName) {
    const studentPhone = document.getElementById('contact-student-phone').value.trim();
    const parentPhone = document.getElementById('contact-parent-phone').value.trim();

    closeModal();
    showToast('저장 중...', 'info');

    try {
      const result = await callServer('saveStudentContact', studentId, studentName, studentPhone, parentPhone);
      if (result.success) {
        showToast('연락처가 저장되었습니다.', 'success');
        await openStudentDetail(studentId);
      } else {
        showToast('오류: ' + result.error, 'error');
      }
    } catch (e) {
      showToast('오류: ' + e, 'error');
    }
  }

  // ─── 누가기록 ──────────────────────────────────────────
  function renderCumulativeRecords(records) {
    const container = document.getElementById('cumulative-list');

    // 캐시를 수동 갱신할 수 있는 새로고침 버튼 렌더링 포함
    let html = `
      <div style="display:flex; justify-content: flex-end; margin-bottom: 12px; padding: 0 16px;">
        <button class="btn-primary btn-sm" onclick="forceRefreshData()">🔄 최신 데이터 불러오기</button>
      </div>
    `;

    if (!records || records.length === 0) {
      container.innerHTML = html + '<div class="empty-state"><div class="empty-icon">📝</div><p>누가기록이 없습니다.</p></div>';
      return;
    }

    // 최신순 정렬
    const sorted = [...records].sort((a, b) => {
      const da = a.timestamp || a.date || '';
      const db = b.timestamp || b.date || '';
      return String(db).localeCompare(String(da));
    });

    html += sorted.map(r => `
      <div class="record-card">
        <div class="record-meta">
          <span>${r.date || ''}</span>
          <span>${escapeHtml(r.name || '')} (${r.studentId || ''})</span>
          <span>${escapeHtml(r.teacher || '')}</span>
          ${r.source === '원본' ? '<span class="source-tag">원본</span>' : '<span class="source-tag app">앱</span>'}
        </div>
        <div class="record-content">${escapeHtml(r.content || '')}</div>
        ${r.action ? `<div style="font-size:12px;color:var(--text-secondary);">조치: ${escapeHtml(r.action)}</div>` : ''}
        ${r.source === '앱' && ((APP.user && r.authorEmail === APP.user.email) || !r.authorEmail || (APP.user && APP.user.email === 'admin@school.com')) ? `
          <div style="margin-top:12px; display:flex; justify-content:flex-end; gap:8px;">
            <button class="btn-status" style="background-color:#f1f3f5; color:#495057; border: 1px solid #ced4da; padding: 6px 10px; font-size: 12px; line-height: 1;" onclick="showEditCumulativeDialog(${r.rowIndex}, '${escapeHtml(r.content || '').replace(/'/g, "\\'").replace(/\n/g, '\\n')}', '${escapeHtml(r.action || '').replace(/'/g, "\\'").replace(/\n/g, '\\n')}')">✏️ 수정</button>
            <button class="btn-status" style="background-color:#fff5f5; color:#e03131; border: 1px solid #ffc9c9; padding: 6px 10px; font-size: 12px; line-height: 1;" onclick="deleteCumulativeRecord(${r.rowIndex})">🗑️ 삭제</button>
          </div>
        ` : ''}
      </div>
    `).join('');

    container.innerHTML = html;
  }

  // 명시적 로드 필요 시만 사용
  async function loadCumulativeRecords() {
    const container = document.getElementById('cumulative-list');
    container.innerHTML = '<div class="empty-state"><div class="spinner"></div><p>로드 중...</p></div>';
    try {
      const result = await callServer('getCumulativeRecords');
      if (result && result.success) {
        APP.cumulativeRecords = result.data;
        renderCumulativeRecords(APP.cumulativeRecords);
      } else {
        container.innerHTML = `<div class="empty-state"><p>${result ? result.error : '데이터를 불러올 수 없습니다.'}</p></div>`;
      }
    } catch (e) {
      container.innerHTML = `<div class="empty-state"><p>오류: ${e}</p></div>`;
    }
  }

  function showAddRecordDialog() {
    showModal('누가기록 추가', `
    <div class="form-group">
      <label>학번</label>
      <input type="text" id="record-student-id" placeholder="학번 입력">
    </div>
    <div class="form-group">
      <label>학생명</label>
      <input type="text" id="record-student-name" placeholder="학생명 입력">
    </div>
    <div class="form-group">
      <label>상담 교사</label>
      <input type="text" id="record-teacher-name" placeholder="상담 교사명 입력">
    </div>
    <div class="form-group">
      <label>상담(지도) 내용</label>
      <textarea id="record-content" placeholder="내용을 입력하세요..."></textarea>
    </div>
    <div class="form-group">
      <label>조치 내용</label>
      <input type="text" id="record-action" placeholder="조치 내용 입력">
    </div>
    <button class="btn-modal-submit" onclick="submitCumulativeRecord()">기록 추가</button>
  `);
  }

  async function submitCumulativeRecord() {
    const studentId = document.getElementById('record-student-id').value.trim();
    const studentName = document.getElementById('record-student-name').value.trim();
    const teacherName = document.getElementById('record-teacher-name').value.trim();
    const content = document.getElementById('record-content').value.trim();
    const action = document.getElementById('record-action').value.trim();

    if (!studentId || !content || !teacherName) {
      showToast('학번, 상담 교사, 내용은 필수입니다.', 'warning');
      return;
    }

    closeModal();
    showToast('등록 중...', 'info');

    try {
      const result = await callServer('addManualCumulativeRecord', studentId, studentName, teacherName, content, action);
      if (result.success) {
        showToast('누가기록이 추가되었습니다.', 'success');
        loadCumulativeRecords();
      } else {
        showToast('오류: ' + result.error, 'error');
      }
    } catch (e) {
      showToast('오류: ' + e, 'error');
    }
  }

  function showEditCumulativeDialog(rowIndex, oldContent, oldAction) {
    showModal('누가기록 수정', `
    <div class="form-group">
      <label>상담(지도) 내용</label>
      <textarea id="edit-record-content" style="min-height:100px; width:100%; padding:8px; border:1px solid var(--border-color); border-radius:4px; box-sizing:border-box;">${oldContent}</textarea>
    </div>
    <div class="form-group">
      <label>조치 내용</label>
      <input type="text" id="edit-record-action" class="form-control" value="${oldAction}" style="width:100%; padding:8px; border:1px solid var(--border-color); border-radius:4px; box-sizing:border-box;">
    </div>
    <button class="btn-modal-submit" onclick="submitEditCumulativeRecord(${rowIndex})">수정 완료</button>
  `);
  }

  async function submitEditCumulativeRecord(rowIndex) {
    const content = document.getElementById('edit-record-content').value.trim();
    const action = document.getElementById('edit-record-action').value.trim();

    if (!content) {
      showToast('내용을 입력하세요.', 'warning');
      return;
    }

    closeModal();
    showToast('수정 중...', 'info');

    try {
      const result = await callServer('editMyCumulativeRecord', rowIndex, content, action);
      if (result.success) {
        showToast('수정되었습니다.', 'success');
        loadCumulativeRecords();
      } else {
        showToast('오류: ' + result.error, 'error');
      }
    } catch (e) {
      showToast('오류: ' + e, 'error');
    }
  }

  async function deleteCumulativeRecord(rowIndex) {
    if (!confirm('정말로 이 누가기록을 삭제하시겠습니까?\\n(삭제 후 데이터가 즉각 화면에 업데이트됩니다)')) return;

    showToast('삭제 중...', 'info');
    try {
      const result = await callServer('deleteMyCumulativeRecord', rowIndex);
      if (result.success) {
        showToast('삭제되었습니다.', 'success');
        loadCumulativeRecords();
      } else {
        showToast('오류: ' + result.error, 'error');
      }
    } catch (e) {
      showToast('오류: ' + e, 'error');
    }
  }

  // ─── 교사 건의사항 ─────────────────────────────────────
  function renderSuggestions(suggestions) {
    const container = document.getElementById('suggestions-list');

    let html = `
      <div style="display:flex; justify-content: flex-end; margin-bottom: 12px; padding: 0 16px;">
        <button class="btn-primary btn-sm" onclick="forceRefreshData()">🔄 최신 데이터 불러오기</button>
      </div>
    `;

    if (!suggestions || suggestions.length === 0) {
      container.innerHTML = html + '<div class="empty-state"><div class="empty-icon">💬</div><p>건의사항이 없습니다.</p></div>';
      return;
    }

    html += suggestions.map(s => `
      <div class="suggestion-card">
        <div class="suggestion-meta">
          <span>${s.date || ''}</span>
          <span>${escapeHtml(s.authorName || '')}</span>
          <span class="status-badge status-${s.status}">${s.status}</span>
        </div>
        <div class="suggestion-content">${escapeHtml(s.content || '')}</div>
        <div class="status-actions">
          ${s.author === APP.user.email ? `
            <button class="btn-status" style="background-color: #f1f3f5; color: #495057; border: 1px solid #ced4da;" onclick="showEditSuggestionDialog(${s.index}, '${escapeHtml(s.content || '').replace(/'/g, "\\'").replace(/\n/g, '\\n')}')">✏️ 수정</button>
            <button class="btn-status" style="background-color: #fff5f5; color: #e03131; border: 1px solid #ffc9c9;" onclick="deleteSuggestion(${s.index})">🗑️ 삭제</button>
          ` : ''}
          <div style="flex-grow:1;"></div>
          <button class="btn-status" onclick="changeSuggestionStatus(${s.index}, '접수')">접수</button>
          <button class="btn-status" onclick="changeSuggestionStatus(${s.index}, '처리중')">처리중</button>
          <button class="btn-status" onclick="changeSuggestionStatus(${s.index}, '완료')">완료</button>
        </div>
      </div>
    `).join('');

    container.innerHTML = html;
  }

  // 명시적 로드 필요 시만 사용
  async function loadSuggestions() {
    const container = document.getElementById('suggestions-list');
    container.innerHTML = '<div class="empty-state"><div class="spinner"></div><p>로드 중...</p></div>';
    try {
      const result = await callServer('getSuggestions');
      if (result && result.success) {
        APP.suggestions = result.data;
        renderSuggestions(APP.suggestions);
      } else {
        container.innerHTML = `<div class="empty-state"><p>${result ? result.error : '데이터를 불러올 수 없습니다.'}</p></div>`;
      }
    } catch (e) {
      container.innerHTML = `<div class="empty-state"><p>오류: ${e}</p></div>`;
    }
  }

  function showAddSuggestionDialog() {
    showModal('건의사항 작성', `
    <div class="form-group">
      <label>작성자 이름</label>
      <input type="text" id="suggestion-author-name" class="form-control" placeholder="이름을 입력하세요" value="" style="width:100%; padding:8px; border:1px solid var(--border-color); border-radius:4px; margin-bottom:12px; box-sizing:border-box;">
    </div>
    <div class="form-group">
      <label>건의 내용</label>
      <textarea id="suggestion-content" placeholder="건의사항을 작성하세요..." style="min-height:150px; width:100%; padding:8px; border:1px solid var(--border-color); border-radius:4px; box-sizing:border-box;"></textarea>
    </div>
    <button class="btn-modal-submit" onclick="submitSuggestion()">작성 완료</button>
  `);
  }

  async function submitSuggestion() {
    const authorName = document.getElementById('suggestion-author-name').value.trim();
    const content = document.getElementById('suggestion-content').value.trim();
    if (!content) {
      showToast('내용을 입력하세요.', 'warning');
      return;
    }

    closeModal();
    showToast('등록 중...', 'info');

    try {
      const result = await callServer('addSuggestion', content, authorName);
      if (result.success) {
        showToast('건의사항이 등록되었습니다.', 'success');
        loadSuggestions();
      } else {
        showToast('오류: ' + result.error, 'error');
      }
    } catch (e) {
      showToast('오류: ' + e, 'error');
    }
  }

  function showEditSuggestionDialog(rowIndex, oldContent) {
    showModal('건의사항 수정', `
    <div class="form-group">
      <label>건의 내용</label>
      <textarea id="edit-suggestion-content" style="min-height:150px; width:100%; padding:8px; border:1px solid var(--border-color); border-radius:4px; box-sizing:border-box;">${oldContent}</textarea>
    </div>
    <button class="btn-modal-submit" onclick="submitEditSuggestion(${rowIndex})">수정 완료</button>
  `);
  }

  async function submitEditSuggestion(rowIndex) {
    const content = document.getElementById('edit-suggestion-content').value.trim();
    if (!content) {
      showToast('내용을 입력하세요.', 'warning');
      return;
    }

    closeModal();
    showToast('수정 중...', 'info');

    try {
      const result = await callServer('editMySuggestion', rowIndex, content);
      if (result.success) {
        showToast('수정되었습니다.', 'success');
        loadSuggestions();
      } else {
        showToast('오류: ' + result.error, 'error');
      }
    } catch (e) {
      showToast('오류: ' + e, 'error');
    }
  }

  async function deleteSuggestion(rowIndex) {
    if (!confirm('정말로 이 건의사항을 삭제하시겠습니까?\\n(삭제 후 데이터가 즉각 화면에 업데이트됩니다)')) return;

    showToast('삭제 중...', 'info');
    try {
      const result = await callServer('deleteMySuggestion', rowIndex);
      if (result.success) {
        showToast('삭제되었습니다.', 'success');
        loadSuggestions(); // 삭제 후 리스트 갱신
      } else {
        showToast('오류: ' + result.error, 'error');
      }
    } catch (e) {
      showToast('오류: ' + e, 'error');
    }
  }

  async function changeSuggestionStatus(rowIndex, newStatus) {
    try {
      const result = await callServer('updateSuggestionStatus', rowIndex, newStatus);
      if (result.success) {
        showToast('상태가 변경되었습니다.', 'success');
        loadSuggestions();
      } else {
        showToast('오류: ' + result.error, 'error');
      }
    } catch (e) {
      showToast('오류: ' + e, 'error');
    }
  }

  // ─── 누적 벌점 월별 내역 모달 ─────────────────────────
  function showPenaltyBreakdown(student) {
    if (!student) return;
    const byMonth = student.penaltyByMonth || {};
    const cumTotal = student.cumulativePenalty !== undefined ? student.cumulativePenalty : (student.calculatedTotalPenalty || 0);
    const months = Object.keys(byMonth).sort((a, b) => parseInt(a) - parseInt(b));

    if (months.length === 0 && cumTotal === 0) {
      showToast('벌점 내역이 없습니다.', 'info');
      return;
    }

    var html = `<div style="font-size:15px;font-weight:700;margin-bottom:12px;color:var(--danger);">합계: ${cumTotal}점</div>`;
    if (months.length === 0) {
      html += `<p style="color:var(--text-secondary);font-size:13px;">3월 이후 앱으로 기록된 벌점이 없습니다.</p>`;
    } else {
      months.forEach(m => {
        const mData = byMonth[m];
        html += `<div style="margin-bottom:12px;">
          <div style="display:flex;align-items:center;gap:6px;font-weight:600;font-size:14px;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid var(--border);">
            ${(window.ICONS && ICONS.today) || '📅'} ${m}
            <span style="margin-left:auto;color:var(--danger);font-size:13px;">${mData.points}점</span>
          </div>`;
        mData.items.forEach(item => {
          html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:12px;color:var(--text-secondary);">
            <div>
              <span style="color:var(--text-primary);">${escapeHtml(item.itemName)}</span>
              ${item.memo ? `<span style="margin-left:4px;">(${escapeHtml(item.memo)})</span>` : ''}
              <div style="font-size:11px;margin-top:1px;">${item.date}</div>
            </div>
            <span style="font-weight:600;color:var(--danger);">-${item.points}점</span>
          </div>`;
        });
        html += `</div>`;
      });
    }

    showModal(`${escapeHtml(student.name)} 누적 벌점 (3월~)`, html);
  }

  // ─── 사감 근무 캘린더 ──────────────────────────────────
  function renderDutyCalendar(dutyData, monthStr) {
    var wrap = document.getElementById('duty-calendar-wrap');
    if (!wrap) return;
    var monthNum = parseInt(String(monthStr).replace('월', ''));
    var year = new Date().getFullYear();
    var firstDay = new Date(year, monthNum - 1, 1);
    var lastDay = new Date(year, monthNum, 0);
    var today = new Date();
    var dutyMap = {};
    (dutyData || []).forEach(function(entry) {
      var nums = String(entry.date).match(/\d+/g);
      if (!nums) return;
      var day = parseInt(nums[nums.length - 1], 10);
      if (!dutyMap[day]) dutyMap[day] = [];
      dutyMap[day].push(entry.name);
    });
    var DAYS = ['일', '월', '화', '수', '목', '금', '토'];
    var html = '<div class="duty-calendar"><div class="duty-calendar-header"><span class="duty-calendar-title">' + monthNum + '월 사감 근무 캘린더</span></div><div class="duty-cal-grid">';
    html += DAYS.map(function(d, i) { return '<div class="duty-cal-dow ' + (i === 0 ? 'sun' : i === 6 ? 'sat' : '') + '">' + d + '</div>'; }).join('');
    for (var i = 0; i < firstDay.getDay(); i++) html += '<div class="duty-cal-cell empty"></div>';
    for (var d = 1; d <= lastDay.getDate(); d++) {
      var isToday = (today.getFullYear() === year && today.getMonth() + 1 === monthNum && today.getDate() === d);
      var hasDuty = !!dutyMap[d];
      var dow = new Date(year, monthNum - 1, d).getDay();
      var colorStyle = !isToday ? (dow === 0 ? 'color:#e53935;' : dow === 6 ? 'color:#1565c0;' : '') : '';
      html += '<div class="duty-cal-cell' + (isToday ? ' today' : '') + (hasDuty ? ' has-duty' : '') + '" style="' + colorStyle + '" onclick="showDutyOnDay(' + d + ')">' + d + '</div>';
    }
    html += '</div><div class="duty-cal-popup" id="duty-cal-popup">날짜를 클릭하면 해당일 사감이 표시됩니다</div></div>';
    wrap.innerHTML = html;
    APP._dutyMap = dutyMap;
  }

  function showDutyOnDay(day) {
    var popup = document.getElementById('duty-cal-popup');
    if (!popup) return;
    var duties = (APP._dutyMap || {})[day];
    if (duties && duties.length > 0) {
      popup.textContent = day + '일 사감: ' + duties.join(', ');
      popup.style.background = 'var(--primary)';
    } else {
      popup.textContent = day + '일: 사감 데이터 없음';
      popup.style.background = 'var(--text-tertiary)';
    }
  }

  // ─── 사감 근무 조회 ────────────────────────────────────
  function renderDutySchedule(data, teachers) {
    const container = document.getElementById('duty-schedule-list');
    const teacherSelect = document.getElementById('duty-teacher-select');

    // 교사 드롭다운 갱신
    teacherSelect.innerHTML = '<option value="">교사 선택</option>';
    if (teachers && teachers.length > 0) {
      teachers.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        teacherSelect.appendChild(opt);
      });
    }

    renderDutyPage(data);
  }

  // 명시적 로드 필요 시만 (보통은 initApp에서 캐싱된 APP.dutyData를 사용)
  async function loadDutySchedule() {
    const container = document.getElementById('duty-schedule-list');
    container.innerHTML = '<div class="empty-state"><div class="spinner"></div><p>로드 중...</p></div>';

    try {
      const result = await callServer('getDutySchedule', APP.currentMonth);
      if (!result.success) {
        container.innerHTML = `<div class="empty-state"><div class="empty-icon">📅</div><p>${result.error}</p></div>`;
        return;
      }

      APP.dutyData = result.data;
      APP.dutyTeachers = result.teachers;
      renderDutySchedule(APP.dutyData, APP.dutyTeachers);
    } catch (e) {
      container.innerHTML = `<div class="empty-state"><p>오류: ${e}</p></div>`;
    }
  }

  /**
   * 사감 페이지 렌더링
   * - 상단: 오늘 사감 강조 배너
   * - 하단: 교사 선택 시 해당 교사의 근무 날짜/요일 목록
   */
  function renderDutyPage(data) {
    const container = document.getElementById('duty-schedule-list');

    let html = `
      <div style="display:flex; justify-content: flex-end; margin-bottom: 12px; padding: 0 16px;">
        <button class="btn-primary btn-sm" onclick="forceRefreshData()">🔄 최신 데이터 불러오기</button>
      </div>
    `;

    if (!data || data.length === 0) {
      container.innerHTML = html + '<div class="empty-state"><div class="empty-icon">📅</div><p>사감 근무 데이터가 없습니다.</p></div>';
      return;
    }

    // 오늘 날짜로 사감 찾기 (주말 등 다수/병합셀 고려)
    const today = new Date();
    const todayDay = today.getDate();
    const todayMonth = today.getMonth() + 1;

    // 현재 열려있는 탭의 월이 실제 오늘이 속한 달일 경우에만 사감이 뜨도록 제한
    const isCurrentMonthTab = String(APP.currentMonth).startsWith(String(todayMonth));

    const todayDuties = [];
    if (isCurrentMonthTab) {
      for (const entry of data) {
        // "3월 6일", "6일" 등에서 마지막 숫자(일) 추출
        const nums = String(entry.date).match(/\d+/g);
        let entryDay = -1;
        if (nums && nums.length > 0) {
          entryDay = parseInt(nums[nums.length - 1], 10);
        }

        if (entryDay === todayDay) {
          todayDuties.push(entry);
        }
      }
    }

    // 오늘 사감 배너
    if (todayDuties.length > 0) {
      const names = todayDuties.map(d => escapeHtml(d.name)).join(', ');
      const dow = escapeHtml(todayDuties[0].dayOfWeek);
      html += `
            <div class="today-duty-banner">
              <div class="today-duty-label">📌 오늘의 사감</div>
              <div class="today-duty-name">${names}</div>
              <div class="today-duty-date">${todayMonth}월 ${todayDay}일 (${dow})</div>
            </div>`;
    } else {
      html += `
            <div class="today-duty-banner" style="background:var(--surface-variant);">
              <div class="today-duty-label">📌 오늘의 사감</div>
              <div class="today-duty-name" style="color:var(--text-secondary);">데이터 없음</div>
            </div>`;
    }

    // 안내 메시지 (교사 미선택 시)
    html += '<div id="duty-teacher-result" style="margin-top:var(--space-md);"></div>';
    container.innerHTML = html;
  }

  function filterDutyByTeacher() {
    const teacher = document.getElementById('duty-teacher-select').value;
    const resultContainer = document.getElementById('duty-teacher-result');
    if (!resultContainer) return;

    if (!teacher) {
      resultContainer.innerHTML = '<p style="text-align:center;color:var(--text-tertiary);font-size:13px;padding:var(--space-lg) 0;">👆 위에서 교사를 선택하면<br>해당 교사의 사감 근무일을 볼 수 있습니다.</p>';
      return;
    }

    // 해당 교사의 근무일만 필터
    const filtered = (APP.dutyData || []).filter(entry => {
      return entry.name.includes(teacher) || entry.duty.includes(teacher);
    });

    if (filtered.length === 0) {
      resultContainer.innerHTML = `<p style="text-align:center;color:var(--text-tertiary);font-size:13px;padding:var(--space-md) 0;">${escapeHtml(teacher)} 선생님의 근무 기록이 없습니다.</p>`;
      return;
    }

    resultContainer.innerHTML = `
            <h3 style="font-size:15px;margin-bottom:var(--space-sm);color:var(--text-primary);">${escapeHtml(teacher)} 선생님 사감 근무 (${filtered.length}회)</h3>
            ${filtered.map(entry => `
              <div class="duty-card">
                <div class="duty-date">
                  <div class="day">${escapeHtml(entry.date)}</div>
                  <div class="dow">${escapeHtml(entry.dayOfWeek)}</div>
                </div>
              </div>
            `).join('')}
        `;
  }

  // ─── 설정 화면 ─────────────────────────────────────────
  function renderSettings() {
    const container = document.getElementById('settings-content');
    const s = APP.settings;

    container.innerHTML = `
    <div class="setting-group">
      <h3>🔢 외출/외박 규정</h3>
      <div class="setting-item">
        <div class="setting-label">
          월 최대 외출 횟수
          <small>초과 시 벌점 부과</small>
        </div>
        <div class="setting-value">
          <input type="number" id="setting-max-out" value="${s.MAX_OUT_COUNT || 2}" min="0" max="10">
        </div>
      </div>
      <div class="setting-item">
        <div class="setting-label">
          월 최대 외박 횟수
          <small>초과 시 벌점 부과</small>
        </div>
        <div class="setting-value">
          <input type="number" id="setting-max-stay" value="${s.MAX_STAY_COUNT || 2}" min="0" max="10">
        </div>
      </div>
      <div class="setting-item">
        <div class="setting-label">
          초과 1회당 벌점
          <small>외출/외박 초과 시</small>
        </div>
        <div class="setting-value">
          <input type="number" id="setting-over-penalty" value="${s.OVER_PENALTY_POINTS || 5}" min="1" max="20">
        </div>
      </div>
    </div>
    
    <div class="setting-group">
      <h3>🔗 원본 시트 연동</h3>
      <div class="setting-item">
        <div class="setting-label">
          원본 시트 자동 반영
          <small>앱 데이터를 원본 시트에도 업데이트</small>
        </div>
        <div class="setting-value">
          <select id="setting-sync">
            <option value="ON" ${s.SYNC_TO_ORIGINAL === 'ON' ? 'selected' : ''}>ON</option>
            <option value="OFF" ${s.SYNC_TO_ORIGINAL === 'OFF' ? 'selected' : ''}>OFF</option>
          </select>
        </div>
      </div>
    </div>
    
    <div class="setting-group">
      <h3>ℹ️ 정보</h3>
      <div class="setting-item">
        <div class="setting-label">현재 사용자</div>
        <div class="setting-value" style="font-size:12px;">${APP.user ? APP.user.email : '-'}</div>
      </div>
      <div class="setting-item">
        <div class="setting-label">선택된 월</div>
        <div class="setting-value">${APP.currentMonth}</div>
      </div>
      <div class="setting-item">
        <div class="setting-label">징계 기준</div>
        <div class="setting-value" style="font-size:11px;text-align:right;">
          5점 반성문 / 8점 봉사<br>
          12점 상담 / 15점 임시퇴사<br>
          20점 퇴사
        </div>
      </div>
    </div>

    <div class="setting-group">
      <h3>특별활동 관리</h3>
      <p style="font-size:12px;color:#6b7280;margin-bottom:8px;">학원, 악기, 야간방과후, 오케스트라 등 정기 외부활동을 등록합니다.</p>
      <div id="special-activities-list"></div>
      <button class="btn-primary btn-sm" style="margin-top:8px;" onclick="showAddActivityDialog()">+ 특별활동 추가</button>
    </div>
    
    <button class="btn-save-settings" onclick="saveSettings()">설정 저장</button>
  `;
    renderSpecialActivitiesList();
  }

  function renderSpecialActivitiesList() {
    var container = document.getElementById('special-activities-list');
    if (!container) return;
    var items = APP.specialActivities || [];
    if (items.length === 0) {
      container.innerHTML = '<p style="font-size:12px;color:#9ca3af;">등록된 특별활동이 없습니다.</p>';
      return;
    }

    container.innerHTML = items.map(function(a) {
      return '<div style="display:flex;align-items:center;padding:6px 0;border-bottom:1px solid #f3f4f6;gap:8px;">'
        + '<div style="flex:1;font-size:13px;"><strong>' + escapeHtml(a.name || '') + '</strong>'
        + '<span style="color:#6b7280;font-size:11px;"> ' + escapeHtml(a.room || '') + '호 · ' + escapeHtml(a.activityType || '') + '</span><br>'
        + '<span style="font-size:11px;color:#9ca3af;">' + escapeHtml(a.days || '') + ' ' + escapeHtml(a.startTime || '') + '~' + escapeHtml(a.endTime || '') + '</span></div>'
        + '<button onclick="deleteActivity(' + Number(a.rowIndex || 0) + ')" style="color:#ef4444;background:none;border:none;cursor:pointer;font-size:12px;">삭제</button>'
        + '</div>';
    }).join('');
  }

  function showAddActivityDialog() {
    var html = '<div class="form-group"><label>학번</label><input type="text" id="act-sid" placeholder="학번"></div>'
      + '<div class="form-group"><label>이름</label><input type="text" id="act-name" placeholder="이름"></div>'
      + '<div class="form-group"><label>호실</label><input type="text" id="act-room" placeholder="101"></div>'
      + '<div class="form-group"><label>활동 종류</label><select id="act-type"><option>학원</option><option>악기</option><option>야간방과후</option><option>오케스트라</option></select></div>'
      + '<div class="form-group"><label>요일 (예: 월,수,금)</label><input type="text" id="act-days" placeholder="월,수,금"></div>'
      + '<div class="form-group"><label>시작 시간</label><input type="time" id="act-start" value="17:00"></div>'
      + '<div class="form-group"><label>종료 시간</label><input type="time" id="act-end" value="20:00"></div>'
      + '<div class="form-group"><label>비고(선택)</label><input type="text" id="act-note"></div>'
      + '<button class="btn-modal-submit" onclick="submitActivity()">저장</button>';
    showModal('특별활동 추가', html);
  }

  function submitActivity() {
    var sid = document.getElementById('act-sid').value.trim();
    var sname = document.getElementById('act-name').value.trim();
    var room = document.getElementById('act-room').value.trim();
    var type = document.getElementById('act-type').value;
    var days = document.getElementById('act-days').value.trim();
    var start = document.getElementById('act-start').value;
    var end = document.getElementById('act-end').value;
    var note = document.getElementById('act-note').value.trim();

    if (!sid || !sname || !days) {
      showToast('학번, 이름, 요일은 필수입니다.', 'warning');
      return;
    }

    closeModal();
    callServer('saveSpecialActivity', null, sid, sname, room, type, days, start, end, note)
      .then(function(r) {
        if (!r.success) {
          showToast('오류: ' + r.error, 'error');
          return;
        }
        showToast('저장되었습니다.', 'success');
        return callServer('getSpecialActivities');
      })
      .then(function(r2) {
        if (r2 && r2.success) {
          APP.specialActivities = r2.data;
          renderSpecialActivitiesList();
        }
      })
      .catch(function(e) { showToast('오류: ' + e, 'error'); });
  }

  function deleteActivity(rowIndex) {
    if (!confirm('삭제하시겠습니까?')) return;
    callServer('deleteSpecialActivity', rowIndex)
      .then(function(r) {
        if (!r.success) {
          showToast('오류: ' + r.error, 'error');
          return;
        }
        showToast('삭제되었습니다.', 'success');
        return callServer('getSpecialActivities');
      })
      .then(function(r2) {
        if (r2 && r2.success) {
          APP.specialActivities = r2.data;
          renderSpecialActivitiesList();
        }
      })
      .catch(function(e) { showToast('오류: ' + e, 'error'); });
  }

  async function saveSettings() {
    showToast('저장 중...', 'info');

    try {
      const updates = [
        { key: 'MAX_OUT_COUNT', value: document.getElementById('setting-max-out').value },
        { key: 'MAX_STAY_COUNT', value: document.getElementById('setting-max-stay').value },
        { key: 'OVER_PENALTY_POINTS', value: document.getElementById('setting-over-penalty').value },
        { key: 'SYNC_TO_ORIGINAL', value: document.getElementById('setting-sync').value }
      ];

      for (const u of updates) {
        await callServer('updateSetting', u.key, u.value);
        APP.settings[u.key] = u.value;
      }

      showToast('설정이 저장되었습니다.', 'success');
    } catch (e) {
      showToast('저장 오류: ' + e, 'error');
    }
  }

  // ─── 모달 ──────────────────────────────────────────────
  function showModal(title, bodyHtml) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal-overlay').classList.add('visible');
  }

  function closeModal() {
    document.getElementById('modal-overlay').classList.remove('visible');
  }

  // ─── 토스트 알림 ───────────────────────────────────────
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = message;
    container.appendChild(toast);

    // 3초 후 자동 제거
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3000);
  }

  // ─── 유틸리티 ──────────────────────────────────────────
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  // 페이지 로드 시 당겨서 새로고침 리스너 등록
  document.addEventListener('DOMContentLoaded', initPullToRefresh);

  // ─── 당겨서 새로고침 (Pull-to-refresh) 시각적 구현 ─────────────────
  function initPullToRefresh() {
    let touchStartY = 0;
    let isPulling = false;
    const bodyContainer = document.body;

    // 인디케이터 컨테이너 (화면 상단 안에 숨겨뒀다 내려오는 방식 - 안전하게 보이도록)
    const ptrContainer = document.createElement('div');
    ptrContainer.id = 'ptr-container';
    ptrContainer.style.position = 'fixed'; // fixed로 화면 기준 배치가 모바일에서 잘 보임
    ptrContainer.style.top = '0';
    ptrContainer.style.left = '0';
    ptrContainer.style.width = '100%';
    ptrContainer.style.height = '60px'; // 높이를 60px 지정
    ptrContainer.style.display = 'flex';
    ptrContainer.style.flexDirection = 'column';
    ptrContainer.style.alignItems = 'center';
    ptrContainer.style.justifyContent = 'center';
    ptrContainer.style.background = 'var(--surface)';
    ptrContainer.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
    ptrContainer.style.color = 'var(--primary)';
    ptrContainer.style.fontSize = '12px';
    ptrContainer.style.fontWeight = '600';
    ptrContainer.style.zIndex = '9999';
    ptrContainer.style.transform = 'translateY(-100%)'; // 평소엔 화면 밖 위로 완전 숨김
    ptrContainer.style.transition = 'transform 0.2s ease-out';
    ptrContainer.style.pointerEvents = 'none';

    // 스피너 형태 대신 빙글빙글 도는 픽토그램
    const ptrIcon = document.createElement('div');
    ptrIcon.innerHTML = '🔄';
    ptrIcon.style.fontSize = '24px';
    ptrIcon.style.transition = 'transform 0.1s linear';
    ptrIcon.style.marginBottom = '2px';

    const ptrText = document.createElement('span');
    ptrText.textContent = '당겨서 새로고침';

    ptrContainer.appendChild(ptrIcon);
    ptrContainer.appendChild(ptrText);
    document.body.appendChild(ptrContainer);

    bodyContainer.addEventListener('touchstart', e => {
      if (window.scrollY === 0) {
        touchStartY = e.touches[0].clientY;
        isPulling = true;
        ptrContainer.style.transition = 'none'; // 당길 땐 즉각 내려오게
      }
    }, { passive: true });

    bodyContainer.addEventListener('touchmove', e => {
      if (!isPulling) return;
      const y = e.touches[0].clientY;
      const distance = y - touchStartY;

      if (distance > 0 && window.scrollY === 0) {
        let pullFactor = Math.min(distance / (window.innerHeight / 4), 1);

        let translateY = -100 + (pullFactor * 100);
        ptrContainer.style.transform = `translateY(${translateY}%)`;
        ptrIcon.style.transform = `rotate(${pullFactor * 360}deg)`;

        if (distance > window.innerHeight / 4) {
          ptrText.textContent = '놓아서 새로고침';
        } else {
          ptrText.textContent = '당겨서 새로고침';
        }
      }
    }, { passive: true });

    bodyContainer.addEventListener('touchend', e => {
      if (!isPulling) return;
      isPulling = false;

      const touchEndY = e.changedTouches[0].clientY;
      const distance = touchEndY - touchStartY;

      ptrContainer.style.transition = 'transform 0.3s cubic';

      if (distance > window.innerHeight / 4) {
        ptrContainer.style.transform = 'translateY(0)'; // 화면에 떠있게 유지
        ptrText.textContent = '불러오는 중...';

        forceRefreshData().then(() => {
          ptrContainer.style.transform = 'translateY(-100%)';
          ptrText.textContent = '당겨서 새로고침';
        });
      } else {
        ptrContainer.style.transform = 'translateY(-100%)';
      }
    });
  }
