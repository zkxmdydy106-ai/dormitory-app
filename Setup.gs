/**
 * ============================================================
 * APP 데이터 초기화 스크립트 (Setup.gs)
 * ============================================================
 * 
 * 원본 스프레드시트 내에 APP_ 접두어 탭을 추가합니다.
 * (원본 월별 탭은 절대 수정하지 않음)
 * 
 * [사용 방법]
 * 1. Script Properties에 아래 값을 설정합니다:
 *    - SHEET_ID : 구글시트 ID (하나만 필요!)
 * 2. setupAppDb() 함수를 실행합니다
 */

/**
 * APP_DB 전체 초기화 (최초 1회 실행)
 * Script Editor에서 이 함수를 직접 실행하세요
 */
function setupAppDb() {
  const sheetId = getOriginalSheetId();
  
  if (!sheetId) {
    throw new Error(
      'SHEET_ID가 설정되지 않았습니다.\n' +
      '파일 > 프로젝트 설정 > 스크립트 속성에서 SHEET_ID를 설정하세요.'
    );
  }
  
  const ss = SpreadsheetApp.openById(sheetId);
  
  // 각 시트 생성
  createSheetIfNotExists(ss, 'APP_외출외박로그', 
    ['날짜', '타입', '학번', '이름', '호실', '귀사시간', '토글상태', '기록자', '기록시각']);
  
  createSheetIfNotExists(ss, 'APP_벌점로그', 
    ['날짜', '학번', '항목', '벌점', '메모', '기록자', '기록시각']);
  
  createSheetIfNotExists(ss, 'APP_학생연락처', 
    ['학번', '학생명', '학생전화', '학부모전화']);
  
  createSheetIfNotExists(ss, 'APP_문자템플릿', 
    ['타입', '제목', '본문']);
  
  createSheetIfNotExists(ss, 'APP_벌점항목', 
    ['항목명', '벌점', '설명', '카테고리']);
  
  createSheetIfNotExists(ss, 'APP_징계기준', 
    ['시작점수', '끝점수', '징계명', '조치내용']);
  
  createSheetIfNotExists(ss, 'APP_교사건의', 
    ['작성자', '날짜', '내용', '상태', '답변']);
  
  createSheetIfNotExists(ss, 'APP_감사로그', 
    ['시각', '사용자', '액션', '대상', '상세']);
  
  createSheetIfNotExists(ss, 'APP_누가기록', 
    ['순', '날짜', '학번', '이름', '담당교사', '상담(지도)내용', '조치내용', '기록시각']);
  
  createSheetIfNotExists(ss, 'APP_설정',
    ['키', '값']);

  if (!ss.getSheetByName('APP_특별활동')) {
    var actSheet = ss.insertSheet('APP_특별활동');
    actSheet.appendRow(['학번','이름','호실','활동종류','요일','시작시간','종료시간','비고','등록자','등록시각']);
    actSheet.setFrozenRows(1);
  }

  // 기본 설정값 입력
  setupDefaultSettings(ss);
  
  // 기본 벌점 항목 입력
  setupDefaultPenaltyItems(ss);
  
  // 기본 징계 기준 입력
  setupDefaultDisciplineRules(ss);
  
  // 기본 문자 템플릿 입력
  setupDefaultSmsTemplates(ss);
  
  // 기본 Sheet1 삭제 (있으면)
  try {
    const defaultSheet = ss.getSheetByName('Sheet1') || ss.getSheetByName('시트1');
    if (defaultSheet && ss.getSheets().length > 1) {
      ss.deleteSheet(defaultSheet);
    }
  } catch (e) {
    // 무시 — 기본 시트가 없을 수 있음
  }
  
  Logger.log('✅ APP_DB 초기화 완료!');
  Logger.log('생성된 시트 목록:');
  ss.getSheets().forEach(s => Logger.log('  - ' + s.getName()));
}

/**
 * 시트가 없으면 생성하고 헤더를 추가
 */
