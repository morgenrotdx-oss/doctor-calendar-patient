// ===== 設定 =====
// ★ここに新しいAPIのURLを貼り付けてください（クォーテーションを消さないように注意）
const GAS_API = 'https://script.google.com/macros/s/AKfycbwV-Rnvw1eLlLt8jAfZb9Ake95eJGKpaLhn6-CwO1SXLpbtV5Jjn7HgTQEOsTFd3m5G/exec';

// ===== 定数定義 =====
const WEEKDAYS = ["月","火","水","木","金","土","日"];
const DEPT_ORDER = [
  "小児科１診","小児科２診","小児科３診",
  "耳鼻科１診","耳鼻科２診","耳鼻科３診",
  "皮膚科","形成外科","小児科夜診","耳鼻科夜診"
];
const WK_INDEX = { '月':0,'火':1,'水':2,'木':3,'金':4,'土':5,'日':6,
                   'Mon':0,'Tue':1,'Wed':2,'Thu':3,'Fri':4,'Sat':5,'Sun':6 };
const JP2EN = { '月':'Mon','火':'Tue','水':'Wed','木':'Thu','金':'Fri','土':'Sat','日':'Sun' };
const EN2JP = { 'Mon':'月','Tue':'火','Wed':'水','Thu':'木','Fri':'金','Sat':'土','Sun':'日' };

// ===== グローバル変数 =====
let rooms = [];
let schedule = {};
let holidays = [];
let clinicCode = '001';
let clinicName = "";
let minYearMonth = "";
let maxYearMonth = "";
let isLoading = false;
let oneLine = false; 

let state = {
  monthStr: null
};

// ===== ユーティリティ =====
function yyyymm(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
}

function calcMonthInfoFromYYYYMM_JST(monthStr){
  const parts = monthStr.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]) - 1;
  
  const firstUTCJST = new Date(Date.UTC(year, month, 1, 9));
  const sunday0 = firstUTCJST.getUTCDay();
  const firstWeekday = (sunday0 + 6) % 7; 
  const totalDays = new Date(year, month + 1, 0).getDate();
  const numWeeks  = Math.ceil((firstWeekday + totalDays) / 7);
  return { year, month, firstWeekday, totalDays, numWeeks };
}

function inferWeekcharMapForMonth(year, month) {
  const m1 = month + 1;
  const map = new Map();
  if (rooms) {
    for (const r of rooms) {
      const obj = schedule[r];
      if (!obj) continue;
      for (const k of Object.keys(obj)) {
        const m = k.match(/^(\d{1,2})\/(\d{1,2})\(([^)]+)\)$/);
        if (!m) continue;
        const mm = Number(m[1]);
        const dd = Number(m[2]);
        const raw = m[3];
        if (mm !== m1 || map.has(dd)) continue;
        const t = String(raw).trim();
        const youbi = EN2JP[t] || t[0];
        if (youbi) map.set(dd, youbi);
      }
    }
  }
  return map;
}

function normalizeWeekChar(x) {
  if (!x) return null;
  const t = String(x).trim();
  return EN2JP[t] || t[0];
}

// ===== UI操作系 =====
function showLoader(){ 
  isLoading = true;
  const loader = document.getElementById('loader');
  if (loader) loader.style.display = 'flex';
  updateNavDisabled();
}

function hideLoader(){ 
  isLoading = false;
  const loader = document.getElementById('loader');
  if (loader) loader.style.display = 'none';
  updateNavDisabled();
}

// ★ここがエラー原因になりやすい箇所なので、書き方を単純化しました
function updateNavDisabled(){
  const prevBtn = document.getElementById('prevMonth');
  const nextBtn = document.getElementById('nextMonth');
  
  let isMin = false;
  if (minYearMonth && state.monthStr <= minYearMonth) {
    isMin = true;
  }
  
  let isMax = false;
  if (maxYearMonth && state.monthStr >= maxYearMonth) {
    isMax = true;
  }
  
  if (prevBtn) {
    prevBtn.disabled = (isLoading || isMin);
  }
  if (nextBtn) {
    nextBtn.disabled = (isLoading || isMax);
  }
}

function updateTitle(year, month) {
  const el = document.getElementById('tableTitle');
  if (el) el.textContent = (clinicName || "") + " " + year + "年" + (month + 1) + "月 - 医師勤務表";
}

