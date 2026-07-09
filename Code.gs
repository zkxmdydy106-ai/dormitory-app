/**
 * ============================================================
 * 기숙사 업무 최적화 웹앱 — 메인 엔트리포인트
 * ============================================================
 * 
 * [설계 원칙]
 * - A안 채택: 원본 스프레드시트 1개만 사용
 * - 원본 시트 내에 APP_ 접두어 탭을 추가하여 앱 데이터 저장
 * - SYNC_TO_ORIGINAL = ON이면 원본 월별 시트의 E/I/F/J/M/N열도 자동 갱신
 * 
 * [스프레드시트 ID 관리]
 * - Script Properties에 아래 키로 저장:
 *   SHEET_ID : 구글시트 ID (하나만 필요!)
 */

// ─── 상수 ──────────────────────────────────────────────
const PROPS = PropertiesService.getScriptProperties();

/** 스프레드시트 ID (A안: 1개만 사용) */
function getOriginalSheetId() {
  return PROPS.getProperty('SHEET_ID') || '';
}

/** APP 데이터도 같은 시트에 저장 (A안) */
function getAppDbSheetId() {
  return getOriginalSheetId(); // A안: 원본과 동일한 스프레드시트 사용
}

/**
 * Date 객체를 문자열로 변환 (GAS 직렬화 오류 방지)
 * google.script.run은 Date 객체를 포함한 반환값을 직렬화하지 못해 null이 됨
 */
function safeString(val) {
  if (val === null || val === undefined) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
  }
  return String(val);
}
function safeDateStr(val) {
  if (val === null || val === undefined) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'Asia/Seoul', 'yyyy-MM-dd');
  }
  return String(val);
}

// ─── 초기화 통합 API (서버 호출 1회로 로딩 최적화) ──────
/**
 * 강제 새로고침용 API (캐시 무시 및 초기화)
 */
function forceInitApp(month) {
  clearAppCache(month);
  return initApp(month);
}

/**
 * initApp — 앱 초기화에 필요한 모든 데이터를 한 번에 반환
 * 기존: getCurrentUser + getAvailableMonths + getSettings + getStudentList = 서버 호출 4회
 * 최적화: initApp 1회로 통합 → 로딩 시간 3~4초 → 1~2초
 * 
 * @param {string} month - 현재 월 (예: "3월"). 빈값이면 현재 월 자동 감지
 * @returns {Object} { user, months, settings, studentList, dutyData, suggestions, cumulativeRecords }
 */
function initApp(month) {
  try {
    // 1) 사용자 정보
    const user = getCurrentUser();
    
    // 2) 월 탭 목록
    const monthResult = getAvailableMonths();
    const months = monthResult.success ? monthResult.data : [];
    
    // 3) 현재 월 결정
    if (!month || month === '') {
      const currentMonthNum = new Date().getMonth() + 1;
      month = currentMonthNum + '월';
      if (!months.includes(month) && months.length > 0) {
        month = months[0]; // 현재 월이 없으면 첫번째 탭
      }
    }
    
    // 4) 설정값
    const settingsResult = getSettings();
    const settings = settingsResult.success ? settingsResult.data : {};
    
    // 5) 학생 리스트
    const studentResult = getStudentList(month);
    
    // 6) 사감 근무 리스트
    let dutyData = null;
    try { dutyData = getDutySchedule(month); } catch(e) {}
    
    // 7) 건의사항
    let suggestions = null;
    try { suggestions = getSuggestions(); } catch(e) {}
    
    // 8) 누가기록
    let cumulativeRecords = null;
    try { cumulativeRecords = getCumulativeRecords(); } catch(e) {}

    // 9) 특별활동
    var specialActivities = null;
    try { specialActivities = getSpecialActivities(); } catch(e) {}

    return JSON.parse(JSON.stringify({
      user: user,
      months: months,
      currentMonth: month,
      settings: settings,
      studentList: studentResult,
      dutyData: dutyData,
      suggestions: suggestions,
      cumulativeRecords: cumulativeRecords,
      specialActivities: specialActivities
    }));
  } catch (e) {
    Logger.log('initApp 오류: ' + e.toString());
    return {
      user: { email: 'unknown' },
      months: [],
      currentMonth: month || '3월',
      settings: { MAX_OUT_COUNT: '2', MAX_STAY_COUNT: '2', OVER_PENALTY_POINTS: '5', SYNC_TO_ORIGINAL: 'ON' },
      studentList: { success: false, error: e.toString() },
      dutyData: null,
      suggestions: null,
      cumulativeRecords: null
    };
  }
}

// ─── 웹앱 진입점 ───────────────────────────────────────
/**
 * doGet — SPA 진입점
 * 구글 계정 로그인 상태에서 바로 접근 가능
 */
function doGet(e) {
  const template = HtmlService.createTemplateFromFile('Index');
  const html = template.evaluate()
    .setTitle('강경고등학교 기숙사 관리')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
  return html;
}

/**
 * HTML 파일 포함 헬퍼 (CSS/JS 분리용)
 * Index.html에서 <?!= include('Stylesheet') ?> 형태로 사용
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ─── 인증 관련 ─────────────────────────────────────────
/**
 * 현재 로그인한 사용자 이메일 반환
 * 구글 계정으로 바로 인증됨 (PIN 없음)
 */
function getCurrentUser() {
  const email = Session.getActiveUser().getEmail();
  return {
    email: email,
    name: email.split('@')[0] // 이메일 앞부분을 이름으로 사용
  };
}

// ─── 캐시 헬퍼 ─────────────────────────────────────────
/**
 * 캐시 로직 완전 비활성화 (실시간 구글 시트 반영 중요도 상승)
 * - 사용자 요청: 조금 느려도 화면을 켤 때나 새로고침할 때 항상 시트의 최신 숫자(수기 입력값)가 나오도록 롤백.
 */
function getCachedData(key, fetcher, expirationSec = 300) {
  // 캐시를 타지 않고 무조건 원본 시트 파싱 함수를 실행하여 리턴
  return fetcher();
}

/**
 * 데이터 변경 시 관련 캐시 모두 삭제
 */
function clearAppCache(month) {
  try {
    const cache = CacheService.getScriptCache();
    const keys = ['settings', 'suggestions', 'contacts_cache'];
    if (month) {
      keys.push('studentList_' + month);
      keys.push('duty_' + month);
      keys.push('cumulative_' + month);
      keys.push('outlogs_' + month);
    }
    cache.removeAll(keys);
  } catch (e) {}
}

// ─── 학생 리스트 / 검색 ────────────────────────────────
/**
 * 당월 학생 리스트 가져오기
 * @param {string} month - 월 이름 (예: "3월")
 * @returns {Object[]} 학생 배열 [{room, studentId, name, outCount, stayCount, totalPenalty, discipline}]
 */
