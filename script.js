// ===== 設定 =====
const GAS_API = 'https://script.google.com/macros/s/AKfycbwV-Rnvw1eLlLt8jAfZb9Ake95eJGKpaLhn6-CwO1SXLpbtV5Jjn7HgTQEOsTFd3m5G/exec';

// ===== 定数定義 =====
const WEEKDAYS = ["月","火","水","木","金","土","日"];
const DEPT_ORDER = [
  "小児科１診","小児科２診","小児科３診",
  "耳鼻科１診","耳鼻科２診","耳鼻科３診",
  "皮膚科","形成外科","小児科夜診","耳鼻科夜診"
];
// 曜日変換マップ
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
let oneLine = false; // 患者向け: 1行表示モードフラグ

let state = {
  monthStr: null // "YYYY-MM"
};

// ===== ユーティリティ =====
function yyyymm(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }

function calcMonthInfoFromYYYYMM_JST(monthStr){
  const [yy, mm] = monthStr.split('-').map(Number);
  const year  = yy, month = mm - 1;
  const firstUTCJST = new Date(Date.UTC(year, month, 1, 9));
  const sunday0 = firstUTCJST.getUTCDay();
  let firstWeekday = (sunday0 + 6) % 7; // 月曜起点
  const totalDays = new Date(year, month + 1, 0).getDate();
  const numWeeks  = Math.ceil((firstWeekday + totalDays) / 7);
  return { year, month, firstWeekday, totalDays, numWeeks };
}