function createSheetIfNotExists(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    Logger.log('시트 생성: ' + sheetName);
  }
  
  // 헤더가 비어있으면 추가
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    
    // 헤더 스타일 적용
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange
      .setBackground('#1a73e8')
      .setFontColor('#ffffff')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');
    
    // 열 너비 자동 조정
    for (let i = 1; i <= headers.length; i++) {
      sheet.setColumnWidth(i, 120);
    }
    
    // 첫 행 고정
    sheet.setFrozenRows(1);
  }
  
  return sheet;
}

/**
 * 기본 설정값 입력
 */
function setupDefaultSettings(ss) {
  const sheet = ss.getSheetByName('APP_설정');
  if (sheet.getLastRow() > 1) return; // 이미 데이터가 있으면 건너뜀
  
  const defaults = [
    ['MAX_OUT_COUNT', '2'],          // 월 최대 외출 허용 횟수
    ['MAX_STAY_COUNT', '2'],         // 월 최대 외박 허용 횟수
    ['OVER_PENALTY_POINTS', '5'],    // 초과 1회당 벌점 (실제 규정: 1회당 5점)
    ['SYNC_TO_ORIGINAL', 'ON'],      // 원본 시트에도 반영 (기본 ON)
    ['SCHOOL_NAME', '강경고등학교'],  // 학교명
    ['DORM_NAME', '기숙사']           // 기숙사명
  ];
  
  defaults.forEach(row => sheet.appendRow(row));
  Logger.log('기본 설정값 입력 완료');
}

/**
 * 기본 벌점 항목 입력
 */
function setupDefaultPenaltyItems(ss) {
  const sheet = ss.getSheetByName('APP_벌점항목');
  if (sheet.getLastRow() > 1) return;
  
  const items = [
    // ═══ 즉시 퇴사 항목 (벌점 단위가 아닌 즉시 퇴사) ═══
    // [항목명, 벌점, 설명, 카테고리]
    ['음주', 0, '즉시 퇴사 대상 — 음주', '즉시퇴사'],
    ['절도', 0, '즉시 퇴사 대상 — 절도', '즉시퇴사'],
    ['도박', 0, '즉시 퇴사 대상 — 도박', '즉시퇴사'],
    ['흡연 (도구 휴대 포함)', 0, '즉시 퇴사 대상 — 흡연(흡연 도구 휴대자 포함)', '즉시퇴사'],
    ['무단외출·무단외박', 0, '즉시 퇴사 대상 — 무단외출·무단 외박한 자', '즉시퇴사'],
    ['학교 내 봉사 이상 징계', 0, '즉시 퇴사 대상 — 학교 내 봉사 이상의 징계를 받은 자', '즉시퇴사'],
    ['기숙사 내 폭력', 0, '즉시 퇴사 대상 — 기숙사 내 폭력 사안에 연루된 자', '즉시퇴사'],
    ['이성 층/호실 출입', 0, '즉시 퇴사 대상 — 이성 층 및 호실을 출입한 자', '즉시퇴사'],
    ['학교폭력(부조리 포함)', 0, '즉시 퇴사 대상 — 학교폭력(부조리 포함) 연루 학생', '즉시퇴사'],
    ['운영위 퇴사 결정', 0, '즉시 퇴사 대상 — 운영위원회 협의로 생활 불가 판단', '즉시퇴사'],
    
    // ═══ 8점 항목 ═══
    ['이성 교제 행위', 8, '기숙사 내 이성 교제 행위 (일체의 신체 접촉 행위 포함)', '중대위반'],
    ['반입금지 물품 반입', 8, '반입금지 물품(전기장판/히터/밥솥/포트/가스레인지/흉기 등) 소지', '중대위반'],
    ['타 호실 취침', 8, '제반규칙 미준수 — 타 호실 취침 등', '중대위반'],
    
    // ═══ 5점 항목 ═══
    ['자기주도적학습 불참', 5, '야자 시간별 벌점 (1,2차 야자 시간별로 부여. 쉬는시간 이전 야자 불참 시 5점, 두 번 불참 시 10점)', '학습'],
    ['기물파손', 5, '기숙사 기물 파손 (본인 변상)', '시설'],
    ['외출/외박 횟수 초과', 5, '월별 외박 및 외출 횟수 초과 (외박 2회, 외출 2회 초과 시 1회당 5점)', '외출/외박'],
    
    // ═══ 3점 항목 ═══
    ['자기주도적학습 지각·불성실', 3, '야자 시간별 벌점 (쉬는시간 이전 야자 지각 시 3점, 두 번 지각 시 6점)', '학습'],
    ['정해진 시간 외 취식', 3, '정해진 시간 외 음식을 취식한 자', '생활규정'],
    ['청소 불이행', 3, '공동구역 및 호실 청소를 성실히 이행하지 않은 자', '생활규정'],
    ['사감 지시 불이행', 3, '기타 사감 지시 불이행한 자', '생활규정']
  ];
  
  items.forEach(row => sheet.appendRow(row));
  Logger.log('기본 벌점 항목 입력 완료 (' + items.length + '건)');
}

