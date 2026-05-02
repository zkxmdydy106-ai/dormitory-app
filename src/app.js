function getGender(room) {
  var first = String(room || '').trim().charAt(0);
  if (first === '1') return 'female';
  if (first === '2') return 'male';
  return 'unknown';
}

  /**
   * ============================================================
   * 湲곗닕???낅Т 理쒖쟻???뱀빋 ???대씪?댁뼵??JavaScript
   * ============================================================
   * 
   * SPA ?쇱슦?? API ?몄텧(google.script.run), ?붾㈃ ?뚮뜑留??꾩껜 ?대떦
   */

  // ??? ?꾩뿭 ?곹깭 ??????????????????????????????????????????
  const APP = {
    currentPage: 'student-list',   // ?꾩옱 ?쒖꽦 ?섏씠吏
    currentMonth: '',              // ?꾩옱 ?좏깮????
    students: [],                  // ?숈깮 由ъ뒪??罹먯떆
    selectedStudent: null,         // ?좏깮???숈깮 ?곸꽭
    penaltyItems: [],              // 踰뚯젏 ??ぉ 紐⑸줉 罹먯떆
    penaltyTargetStudent: null,    // 踰뚯젏 遺??????숈깮
    currentFilter: 'all',          // ?숈깮 由ъ뒪???꾪꽣
    navigationHistory: [],         // ?ㅻ줈媛湲??덉뒪?좊━
    settings: {},                  // ???ㅼ젙媛?
    user: null,                    // ?꾩옱 ?ъ슜???뺣낫
    specialActivities: []          // 특별활동 목록
  };

  // ??? 珥덇린???????????????????????????????????????????????
  document.addEventListener('DOMContentLoaded', () => {
    init();
  });

  async function init() {
    try {
      // ?쒕쾭 ?몄텧 1?뚮줈 紐⑤뱺 珥덇린 ?곗씠?곕? ?쒕쾲??濡쒕뱶 (濡쒕뵫 ?띾룄 理쒖쟻??
      const data = await callServer('initApp', '');

      if (!data) {
        showToast('珥덇린???ㅽ뙣: ?쒕쾭 ?묐떟 ?놁쓬', 'error');
        document.getElementById('loading-overlay').classList.add('hidden');
        return;
      }

      // 1. ?ъ슜???뺣낫
      APP.user = data.user || { email: 'unknown' };
      document.getElementById('user-email').textContent = APP.user.email;

      // 2. ????
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
        // ?쒕쾭?먯꽌 寃곗젙???꾩옱 ???곸슜
        select.value = data.currentMonth || months[0];
        APP.currentMonth = select.value;
      } else {
        APP.currentMonth = '3??;
      }

      // 3. ?ㅼ젙媛?
      APP.settings = data.settings || { MAX_OUT_COUNT: '2', MAX_STAY_COUNT: '2' };

      // 4. ?꾩뿭 ?곗씠??罹먯떆 ???(SPA 1珥?濡쒕뵫 援ы쁽 ?듭떖)
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

      if (data.specialActivities && data.specialActivities.success) APP.specialActivities = data.specialActivities.data || [];

      // 5. ?숈깮 由ъ뒪???뚮뜑留?
      if (data.studentList && data.studentList.success) {
        APP.students = data.studentList.data;
        renderStudentList(APP.students);
      } else {
        const listContainer = document.getElementById('student-list');
        listContainer.innerHTML = `<div class="empty-state"><div class="empty-icon">?좑툘</div><p>${data.studentList ? data.studentList.error : '?숈깮 ?곗씠?곕? 遺덈윭?????놁뒿?덈떎.'}</p></div>`;
      }

      // 濡쒕뵫 ?ㅻ쾭?덉씠 ?④린湲?
      document.getElementById('loading-overlay').classList.add('hidden');

    } catch (e) {
      console.error('珥덇린???ㅻ쪟:', e);
      showToast('珥덇린???ㅻ쪟: ' + e, 'error');
      document.getElementById('loading-overlay').classList.add('hidden');
    }
  }

  // ??? ?쒕쾭 ?몄텧 ?ы띁 ?????????????????????????????????????
  /**
   * google.script.run??Promise濡?媛먯떥???ы띁
   * @param {string} functionName - ?쒕쾭 ?⑥닔紐?
   * @param {...any} args - ?⑥닔 ?몄옄??
   */
  function callServer(functionName, ...args) {
    return new Promise((resolve, reject) => {
      const runner = google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject);
      runner[functionName](...args);
    });
  }

  // ??? ?ㅻ퉬寃뚯씠??/ ?쇱슦???????????????????????????????????
  function navigateTo(pageName, navBtn) {
    // ?ㅻ퉬寃뚯씠??踰꾪듉 ?쒖꽦???곹깭 蹂寃?
    if (navBtn) {
      document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
      navBtn.classList.add('active');
    }

    // ?덉뒪?좊━???꾩옱 ?섏씠吏 ???
    if (APP.currentPage !== pageName) {
      APP.navigationHistory.push(APP.currentPage);
    }

    // ?섏씠吏 ?꾪솚
    showPage(pageName);

    // ?섏씠吏蹂??곗씠??濡쒕뱶 (罹먯떆 ?ъ슜?쇰줈 ?쒕쾭 ?몄텧 理쒖냼??
    switch (pageName) {
      case 'student-list':
        updateHeaderTitle('湲곗닕??愿由?);
        document.getElementById('btn-back').style.display = 'none';
        // ?숈깮由ъ뒪?몃뒗 ?먯＜ 諛붾뚮?濡?湲곕낯?곸쑝濡??섎룞/?먮룞 罹먯떆 蹂묓뻾. ?ш린?쒕뒗 ?대? ?덈뒗 APP.students ?ъ슜
        renderStudentList(APP.students);
        break;
      case 'student-detail':
        document.getElementById('btn-back').style.display = 'flex';
        break;
      case 'penalty-items':
        updateHeaderTitle('踰뚯젏 ??ぉ ?좏깮');
        document.getElementById('btn-back').style.display = 'flex';
        loadPenaltyItems(); // 嫄곗쓽 蹂???녾퀬 ?ш린 ?묒쓬
        break;
      case 'cumulative':
        updateHeaderTitle('?꾧? 湲곕줉');
        document.getElementById('btn-back').style.display = 'none';
        renderCumulativeRecords(APP.cumulativeRecords || []);
        break;
      case 'suggestions':
        updateHeaderTitle('援먯궗 嫄댁쓽?ы빆');
        document.getElementById('btn-back').style.display = 'none';
        renderSuggestions(APP.suggestions || []);
        break;
      case 'duty':
        updateHeaderTitle('?ш컧 洹쇰Т 議고쉶');
        document.getElementById('btn-back').style.display = 'none';
        renderDutyCalendar(APP.dutyData || [], APP.currentMonth);
        renderDutySchedule(APP.dutyData || [], APP.dutyTeachers || []);
        break;
      case 'settings':
        updateHeaderTitle('?ㅼ젙');
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

      // ?ㅻ퉬寃뚯씠??踰꾪듉 ?곹깭 蹂듭썝
      const navBtn = document.querySelector(`[data-page="${prevPage}"]`);
      if (navBtn) {
        document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
        navBtn.classList.add('active');
      }

      if (prevPage === 'student-list') {
        updateHeaderTitle('湲곗닕??愿由?);
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
    listContainer.innerHTML = '<div class="empty-state"><div class="spinner"></div><p>?붾퀎 ?곗씠??遺덈윭?ㅻ뒗 以?..</p></div>';

    try {
      // 1?뚯쓽 API ?몄텧濡?紐⑤뱺 ?곗씠??媛깆떊 (?쒕쾭 以묐났 ?몄텧 理쒖쟻??
      const data = await callServer('initApp', APP.currentMonth);
      if (data) {
        if (data.studentList && data.studentList.success) APP.students = data.studentList.data;
        if (data.dutyData && data.dutyData.success) {
          APP.dutyData = data.dutyData.data;
          APP.dutyTeachers = data.dutyData.teachers;
        }
        if (data.suggestions && data.suggestions.success) APP.suggestions = data.suggestions.data;
        if (data.cumulativeRecords && data.cumulativeRecords.success) APP.cumulativeRecords = data.cumulativeRecords.data;

        // ?꾩옱 ?좏깮???붾㈃ ?뚮뜑留??낅뜲?댄듃
        navigateTo(APP.currentPage, null);
      }
    } catch (e) {
      listContainer.innerHTML = `<div class="empty-state"><div class="empty-icon">??/div><p>?ㅻ쪟: ${e}</p></div>`;
    }
  }

  // ??? 怨듯넻 ?곗씠??由ы봽?덉떆 踰꾪듉 ?몃뱾??????????????????????
  async function forceRefreshData() {
    showToast('?덈줈怨좎묠 以?..', 'info');
    document.getElementById('header-title').textContent = '濡쒕뵫以?..';
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

        // ?꾩옱 ?대젮?덈뒗 ?섏씠吏 ?ㅼ떆 ?뚮뜑留?
        navigateTo(APP.currentPage, null);
        showToast('理쒖떊 ?뺣낫濡?媛깆떊?섏뿀?듬땲??', 'success');
      }
    } catch (e) {
      showToast('?덈줈怨좎묠 ?ㅽ뙣', 'error');
    }
  }

  // ??? ?숈깮 由ъ뒪??????????????????????????????????????????
  async function loadStudentList() {
    const listContainer = document.getElementById('student-list');
    listContainer.innerHTML = '<div class="empty-state"><div class="spinner"></div><p>?숈깮 紐⑸줉 遺덈윭?ㅻ뒗 以?..</p></div>';

    try {
      const result = await callServer('getStudentList', APP.currentMonth);
      if (!result.success) {
        listContainer.innerHTML = `<div class="empty-state"><div class="empty-icon">?좑툘</div><p>${result.error}</p></div>`;
        return;
      }

      APP.students = result.data;
      renderStudentList(APP.students);
    } catch (e) {
      listContainer.innerHTML = `<div class="empty-state"><div class="empty-icon">??/div><p>?ㅻ쪟: ${e}</p></div>`;
    }
  }

  var DAY_MAP = {0:'일',1:'월',2:'화',3:'수',4:'목',5:'금',6:'토'};
  function getTodayActivities(studentId) {
    var todayDow = DAY_MAP[new Date().getDay()];
    return (APP.specialActivities || []).filter(function(a) {
      if (String(a.studentId) !== String(studentId)) return false;
      return a.days.split(',').map(function(d){ return d.trim(); }).indexOf(todayDow) !== -1;
    });
  }

  function renderStudentList(students) {
    const listContainer = document.getElementById('student-list');

    if (!students || students.length === 0) {
      listContainer.innerHTML = '<div class="empty-state"><div class="empty-icon">?뱥</div><p>?숈깮 ?곗씠?곌? ?놁뒿?덈떎.</p></div>';
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
            <span>?룧 ${escapeHtml(s.room)}</span>
            <span>?뱷 ${escapeHtml(s.studentId)}</span>
          </div>
        </div>
        <div class="student-badges" id="badges-${s.studentId}">
          ${outCount > 0 ? `<span class="badge badge-out">?몄텧${outCount}</span>` : ''}
          ${stayCount > 0 ? `<span class="badge badge-stay">?몃컯${stayCount}</span>` : ''}
          ${totalP > 0 ? `<span class="badge badge-penalty">${totalP}??/span>` : ''}
        ${getTodayActivities(s.studentId).map(function(a){ return '<span class="badge badge-activity">' + a.activityType + ' ' + a.startTime + '</span>'; }).join('')}
        </div>
      </div>
    `;
    }).join('');
  }

  // ??? ?숈깮 移대뱶 諭껋? 遺遺??낅뜲?댄듃 ?????????????????????????
  function updateStudentCardUI(s) {
    const badgesContainer = document.getElementById('badges-' + s.studentId);
    if (!badgesContainer) return;

    const totalP = s.calculatedTotalPenalty || s.totalPenalty || 0;
    const outCount = s.appOutCount || s.outCount || 0;
    const stayCount = s.appStayCount || s.stayCount || 0;

    badgesContainer.innerHTML = `
      ${outCount > 0 ? `<span class="badge badge-out">?몄텧${outCount}</span>` : ''}
      ${stayCount > 0 ? `<span class="badge badge-stay">?몃컯${stayCount}</span>` : ''}
      ${totalP > 0 ? `<span class="badge badge-penalty">${totalP}??/span>` : ''}
    `;
  }

  function filterStudents() {
    const query = document.getElementById('search-input').value.toLowerCase().trim();
    let filtered = APP.students;

    // ?띿뒪??寃??
    if (query) {
      filtered = filtered.filter(s =>
        s.name.toLowerCase().includes(query) ||
        s.studentId.toLowerCase().includes(query) ||
        s.room.toLowerCase().includes(query)
      );
    }

    // ?꾪꽣 移?
    if (APP.currentFilter === 'penalty') {
      filtered = filtered.filter(s => (s.calculatedTotalPenalty || s.totalPenalty || 0) > 0);
    } else if (APP.currentFilter === 'discipline') {
      filtered = filtered.filter(s => {
        const d = s.calculatedDiscipline || s.discipline || '';
        return d && d !== '?놁쓬';
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

  // ??? ?숈깮 ?곸꽭 ??????????????????????????????????????????
  function openStudentDetail(studentId) {
    const baseStudent = APP.students.find(s => s.studentId === studentId);
    navigateTo('student-detail');

    const container = document.getElementById('student-detail-content');

    if (baseStudent) {
      APP.selectedStudent = baseStudent;

      // UI 怨④꺽 ?뚮뜑留?(理쒖큹 1?뚮쭔 ?붾㈃ ??뼱?곌린)
      renderStudentDetailHTML(baseStudent);

      // 湲곕줉 ?곗씠?곌? ?꾩쭅 ?쒕쾭?먯꽌 ?섏떊?섏? ?딆븯?ㅻ㈃ 鍮??ㅽ뵾??怨듦컙 ?뺣낫
      if (!baseStudent.outLogs) {
        document.getElementById('detail-bottom-section').innerHTML = '<div style="text-align:center; padding: 20px;"><div class="spinner" style="width:20px;height:20px;margin:0 auto;border-color:var(--primary) transparent transparent transparent;"></div></div>';
      }
    } else {
      container.innerHTML = '<div class="empty-state"><div class="spinner"></div><p>?숈깮 ?뺣낫 遺덈윭?ㅻ뒗 以?..</p></div>';
    }

    const requestTime = Date.now();
    // ?쒕쾭?먯꽌 ?곸꽭 ?곗씠???곕씫泥? ?몄텧?몃컯濡쒓렇) 諛깃렇?쇱슫??蹂닿컯 (await ?놁씠 諛깃렇?쇱슫???ㅽ뻾)
    callServer('getStudentDetail', studentId, APP.currentMonth).then(result => {
      if (result && result.success) {

        // ?꾩옱 ?대씪?댁뼵?몄뿉 ?ㅽ뻾 ?湲??붾컮?댁뒪 以? ?먮뒗 吏꾪뻾 以묒씤 ?좉????덈떎硫? ?쒕쾭 ?ㅻ깄??怨쇨굅)?쇰줈 ??뼱?곗? ?딅룄濡?蹂댄샇
        APP.pendingToggles = APP.pendingToggles || {};
        APP.isSyncing = APP.isSyncing || {};
        const isPending = Object.keys(APP.pendingToggles).some(k => k.startsWith(studentId + '_')) || APP.isSyncing[studentId] > 0;

        // requestTime ?댄썑???대씪?댁뼵???ъ슜??媛 吏곸젒 議곗옉???붿쟻???덈떎硫??쒕쾭?먯꽌 ??援ъ떇 ?곗씠?곕줈 ??뼱?곗? ?딆쓬
        const isLocalNewer = baseStudent && baseStudent.lastModifiedLocal && baseStudent.lastModifiedLocal > requestTime;

        if ((isPending || isLocalNewer) && baseStudent) {
          result.data.todayOut = baseStudent.todayOut;
          result.data.todayStay = baseStudent.todayStay;
          result.data.appOutCount = baseStudent.appOutCount;
          result.data.appStayCount = baseStudent.appStayCount;
          result.data.outLogs = baseStudent.outLogs;
        }

        if (baseStudent) {
          Object.assign(baseStudent, result.data); // 硫붾え由?罹먯떆 媛깆떊
          APP.selectedStudent = baseStudent;
        } else {
          APP.selectedStudent = result.data;
          renderStudentDetailHTML(result.data); // 怨④꺽 ?뚮뜑留?
        }

        // ?꾩옱 ?곸꽭 ?섏씠吏??寃쎌슦 源쒕묀???놁씠 遺遺?DOM ?낅뜲?댄듃 ?ㅽ뻾
        if (APP.currentPage === 'student-detail' && APP.selectedStudent.studentId === studentId) {
          updateDetailStatsUI(APP.selectedStudent);
        }
      } else if (!baseStudent) {
        container.innerHTML = `<div class="empty-state"><div class="empty-icon">?좑툘</div><p>${result ? result.error : '?숈깮 ?뺣낫瑜?遺덈윭?????놁뒿?덈떎.'}</p></div>`;
      }
    }).catch(e => {
      if (!baseStudent) container.innerHTML = `<div class="empty-state"><div class="empty-icon">??/div><p>?ㅻ쪟: ${e}</p></div>`;
    });
  }

  function renderStudentDetailHTML(s) {
    const container = document.getElementById('student-detail-content');
    const initial = s.name ? s.name.charAt(0) : '?';
    const gender = getGender(s.room);

    container.innerHTML = `
    <!-- ?꾨줈???ㅻ뜑 -->
    <div class="detail-header">
      <div class="detail-avatar gender-${gender}">${initial}</div>
      <h2 class="detail-name">${escapeHtml(s.name)}</h2>
      <div class="detail-sub">?룧 ${escapeHtml(s.room)} | ?뱷 ${escapeHtml(s.studentId)}</div>
    </div>
    
    <!-- ?듦퀎 移대뱶 -->
    <div class="stats-grid">
      <div class="stat-card out">
        <div class="stat-value" id="stat-out"></div>
        <div class="stat-label">?몄텧 ?잛닔</div>
      </div>
      <div class="stat-card stay">
        <div class="stat-value" id="stat-stay"></div>
        <div class="stat-label">?몃컯 ?잛닔</div>
      </div>
      <div class="stat-card penalty">
        <div class="stat-value" id="stat-penalty"></div>
        <div class="stat-label">珥?踰뚯젏</div>
      </div>
      <div class="stat-card discipline">
        <div class="stat-value" id="stat-discipline" style="font-size:14px; color: var(--warning);"></div>
        <div class="stat-label">吏뺢퀎 ?곹깭</div>
      </div>
    </div>
    
    <!-- ?좎쭨 ?좏깮 湲곕뒫 -->
    <div class="return-time-section visible" style="margin-bottom: var(--space-md); padding: 12px; border: 1px solid var(--border); background: var(--surface);">
      <label style="margin-bottom:4px;">?뱟 ?곸슜 ?좎쭨 (怨쇨굅 湲곕줉??</label>
      <input type="date" id="record-date-input" value="${APP.selectedDate || new Date().toISOString().split('T')[0]}" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: var(--radius-sm);">
    </div>

    <!-- ?몄텧/?몃컯 ?좉? 踰꾪듉 -->
    <div class="action-buttons">
      <button class="btn-action" id="btn-toggle-out" onclick="toggleOutStay('?몄텧')"></button>
      <button class="btn-action" id="btn-toggle-stay" onclick="toggleOutStay('?몃컯')"></button>
    </div>
    
    <!-- 외박→외출 전환 버튼 -->
    <button class="btn-convert-stay" onclick="convertStayToOut()">↔ 외박을 외출로 전환하여 사용</button>
    
    <!-- 洹???쒓컙 ?낅젰 (?몄텧 ?? -->
    <div class="return-time-section" id="return-time-section">
      <label>?븧 洹???덉젙 ?쒓컙</label>
      <input type="time" id="return-time-input" value="${s.todayOut ? (s.todayOut.returnTime || '') : ''}" onchange="updateReturnTime()">
    </div>
    
    <!-- 踰뚯젏 遺??踰꾪듉 -->
    <button class="btn-penalty-add" onclick="openPenaltySelection('${s.studentId}', '${escapeHtml(s.name)}')">
      ??踰뚯젏 遺?ы븯湲?
    </button>
    
    <!-- ?좊룞???곕씫泥?諛?湲곕줉 ?뚮뜑留??곸뿭 -->
    <div id="detail-bottom-section"></div>
    `;

    updateHeaderTitle(s.name);
    updateDetailStatsUI(s); // ???梨꾩슫 ??媛믪쓣 利됱떆 諛섏쁺
  }

  // ?붾㈃ ?쇰?遺꾨쭔 ?낅뜲?댄듃?섎뒗 ?듭떖 ?⑥닔 (源쒕묀??李⑤떒)
  function updateDetailStatsUI(s) {
    const maxOut = APP.settings.MAX_OUT_COUNT || 2;
    const maxStay = APP.settings.MAX_STAY_COUNT || 2;

    // 議곗옉 吏곹썑(5珥????먮뒗 ?ъ슜?먭? 留뚮뱺 0 ?깆쓽 falsy 媛믪쓣 ?덈??곸쑝濡??좊ː (?앸갚 諛⑹?)
    // ?쒓컙??吏?섎㈃, 湲곗〈泥섎읆 ?쒗듃 ?섎룞 ?묒꽦媛?outCount)?쇰줈 fallback ?덉슜 (?곕룞??蹂듦뎄)
    const isRecent = s.lastModifiedLocal && (Date.now() - s.lastModifiedLocal < 5000);
    const outCount = isRecent ? (s.appOutCount || 0) : Math.max(s.appOutCount || 0, s.outCount || 0);
    const stayCount = isRecent ? (s.appStayCount || 0) : Math.max(s.appStayCount || 0, s.stayCount || 0);

    const totalP = s.calculatedTotalPenalty || s.totalPenalty || 0;
    const disc = s.calculatedDiscipline || s.discipline || '?놁쓬';

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
      elPen.textContent = `${totalP}`;
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
        <span class="action-icon">${todayOutActive ? '?? : '?슯'}</span>
        <span>?몄텧${todayOutActive ? ' (?ㅻ뒛 湲곕줉??' : ''}</span>
        <span class="action-sub">${outCount >= maxOut ? '?좑툘 珥덇낵 ??踰뚯젏 遺怨? : '?대쾲??' + outCount + '/' + maxOut}</span>
      `;
    }

    const btnStay = document.getElementById('btn-toggle-stay');
    if (btnStay) {
      btnStay.className = `btn-action ${todayStayActive ? 'active' : ''}`;
      btnStay.innerHTML = `
        <span class="action-icon">${todayStayActive ? '?? : '?뙔'}</span>
        <span>?몃컯${todayStayActive ? ' (?ㅻ뒛 湲곕줉??' : ''}</span>
        <span class="action-sub">${stayCount >= maxStay ? '?좑툘 珥덇낵 ??踰뚯젏 遺怨? : '?대쾲??' + stayCount + '/' + maxStay}</span>
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
    let html = '<div class="contact-section"><h3>?뱸 ?곕씫泥?/h3>';
    if (s.studentPhone) {
      html += `
        <div class="contact-row">
          <div>
            <div class="contact-label">?숈깮 ?꾪솕</div>
            <div class="contact-value">${escapeHtml(s.studentPhone)}</div>
          </div>
          <div class="contact-actions">
            <a href="tel:${s.studentPhone}" target="_top" class="btn-contact btn-call">?뱸 ?꾪솕</a>
            <button class="btn-contact btn-sms" onclick="openSms('${s.studentPhone}', '${escapeHtml(s.name)}')">?뮠 臾몄옄</button>
          </div>
        </div>
      `;
    }
    if (s.parentPhone) {
      html += `
        <div class="contact-row">
          <div>
            <div class="contact-label">?숇?紐??꾪솕</div>
            <div class="contact-value">${escapeHtml(s.parentPhone)}</div>
          </div>
          <div class="contact-actions">
            <a href="tel:${s.parentPhone}" target="_top" class="btn-contact btn-call">?뱸 ?꾪솕</a>
            <button class="btn-contact btn-sms" onclick="openSms('${s.parentPhone}', '${escapeHtml(s.name)}')">?뮠 臾몄옄</button>
          </div>
        </div>
      `;
    }
    if (!s.studentPhone && !s.parentPhone) {
      html += `
        <p style="color:var(--text-tertiary);font-size:13px;">?곕씫泥섍? ?깅줉?섏? ?딆븯?듬땲??</p>
        <button class="btn-primary btn-sm" onclick="showContactEditDialog('${s.studentId}', '${escapeHtml(s.name)}')">?곕씫泥??깅줉</button>
      `;
    } else {
      html += `<button class="btn-primary btn-sm" style="margin-top:8px" onclick="showContactEditDialog('${s.studentId}', '${escapeHtml(s.name)}')">?곕씫泥??섏젙</button>`;
    }
    html += '</div>';

    if (s.outLogs && s.outLogs.length > 0) {
      html += `<div class="contact-section" style="margin-top: var(--space-md);">
        <h3>?뱟 ?대쾲???몄텧/?몃컯 湲곕줉</h3>
        ${s.outLogs.filter(l => l.status === 'active').map(l => `
          <div class="contact-row">
            <div>
              <span class="badge ${ l.type === '외출' ? 'badge-out' : l.type === '외박(외출전환)' ? 'badge-converted' : 'badge-stay'}">${l.type === '외박(외출전환)' ? '외박→외출전환' : l.type}</span>
              <span style="font-size:13px; margin-left:8px;">${l.date}</span>
              ${l.returnTime ? `<span style="font-size:12px; color:var(--text-secondary);"> 洹?? ${l.returnTime}</span>` : ''}
            </div>
          </div>
        `).join('')}
      </div>`;
    }
    return html;
  }

  // ??? ?몄텧/?몃컯 ?좉? 理쒖쟻??(Optimistic UI & Debounce) ????????????????????????????????????
  APP.pendingToggles = APP.pendingToggles || {};
  APP.isSyncing = APP.isSyncing || {};

  function toggleOutStay(type) {
    const s = APP.selectedStudent;
    if (!s) return;

    s.lastModifiedLocal = Date.now(); // ?ъ슜?먭? 議곗옉??理쒖떊 ?쒖젏 湲곕줉

    const returnTime = type === '?몄텧' ? document.getElementById('return-time-input')?.value || '' : '';
    const recordDate = document.getElementById('record-date-input')?.value || new Date().toISOString().split('T')[0];
    APP.selectedDate = recordDate;

    // 議곗옉 ?잛닔 湲곕줉 (?붾컮?댁뒪 ?먮퀎??
    const key = `${s.studentId}_${type}_${recordDate}`;
    if (!APP.pendingToggles[key]) {
      APP.pendingToggles[key] = { count: 0, timer: null };
    }
    APP.pendingToggles[key].count++;

    // 利됯컖?곸씤 UI 諛섏쁺???꾪븳 罹먯떆 蹂寃?(Optimistic Update)
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
    if (type === '?몄텧') {
      // ?대? ?ㅻ뒛 ?몄텧 湲곕줉???쒖꽦?붾릺???덈떎硫?-> 痍⑥냼 ?숈옉
      const existingOut = s.outLogs.find(l => String(l.date).startsWith(recordDate) && l.type === '?몄텧' && l.status === 'active');
      if (existingOut) {
        existingOut.status = 'removed';
        if (s.todayOut && String(s.todayOut.date).startsWith(recordDate)) s.todayOut.status = 'removed';
        s.appOutCount = Math.max(0, (s.appOutCount || 0) - 1);
        actionText = '?몄텧 痍⑥냼 ?꾨즺';
        if (isToday) s.todayOut = null;
      } else {
        // ?덈줈 異붽? ?숈옉
        s.todayOut = newLog;
        s.appOutCount = (s.appOutCount || 0) + 1;
        s.outLogs.unshift(newLog);
        actionText = '?몄텧 湲곕줉 ?꾨즺';
      }
    } else {
      // ?몃컯 ?좉?
      const existingStay = s.outLogs.find(l => String(l.date).startsWith(recordDate) && l.type === '?몃컯' && l.status === 'active');
      if (existingStay) {
        existingStay.status = 'removed';
        if (s.todayStay && String(s.todayStay.date).startsWith(recordDate)) s.todayStay.status = 'removed';
        s.appStayCount = Math.max(0, (s.appStayCount || 0) - 1);
        actionText = '?몃컯 痍⑥냼 ?꾨즺';
        if (isToday) s.todayStay = null;
      } else {
        s.todayStay = newLog;
        s.appStayCount = (s.appStayCount || 0) + 1;
        s.outLogs.unshift(newLog);
        actionText = '?몃컯 湲곕줉 ?꾨즺';
      }
    }

    // 硫붿씤?붾㈃ 紐⑸줉???숈깮 ?곗씠??利됯컖 蹂寃?
    const baseStudent = APP.students.find(x => x.studentId === s.studentId);
    if (baseStudent) {
      Object.assign(baseStudent, s);
      updateStudentCardUI(baseStudent); // 由ъ뒪???붾㈃ 諭껋? ?낅뜲?댄듃
    }

    // ?꾩옱 ?대젮?덈뒗 ???쇰?遺꾨쭔 利됱떆 蹂寃?(源쒕묀??李⑤떒, ?뚮┝ 硫붿떆吏 ?쒓굅)
    updateDetailStatsUI(s);

    // ?댁쟾 ??대㉧ 吏?곌린 (Debounce)
    if (APP.pendingToggles[key].timer) clearTimeout(APP.pendingToggles[key].timer);

    // 1.5珥??숈븞 異붽? ?낅젰???놁쑝硫??쒕쾭 ?꾩넚
    APP.pendingToggles[key].timer = setTimeout(() => {
      const finalCount = APP.pendingToggles[key].count;
      delete APP.pendingToggles[key]; // ?먯뿉????젣

      // ???踰??대┃(?곹깭 蹂寃? ?쒖뿉留??쒕쾭 ?꾩넚, 吏앹닔 踰??먯긽 蹂듦뎄)? ?듭떊 ?앸왂
      if (finalCount % 2 !== 0) {
        APP.isSyncing[s.studentId] = (APP.isSyncing[s.studentId] || 0) + 1; // ?숆린??以??뚮옒洹???

        callServer('toggleOutStay', s.studentId, s.name, s.room, type, returnTime, APP.currentMonth, recordDate)
          .catch(e => {
            showToast('?듭떊 ?ㅻ쪟 諛쒖깮: ' + e, 'error');
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
      var newLog = { date: recordDate, type: '외박(외출전환)', studentId: s.studentId, name: s.name, room: s.room, returnTime: '', status: 'active', recorder: '', timestamp: new Date().toISOString() };
      if (!s.outLogs) s.outLogs = [];
      s.outLogs.unshift(newLog);
      s.appOutCount = (s.appOutCount || 0) + 1;
    }
    s.lastModifiedLocal = Date.now();
    if (typeof updateDetailStatsUI === 'function') updateDetailStatsUI(s);
    var baseStudent = APP.students && APP.students.find(function(x) { return x.studentId === s.studentId; });
    if (baseStudent) Object.assign(baseStudent, s);
    google.script.run.withSuccessHandler(function() {}).withFailureHandler(function(e) { console.error(e); }).convertStayToOut(s.studentId, s.name, s.room, APP.currentMonth, recordDate);
  }

  async function updateReturnTime() {
    // 洹???쒓컙??諛붾뚮㈃ ?쒕쾭???낅뜲?댄듃 (湲곗〈 active 湲곕줉??洹?ъ떆媛?媛깆떊)
    // 媛꾨떒???좉? 痍⑥냼 ???ㅼ떆 湲곕줉?섎뒗 濡쒖쭅? 踰덇굅濡쒖슦誘濡?
    // ?ш린?쒕뒗 ?ъ슜?먭? 臾몄옄濡?蹂대궪 ???ㅼ떆媛?諛섏쁺?섎룄濡??꾨줎?몄뿉留?蹂닿?
  }

  // ??? 踰뚯젏 遺????????????????????????????????????????????
  function openPenaltySelection(studentId, studentName) {
    APP.penaltyTargetStudent = { studentId, name: studentName };
    navigateTo('penalty-items');
  }

  async function loadPenaltyItems() {
    const container = document.getElementById('penalty-items-list');

    // ???쒖옉 ????踰?濡쒕뱶?덈떎硫?罹먯떆???댁슜??利됱떆 ?뚮뜑留?
    if (APP.penaltyItems && APP.penaltyItems.length > 0) {
      renderPenaltyItems(APP.penaltyItems);
      return;
    }

    container.innerHTML = '<div class="empty-state"><div class="spinner"></div><p>踰뚯젏 ??ぉ 濡쒕뱶 以?..</p></div>';

    try {
      const result = await callServer('getPenaltyItems');
      if (!result.success) {
        container.innerHTML = `<div class="empty-state"><p>${result.error}</p></div>`;
        return;
      }

      APP.penaltyItems = result.data;
      renderPenaltyItems(result.data);
    } catch (e) {
      container.innerHTML = `<div class="empty-state"><p>?ㅻ쪟: ${e}</p></div>`;
    }
  }

  function renderPenaltyItems(items) {
    const container = document.getElementById('penalty-items-list');

    if (!items || items.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>踰뚯젏 ??ぉ???놁뒿?덈떎.</p></div>';
      return;
    }

    // ?먯닔 ?ㅻ쫫李⑥닚 ?뺣젹 (0??利됱떆?댁궗??留?留덉?留?
    const sorted = [...items].sort((a, b) => {
      if (a.points === 0 && b.points === 0) return 0;
      if (a.points === 0) return 1;  // 利됱떆?댁궗??留???
      if (b.points === 0) return -1;
      return a.points - b.points;    // ??? ?먯닔遺??
    });

    let html = '';
    sorted.forEach(item => {
      const pointsDisplay = item.points === 0 ? '利됱떆?댁궗' : item.points + '??;
      const pointsClass = item.points === 0 ? 'style="color:var(--danger);font-size:13px;font-weight:700;"' : '';
      html += `
        <div class="penalty-item-card" onclick="selectPenaltyItem(${item.index}, '${escapeHtml(item.name)}', ${item.points})">
          <div class="penalty-item-info">
            <h4>${escapeHtml(item.name)}</h4>
            <p>${escapeHtml(item.description)}</p>
            <span class="badge" style="background:var(--surface-variant);color:var(--text-secondary);font-size:11px;">${escapeHtml(item.category || '湲고?')}</span>
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
      showToast('????숈깮??癒쇱? ?좏깮?섏꽭??', 'warning');
      return;
    }

    const student = APP.penaltyTargetStudent;
    const pointsLabel = points === 0 ? '利됱떆?댁궗 ??? : points + '??;

    showModal('踰뚯젏 遺???뺤씤', `
    <div style="margin-bottom:var(--space-md);">
      <p><strong>${escapeHtml(student.name)}</strong> ?숈깮?먭쾶</p>
      <p style="font-size:18px;font-weight:700;color:var(--danger);margin:8px 0;">${escapeHtml(itemName)} (${pointsLabel})</p>
      <p>踰뚯젏??遺?ы빀?덈떎.</p>
    </div>
    <div class="form-group">
      <label>?꾧?湲곕줉 硫붾え (?좏깮)</label>
      <textarea id="penalty-memo" placeholder="?ъ쑀??硫붾え瑜??낅젰?섏꽭??.."></textarea>
    </div>
    <button class="btn-modal-submit btn-modal-danger" onclick="confirmPenalty('${student.studentId}', '${escapeHtml(itemName)}', ${points})">
      踰뚯젏 遺??
    </button>
  `);
  }

  async function confirmPenalty(studentId, itemName, points) {
    const memo = document.getElementById('penalty-memo')?.value || '';
    closeModal();
    showToast('踰뚯젏 遺??以?..', 'info');

    try {
      const result = await callServer('addPenalty', studentId, itemName, points, memo);
      if (result && result.success) {
        showToast('踰뚯젏??遺?щ릺?덉뒿?덈떎.', 'success');
        goBack(); // ?숈깮 ?곸꽭濡??뚯븘媛湲?
        // ?쎄컙???쒕젅?????곸꽭 ?덈줈怨좎묠
        setTimeout(() => openStudentDetail(studentId), 300);
      } else if (result && result.error) {
        showToast('?ㅻ쪟: ' + result.error, 'error');
      } else {
        showToast('踰뚯젏 泥섎━ ?꾨즺', 'success');
        goBack();
        setTimeout(() => openStudentDetail(studentId), 300);
      }
    } catch (e) {
      showToast('?ㅻ쪟: ' + e, 'error');
    }
  }

  // ??? 臾몄옄/?꾪솕 ?곕씫 ????????????????????????????????????
  async function openSms(phone, studentName) {
    const s = APP.selectedStudent;

    // ?몄텧/?몃컯 ?곹깭???곕씪 ?쒗뵆由??좏삎 寃곗젙
    let type = '?몄텧'; // 湲곕낯媛?
    if (s && s.todayStay) type = '?몃컯';

    try {
      const result = await callServer('getSmsTemplate', type);
      let body = result.success ? result.data : '';

      // 蹂??移섑솚
      const today = new Date();
      const dateStr = (today.getMonth() + 1) + '??' + today.getDate() + '??;
      const returnTime = document.getElementById('return-time-input')?.value || '誘몄젙';

      body = body.replace(/\{?대쫫\}/g, studentName || '');
      body = body.replace(/\{?좎쭨\}/g, dateStr);
      body = body.replace(/\{洹?ъ떆媛?}/g, returnTime);

      // SMS ?λ쭅??(iOS: sms:踰덊샇&body=... / Android: sms:踰덊샇?body=...)
      const encodedBody = encodeURIComponent(body);
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      const separator = isIOS ? '&' : '?';
      const smsUrl = `sms:${phone}${separator}body=${encodedBody}`;

      window.top.location.href = smsUrl;
    } catch (e) {
      // ?쒗뵆由?濡쒕뱶 ?ㅽ뙣 ??鍮?臾몄옄濡??닿린
      window.top.location.href = `sms:${phone}`;
    }
  }

  // ??? ?곕씫泥??섏젙 ?ㅼ씠?쇰줈洹??????????????????????????????
  function showContactEditDialog(studentId, studentName) {
    const s = APP.selectedStudent;
    showModal('?곕씫泥??깅줉/?섏젙', `
    <div class="form-group">
      <label>?숈깮紐?/label>
      <input type="text" id="contact-name" value="${escapeHtml(studentName)}" readonly style="background:var(--surface-variant);">
    </div>
    <div class="form-group">
      <label>?숈깮 ?꾪솕踰덊샇</label>
      <input type="tel" id="contact-student-phone" placeholder="010-0000-0000" value="${s?.studentPhone || ''}">
    </div>
    <div class="form-group">
      <label>?숇?紐??꾪솕踰덊샇</label>
      <input type="tel" id="contact-parent-phone" placeholder="010-0000-0000" value="${s?.parentPhone || ''}">
    </div>
    <button class="btn-modal-submit" onclick="saveContact('${studentId}', '${escapeHtml(studentName)}')">???/button>
  `);
  }

  async function saveContact(studentId, studentName) {
    const studentPhone = document.getElementById('contact-student-phone').value.trim();
    const parentPhone = document.getElementById('contact-parent-phone').value.trim();

    closeModal();
    showToast('???以?..', 'info');

    try {
      const result = await callServer('saveStudentContact', studentId, studentName, studentPhone, parentPhone);
      if (result.success) {
        showToast('?곕씫泥섍? ??λ릺?덉뒿?덈떎.', 'success');
        await openStudentDetail(studentId);
      } else {
        showToast('?ㅻ쪟: ' + result.error, 'error');
      }
    } catch (e) {
      showToast('?ㅻ쪟: ' + e, 'error');
    }
  }

  // ??? ?꾧?湲곕줉 ??????????????????????????????????????????
  function renderCumulativeRecords(records) {
    const container = document.getElementById('cumulative-list');

    // 罹먯떆瑜??섎룞 媛깆떊?????덈뒗 ?덈줈怨좎묠 踰꾪듉 ?뚮뜑留??ы븿
    let html = `
      <div style="display:flex; justify-content: flex-end; margin-bottom: 12px; padding: 0 16px;">
        <button class="btn-primary btn-sm" onclick="forceRefreshData()">?봽 理쒖떊 ?곗씠??遺덈윭?ㅺ린</button>
      </div>
    `;

    if (!records || records.length === 0) {
      container.innerHTML = html + '<div class="empty-state"><div class="empty-icon">?뱷</div><p>?꾧?湲곕줉???놁뒿?덈떎.</p></div>';
      return;
    }

    // 理쒖떊???뺣젹
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
          ${r.source === '?먮낯' ? '<span class="source-tag">?먮낯</span>' : '<span class="source-tag app">??/span>'}
        </div>
        <div class="record-content">${escapeHtml(r.content || '')}</div>
        ${r.action ? `<div style="font-size:12px;color:var(--text-secondary);">議곗튂: ${escapeHtml(r.action)}</div>` : ''}
        ${r.source === '?? && ((APP.user && r.authorEmail === APP.user.email) || !r.authorEmail || (APP.user && APP.user.email === 'admin@school.com')) ? `
          <div style="margin-top:12px; display:flex; justify-content:flex-end; gap:8px;">
            <button class="btn-status" style="background-color:#f1f3f5; color:#495057; border: 1px solid #ced4da; padding: 6px 10px; font-size: 12px; line-height: 1;" onclick="showEditCumulativeDialog(${r.rowIndex}, '${escapeHtml(r.content || '').replace(/'/g, "\\'").replace(/\n/g, '\\n')}', '${escapeHtml(r.action || '').replace(/'/g, "\\'").replace(/\n/g, '\\n')}')">?륅툘 ?섏젙</button>
            <button class="btn-status" style="background-color:#fff5f5; color:#e03131; border: 1px solid #ffc9c9; padding: 6px 10px; font-size: 12px; line-height: 1;" onclick="deleteCumulativeRecord(${r.rowIndex})">?뿊截???젣</button>
          </div>
        ` : ''}
      </div>
    `).join('');

    container.innerHTML = html;
  }

  // 紐낆떆??濡쒕뱶 ?꾩슂 ?쒕쭔 ?ъ슜
  async function loadCumulativeRecords() {
    const container = document.getElementById('cumulative-list');
    container.innerHTML = '<div class="empty-state"><div class="spinner"></div><p>濡쒕뱶 以?..</p></div>';
    try {
      const result = await callServer('getCumulativeRecords');
      if (result && result.success) {
        APP.cumulativeRecords = result.data;
        renderCumulativeRecords(APP.cumulativeRecords);
      } else {
        container.innerHTML = `<div class="empty-state"><p>${result ? result.error : '?곗씠?곕? 遺덈윭?????놁뒿?덈떎.'}</p></div>`;
      }
    } catch (e) {
      container.innerHTML = `<div class="empty-state"><p>?ㅻ쪟: ${e}</p></div>`;
    }
  }

  function showAddRecordDialog() {
    showModal('?꾧?湲곕줉 異붽?', `
    <div class="form-group">
      <label>?숇쾲</label>
      <input type="text" id="record-student-id" placeholder="?숇쾲 ?낅젰">
    </div>
    <div class="form-group">
      <label>?숈깮紐?/label>
      <input type="text" id="record-student-name" placeholder="?숈깮紐??낅젰">
    </div>
    <div class="form-group">
      <label>?곷떞 援먯궗</label>
      <input type="text" id="record-teacher-name" placeholder="?곷떞 援먯궗紐??낅젰">
    </div>
    <div class="form-group">
      <label>?곷떞(吏?? ?댁슜</label>
      <textarea id="record-content" placeholder="?댁슜???낅젰?섏꽭??.."></textarea>
    </div>
    <div class="form-group">
      <label>議곗튂 ?댁슜</label>
      <input type="text" id="record-action" placeholder="議곗튂 ?댁슜 ?낅젰">
    </div>
    <button class="btn-modal-submit" onclick="submitCumulativeRecord()">湲곕줉 異붽?</button>
  `);
  }

  async function submitCumulativeRecord() {
    const studentId = document.getElementById('record-student-id').value.trim();
    const studentName = document.getElementById('record-student-name').value.trim();
    const teacherName = document.getElementById('record-teacher-name').value.trim();
    const content = document.getElementById('record-content').value.trim();
    const action = document.getElementById('record-action').value.trim();

    if (!studentId || !content || !teacherName) {
      showToast('?숇쾲, ?곷떞 援먯궗, ?댁슜? ?꾩닔?낅땲??', 'warning');
      return;
    }

    closeModal();
    showToast('?깅줉 以?..', 'info');

    try {
      const result = await callServer('addManualCumulativeRecord', studentId, studentName, teacherName, content, action);
      if (result.success) {
        showToast('?꾧?湲곕줉??異붽??섏뿀?듬땲??', 'success');
        loadCumulativeRecords();
      } else {
        showToast('?ㅻ쪟: ' + result.error, 'error');
      }
    } catch (e) {
      showToast('?ㅻ쪟: ' + e, 'error');
    }
  }

  function showEditCumulativeDialog(rowIndex, oldContent, oldAction) {
    showModal('?꾧?湲곕줉 ?섏젙', `
    <div class="form-group">
      <label>?곷떞(吏?? ?댁슜</label>
      <textarea id="edit-record-content" style="min-height:100px; width:100%; padding:8px; border:1px solid var(--border-color); border-radius:4px; box-sizing:border-box;">${oldContent}</textarea>
    </div>
    <div class="form-group">
      <label>議곗튂 ?댁슜</label>
      <input type="text" id="edit-record-action" class="form-control" value="${oldAction}" style="width:100%; padding:8px; border:1px solid var(--border-color); border-radius:4px; box-sizing:border-box;">
    </div>
    <button class="btn-modal-submit" onclick="submitEditCumulativeRecord(${rowIndex})">?섏젙 ?꾨즺</button>
  `);
  }

  async function submitEditCumulativeRecord(rowIndex) {
    const content = document.getElementById('edit-record-content').value.trim();
    const action = document.getElementById('edit-record-action').value.trim();

    if (!content) {
      showToast('?댁슜???낅젰?섏꽭??', 'warning');
      return;
    }

    closeModal();
    showToast('?섏젙 以?..', 'info');

    try {
      const result = await callServer('editMyCumulativeRecord', rowIndex, content, action);
      if (result.success) {
        showToast('?섏젙?섏뿀?듬땲??', 'success');
        loadCumulativeRecords();
      } else {
        showToast('?ㅻ쪟: ' + result.error, 'error');
      }
    } catch (e) {
      showToast('?ㅻ쪟: ' + e, 'error');
    }
  }

  async function deleteCumulativeRecord(rowIndex) {
    if (!confirm('?뺣쭚濡????꾧?湲곕줉????젣?섏떆寃좎뒿?덇퉴?\\n(??젣 ???곗씠?곌? 利됯컖 ?붾㈃???낅뜲?댄듃?⑸땲??')) return;

    showToast('??젣 以?..', 'info');
    try {
      const result = await callServer('deleteMyCumulativeRecord', rowIndex);
      if (result.success) {
        showToast('??젣?섏뿀?듬땲??', 'success');
        loadCumulativeRecords();
      } else {
        showToast('?ㅻ쪟: ' + result.error, 'error');
      }
    } catch (e) {
      showToast('?ㅻ쪟: ' + e, 'error');
    }
  }

  // ??? 援먯궗 嫄댁쓽?ы빆 ?????????????????????????????????????
  function renderSuggestions(suggestions) {
    const container = document.getElementById('suggestions-list');

    let html = `
      <div style="display:flex; justify-content: flex-end; margin-bottom: 12px; padding: 0 16px;">
        <button class="btn-primary btn-sm" onclick="forceRefreshData()">?봽 理쒖떊 ?곗씠??遺덈윭?ㅺ린</button>
      </div>
    `;

    if (!suggestions || suggestions.length === 0) {
      container.innerHTML = html + '<div class="empty-state"><div class="empty-icon">?뮠</div><p>嫄댁쓽?ы빆???놁뒿?덈떎.</p></div>';
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
            <button class="btn-status" style="background-color: #f1f3f5; color: #495057; border: 1px solid #ced4da;" onclick="showEditSuggestionDialog(${s.index}, '${escapeHtml(s.content || '').replace(/'/g, "\\'").replace(/\n/g, '\\n')}')">?륅툘 ?섏젙</button>
            <button class="btn-status" style="background-color: #fff5f5; color: #e03131; border: 1px solid #ffc9c9;" onclick="deleteSuggestion(${s.index})">?뿊截???젣</button>
          ` : ''}
          <div style="flex-grow:1;"></div>
          <button class="btn-status" onclick="changeSuggestionStatus(${s.index}, '?묒닔')">?묒닔</button>
          <button class="btn-status" onclick="changeSuggestionStatus(${s.index}, '泥섎━以?)">泥섎━以?/button>
          <button class="btn-status" onclick="changeSuggestionStatus(${s.index}, '?꾨즺')">?꾨즺</button>
        </div>
      </div>
    `).join('');

    container.innerHTML = html;
  }

  // 紐낆떆??濡쒕뱶 ?꾩슂 ?쒕쭔 ?ъ슜
  async function loadSuggestions() {
    const container = document.getElementById('suggestions-list');
    container.innerHTML = '<div class="empty-state"><div class="spinner"></div><p>濡쒕뱶 以?..</p></div>';
    try {
      const result = await callServer('getSuggestions');
      if (result && result.success) {
        APP.suggestions = result.data;
        renderSuggestions(APP.suggestions);
      } else {
        container.innerHTML = `<div class="empty-state"><p>${result ? result.error : '?곗씠?곕? 遺덈윭?????놁뒿?덈떎.'}</p></div>`;
      }
    } catch (e) {
      container.innerHTML = `<div class="empty-state"><p>?ㅻ쪟: ${e}</p></div>`;
    }
  }

  function showAddSuggestionDialog() {
    showModal('嫄댁쓽?ы빆 ?묒꽦', `
    <div class="form-group">
      <label>?묒꽦???대쫫</label>
      <input type="text" id="suggestion-author-name" class="form-control" placeholder="?대쫫???낅젰?섏꽭?? value="" style="width:100%; padding:8px; border:1px solid var(--border-color); border-radius:4px; margin-bottom:12px; box-sizing:border-box;">
    </div>
    <div class="form-group">
      <label>嫄댁쓽 ?댁슜</label>
      <textarea id="suggestion-content" placeholder="嫄댁쓽?ы빆???묒꽦?섏꽭??.." style="min-height:150px; width:100%; padding:8px; border:1px solid var(--border-color); border-radius:4px; box-sizing:border-box;"></textarea>
    </div>
    <button class="btn-modal-submit" onclick="submitSuggestion()">?묒꽦 ?꾨즺</button>
  `);
  }

  async function submitSuggestion() {
    const authorName = document.getElementById('suggestion-author-name').value.trim();
    const content = document.getElementById('suggestion-content').value.trim();
    if (!content) {
      showToast('?댁슜???낅젰?섏꽭??', 'warning');
      return;
    }

    closeModal();
    showToast('?깅줉 以?..', 'info');

    try {
      const result = await callServer('addSuggestion', content, authorName);
      if (result.success) {
        showToast('嫄댁쓽?ы빆???깅줉?섏뿀?듬땲??', 'success');
        loadSuggestions();
      } else {
        showToast('?ㅻ쪟: ' + result.error, 'error');
      }
    } catch (e) {
      showToast('?ㅻ쪟: ' + e, 'error');
    }
  }

  function showEditSuggestionDialog(rowIndex, oldContent) {
    showModal('嫄댁쓽?ы빆 ?섏젙', `
    <div class="form-group">
      <label>嫄댁쓽 ?댁슜</label>
      <textarea id="edit-suggestion-content" style="min-height:150px; width:100%; padding:8px; border:1px solid var(--border-color); border-radius:4px; box-sizing:border-box;">${oldContent}</textarea>
    </div>
    <button class="btn-modal-submit" onclick="submitEditSuggestion(${rowIndex})">?섏젙 ?꾨즺</button>
  `);
  }

  async function submitEditSuggestion(rowIndex) {
    const content = document.getElementById('edit-suggestion-content').value.trim();
    if (!content) {
      showToast('?댁슜???낅젰?섏꽭??', 'warning');
      return;
    }

    closeModal();
    showToast('?섏젙 以?..', 'info');

    try {
      const result = await callServer('editMySuggestion', rowIndex, content);
      if (result.success) {
        showToast('?섏젙?섏뿀?듬땲??', 'success');
        loadSuggestions();
      } else {
        showToast('?ㅻ쪟: ' + result.error, 'error');
      }
    } catch (e) {
      showToast('?ㅻ쪟: ' + e, 'error');
    }
  }

  async function deleteSuggestion(rowIndex) {
    if (!confirm('?뺣쭚濡???嫄댁쓽?ы빆????젣?섏떆寃좎뒿?덇퉴?\\n(??젣 ???곗씠?곌? 利됯컖 ?붾㈃???낅뜲?댄듃?⑸땲??')) return;

    showToast('??젣 以?..', 'info');
    try {
      const result = await callServer('deleteMySuggestion', rowIndex);
      if (result.success) {
        showToast('??젣?섏뿀?듬땲??', 'success');
        loadSuggestions(); // ??젣 ??由ъ뒪??媛깆떊
      } else {
        showToast('?ㅻ쪟: ' + result.error, 'error');
      }
    } catch (e) {
      showToast('?ㅻ쪟: ' + e, 'error');
    }
  }

  async function changeSuggestionStatus(rowIndex, newStatus) {
    try {
      const result = await callServer('updateSuggestionStatus', rowIndex, newStatus);
      if (result.success) {
        showToast('?곹깭媛 蹂寃쎈릺?덉뒿?덈떎.', 'success');
        loadSuggestions();
      } else {
        showToast('?ㅻ쪟: ' + result.error, 'error');
      }
    } catch (e) {
      showToast('?ㅻ쪟: ' + e, 'error');
    }
  }

  // ??? ?ш컧 洹쇰Т 議고쉶 ????????????????????????????????????
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
    html += DAYS.map(function(d, i) { return '<div class="duty-cal-dow ' + (i===0?'sun':i===6?'sat':'') + '">' + d + '</div>'; }).join('');
    for (var i = 0; i < firstDay.getDay(); i++) html += '<div class="duty-cal-cell empty"></div>';
    for (var d = 1; d <= lastDay.getDate(); d++) {
      var isToday = (today.getFullYear()===year && today.getMonth()+1===monthNum && today.getDate()===d);
      var hasDuty = !!dutyMap[d];
      var dow = new Date(year, monthNum-1, d).getDay();
      var colorStyle = !isToday ? (dow===0?'color:#e53935;':dow===6?'color:#1565c0;':'') : '';
      html += '<div class="duty-cal-cell' + (isToday?' today':'') + (hasDuty?' has-duty':'') + '" style="' + colorStyle + '" onclick="showDutyOnDay(' + d + ')">' + d + '</div>';
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
      popup.style.background = '#3b82f6';
    } else {
      popup.textContent = day + '일: 사감 데이터 없음';
      popup.style.background = '#9ca3af';
    }
  }

  function renderDutySchedule(data, teachers) {
    const container = document.getElementById('duty-schedule-list');
    const teacherSelect = document.getElementById('duty-teacher-select');

    // 援먯궗 ?쒕∼?ㅼ슫 媛깆떊
    teacherSelect.innerHTML = '<option value="">援먯궗 ?좏깮</option>';
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

  // 紐낆떆??濡쒕뱶 ?꾩슂 ?쒕쭔 (蹂댄넻? initApp?먯꽌 罹먯떛??APP.dutyData瑜??ъ슜)
  async function loadDutySchedule() {
    const container = document.getElementById('duty-schedule-list');
    container.innerHTML = '<div class="empty-state"><div class="spinner"></div><p>濡쒕뱶 以?..</p></div>';

    try {
      const result = await callServer('getDutySchedule', APP.currentMonth);
      if (!result.success) {
        container.innerHTML = `<div class="empty-state"><div class="empty-icon">?뱟</div><p>${result.error}</p></div>`;
        return;
      }

      APP.dutyData = result.data;
      APP.dutyTeachers = result.teachers;
      renderDutySchedule(APP.dutyData, APP.dutyTeachers);
    } catch (e) {
      container.innerHTML = `<div class="empty-state"><p>?ㅻ쪟: ${e}</p></div>`;
    }
  }

  /**
   * ?ш컧 ?섏씠吏 ?뚮뜑留?
   * - ?곷떒: ?ㅻ뒛 ?ш컧 媛뺤“ 諛곕꼫
   * - ?섎떒: 援먯궗 ?좏깮 ???대떦 援먯궗??洹쇰Т ?좎쭨/?붿씪 紐⑸줉
   */
  function renderDutyPage(data) {
    const container = document.getElementById('duty-schedule-list');

    let html = `
      <div style="display:flex; justify-content: flex-end; margin-bottom: 12px; padding: 0 16px;">
        <button class="btn-primary btn-sm" onclick="forceRefreshData()">?봽 理쒖떊 ?곗씠??遺덈윭?ㅺ린</button>
      </div>
    `;

    if (!data || data.length === 0) {
      container.innerHTML = html + '<div class="empty-state"><div class="empty-icon">?뱟</div><p>?ш컧 洹쇰Т ?곗씠?곌? ?놁뒿?덈떎.</p></div>';
      return;
    }

    // ?ㅻ뒛 ?좎쭨濡??ш컧 李얘린 (二쇰쭚 ???ㅼ닔/蹂묓빀? 怨좊젮)
    const today = new Date();
    const todayDay = today.getDate();
    const todayMonth = today.getMonth() + 1;

    // ?꾩옱 ?대젮?덈뒗 ??쓽 ?붿씠 ?ㅼ젣 ?ㅻ뒛???랁븳 ?ъ씪 寃쎌슦?먮쭔 ?ш컧???⑤룄濡??쒗븳
    const isCurrentMonthTab = String(APP.currentMonth).startsWith(String(todayMonth));

    const todayDuties = [];
    if (isCurrentMonthTab) {
      for (const entry of data) {
        // "3??6??, "6?? ?깆뿉??留덉?留??レ옄(?? 異붿텧
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

    // ?ㅻ뒛 ?ш컧 諛곕꼫
    if (todayDuties.length > 0) {
      const names = todayDuties.map(d => escapeHtml(d.name)).join(', ');
      const dow = escapeHtml(todayDuties[0].dayOfWeek);
      html += `
            <div class="today-duty-banner">
              <div class="today-duty-label">?뱦 ?ㅻ뒛???ш컧</div>
              <div class="today-duty-name">${names}</div>
              <div class="today-duty-date">${todayMonth}??${todayDay}??(${dow})</div>
            </div>`;
    } else {
      html += `
            <div class="today-duty-banner" style="background:var(--surface-variant);">
              <div class="today-duty-label">?뱦 ?ㅻ뒛???ш컧</div>
              <div class="today-duty-name" style="color:var(--text-secondary);">?곗씠???놁쓬</div>
            </div>`;
    }

    // ?덈궡 硫붿떆吏 (援먯궗 誘몄꽑????
    html += '<div id="duty-teacher-result" style="margin-top:var(--space-md);"></div>';
    container.innerHTML = html;
  }

  function filterDutyByTeacher() {
    const teacher = document.getElementById('duty-teacher-select').value;
    const resultContainer = document.getElementById('duty-teacher-result');
    if (!resultContainer) return;

    if (!teacher) {
      resultContainer.innerHTML = '<p style="text-align:center;color:var(--text-tertiary);font-size:13px;padding:var(--space-lg) 0;">?몘 ?꾩뿉??援먯궗瑜??좏깮?섎㈃<br>?대떦 援먯궗???ш컧 洹쇰Т?쇱쓣 蹂????덉뒿?덈떎.</p>';
      return;
    }

    // ?대떦 援먯궗??洹쇰Т?쇰쭔 ?꾪꽣
    const filtered = (APP.dutyData || []).filter(entry => {
      return entry.name.includes(teacher) || entry.duty.includes(teacher);
    });

    if (filtered.length === 0) {
      resultContainer.innerHTML = `<p style="text-align:center;color:var(--text-tertiary);font-size:13px;padding:var(--space-md) 0;">${escapeHtml(teacher)} ?좎깮?섏쓽 洹쇰Т 湲곕줉???놁뒿?덈떎.</p>`;
      return;
    }

    resultContainer.innerHTML = `
            <h3 style="font-size:15px;margin-bottom:var(--space-sm);color:var(--text-primary);">${escapeHtml(teacher)} ?좎깮???ш컧 洹쇰Т (${filtered.length}??</h3>
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

  // ??? ?ㅼ젙 ?붾㈃ ?????????????????????????????????????????
  function renderSettings() {
    const container = document.getElementById('settings-content');
    const s = APP.settings;

    container.innerHTML = `
    <div class="setting-group">
      <h3>?뵢 ?몄텧/?몃컯 洹쒖젙</h3>
      <div class="setting-item">
        <div class="setting-label">
          ??理쒕? ?몄텧 ?잛닔
          <small>珥덇낵 ??踰뚯젏 遺怨?/small>
        </div>
        <div class="setting-value">
          <input type="number" id="setting-max-out" value="${s.MAX_OUT_COUNT || 2}" min="0" max="10">
        </div>
      </div>
      <div class="setting-item">
        <div class="setting-label">
          ??理쒕? ?몃컯 ?잛닔
          <small>珥덇낵 ??踰뚯젏 遺怨?/small>
        </div>
        <div class="setting-value">
          <input type="number" id="setting-max-stay" value="${s.MAX_STAY_COUNT || 2}" min="0" max="10">
        </div>
      </div>
      <div class="setting-item">
        <div class="setting-label">
          珥덇낵 1?뚮떦 踰뚯젏
          <small>?몄텧/?몃컯 珥덇낵 ??/small>
        </div>
        <div class="setting-value">
          <input type="number" id="setting-over-penalty" value="${s.OVER_PENALTY_POINTS || 5}" min="1" max="20">
        </div>
      </div>
    </div>
    
    <div class="setting-group">
      <h3>?뵕 ?먮낯 ?쒗듃 ?곕룞</h3>
      <div class="setting-item">
        <div class="setting-label">
          ?먮낯 ?쒗듃 ?먮룞 諛섏쁺
          <small>???곗씠?곕? ?먮낯 ?쒗듃?먮룄 ?낅뜲?댄듃</small>
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
      <h3>?뱄툘 ?뺣낫</h3>
      <div class="setting-item">
        <div class="setting-label">?꾩옱 ?ъ슜??/div>
        <div class="setting-value" style="font-size:12px;">${APP.user ? APP.user.email : '-'}</div>
      </div>
      <div class="setting-item">
        <div class="setting-label">?좏깮????/div>
        <div class="setting-value">${APP.currentMonth}</div>
      </div>
      <div class="setting-item">
        <div class="setting-label">吏뺢퀎 湲곗?</div>
        <div class="setting-value" style="font-size:11px;text-align:right;">
          5??諛섏꽦臾?/ 8??遊됱궗<br>
          12???곷떞 / 15???꾩떆?댁궗<br>
          20???댁궗
        </div>
      </div>
    </div>
    
    <div class="setting-group"><h3>특별활동 관리</h3><p style="font-size:12px;color:#6b7280;margin-bottom:8px;">학원, 악기, 야간방과후, 오케스트라 등 정기 외부활동을 등록합니다.</p><div id="special-activities-list"></div><button class="btn-primary btn-sm" style="margin-top:8px;" onclick="showAddActivityDialog()">+ 특별활동 추가</button></div>
        <button class="btn-save-settings" onclick="saveSettings()">?ㅼ젙 ???/button>
  `;
    renderSpecialActivitiesList();
  }

  function renderSpecialActivitiesList() {
    var container = document.getElementById('special-activities-list');
    if (!container) return;
    var items = APP.specialActivities || [];
    if (items.length === 0) { container.innerHTML = '<p style="font-size:12px;color:#9ca3af;">등록된 특별활동이 없습니다.</p>'; return; }
    container.innerHTML = items.map(function(a) {
      return '<div style="display:flex;align-items:center;padding:6px 0;border-bottom:1px solid #f3f4f6;gap:8px;">'
        + '<div style="flex:1;font-size:13px;"><strong>' + (a.name||'') + '</strong>'
        + '<span style="color:#6b7280;font-size:11px;"> ' + (a.room||'') + '호 · ' + (a.activityType||'') + '</span><br>'
        + '<span style="font-size:11px;color:#9ca3af;">' + (a.days||'') + ' ' + (a.startTime||'') + '~' + (a.endTime||'') + '</span></div>'
        + '<button onclick="deleteActivity(' + a.rowIndex + ')" style="color:#ef4444;background:none;border:none;cursor:pointer;font-size:12px;">삭제</button>'
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
    if (typeof showModal === 'function') showModal('특별활동 추가', html);
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
      if (typeof showToast === 'function') showToast('학번, 이름, 요일은 필수입니다.', 'warning');
      return;
    }
    if (typeof closeModal === 'function') closeModal();
    google.script.run.withSuccessHandler(function(r) {
      if (r.success) {
        if (typeof showToast === 'function') showToast('저장되었습니다.', 'success');
        google.script.run.withSuccessHandler(function(r2) {
          if (r2.success) { APP.specialActivities = r2.data; renderSpecialActivitiesList(); }
        }).getSpecialActivities();
      } else {
        if (typeof showToast === 'function') showToast('오류: ' + r.error, 'error');
      }
    }).saveSpecialActivity(null, sid, sname, room, type, days, start, end, note);
  }

  function deleteActivity(rowIndex) {
    if (!confirm('삭제하시겠습니까?')) return;
    google.script.run.withSuccessHandler(function(r) {
      if (r.success) {
        if (typeof showToast === 'function') showToast('삭제되었습니다.', 'success');
        google.script.run.withSuccessHandler(function(r2) {
          if (r2.success) { APP.specialActivities = r2.data; renderSpecialActivitiesList(); }
        }).getSpecialActivities();
      } else {
        if (typeof showToast === 'function') showToast('오류: ' + r.error, 'error');
      }
    }).deleteSpecialActivity(rowIndex);
  }


  async function saveSettings() {
    showToast('???以?..', 'info');

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

      showToast('?ㅼ젙????λ릺?덉뒿?덈떎.', 'success');
    } catch (e) {
      showToast('????ㅻ쪟: ' + e, 'error');
    }
  }

  // ??? 紐⑤떖 ??????????????????????????????????????????????
  function showModal(title, bodyHtml) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal-overlay').classList.add('visible');
  }

  function closeModal() {
    document.getElementById('modal-overlay').classList.remove('visible');
  }

  // ??? ?좎뒪???뚮┝ ???????????????????????????????????????
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = message;
    container.appendChild(toast);

    // 3珥????먮룞 ?쒓굅
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3000);
  }

  // ??? ?좏떥由ы떚 ??????????????????????????????????????????
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  // ?섏씠吏 濡쒕뱶 ???밴꺼???덈줈怨좎묠 由ъ뒪???깅줉
  document.addEventListener('DOMContentLoaded', initPullToRefresh);

  // ??? ?밴꺼???덈줈怨좎묠 (Pull-to-refresh) ?쒓컖??援ы쁽 ?????????????????
  function initPullToRefresh() {
    let touchStartY = 0;
    let isPulling = false;
    const bodyContainer = document.body;

    // ?몃뵒耳?댄꽣 而⑦뀒?대꼫 (?붾㈃ ?곷떒 ?덉뿉 ?④꺼????대젮?ㅻ뒗 諛⑹떇 - ?덉쟾?섍쾶 蹂댁씠?꾨줉)
    const ptrContainer = document.createElement('div');
    ptrContainer.id = 'ptr-container';
    ptrContainer.style.position = 'fixed'; // fixed濡??붾㈃ 湲곗? 諛곗튂媛 紐⑤컮?쇱뿉????蹂댁엫
    ptrContainer.style.top = '0';
    ptrContainer.style.left = '0';
    ptrContainer.style.width = '100%';
    ptrContainer.style.height = '60px'; // ?믪씠瑜?60px 吏??
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
    ptrContainer.style.transform = 'translateY(-100%)'; // ?됱냼???붾㈃ 諛??꾨줈 ?꾩쟾 ?④?
    ptrContainer.style.transition = 'transform 0.2s ease-out';
    ptrContainer.style.pointerEvents = 'none';

    // ?ㅽ뵾???뺥깭 ???鍮숆?鍮숆? ?꾨뒗 ?쏀넗洹몃옩
    const ptrIcon = document.createElement('div');
    ptrIcon.innerHTML = '?봽';
    ptrIcon.style.fontSize = '24px';
    ptrIcon.style.transition = 'transform 0.1s linear';
    ptrIcon.style.marginBottom = '2px';

    const ptrText = document.createElement('span');
    ptrText.textContent = '?밴꺼???덈줈怨좎묠';

    ptrContainer.appendChild(ptrIcon);
    ptrContainer.appendChild(ptrText);
    document.body.appendChild(ptrContainer);

    bodyContainer.addEventListener('touchstart', e => {
      if (window.scrollY === 0) {
        touchStartY = e.touches[0].clientY;
        isPulling = true;
        ptrContainer.style.transition = 'none'; // ?밴만 ??利됯컖 ?대젮?ㅺ쾶
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
          ptrText.textContent = '?볦븘???덈줈怨좎묠';
        } else {
          ptrText.textContent = '?밴꺼???덈줈怨좎묠';
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
        ptrContainer.style.transform = 'translateY(0)'; // ?붾㈃???좎엳寃??좎?
        ptrText.textContent = '遺덈윭?ㅻ뒗 以?..';

        forceRefreshData().then(() => {
          ptrContainer.style.transform = 'translateY(-100%)';
          ptrText.textContent = '?밴꺼???덈줈怨좎묠';
        });
      } else {
        ptrContainer.style.transform = 'translateY(-100%)';
      }
    });
  }