// サーバーの曜日情報からマップを作成
function inferWeekcharMapForMonth(year, month) {
  const m1 = month + 1;
  const map = new Map();
  for (const r of (rooms || [])) {
    const obj = schedule[r];
    if (!obj) continue;
    for (const k of Object.keys(obj)) {
      const m = k.match(/^(\d{1,2})\/(\d{1,2})\(([^)]+)\)$/);
      if (!m) continue;
      const mm = Number(m[1]), dd = Number(m[2]), raw = m[3];
      if (mm !== m1 || map.has(dd)) continue;
      const t = String(raw).trim();
      const youbi = EN2JP[t] || t[0];
      if (youbi) map.set(dd, youbi);
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
  document.getElementById('loader')?.style.display = 'flex';
  updateNavDisabled();
}
function hideLoader(){ 
  isLoading = false;
  document.getElementById('loader')?.style.display = 'none';
  updateNavDisabled();
}
function updateNavDisabled(){
  const prevBtn = document.getElementById('prevMonth');
  const nextBtn = document.getElementById('nextMonth');
  const atMin = !!minYearMonth && (state.monthStr <= minYearMonth);
  const atMax = !!maxYearMonth && (state.monthStr >= maxYearMonth);
  if (prevBtn) prevBtn.disabled = isLoading || atMin;
  if (nextBtn) nextBtn.disabled = isLoading || atMax;
}

function updateTitle(year, month) {
  document.getElementById('tableTitle').textContent =
    `${clinicName || ""} ${year}年${month + 1}月 医師勤務表`;
}

function clearTable() {
  document.querySelector('#calendar thead').innerHTML = '';
  document.querySelector('#calendar tbody').innerHTML = '';
}

function renderHeader() {
  const headRow = document.createElement('tr');
  headRow.appendChild(document.createElement('th'));
  WEEKDAYS.forEach((wd, i) => {
    const th = document.createElement('th');
    th.textContent = wd;
    if (i === 5) th.classList.add('saturday');
    if (i === 6) th.classList.add('sunday');
    headRow.appendChild(th);
  });
  document.querySelector('#calendar thead').appendChild(headRow);
}

// ===== メイン描画処理（患者向けロジック統合版） =====
function renderCalendar(){
  if (!state.monthStr || !/^\d{4}-\d{2}$/.test(state.monthStr)) {
    state.monthStr = yyyymm(new Date());
  }

  let { year, month, firstWeekday, totalDays, numWeeks } = calcMonthInfoFromYYYYMM_JST(state.monthStr);
  const youbiMap = inferWeekcharMapForMonth(year, month);
  
  // 曜日判定関数
  const jpDowJST = (y, m0, d) => ["日","月","火","水","木","金","土"][new Date(Date.UTC(y, m0, d, 9)).getUTCDay()];
  const youbiOf = (d) => normalizeWeekChar(youbiMap.get(d) || jpDowJST(year, month, d));

  // 1日の曜日補正
  const y1 = youbiMap.get(1);
  if (y1 != null && WK_INDEX[y1] != null) firstWeekday = WK_INDEX[y1];

  updateTitle(year, month);
  clearTable();
  renderHeader();

  const holidaySet = new Set((holidays || []).map(h => h.split('(')[0]));
  const nowJST = new Date(Date.now() + 9*60*60*1000);

  const tbodyNew = document.createElement('tbody');

  for (let w = 0; w < numWeeks; w++) {
    // (a) 日付行
    const trWeek = document.createElement('tr');
    trWeek.classList.add('week-row','date-row');
    const tdLabel = document.createElement('td'); 
    trWeek.appendChild(tdLabel);

    for (let d = 0; d < 7; d++) {
      const td = document.createElement('td');
      const dayNum = w * 7 + d - firstWeekday + 1;
      if (dayNum >= 1 && dayNum <= totalDays) {
        td.textContent = dayNum;
        if (d === 5) td.classList.add('saturday');
        if (d === 6) td.classList.add('sunday');
        
        const label = `${month + 1}/${dayNum}`;
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

    // (b) 週内ドクター有無チェック
    const dayHasDoctor = {};
    for (let d = 0; d < 7; d++) {
      const dayNum = w * 7 + d - firstWeekday + 1;
      if (dayNum < 1 || dayNum > totalDays) continue;

      const tok   = youbiOf(dayNum); 
      const keyJP = `${month + 1}/${dayNum}(${tok})`;
      const keyEN = `${month + 1}/${dayNum}(${JP2EN[tok] || tok})`;

      dayHasDoctor[dayNum] = rooms.some(room => {
        const obj = schedule[room] || {};
        // 患者向け: APIは常に配列を返す想定
        const entries = obj[keyJP] || obj[keyEN] || [];
        return entries.some(e => {
            const disp = e.displayName || e.name || '';
            return !!disp && disp !== '休診';
        });
      });
    }

    // (c) 診療科行
    rooms.forEach((room, rIndex) => {
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

        const tok   = youbiOf(dayNum);
        const keyJP = `${month + 1}/${dayNum}(${tok})`;
        const keyEN = `${month + 1}/${dayNum}(${JP2EN[tok] || tok})`;
        
        // ★データ取得（APIは配列を返す）
        const entries = (schedule[room]?.[keyJP]) || (schedule[room]?.[keyEN]) || [];

        // 全科休診日の場合
        if (!dayHasDoctor[dayNum]) {
          if (rIndex === 0) {
            td.textContent = '休診日';
            td.classList.add('kyushin-cell');
            td.setAttribute('aria-label', `${month+1}/${dayNum} 休診日`);
            td.rowSpan = rooms.length;
            trRoom.appendChild(td);
          }
          continue;
        }

        if (entries.length > 0) {
          // 時間ソート
          entries.sort((a, b) => {
            const [h1, m1] = (a.timeFrom || "0:00").split(":").map(Number);
            const [h2, m2] = (b.timeFrom || "0:00").split(":").map(Number);
            return (h1 * 60 + (m1 || 0)) - (h2 * 60 + (m2 || 0));
          });

          // HTML生成 (患者向け: oneLine対応)
          td.innerHTML = entries.map(e => {
            const timeTxt = `${e.timeFrom || ""}${e.timeTo ? '～' + e.timeTo : ''}`;
            const nameTxt = `<span${e.sex === "女" ? ' class="female"' : ''}>${e.displayName || e.name}</span>`;
            const tongueIcon = e.tongueMark ? ` <span title="舌下">${e.tongueMark}</span>` : '';
            
            const sep = oneLine ? ' ' : '<br>';
            const cls = oneLine ? 'cell-entry one-line' : 'cell-entry';
            return `<div class="${cls}" style="margin:2px 0">${timeTxt}${sep}${nameTxt}${tongueIcon}</div>`;
          }).join('');

          // ★患者向け機能: 八重樫ハイライト
          if (entries.some(e => e.displayName === "八重樫" && e.timeFrom === "9:30")) {
            td.classList.add("yaegashi-cell");
          }

          // 全て休診ならグレーアウト
          if (entries.every(e => (e.displayName || e.name) === "休診")) {
            td.classList.add("kyushin-cell");
          } else {
             // モーダル設定
             td.style.cursor = "zoom-in";
             // データ埋め込み（JSON化）
             td.dataset.entry = JSON.stringify({
               date: `${month+1}/${dayNum}`,
               dept: room,
               entries: entries // 配列ごと渡す
             });
          }
        } else {
          // 他の科はやってるけどここはデータなし
          td.textContent = "−";
          td.setAttribute('aria-label', `${month+1}/${dayNum} ${room} −`);
        }

        trRoom.appendChild(td);
      }
      tbodyNew.appendChild(trRoom);
    });
  }

  const table = document.getElementById('calendar');
  table.replaceChild(tbodyNew, table.tBodies[0]) || table.appendChild(tbodyNew);
}

// ===== モーダル（患者向けピンクデザイン対応） =====
function showCellModal({ date, dept, entries }) {
  const modal = document.getElementById('cellModal');
  const content = document.getElementById('cellModalContent');
  if (!modal || !content) return;

  const parts = [
    `<button type="button" id="cellModalClose" aria-label="閉じる">閉じる</button>`,
    `<h3 id="cellModalTitle">勤務詳細</h3>`,
    `<div class="modal-label">日付</div><div class="modal-value">${date}</div>`,
    `<div class="modal-label">診療科</div><div class="modal-value">${dept}</div>`
  ];

  entries.forEach(e => {
    const from = e.timeFrom || "";
    const to   = e.timeTo   || "";
    // 八重樫強調
    const highlighted = (e.displayName === '八重樫' && from === '9:30')
      ? `<span class="highlight-time">${from}</span>${to ? '～'+to : ''}`
      : (to ? `${from}～${to}` : from);
    
    const nameTxt = e.displayName || e.name || '';
    const tongueIcon = e.tongueMark ? ` <span title="舌下">${e.tongueMark}</span>` : '';
    
    parts.push(
      `<div class="modal-label">勤務時間</div><div class="modal-value">${highlighted}</div>`,
      `<div class="modal-label">医師名</div><div class="modal-value">${nameTxt}${tongueIcon}</div>`
    );
  });
  content.innerHTML = parts.join('');

  modal.style.display = 'flex';
  document.body.classList.add('no-scroll');
  
  const close = () => {
    modal.style.display = 'none';
    document.body.classList.remove('no-scroll');
  };
  
  document.getElementById('cellModalClose').onclick = close;
  modal.onclick = (e) => { if(e.target === modal) close(); };
}

// ===== データ取得 =====
async function fetchSchedule(){
  if (isLoading) return;

  const url = new URL(GAS_API);
  url.searchParams.set('action', 'schedule');
  url.searchParams.set('clinic', clinicCode);
  url.searchParams.set('month', state.monthStr); 

  showLoader();
  try {
    const res = await fetch(url.toString());
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'API error');
    
    clinicName   = json.clinicName || '';
    const data   = json.data || {};
    rooms        = (data.rooms || []).slice();
    schedule     = data.schedule || {};
    holidays     = data.holidays || [];
    minYearMonth = data.minYearMonth || "";
    maxYearMonth = data.maxYearMonth || "";
    
    // 並び順
    rooms.sort((a,b)=>{
      const ia = DEPT_ORDER.indexOf(a), ib = DEPT_ORDER.indexOf(b);
      if (ia===-1 && ib===-1) return a.localeCompare(b,'ja');
      if (ia===-1) return 1; if (ib===-1) return -1;
      return ia - ib;
    });

    renderCalendar();
  } catch(e) {
    alert('読み込みエラー: ' + e.message);
  } finally {
    hideLoader();
  }
}

// ===== 初期化 =====
document.addEventListener('DOMContentLoaded', () => {
  // URLパラメータ取得
  const p = new URLSearchParams(location.search);
  clinicCode = p.get('clinic') || '001';
  // oneLineフラグ取得
  const olVal = (p.get('oneLine') || '').toLowerCase();
  oneLine = ['1','true','on','yes'].includes(olVal);

  state.monthStr = yyyymm(new Date());

  // イベント設定
  document.getElementById('prevMonth').onclick = ()=>{
    const [y,m] = state.monthStr.split('-').map(Number);
    state.monthStr = yyyymm(new Date(y, m-2, 1));
    fetchSchedule();
  };
  document.getElementById('nextMonth').onclick = ()=>{
    const [y,m] = state.monthStr.split('-').map(Number);
    state.monthStr = yyyymm(new Date(y, m, 1));
    fetchSchedule();
  };
  
  // モーダル委譲
  document.getElementById('calendar').addEventListener('click', (e) => {
    const td = e.target.closest('td[data-entry]');
    if (!td) return;
    try {
      const payload = JSON.parse(td.dataset.entry);
      showCellModal(payload);
    } catch (_) { }
  });

  fetchSchedule();
});