function getStudentList(month) {
  return getCachedData('studentList_' + month, () => {
    try {
      const originalSs = SpreadsheetApp.openById(getOriginalSheetId());
      const sheet = originalSs.getSheetByName(month);
      
      if (!sheet) {
        return { success: false, error: month + ' 시트를 찾을 수 없습니다.' };
      }
      
      // 데이터 시작행: 3행 (1~2행은 헤더)
      const lastRow = sheet.getLastRow();
      if (lastRow < 3) {
        return { success: true, data: [] };
      }
      
      const dataRange = sheet.getRange(3, 1, lastRow - 2, 14); // A~N
      const values = dataRange.getValues();
      
      const students = [];
      for (let i = 0; i < values.length; i++) {
        const row = values[i];
        // 학번.이름이 비어있으면 건너뜀
        if (!row[1] || String(row[1]).trim() === '') continue;
        
        // "학번.이름" 또는 "학번 이름" 형식 파싱 (점/공백 모두 지원)
        const idName = String(row[1]).trim();
        let studentId = '', name = '';
        // 점(.) 구분자 우선, 없으면 공백( ) 구분자 사용
        const dotIndex = idName.indexOf('.');
        const spaceIndex = idName.indexOf(' ');
        const separator = dotIndex > -1 ? dotIndex : spaceIndex;
        if (separator > -1) {
          studentId = idName.substring(0, separator).trim();
          name = idName.substring(separator + 1).trim();
        } else {
          studentId = idName;
          name = idName;
        }
        
        students.push({
          row: i + 3,            // 원본 시트 행 번호 (참조용, 수정하지 않음)
          room: String(row[0]).trim(),     // A: 호실
          studentId: studentId,             // B 파싱: 학번
          name: name,                       // B 파싱: 이름
          outApproval: String(row[3]).trim(),   // D: 외출 인정
          outCount: Number(row[4]) || 0,        // E: 외출 횟수
          outPenalty: Number(row[5]) || 0,      // F: 외출 벌점
          stayApproval: String(row[7]).trim(),  // H: 외박 인정
          stayCount: Number(row[8]) || 0,       // I: 외박 횟수
          stayPenalty: Number(row[9]) || 0,     // J: 외박 벌점
          penaltyReason: String(row[10]).trim(), // K: 벌점 사유
          penalty: Number(row[11]) || 0,         // L: 벌점
          totalPenalty: Number(row[12]) || 0,    // M: 총 벌점
          discipline: String(row[13]).trim()     // N: 징계 조치
        });
      }
      
      // APP 로그에서 이번달 데이터 합산
      const appData = getAppMonthlyData(month, students);
      
      return JSON.parse(JSON.stringify({ success: true, data: appData }));
    } catch (e) {
      return { success: false, error: e.toString() };
    }
  }, 300); // 5분 캐시
}

/**
 * APP 로그 기반으로 학생별 이번달 데이터 합산
 * 원본 데이터를 기초값으로 참고하되, APP 로그를 우선 적용
 */
function getAppMonthlyData(month, students) {
  try {
    const appDb = SpreadsheetApp.openById(getAppDbSheetId());
    
    // 월 번호 추출 (예: "3월" → 3)
    const monthNum = parseInt(month.replace('월', ''));
    const now = new Date();
    const year = now.getFullYear();
    const monthStart = new Date(year, monthNum - 1, 1);
    const monthEnd = new Date(year, monthNum, 0, 23, 59, 59);
    
    // 외출/외박 로그 가져오기
    const outLogSheet = appDb.getSheetByName('APP_외출외박로그');
    let outLogs = [];
    if (outLogSheet && outLogSheet.getLastRow() > 1) {
      const outData = outLogSheet.getRange(2, 1, outLogSheet.getLastRow() - 1, 9).getValues();
      outLogs = outData.filter(row => {
        const d = new Date(row[0]);
        return d >= monthStart && d <= monthEnd && String(row[6]).trim() === 'active';
      });
    }
    
    // 벌점 로그 가져오기 (월별 + 3월부터 누적 집계 모두 처리)
    const penaltyLogSheet = appDb.getSheetByName('APP_벌점로그');
    let penaltyLogs = [];
    let allPenaltyLogs = [];
    if (penaltyLogSheet && penaltyLogSheet.getLastRow() > 1) {
      const penaltyData = penaltyLogSheet.getRange(2, 1, penaltyLogSheet.getLastRow() - 1, 7).getValues();
      const marchStart = new Date(year, 2, 1); // 3월 1일
      penaltyLogs = penaltyData.filter(row => {
        const d = new Date(row[0]);
        return d >= monthStart && d <= monthEnd;
      });
      allPenaltyLogs = penaltyData.filter(row => {
        const d = new Date(row[0]);
        return d >= marchStart;
      });
    }
    
    // 설정값 가져오기
    const settings = getSettings();
    const maxOut = parseInt(settings['MAX_OUT_COUNT'] || '2');
    const maxStay = parseInt(settings['MAX_STAY_COUNT'] || '2');
    const overPenalty = parseInt(settings['OVER_PENALTY_POINTS'] || '5');
    
    // 징계 기준 가져오기
    const disciplineRules = getDisciplineRules();
    
    // 학생별 APP 데이터 합산
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

      // 3월부터 월별 벌점 내역 (앱 벌점로그 기준)
      const studentAllLogs = allPenaltyLogs.filter(log => String(log[1]) === student.studentId);
      const penaltyByMonth = {};
      studentAllLogs.forEach(log => {
        const d = new Date(log[0]);
        const m = (d.getMonth() + 1) + '월';
        if (!penaltyByMonth[m]) penaltyByMonth[m] = { points: 0, items: [] };
        const pts = Number(log[3]) || 0;
        penaltyByMonth[m].points += pts;
        penaltyByMonth[m].items.push({
          date: safeDateStr(log[0]),
          itemName: String(log[2]),
          points: pts,
          memo: String(log[4])
        });
      });
      student.penaltyByMonth = penaltyByMonth;

      // 앱 벌점 누적(3월~조회월 말)
      const appCumulative = studentAllLogs
        .filter(log => new Date(log[0]) <= monthEnd)
        .reduce((sum, log) => sum + (Number(log[3]) || 0), 0);
      // 시트 수기 누적(M열, 총 벌점) — 선생님이 수기 입력·직접 수정한 값 포함
      const sheetCumulative = Number(student.totalPenalty) || 0;
      // 누적 벌점 = 시트 수기값과 앱 누적 중 큰 값
      // (수기 벌점을 반영하면서도 앱↔수기 이중 계산을 방지)
      student.cumulativePenalty = Math.max(sheetCumulative, appCumulative);
      // 총 벌점(폴백용)도 동일 값으로 통일
      student.calculatedTotalPenalty = student.cumulativePenalty;

      // 징계 자동 판단 (누적 기준)
      student.calculatedDiscipline = calculateDiscipline(student.cumulativePenalty, disciplineRules);
    });
    
    return students;
  } catch (e) {
    Logger.log('getAppMonthlyData 오류: ' + e.toString());
    return students; // APP 데이터 실패 시 원본 데이터만 반환
  }
}

// ─── 학생 상세 ─────────────────────────────────────────
/**
 * 특정 학생의 상세 정보 가져오기
 * @param {string} studentId - 학번
 * @param {string} month - 월 이름
 */