/**
 * 기본 징계 기준 입력
 */
function setupDefaultDisciplineRules(ss) {
  const sheet = ss.getSheetByName('APP_징계기준');
  if (sheet.getLastRow() > 1) return;
  
  // 실제 강경고 기숙사 징계 기준
  // ※ 1학기 동안 벌점 유지 (학기별로 벌점 갱신)
  const rules = [
    // [시작점수, 끝점수, 징계명, 조치내용]
    [5, 7, '반성문', '반성문 작성'],
    [8, 11, '봉사활동', '기숙사 자체 봉사활동'],
    [12, 14, '학부모 상담', '학부모 상담 실시'],
    [15, 19, '임시퇴사', '임시퇴사 5일'],
    [20, 999, '퇴사', '퇴사 조치']
  ];
  
  rules.forEach(row => sheet.appendRow(row));
  Logger.log('기본 징계 기준 입력 완료 (' + rules.length + '건)');
}

/**
 * 기본 문자 템플릿 입력
 */
function setupDefaultSmsTemplates(ss) {
  const sheet = ss.getSheetByName('APP_문자템플릿');
  if (sheet.getLastRow() > 1) return;
  
  const templates = [
    [
      '외출', 
      '외출 안내', 
      '안녕하세요. 강경고등학교 기숙사입니다.\n' +
      '{이름} 학생이 {날짜} 외출하였습니다.\n' +
      '귀사 예정 시간: {귀사시간}\n' +
      '감사합니다.'
    ],
    [
      '외박', 
      '외박 안내', 
      '안녕하세요. 강경고등학교 기숙사입니다.\n' +
      '{이름} 학생이 {날짜} 외박하였습니다.\n' +
      '감사합니다.'
    ]
  ];
  
  templates.forEach(row => sheet.appendRow(row));
  Logger.log('기본 문자 템플릿 입력 완료');
}

/**
 * 설정 업데이트
 * @param {string} key - 설정 키
 * @param {string} value - 설정 값
 */
function updateSetting(key, value) {
  try {
    const appDb = SpreadsheetApp.openById(getAppDbSheetId());
    const sheet = appDb.getSheetByName('APP_설정');
    
    if (sheet.getLastRow() > 1) {
      const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
      for (let i = 0; i < data.length; i++) {
        if (data[i][0] === key) {
          sheet.getRange(i + 2, 2).setValue(value);
          
          const user = getCurrentUser();
          addAuditLog(user.email, '설정 변경', key, value);
          
          return { success: true };
        }
      }
    }
    
    // 키가 없으면 추가
    sheet.appendRow([key, value]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * 설정값 전체 조회 (프론트엔드용)
 */
function getAllSettings() {
  return { success: true, data: getSettings() };
}