function clearTable() {
  const thead = document.querySelector('#calendar thead');
  const tbody = document.querySelector('#calendar tbody');
  if (thead) thead.innerHTML = '';
  if (tbody) tbody.innerHTML = '';
}

function renderHeader() {
  const thead = document.querySelector('#calendar thead');
  if (!thead) return;

  const headRow = document.createElement('tr');
  headRow.appendChild(document.createElement('th'));
  
  for (let i = 0; i < WEEKDAYS.length; i++) {
    const th = document.createElement('th');
    th.textContent = WEEKDAYS[i];
    if (i === 5) th.classList.add('saturday');
    if (i === 6) th.classList.add('sunday');
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
}

// ===== メイン描画処理 =====
function renderCalendar(){
  if (!state.monthStr || !/^\d{4}-\d{2}$/.test(state.monthStr)) {
    state.monthStr = yyyymm(new Date());
  }

  const info = calcMonthInfoFromYYYYMM_JST(state.monthStr);
  const year = info.year;
  const month = info.month;
  let firstWeekday = info.firstWeekday;
  const totalDays = info.totalDays;
  const numWeeks = info.numWeeks;

  const youbiMap = inferWeekcharMapForMonth(year, month);
  
  function getYoubi(d) {
    const fromMap = youbiMap.get(d);
    if (fromMap) return normalizeWeekChar(fromMap);
    const dateObj = new Date(Date.UTC(year, month, d, 9));
    const wd = dateObj.getUTCDay();
    return ["日","月","火","水","木","金","土"][wd];
  }

  const y1 = youbiMap.get(1);
  if (y1 != null && WK_INDEX[y1] != null) {
    firstWeekday = WK_INDEX[y1];
  }

  updateTitle(year, month);
  clearTable();
  renderHeader();

  const holidaySet = new Set();
  if (holidays) {
    holidays.forEach(function(h) {
      holidaySet.add(h.split('(')[0]);
    });
  }

  const nowJST = new Date(Date.now() + 9*60*60*1000);
  const tbodyNew = document.createElement('tbody');

  for (let w = 0; w < numWeeks; w++) {
    const trWeek = document.createElement('tr');
    trWeek.classList.add('week-row','date-row');
    trWeek.appendChild(document.createElement('td'));

    for (let d = 0; d < 7; d++) {
      const td = document.createElement('td');
      const dayNum = w * 7 + d - firstWeekday + 1;
      
      if (dayNum >= 1 && dayNum <= totalDays) {
        td.textContent = dayNum;
        if (d === 5) td.classList.add('saturday');
        if (d === 6) td.classList.add('sunday');
        
        const label = (month + 1) + '/' + dayNum;
        if (holidaySet.has(label)) td.classList.add('holiday');

        if (year === nowJST.getUTCFullYear() &&
            month === nowJST.getUTCMonth() &&
            dayNum === nowJST.getUTCDate()) {
          td.classList.add('today-cell');
        }
      }
      trWeek.appendChild(td);
    }
    tbodyNew.appendChild(trWeek);

    // ドクター有無判定
    const dayHasDoctor = {};
    for (let d = 0; d < 7; d++) {
      const dayNum = w * 7 + d - firstWeekday + 1;
      if (dayNum < 1 || dayNum > totalDays) continue;

      const tok = getYoubi(dayNum);
      const keyJP = (month + 1) + '/' + dayNum + '(' + tok + ')';
      const keyEN = (month + 1) + '/' + dayNum + '(' + (JP2EN[tok] || tok) + ')';

      let has = false;
      if (rooms) {
        has = rooms.some(function(room) {
          const obj = schedule[room] || {};
          let entries = obj[keyJP] || obj[keyEN] || [];
          if (!Array.isArray(entries)) entries = [entries];
          
          return entries.some(function(e) {
            const disp = e.displayName || e.name || '';
            return !!disp && disp !== '休診';
          });
        });
      }
      dayHasDoctor[dayNum] = has;
    }

    // 診療科ごとの行
    if (rooms) {
      rooms.forEach(function(room, rIndex) {
        const trRoom = document.createElement('tr');
        const tdRoom = document.createElement('td');
        tdRoom.textContent = room; 
        trRoom.appendChild(tdRoom);

        for (let d = 0; d < 7; d++) {
          const td = document.createElement('td');
          const dayNum = w * 7 + d - firstWeekday + 1;

          if (dayNum < 1 || dayNum > totalDays) {
            trRoom.appendChild(td);
            continue;
          }

          const tok = getYoubi(dayNum);
          const keyJP = (month + 1) + '/' + dayNum + '(' + tok + ')';
          const keyEN = (month + 1) + '/' + dayNum + '(' + (JP2EN[tok] || tok) + ')';
          
          let entries = (schedule[room] && (schedule[room][keyJP] || schedule[room][keyEN])) || [];
          if (!Array.isArray(entries)) entries = [entries];

          if (!dayHasDoctor[dayNum]) {
            if (rIndex === 0) {
              td.textContent = '休診日';
              td.classList.add('kyushin-cell');
              td.setAttribute('aria-label', (month+1) + '/' + dayNum + ' 休診日');
              td.rowSpan = rooms.length;
              trRoom.appendChild(td);
            }
            continue;
          }

          if (entries.length > 0) {
            entries.sort(function(a, b) {
              const parseTime = function(t) {
                const p = (t || "0:00").split(":");
                return Number(p[0]) * 60 + (Number(p[1]) || 0);
              };
              return parseTime(a.timeFrom) - parseTime(b.timeFrom);
            });

            let html = "";
            entries.forEach(function(e) {
              const timeTxt = (e.timeFrom || "") + (e.timeTo ? '～' + e.timeTo : '');
              const sexClass = (e.sex === "女") ? ' class="female"' : '';
              const nameTxt = '<span' + sexClass + '>' + (e.displayName || e.name) + '</span>';
              const tongueIcon = e.tongueMark ? ' <span title="舌下">' + e.tongueMark + '</span>' : '';
              
              const sep = oneLine ? ' ' : '<br>';
              const cls = oneLine ? 'cell-entry one-line' : 'cell-entry';
              
              html += '<div class="' + cls + '" style="margin:2px 0">' + timeTxt + sep + nameTxt + tongueIcon + '</div>';
            });
            td.innerHTML = html;

            // 八重樫ハイライト
            const isYaegashi = entries.some(function(e) {
              return e.displayName === "八重樫" && e.timeFrom === "9:30";
            });
            if (isYaegashi) {
              td.classList.add("yaegashi-cell");
            }

            // 全て休診ならグレーアウト
            const allKyushin = entries.every(function(e) {
              return (e.displayName || e.name) === "休診";
            });

            if (allKyushin) {
              td.classList.add("kyushin-cell");
            } else {
               td.style.cursor = "zoom-in";
               td.dataset.entry = JSON.stringify({
                 date: (month+1) + '/' + dayNum,
                 dept: room,
                 entries: entries
               });
            }
          } else {
            td.textContent = "−";
            td.setAttribute('aria-label', (month+1) + '/' + dayNum + ' ' + room + ' −');
          }

          trRoom.appendChild(td);
        }
        tbodyNew.appendChild(trRoom);
      });
    }
  }

  const table = document.getElementById('calendar');
  if (table && table.tBodies[0]) {
    table.replaceChild(tbodyNew, table.tBodies[0]);
  } else if (table) {
    table.appendChild(tbodyNew);
  }
}

// ===== モーダル =====
function showCellModal(data) {
  const date = data.date;
  const dept = data.dept;
  let entries = data.entries;
  
  const modal = document.getElementById('cellModal');
  const content = document.getElementById('cellModalContent');
  if (!modal || !content) return;

  let htmlParts = [
    '<button type="button" id="cellModalClose" aria-label="閉じる">閉じる</button>',
    '<h3 id="cellModalTitle">勤務詳細</h3>',
    '<div class="modal-label">日付</div><div class="modal-value">' + date + '</div>',
    '<div class="modal-label">診療科</div><div class="modal-value">' + dept + '</div>'
  ];

  if (!Array.isArray(entries)) entries = [entries];

  entries.forEach(function(e) {
    const from = e.timeFrom || "";
    const to   = e.timeTo   || "";
    
    let highlighted = "";
    if (e.displayName === '八重樫' && from === '9:30') {
      highlighted = '<span class="highlight-time">' + from + '</span>' + (to ? '～'+to : '');
    } else {
      highlighted = to ? (from + '～' + to) : from;
    }
    
    const nameTxt = e.displayName || e.name || '';
    const tongueIcon = e.tongueMark ? ' <span title="舌下">' + e.tongueMark + '</span>' : '';
    
    htmlParts.push(
      '<div class="modal-label">勤務時間</div><div class="modal-value">' + highlighted + '</div>',
      '<div class="modal-label">医師名</div><div class="modal-value">' + nameTxt + tongueIcon + '</div>'
    );
  });
  
  content.innerHTML = htmlParts.join('');
  modal.style.display = 'flex';
  document.body.classList.add('no-scroll');
  
  const closeFunc = function() {
    modal.style.display = 'none';
    document.body.classList.remove('no-scroll');
  };
  
  document.getElementById('cellModalClose').onclick = closeFunc;
  modal.onclick = function(e) {
    if(e.target === modal) closeFunc();
  };
}

// ===== データ取得 (デバッグログ付き) =====
async function fetchSchedule(){
  console.log("🚀 fetchSchedule開始"); // ★デバッグログ
  if (isLoading) {
    console.log("読み込み中のためスキップ");
    return;
  }

  const url = new URL(GAS_API);
  url.searchParams.set('action', 'schedule');
  url.searchParams.set('clinic', clinicCode);
  url.searchParams.set('month', state.monthStr); 

  console.log("APIリクエスト: " + url.toString()); // ★デバッグログ
  showLoader();
  
  try {
    const res = await fetch(url.toString());
    console.log("レスポンス受信: " + res.status); // ★デバッグログ
    
    const json = await res.json();
    console.log("JSONパース成功");
    
    if (!json.ok) throw new Error(json.error || 'API error');
    
    clinicName   = json.clinicName || '';
    const data   = json.data || {};
    rooms        = (data.rooms || []).slice();
    schedule     = data.schedule || {};
    holidays     = data.holidays || [];
    minYearMonth = data.minYearMonth || "";
    maxYearMonth = data.maxYearMonth || "";
    
    rooms.sort(function(a,b){
      const ia = DEPT_ORDER.indexOf(a);
      const ib = DEPT_ORDER.indexOf(b);
      if (ia===-1 && ib===-1) return a.localeCompare(b,'ja');
      if (ia===-1) return 1; if (ib===-1) return -1;
      return ia - ib;
    });

    console.log("カレンダー描画へ");
    renderCalendar();
  } catch(e) {
    console.error("❌ エラー発生:", e);
    // エラーでもアラートを出さず、コンソールのみにする
  } finally {
    hideLoader();
  }
}

// ===== 初期化 =====
document.addEventListener('DOMContentLoaded', function() {
  console.log("DOM読み込み完了"); // ★デバッグログ
  const p = new URLSearchParams(location.search);
  clinicCode = p.get('clinic') || '001';
  
  const olVal = (p.get('oneLine') || '').toLowerCase();
  oneLine = ['1','true','on','yes'].includes(olVal);

  state.monthStr = yyyymm(new Date());

  const prevBtn = document.getElementById('prevMonth');
  if (prevBtn) {
    prevBtn.onclick = function(){
      const parts = state.monthStr.split('-');
      const d = new Date(Number(parts[0]), Number(parts[1])-1 - 1, 1);
      state.monthStr = yyyymm(d);
      fetchSchedule();
    };
  }
  
  const nextBtn = document.getElementById('nextMonth');
  if (nextBtn) {
    nextBtn.onclick = function(){
      const parts = state.monthStr.split('-');
      const d = new Date(Number(parts[0]), Number(parts[1])-1 + 1, 1);
      state.monthStr = yyyymm(d);
      fetchSchedule();
    };
  }
  
  const calendarEl = document.getElementById('calendar');
  if (calendarEl) {
    calendarEl.addEventListener('click', function(e) {
      const td = e.target.closest('td[data-entry]');
      if (!td) return;
      try {
        const payload = JSON.parse(td.dataset.entry);
        showCellModal(payload);
      } catch (_) { }
    });
  }

  fetchSchedule();
});