function getStudentDetail(studentId, month) {
  try {
    const result = getStudentList(month);
    if (!result.success) return result;
    
    const student = result.data.find(s => s.studentId === studentId);
    if (!student) {
      return { success: false, error: '학생을 찾을 수 없습니다: ' + studentId };
    }
    
    // 연락처 정보 추가
    const contact = getStudentContact(studentId);
    student.studentPhone = contact.studentPhone || '';
    student.parentPhone = contact.parentPhone || '';
    
    // 이번달 외출/외박 로그 상세
    student.outLogs = getStudentOutLogs(studentId, month);
    
    // 오늘의 외출/외박 상태
    const today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
    student.todayOut = student.outLogs.find(
      log => log.date === today && log.type === '외출' && log.status === 'active'
    ) || null;
    student.todayStay = student.outLogs.find(
      log => log.date === today && log.type === '외박' && log.status === 'active'
    ) || null;
    
    // JSON 왕복으로 Date 객체 완전 제거 (GAS 직렬화 오류 방지)
    return JSON.parse(JSON.stringify({ success: true, data: student }));
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ─── 외출/외박 토글 ────────────────────────────────────
/**
 * 외출 또는 외박 토글
 * - 지정된 날짜(기본: 오늘)에 기록이 없으면 → 새로 생성 (active)
 * - 지정된 날짜에 active 기록이 있으면 → removed로 변경 (취소)
 * 
 * @param {string} studentId - 학번
 * @param {string} studentName - 학생명
 * @param {string} room - 호실
 * @param {string} type - "외출" 또는 "외박"
 * @param {string} returnTime - 귀사 시간 (외출 시, 선택)
 * @param {string} month - 현재 월
 * @param {string} recordDate - 적용 날짜 (YYYY-MM-DD, 옵션)
 */
function toggleOutStay(studentId, studentName, room, type, returnTime, month, recordDate) {
  try {
    const appDb = SpreadsheetApp.openById(getAppDbSheetId());
    const logSheet = appDb.getSheetByName('APP_외출외박로그');
    
    // 타겟 날짜 설정 (전달받지 않으면 오늘 날짜)
    const targetDate = recordDate ? String(recordDate).trim() : Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
    const now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
    const user = getCurrentUser();
    
    // 타겟 날짜에 해당 학생/타입의 active 기록 찾기
    let existingRow = -1;
    if (logSheet.getLastRow() > 1) {
      const data = logSheet.getRange(2, 1, logSheet.getLastRow() - 1, 9).getValues();
      for (let i = 0; i < data.length; i++) {
        // 스프레드시트의 날짜 셀은 Date 객체로 반환될 수 있으므로 문자열로 변환하여 비교
        let rowDate = data[i][0];
        if (rowDate instanceof Date) {
          rowDate = Utilities.formatDate(rowDate, 'Asia/Seoul', 'yyyy-MM-dd');
        } else {
          rowDate = String(rowDate).trim();
        }
        
        if (rowDate === targetDate && 
            String(data[i][1]).trim() === type && 
            String(data[i][2]).trim() === studentId && 
            String(data[i][6]).trim() === 'active') {
          existingRow = i + 2; // 시트 행 번호
          break;
        }
      }
    }
    
    let action = '';
    if (existingRow > -1) {
      // 이미 active 기록이 있으면 → removed로 변경 (취소)
      logSheet.getRange(existingRow, 7).setValue('removed');
      logSheet.getRange(existingRow, 9).setValue(now); // 수정 시각 업데이트
      action = type + ' 취소';
    } else {
      // 새 기록 추가
      logSheet.appendRow([
        targetDate,      // 날짜 (타겟 날짜)
        type,            // 타입
        studentId,       // 학번
        studentName,     // 이름
        room,            // 호실
        returnTime || '',// 귀사시간
        'active',        // 토글상태
        user.email,      // 기록자
        now              // 기록시각
      ]);
      action = type + ' 기록';
    }
    
    // 초과 벌점 자동 부과 확인
    checkAndApplyOverPenalty(studentId, studentName, type, month);
    
    // 원본 시트 동기화 (SYNC_TO_ORIGINAL = ON이면)
    syncToOriginalSheet(studentId, month);
    
    // 감사 로그 기록
    addAuditLog(user.email, action, studentId + ' ' + studentName, 
      type + (returnTime ? ' 귀사:' + returnTime : ''));
    
    // 캐시 무효화
    clearAppCache(month);
    
    return { success: true, action: action };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * 외박을 외출(전환)로 변환 / 취소 토글
 * - 해당 날짜에 '외박(외출전환)' active 기록이 있으면 → removed로 취소
 * - '외박' active 기록이 있으면 → 해당 행의 type을 '외박(외출전환)'으로 수정
 * - 아무 기록도 없으면 → 새로 '외박(외출전환)' 기록 추가
 */
function convertStayToOut(studentId, studentName, room, month, recordDate) {
  try {
    var appDb = SpreadsheetApp.openById(getAppDbSheetId());
    var logSheet = appDb.getSheetByName('APP_외출외박로그');
    var targetDate = recordDate ? String(recordDate).trim() : Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
    var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
    var user = getCurrentUser();
    var existingStayRow = -1;
    var existingConvertRow = -1;
    if (logSheet.getLastRow() > 1) {
      var data = logSheet.getRange(2, 1, logSheet.getLastRow() - 1, 9).getValues();
      for (var i = 0; i < data.length; i++) {
        var rowDate = data[i][0];
        if (rowDate instanceof Date) rowDate = Utilities.formatDate(rowDate, 'Asia/Seoul', 'yyyy-MM-dd');
        else rowDate = String(rowDate).trim();
        if (rowDate !== targetDate || String(data[i][2]).trim() !== studentId) continue;
        if (String(data[i][1]).trim() === '외박' && String(data[i][6]).trim() === 'active') existingStayRow = i + 2;
        if (String(data[i][1]).trim() === '외박(외출전환)' && String(data[i][6]).trim() === 'active') existingConvertRow = i + 2;
      }
    }
    var action = '';
    if (existingConvertRow > -1) {
      logSheet.getRange(existingConvertRow, 7).setValue('removed');
      logSheet.getRange(existingConvertRow, 9).setValue(now);
      action = '외박→외출전환 취소';
    } else if (existingStayRow > -1) {
      logSheet.getRange(existingStayRow, 2).setValue('외박(외출전환)');
      logSheet.getRange(existingStayRow, 9).setValue(now);
      action = '외박→외출전환';
    } else {
      logSheet.appendRow([targetDate, '외박(외출전환)', studentId, studentName, room, '', 'active', user.email, now]);
      action = '외박→외출전환 (신규)';
    }
    // 전환으로 외박/외출 횟수가 바뀌므로 초과 벌점 재계산
    // (외박을 외출로 전환하면 외박 수가 줄어 이전에 자동부과된 '외박 초과' 벌점이 사라져야 함.
    //  외박(외출전환)은 외출 초과 계산에서 면제되므로 외출 벌점은 늘지 않음)
    checkAndApplyOverPenalty(studentId, studentName, '외박', month);
    checkAndApplyOverPenalty(studentId, studentName, '외출', month);
    syncToOriginalSheet(studentId, month);
    addAuditLog(user.email, action, studentId + ' ' + studentName, targetDate);
    clearAppCache(month);
    return { success: true, action: action };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * 초과 벌점 자동 부과/해제 확인
 * 외출/외박 토글 시마다 재계산
 */
function checkAndApplyOverPenalty(studentId, studentName, type, month) {
  const appDb = SpreadsheetApp.openById(getAppDbSheetId());
  const logSheet = appDb.getSheetByName('APP_외출외박로그');
  const penaltySheet = appDb.getSheetByName('APP_벌점로그');
  const settingsResult = getSettings();
  const settings = settingsResult.success ? settingsResult.data : {};
  
  const monthNum = parseInt(month.replace('월', ''));
  const year = new Date().getFullYear();
  const monthStart = new Date(year, monthNum - 1, 1);
  const monthEnd = new Date(year, monthNum, 0, 23, 59, 59);
  
  const maxCount = type === '외출' 
    ? parseInt(settings['MAX_OUT_COUNT'] || '2')
    : parseInt(settings['MAX_STAY_COUNT'] || '2');
  const overPenaltyPoints = parseInt(settings['OVER_PENALTY_POINTS'] || '5');
  
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
  
  // 기존 초과 벌점 기록 제거 (재계산을 위해)
  if (penaltySheet.getLastRow() > 1) {
    const penaltyData = penaltySheet.getRange(2, 1, penaltySheet.getLastRow() - 1, 7).getValues();
    for (let i = penaltyData.length - 1; i >= 0; i--) {
      const d = new Date(penaltyData[i][0]);
      if (d >= monthStart && d <= monthEnd && 
          String(penaltyData[i][1]).trim() === studentId &&
          String(penaltyData[i][2]).startsWith(type + ' 초과')) {
        penaltySheet.deleteRow(i + 2);
      }
    }
  }
  
  // 초과 시 벌점 재부과
  const overCount = Math.max(0, activeCount - maxCount);
  if (overCount > 0) {
    const now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
    const today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
    const user = getCurrentUser();
    
    penaltySheet.appendRow([
      today,
      studentId,
      type + ' 초과 (' + overCount + '회)',
      overCount * overPenaltyPoints,
      '자동 부과: ' + type + ' ' + maxCount + '회 초과',
      user.email,
      now
    ]);
  }
}

// ─── 벌점 부여 ─────────────────────────────────────────
/**
 * 벌점 항목 목록 가져오기
 */
function getPenaltyItems() {
  try {
    const appDb = SpreadsheetApp.openById(getAppDbSheetId());
    const sheet = appDb.getSheetByName('APP_벌점항목');
    if (!sheet || sheet.getLastRow() < 2) {
      return { success: true, data: [] };
    }
    
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
    const items = data.map((row, i) => ({
      index: i,
      name: row[0],
      points: Number(row[1]) || 0,
      description: row[2],
      category: row[3]
    })).filter(item => item.name);
    
    return { success: true, data: items };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * 학생에게 벌점 부여
 * @param {string} studentId - 학번
 * @param {string} itemName - 벌점 항목명
 * @param {number} points - 벌점
 * @param {string} memo - 누가기록 메모
 */
function addPenalty(studentId, itemName, points, memo) {
  try {
    const appDb = SpreadsheetApp.openById(getAppDbSheetId());
    const penaltySheet = appDb.getSheetByName('APP_벌점로그');
    const today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
    const now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
    const user = getCurrentUser();
    
    // 벌점 로그 기록
    penaltySheet.appendRow([
      today,
      studentId,
      itemName,
      points,
      memo || '',
      user.email,
      now
    ]);
    
    // 누가기록에도 자동 기록
    addCumulativeRecord(studentId, '', user.email, 
      '벌점 부여: ' + itemName + ' (' + points + '점)', memo || '');
    
    // 감사 로그
    addAuditLog(user.email, '벌점 부여', studentId, 
      itemName + ' ' + points + '점' + (memo ? ' / ' + memo : ''));
    
    // 원본 시트 동기화 (SYNC_TO_ORIGINAL = ON이면)
    // 현재 월 추정 (오늘 날짜 기준)
    const currentMonth = new Date().getMonth() + 1 + '월';
    syncToOriginalSheet(studentId, currentMonth);
    
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ─── 누가기록 ──────────────────────────────────────────
/**
 * 누가기록 추가 (APP_DB에 저장)
 */
function addCumulativeRecord(studentId, studentName, teacher, content, action) {
  try {
    const appDb = SpreadsheetApp.openById(getAppDbSheetId());
    
    // APP_누가기록 시트가 없으면 무시
    let sheet = appDb.getSheetByName('APP_누가기록');
    if (!sheet) {
      sheet = appDb.insertSheet('APP_누가기록');
      sheet.appendRow(['순', '날짜', '학번', '이름', '담당교사', '상담(지도)내용', '조치내용', '기록시각']);
    }
    
    const user = getCurrentUser();
    const today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
    const now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
    const nextNum = sheet.getLastRow(); // 헤더 포함이므로 그대로 순번으로 사용
    
    sheet.appendRow([
      nextNum,
      today,
      studentId,
      studentName,
      teacher,
      content,
      action,
      now,
      user.email // 작성자 이메일 기록 (본인 인증용)
    ]);
    
    return { success: true };
  } catch (e) {
    Logger.log('누가기록 추가 오류: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}

/**
 * 누가기록 목록 조회
 */
function getCumulativeRecords() {
  return getCachedData('cumulative', () => {
    try {
      const appDb = SpreadsheetApp.openById(getAppDbSheetId());
      const sheet = appDb.getSheetByName('APP_누가기록');
      if (!sheet || sheet.getLastRow() < 2) {
        // 원본 누가기록란도 조회
        return { success: true, data: getOriginalCumulativeRecords() };
      }
      
      const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();
      const records = data.map((row, i) => ({
        rowIndex: i + 2, // 시트 행 번호
        num: safeString(row[0]),
        date: safeDateStr(row[1]),
        studentId: String(row[2]),
        name: safeString(row[3]),
        teacher: safeString(row[4]),
        content: safeString(row[5]),
        action: safeString(row[6]),
        timestamp: safeString(row[7]),
        authorEmail: safeString(row[8]).trim(),
        source: '앱'
      }));
      
      // 원본 누가기록과 합치기
      const originalRecords = getOriginalCumulativeRecords();
      
      return JSON.parse(JSON.stringify({ success: true, data: [...originalRecords, ...records] }));
    } catch (e) {
      return { success: false, error: e.toString() };
    }
  }, 300);
}

/**
 * 원본 "누가기록란" 시트에서 데이터 읽기 (읽기 전용)
 */
function getOriginalCumulativeRecords() {
  try {
    const originalSs = SpreadsheetApp.openById(getOriginalSheetId());
    const sheet = originalSs.getSheetByName('누가기록란');
    if (!sheet || sheet.getLastRow() < 4) return [];
    
    // 3행이 헤더, 4행부터 데이터
    const data = sheet.getRange(4, 1, sheet.getLastRow() - 3, 11).getValues();
    return data.filter(row => row[1] || row[3]).map(row => ({
      num: safeString(row[0]),
      date: safeDateStr(row[1]),
      studentId: String(row[2]),
      name: safeString(row[3]),
      teacher: safeString(row[4]),
      content: safeString(row[5]),
      action: safeString(row[8]),
      timestamp: '',
      source: '원본'
    }));
  } catch (e) {
    Logger.log('원본 누가기록 조회 오류: ' + e.toString());
    return [];
  }
}

/**
 * 누가기록 직접 추가 (사용자가 직접 입력)
 */
function addManualCumulativeRecord(studentId, studentName, teacherName, content, action) {
  try {
    const user = getCurrentUser();
    addCumulativeRecord(studentId, studentName, teacherName, content, action);
    addAuditLog(user.email, '누가기록 직접 추가', studentId + ' ' + studentName, content);
    clearAppCache(); // 전체 캐시 날리기 (cumulative 등)
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * 내 누가기록 수정
 */
function editMyCumulativeRecord(rowIndex, newContent, newAction) {
  try {
    const appDb = SpreadsheetApp.openById(getAppDbSheetId());
    const sheet = appDb.getSheetByName('APP_누가기록');
    const user = getCurrentUser();
    
    // 작성자 확인: I열(9)에 이메일이 있거나, 없으면 구 데이터로 간주하여 일단 허용
    const authorEmail = String(sheet.getRange(rowIndex, 9).getValue()).trim();
    
    // authorEmail이 비어있는 구 데이터의 경우 누구나 수정 가능토록 허용 (작성자 특정 불가)
    if (authorEmail && authorEmail !== user.email && user.email !== 'admin@school.com') {
      return { success: false, error: '본인이 작성한 누가기록만 수정할 수 있습니다.' };
    }
    
    sheet.getRange(rowIndex, 6).setValue(newContent);
    sheet.getRange(rowIndex, 7).setValue(newAction);
    
    const studentId = String(sheet.getRange(rowIndex, 3).getValue()).trim();
    const studentName = String(sheet.getRange(rowIndex, 4).getValue()).trim();
    
    addAuditLog(user.email, '누가기록 수정', '행:' + rowIndex + ' / ' + studentId + ' ' + studentName, newContent.substring(0, 50));
    clearAppCache(); // 전체 캐시 날리기
    
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * 내 누가기록 삭제
 */
function deleteMyCumulativeRecord(rowIndex) {
  try {
    const appDb = SpreadsheetApp.openById(getAppDbSheetId());
    const sheet = appDb.getSheetByName('APP_누가기록');
    const user = getCurrentUser();
    
    // 작성자 확인
    const authorEmail = String(sheet.getRange(rowIndex, 9).getValue()).trim();
    
    if (authorEmail && authorEmail !== user.email && user.email !== 'admin@school.com') {
      return { success: false, error: '본인이 작성한 누가기록만 삭제할 수 있습니다.' };
    }
    
    const studentId = String(sheet.getRange(rowIndex, 3).getValue()).trim();
    const studentName = String(sheet.getRange(rowIndex, 4).getValue()).trim();
    
    sheet.deleteRow(rowIndex);
    addAuditLog(user.email, '누가기록 삭제', '행:' + rowIndex + ' / ' + studentId + ' ' + studentName, '');
    clearAppCache(); // 전체 캐시 날리기
    
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ─── 교사 건의사항 ─────────────────────────────────────
/**
 * 건의사항 목록 가져오기
 */
function getSuggestions() {
  return getCachedData('suggestions', () => {
    try {
      const appDb = SpreadsheetApp.openById(getAppDbSheetId());
      const sheet = appDb.getSheetByName('APP_교사건의');
      if (!sheet || sheet.getLastRow() < 2) {
        return { success: true, data: [] };
      }
      
      const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
      const suggestions = data.map((row, i) => ({
        index: i + 2, // 시트 행 번호
        author: String(row[0]),       // A: 이메일 (내부 식별용)
        date: String(row[1]),         // B: 작성일
        content: String(row[2]),      // C: 내용
        status: String(row[3]) || '접수', // D: 상태
        comment: String(row[4]) || '',// E: 관리자 코멘트
        authorName: String(row[5]) || String(row[0]).split('@')[0] // F: 작성자 이름
      }));
      
      return JSON.parse(JSON.stringify({ success: true, data: suggestions }));
    } catch (e) {
      return { success: false, error: e.toString() };
    }
  }, 300);
}

/**
 * 건의사항 작성
 */
function addSuggestion(content, authorName) {
  try {
    const appDb = SpreadsheetApp.openById(getAppDbSheetId());
    const sheet = appDb.getSheetByName('APP_교사건의');
    const user = getCurrentUser();
    const now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
    const finalName = authorName ? authorName : user.name;
    
    // F열에 작성자 이름 추가 저장
    sheet.appendRow([user.email, now, content, '접수', '', finalName]);
    
    addAuditLog(user.email, '건의사항 작성', '', content.substring(0, 50));
    
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * 건의사항 상태 변경
 */
function updateSuggestionStatus(rowIndex, newStatus) {
  try {
    const appDb = SpreadsheetApp.openById(getAppDbSheetId());
    const sheet = appDb.getSheetByName('APP_교사건의');
    sheet.getRange(rowIndex, 4).setValue(newStatus);
    
    const user = getCurrentUser();
    addAuditLog(user.email, '건의사항 상태변경', '행:' + rowIndex, newStatus);
    
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * 내 건의사항 수정
 */
function editMySuggestion(rowIndex, newContent) {
  try {
    const appDb = SpreadsheetApp.openById(getAppDbSheetId());
    const sheet = appDb.getSheetByName('APP_교사건의');
    const user = getCurrentUser();
    
    // 작성자 확인
    const authorEmail = String(sheet.getRange(rowIndex, 1).getValue()).trim();
    if (authorEmail !== user.email && user.email !== 'admin@school.com') { // 필요시 관리자 예외
      return { success: false, error: '본인이 작성한 글만 수정할 수 있습니다.' };
    }
    
    sheet.getRange(rowIndex, 3).setValue(newContent);
    addAuditLog(user.email, '건의사항 수정', '행:' + rowIndex, newContent.substring(0, 50));
    
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * 내 건의사항 삭제
 */
function deleteMySuggestion(rowIndex) {
  try {
    const appDb = SpreadsheetApp.openById(getAppDbSheetId());
    const sheet = appDb.getSheetByName('APP_교사건의');
    const user = getCurrentUser();
    
    // 작성자 확인
    const authorEmail = String(sheet.getRange(rowIndex, 1).getValue()).trim();
    if (authorEmail !== user.email && user.email !== 'admin@school.com') {
      return { success: false, error: '본인이 작성한 글만 삭제할 수 있습니다.' };
    }
    
    sheet.deleteRow(rowIndex);
    addAuditLog(user.email, '건의사항 삭제', '행:' + rowIndex, '');
    
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ─── 사감 근무 조회 ────────────────────────────────────
/**
 * 사감 근무 데이터 가져오기 (고정 템플릿 구조)
 * - 시트명: "(월) 기숙사 사감 근무 명령부" 등 형태가 다양할 수 있으므로, 현재 사용자 시트 양식에 맞춤
 * - 데이터 시작행: 6 (1~5행 헤더)
 * - F열(6): 날짜 로우 포맷 (예: 2026.03.02)
 * - G열(7): 요일 (예: 월)
 * - H열(8): 당직근무자 직 (예: 교장, 교감, 담당, 교사 등) -> 무시하고 성명열 파싱
 * - I열(9): 당직근무자 성명 (우리가 찾는 값)
 */
function getDutySchedule(month) {
  return getCachedData('duty_' + month, () => {
    try {
      const originalSs = SpreadsheetApp.openById(getOriginalSheetId());
      // 시트 이름이 "(3)월 기숙사 사감 근무 명령부" 와 같이 변경되었을 수 있음
      // 정규식이나 포함 여부로 월에 해당하는 시트를 찾습니다.
      const monthNum = month.replace('월', '');
      let sheet = null;
      
      const sheets = originalSs.getSheets();
      // "3월 사감명령부" 또는 "3월 기숙사" 등 여러 패턴 허용
      for(let s of sheets) {
        const name = s.getName();
        if(name.includes(monthNum + '월') && name.includes('사감')) {
          sheet = s;
          break;
        }else if(name.includes('(' + monthNum + ')월') && name.includes('사감')){
          sheet = s;
          break;
        }else if(name === month + ' 사감명령부'){
          sheet = s;
          break;
        }
      }
      
      if (!sheet) {
        return { success: false, error: '사감 근무표 시트를 찾을 수 없습니다. (예: ' + monthNum + '월 사감...)' };
      }
      
      const lastRow = sheet.getLastRow();
      if (lastRow < 6) {
        return { success: true, data: [], teachers: [] };
      }
      
      // F(6) ~ M(13) 열 데이터 가져오기 (0-based: 날짜(F)=0, 요일(G)=1, 직(H)=2, 성명(I)=3, … 대직성명(M)=7)
      // 일부 월 시트에 M열이 없을 수 있으므로 실제 열 수로 보호
      const numCols = Math.max(4, Math.min(8, sheet.getMaxColumns() - 5));
      const data = sheet.getRange(6, 6, lastRow - 5, numCols).getValues();
      
      const schedules = [];
      const teacherSet = new Set();
      const excludeWords = ['성명', '이름', '사감', '교사', '직', '당직근무자', '당직근무자 성명', ''];
      
      let lastDateStr = '';
      let lastDayStr = '';
      
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        
        let dateRaw = row[0]; // F열 (날짜)
        let dateStr = '';
        
        // 1. 날짜 셀 파싱 & 병합셀 빈칸 상속
        if (dateRaw === '' || dateRaw === null || dateRaw === undefined) {
          dateStr = lastDateStr;
        } else {
          if (dateRaw instanceof Date) {
            // 타임존 오차 해결: 한국 시간 기준으로 일(d) 추출
            dateStr = parseInt(Utilities.formatDate(dateRaw, 'Asia/Seoul', 'd'), 10) + '일';
          } else {
            const temp = String(dateRaw).trim();
            // 문자열에서 마지막 숫자 그룹을 찾아 '일'로 간주 ("2026.03.06." -> "06" -> 6)
            const numMatch = temp.match(/\d+/g);
            if (numMatch && numMatch.length > 0) {
              dateStr = parseInt(numMatch[numMatch.length-1], 10) + '일';
            } else {
              dateStr = temp;
            }
          }
        }
        
        if (!dateStr || dateStr === '0일' || isNaN(parseInt(dateStr))) continue;
        lastDateStr = dateStr;
        
        // 2. 요일 파싱 & 병합셀 빈칸 상속
        let dayStr = String(row[1] || '').trim(); // G열 (요일)
        if (dayStr === '') dayStr = lastDayStr;
        lastDayStr = dayStr;
        
        const teacherName = String(row[3] || '').trim(); // I열 (원래 당직근무자 성명)
        const subName = String(row[7] || '').trim();      // M열 (대직/교체 사감 성명)

        if (teacherName && !excludeWords.includes(teacherName)) {
          const hasSub = subName && !excludeWords.includes(subName) && subName !== teacherName;
          schedules.push({
            date: dateStr,
            dayOfWeek: dayStr,
            duty: '사감',
            name: teacherName,
            sub: hasSub ? subName : ''   // 대직(교체 사감) 이름, 없으면 ''
          });
          teacherSet.add(teacherName);
          if (hasSub) teacherSet.add(subName); // 대직 교사도 근무 조회 대상에 포함
        }
      }
      
      return JSON.parse(JSON.stringify({ 
        success: true, 
        data: schedules, 
        teachers: Array.from(teacherSet).sort()
      }));
    } catch (e) {
      return { success: false, error: e.toString() };
    }
  }, 300);
}

/**
 * 특정 교사의 사감 근무일 필터링
 */
function getTeacherDutyDates(teacherName, month) {
  try {
    const result = getDutySchedule(month);
    if (!result.success) return result;
    
    const filtered = result.data.filter(entry => {
      return entry.name.includes(teacherName);
    });
    
    return { success: true, data: filtered, teacher: teacherName };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ─── 문자 템플릿 ───────────────────────────────────────
/**
 * 문자 템플릿 가져오기
 * @param {string} type - "외출" 또는 "외박"
 */
function getSmsTemplate(type) {
  try {
    const appDb = SpreadsheetApp.openById(getAppDbSheetId());
    const sheet = appDb.getSheetByName('APP_문자템플릿');
    if (!sheet || sheet.getLastRow() < 2) {
      // 기본 템플릿 반환
      if (type === '외출') {
        return { 
          success: true, 
          data: '안녕하세요. 강경고등학교 기숙사입니다.\n{이름} 학생이 오늘({날짜}) 외출하였습니다.\n귀사 예정 시간: {귀사시간}\n감사합니다.' 
        };
      } else {
        return { 
          success: true, 
          data: '안녕하세요. 강경고등학교 기숙사입니다.\n{이름} 학생이 오늘({날짜}) 외박하였습니다.\n감사합니다.' 
        };
      }
    }
    
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
    const template = data.find(row => row[0] === type);
    
    if (template) {
      return { success: true, data: template[2] };
    }
    
    return { success: true, data: '' };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ─── 유틸리티 함수 ─────────────────────────────────────
/**
 * 모든 학생 연락처 가져오기 (캐시)
 */
function getAllContacts() {
  return getCachedData('contacts_cache', () => {
    try {
      const appDb = SpreadsheetApp.openById(getAppDbSheetId());
      const sheet = appDb.getSheetByName('APP_학생연락처');
      if (!sheet || sheet.getLastRow() < 2) return { success: true, data: [] };
      
      const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
      const contacts = data.map(row => ({
        studentId: String(row[0]),
        name: row[1],
        studentPhone: row[2],
        parentPhone: row[3]
      }));
      return JSON.parse(JSON.stringify({ success: true, data: contacts }));
    } catch (e) {
      return { success: false, error: e.toString() };
    }
  }, 1200); // 20분 캐시
}

/**
 * 학생 연락처 조회
 */
function getStudentContact(studentId) {
  try {
    const contactsResult = getAllContacts();
    if (!contactsResult.success) return {};
    
    const contact = contactsResult.data.find(c => String(c.studentId) === String(studentId));
    if (contact) {
      return contact;
    }
    return {};
  } catch (e) {
    return {};
  }
}

/**
 * 월별 전체 외출/외박 로그 가져오기 (캐시)
 */
function getMonthlyOutLogs(month) {
  return getCachedData('outlogs_' + month, () => {
    try {
      const appDb = SpreadsheetApp.openById(getAppDbSheetId());
      const sheet = appDb.getSheetByName('APP_외출외박로그');
      if (!sheet || sheet.getLastRow() < 2) return { success: true, data: [] };
      
      const monthNum = parseInt(month.replace('월', ''));
      const year = new Date().getFullYear();
      const monthStart = new Date(year, monthNum - 1, 1);
      const monthEnd = new Date(year, monthNum, 0, 23, 59, 59);
      
      const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();
      const logs = data
        .filter(row => {
          const d = new Date(row[0]);
          return d >= monthStart && d <= monthEnd;
        })
        .map(row => {
          let dateStr = row[0];
          if (dateStr instanceof Date) {
            dateStr = Utilities.formatDate(dateStr, 'Asia/Seoul', 'yyyy-MM-dd');
          } else {
            dateStr = String(dateStr).trim();
          }
          return {
            date: dateStr,
            type: String(row[1]).trim(),
            studentId: String(row[2]).trim(),
            name: row[3],
            room: row[4],
            returnTime: row[5] || '',
            status: String(row[6]).trim(),
            recorder: row[7],
            timestamp: row[8]
          };
        });
      return JSON.parse(JSON.stringify({ success: true, data: logs }));
    } catch (e) {
      return { success: false, error: e.toString() };
    }
  }, 300); // 5분 캐시
}

/**
 * 학생 외출/외박 로그 조회
 */
function getStudentOutLogs(studentId, month) {
  try {
    const logsResult = getMonthlyOutLogs(month);
    if (!logsResult.success) return [];
    
    return logsResult.data.filter(log => String(log.studentId) === String(studentId));
  } catch (e) {
    return [];
  }
}

/**
 * 설정값 가져오기
 */
function getSettings() {
  return getCachedData('settings', () => {
    try {
      const appDb = SpreadsheetApp.openById(getAppDbSheetId());
      const sheet = appDb.getSheetByName('APP_설정');
      
      const settings = {
        MAX_OUT_COUNT: 2,         // 월 허용 외출 (기본값)
        MAX_STAY_COUNT: 4,        // 월 허용 외박 (기본값 수정)
        OVER_PENALTY_POINTS: 5,   // 초과 시 1회당 벌점 (기본값 5점)
        TEACHER_PIN: '0000',
        SYNC_TO_ORIGINAL: 'ON'
      };
      
      if (sheet && sheet.getLastRow() > 1) {
        const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
        data.forEach(row => {
          if (row[0]) settings[String(row[0]).trim()] = row[1];
        });
      }
      return JSON.parse(JSON.stringify({ success: true, data: settings }));
    } catch (e) {
      Logger.log('설정 가져오기 오류: ' + e.toString());
      return { success: false, error: e.toString() };
    }
  }, 1200); // 설정은 20분 캐시 (덜 자주 변경됨)
}

/**
 * 설정값 업데이트
 * @param {string} key - 설정 키
 * @param {string} value - 설정 값
 */
function updateSetting(key, value) {
  try {
    const appDb = SpreadsheetApp.openById(getAppDbSheetId());
    const sheet = appDb.getSheetByName('APP_설정');
    if (!sheet) return { success: false, error: 'APP_설정 시트가 없습니다.' };
    
    // 기존 키 찾기
    let found = false;
    if (sheet.getLastRow() > 1) {
      const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
      for (let i = 0; i < data.length; i++) {
        if (String(data[i][0]) === key) {
          sheet.getRange(i + 2, 2).setValue(value);
          found = true;
          break;
        }
      }
    }
    
    // 없으면 새로 추가
    if (!found) {
      sheet.appendRow([key, value]);
    }
    
    clearAppCache(); // 설정 변경 시 모든 캐시 무효화

    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * 징계 기준 가져오기
 */
function getDisciplineRules() {
  try {
    const appDb = SpreadsheetApp.openById(getAppDbSheetId());
    const sheet = appDb.getSheetByName('APP_징계기준');
    if (!sheet || sheet.getLastRow() < 2) {
      // 기본 징계 기준
      return [
        { start: 5, end: 7, name: '반성문', action: '반성문 작성' },
        { start: 8, end: 11, name: '봉사활동', action: '기숙사 자체 봉사활동' },
        { start: 12, end: 14, name: '학부모 상담', action: '학부모 상담 실시' },
        { start: 15, end: 19, name: '임시퇴사', action: '임시퇴사 5일' },
        { start: 20, end: 999, name: '퇴사', action: '퇴사 조치' }
      ];
    }
    
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
    return data.filter(row => row[0] !== '').map(row => ({
      start: Number(row[0]),
      end: Number(row[1]),
      name: row[2],
      action: row[3]
    }));
  } catch (e) {
    return [];
  }
}

/**
 * 벌점에 따른 징계 판단
 */
function calculateDiscipline(totalPenalty, rules) {
  if (!totalPenalty || totalPenalty <= 0) return '없음';
  if (rules.length === 0) return '없음';

  // 첫 기준 미만이면 아직 징계 없음
  if (totalPenalty < rules[0].start) return '없음';

  for (const rule of rules) {
    if (totalPenalty >= rule.start && totalPenalty <= rule.end) {
      return rule.name + ' (' + rule.action + ')';
    }
  }
  // 마지막 기준 초과
  return '기준 초과';
}

/**
 * 감사 로그 기록
 */
function addAuditLog(user, action, target, detail) {
  try {
    const appDb = SpreadsheetApp.openById(getAppDbSheetId());
    const sheet = appDb.getSheetByName('APP_감사로그');
    const now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
    
    sheet.appendRow([now, user, action, target, detail]);
  } catch (e) {
    Logger.log('감사 로그 기록 실패: ' + e.toString());
  }
}

/**
 * 사용 가능한 월 탭 목록 가져오기
 */
function getAvailableMonths() {
  try {
    const originalSs = SpreadsheetApp.openById(getOriginalSheetId());
    const sheets = originalSs.getSheets();
    
    // "N월" 패턴의 시트만 필터링
    const months = sheets
      .map(s => s.getName())
      .filter(name => /^\d+월$/.test(name))
      .sort((a, b) => parseInt(a) - parseInt(b));
    
    return { success: true, data: months };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * 학생 연락처 저장/업데이트
 */
function saveStudentContact(studentId, studentName, studentPhone, parentPhone) {
  try {
    const appDb = SpreadsheetApp.openById(getAppDbSheetId());
    const sheet = appDb.getSheetByName('APP_학생연락처');
    
    // 기존 연락처 찾기
    let existingRow = -1;
    if (sheet.getLastRow() > 1) {
      const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
      for (let i = 0; i < data.length; i++) {
        if (String(data[i][0]) === studentId) {
          existingRow = i + 2;
          break;
        }
      }
    }
    
    if (existingRow > -1) {
      sheet.getRange(existingRow, 1, 1, 4).setValues([[studentId, studentName, studentPhone, parentPhone]]);
    } else {
      sheet.appendRow([studentId, studentName, studentPhone, parentPhone]);
    }
    
    const user = getCurrentUser();
    addAuditLog(user.email, '연락처 저장', studentId + ' ' + studentName, '');
    
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ─── 원본 시트 동기화 ─────────────────────────
/**
 * 원본 시트에 APP 데이터 동기화
 * SYNC_TO_ORIGINAL 설정이 'ON'일 때만 동작
 * 
 * 동기화 대상 셀:
 *   E열(5) : 외출 횟수
 *   F열(6) : 외출 벌점
 *   I열(9) : 외박 횟수
 *   J열(10): 외박 벌점
 *   L열(12): 벌점 (항목별)
 *   M열(13): 총 벌점
 *   N열(14): 징계 조치
 * 
 * @param {string} studentId - 학번
 * @param {string} month - 월 이름 (예: "3월")
 */
function syncToOriginalSheet(studentId, month) {
  try {
    const settingsResult = getSettings();
    const settings = settingsResult.success ? settingsResult.data : {};
    if (settings['SYNC_TO_ORIGINAL'] !== 'ON') return;
    
    const originalSs = SpreadsheetApp.openById(getOriginalSheetId());
    const sheet = originalSs.getSheetByName(month);
    if (!sheet) return;
    
    // 학생 행 찾기 (원본 시트에서)
    const lastRow = sheet.getLastRow();
    if (lastRow < 3) return;
    
    const idCol = sheet.getRange(3, 2, lastRow - 2, 1).getValues(); // B열
    let targetRow = -1;
    for (let i = 0; i < idCol.length; i++) {
      const idName = String(idCol[i][0]).trim();
      const dotIdx = idName.indexOf('.');
      const spaceIdx = idName.indexOf(' ');
      const sep = dotIdx > -1 ? dotIdx : spaceIdx;
      const sId = sep > -1 ? idName.substring(0, sep).trim() : idName;
      if (sId === studentId) {
        targetRow = i + 3; // 시트 행 번호
        break;
      }
    }
    if (targetRow === -1) return;
    
    // APP 로그에서 이번달 해당 학생 데이터 계산
    const appDb = SpreadsheetApp.openById(getAppDbSheetId());
    const monthNum = parseInt(month.replace('월', ''));
    const year = new Date().getFullYear();
    const monthStart = new Date(year, monthNum - 1, 1);
    const monthEnd = new Date(year, monthNum, 0, 23, 59, 59);
    
    const maxOut = parseInt(settings['MAX_OUT_COUNT'] || '2');
    const maxStay = parseInt(settings['MAX_STAY_COUNT'] || '2');
    const overPoints = parseInt(settings['OVER_PENALTY_POINTS'] || '5');
    
    // 외출/외박 횟수 및 날짜 계산
    const outLogSheet = appDb.getSheetByName('APP_외출외박로그');
    let outCount = 0, stayCount = 0;
    let outDates = [], stayDates = [];
    if (outLogSheet && outLogSheet.getLastRow() > 1) {
      const outData = outLogSheet.getRange(2, 1, outLogSheet.getLastRow() - 1, 9).getValues();
      outData.forEach(row => {
        const d = new Date(row[0]);
        if (d >= monthStart && d <= monthEnd && String(row[2]) === studentId && String(row[6]).trim() === 'active') {
          const dateStr = (d.getMonth() + 1) + '.' + d.getDate();
          if (row[1] === '외출' || row[1] === '외박(외출전환)') {
            outCount++;
            outDates.push(dateStr);
          }
          if (row[1] === '외박') {
            stayCount++;
            stayDates.push(dateStr);
          }
        }
      });
    }
    
    // 벌점 합계 계산 (APP 로그 기준)
    const penaltySheet = appDb.getSheetByName('APP_벌점로그');
    let penaltySum = 0;
    if (penaltySheet && penaltySheet.getLastRow() > 1) {
      const pData = penaltySheet.getRange(2, 1, penaltySheet.getLastRow() - 1, 7).getValues();
      pData.forEach(row => {
        const d = new Date(row[0]);
        if (d >= monthStart && d <= monthEnd && String(row[1]) === studentId) {
          penaltySum += (Number(row[3]) || 0);
        }
      });
    }
    
    // 초과 벌점 (F/J열 표시용)
    const outOverPenalty = Math.max(0, outCount - maxOut) * overPoints;
    const stayOverPenalty = Math.max(0, stayCount - maxStay) * overPoints;

    // 이번달 총 벌점(L열): 앱 벌점 합계(초과+앱부여)와 기존 시트 L값 중 큰 값
    // → 시트에 직접 입력한 '기타 수기 벌점'을 지우지 않고 보존하면서 앱 벌점도 반영
    const existingL = Number(sheet.getRange(targetRow, 12).getValue()) || 0;
    const monthTotal = Math.max(penaltySum, existingL);

    // 원본 시트에 값 셀 반영 (날짜/횟수/초과벌점/월 총벌점)
    // D열(4): 외출 인정일, E열(5): 외출 횟수, F열(6): 외출 벌점
    sheet.getRange(targetRow, 4).setValue(outDates.length > 0 ? outDates.join('/') + '/' : ''); // D: 외출 날짜
    sheet.getRange(targetRow, 5).setValue(outCount);       // E: 외출 횟수
    sheet.getRange(targetRow, 6).setValue(outOverPenalty);  // F: 외출 벌점
    // H열(8): 외박 인정일, I열(9): 외박 횟수, J열(10): 외박 벌점
    sheet.getRange(targetRow, 8).setValue(stayDates.length > 0 ? stayDates.join('/') + '/' : ''); // H: 외박 날짜
    sheet.getRange(targetRow, 9).setValue(stayCount);      // I: 외박 횟수
    sheet.getRange(targetRow, 10).setValue(stayOverPenalty);// J: 외박 벌점
    // L열(12): 그 달의 총 벌점 (앱 벌점 + 기존 수기 보존)
    sheet.getRange(targetRow, 12).setValue(monthTotal);
    // M열(13, 누적 총벌점)·N열(14, 징계)은 선생님이 직접 관리 → 앱이 덮어쓰지 않음
    
    Logger.log('✅ 원본 시트 동기화 완료: ' + studentId + ' (' + month + ')');
  } catch (e) {
    Logger.log('⚠️ 원본 시트 동기화 실패 (앱 동작에는 무해): ' + e.toString());
  }
}

// ─── 특별활동 (학원/악기/야간방과후/오케스트라) ──────────
function getSpecialActivities() {
  try {
    var appDb = SpreadsheetApp.openById(getAppDbSheetId());
    var sheet = appDb.getSheetByName('APP_특별활동');
    if (!sheet || sheet.getLastRow() < 2) return { success: true, data: [] };
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues();
    var items = data.filter(function(row){ return row[0]; }).map(function(row, i){
      return { rowIndex: i+2, studentId: String(row[0]), name: String(row[1]), room: String(row[2]), activityType: String(row[3]), days: String(row[4]), startTime: String(row[5]), endTime: String(row[6]), note: String(row[7]) };
    });
    return JSON.parse(JSON.stringify({ success: true, data: items }));
  } catch(e) { return { success: false, error: e.toString() }; }
}

function saveSpecialActivity(rowIndex, studentId, studentName, room, activityType, days, startTime, endTime, note) {
  try {
    var appDb = SpreadsheetApp.openById(getAppDbSheetId());
    var sheet = appDb.getSheetByName('APP_특별활동');
    var user = getCurrentUser();
    var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
    var rowData = [studentId, studentName, room, activityType, days, startTime, endTime, note || '', user.email, now];
    if (rowIndex && rowIndex > 1) sheet.getRange(rowIndex, 1, 1, 10).setValues([rowData]);
    else sheet.appendRow(rowData);
    return { success: true };
  } catch(e) { return { success: false, error: e.toString() }; }
}

function deleteSpecialActivity(rowIndex) {
  try {
    var appDb = SpreadsheetApp.openById(getAppDbSheetId());
    var sheet = appDb.getSheetByName('APP_특별활동');
    sheet.deleteRow(rowIndex);
    return { success: true };
  } catch(e) { return { success: false, error: e.toString() }; }
}
