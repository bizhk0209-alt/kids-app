// ===== 設定 =====
const CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbypZzDW4KFBeAB1kooZDMe4tb23J7O7cbfNGTydgFiDORwqd83oS0ihVDn5LF9Sbphx6Q/exec',
};

const CHILDREN = {
  'はると': { cls: 'haruto', needsKana: false },
  'ゆき':   { cls: 'yuki',   needsKana: true  },
  'ななみ': { cls: 'nanami', needsKana: false },
};

// ===== 状態 =====
let currentChild = 'はると';
let allEvents = [];
let checkedState = {}; // { 'key': true/false }
let kanaMode = {}; // { eventKey: 'kanji' | 'kana' }
let searchQuery = '';
let processTimer = null;

// ===== 初期化 =====
window.addEventListener('DOMContentLoaded', () => {
  loadCheckedState();
  loadEvents(currentChild);
});

// ===== 子供切り替え =====
function switchChild(child, btn) {
  currentChild = child;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  searchQuery = '';
  document.getElementById('search-input').value = '';
  loadEvents(child);
}

// ===== 検索 =====
function onSearch(q) {
  searchQuery = q.trim().toLowerCase();
  renderEvents(allEvents);
}

// ===== データ取得 =====
async function loadEvents(child) {
  const list = document.getElementById('event-list');
  list.innerHTML = '<div class="loading">よみこみ中…</div>';

  if (!CONFIG.GAS_URL) {
    // GAS未設定時はサンプルデータで表示
    allEvents = getSampleEvents(child);
    renderEvents(allEvents);
    return;
  }

  try {
    const url = `${CONFIG.GAS_URL}?child=${encodeURIComponent(child)}`;
    const res = await fetch(url);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'API エラー');
    allEvents = json.data || [];
    renderEvents(allEvents);
  } catch(e) {
    list.innerHTML = `<div class="empty">よみこみに失敗しました<br><small>${e.message}</small></div>`;
  }
}

// ===== 今すぐ処理 =====
async function triggerProcess() {
  const btn = document.getElementById('btn-process');
  btn.classList.add('loading');
  btn.innerHTML = '<span class="btn-icon">⏳</span> 処理中…';

  if (!CONFIG.GAS_URL) {
    await new Promise(r => setTimeout(r, 1500));
    showToast('✅ 処理完了（テストモード）');
    btn.classList.remove('loading');
    btn.innerHTML = '<span class="btn-icon">▶</span> 今すぐ処理';
    return;
  }

  try {
    const res = await fetch(CONFIG.GAS_URL, { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      const msg = json.message || 'OCR処理完了';
      showToast('✅ ' + msg);
      // 新規ファイルがあった場合のみ再読み込み
      if (json.newFiles !== 0) {
        setTimeout(() => loadEvents(currentChild), 2000);
      }
    } else {
      showToast('⚠️ ' + (json.error || 'エラー'));
    }
  } catch(e) {
    showToast('⚠️ 通信エラー: ' + e.message);
  } finally {
    btn.classList.remove('loading');
    btn.innerHTML = '<span class="btn-icon">▶</span> 今すぐ処理';
  }
}

// ===== レンダリング =====
function renderEvents(events) {
  const list = document.getElementById('event-list');
  const child = CHILDREN[currentChild];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // フィルタ
  let filtered = events.filter(ev => {
    if (!searchQuery) return true;
    const searchTarget = [ev['行事名'], ev['場所'], ev['持ち物'], ev['持ち物(ふりがな)'], ev['説明']]
      .join(' ').toLowerCase();
    return searchTarget.includes(searchQuery);
  });

  // 日付順ソート（過去→未来）
  filtered.sort((a, b) => {
    const da = new Date(a['日付'] || '2099-01-01');
    const db = new Date(b['日付'] || '2099-01-01');
    return da - db;
  });

  // 未来のイベントを先頭に（過去は後ろ）
  const upcoming = filtered.filter(ev => new Date(ev['日付']) >= today);
  const past = filtered.filter(ev => new Date(ev['日付']) < today);
  filtered = [...upcoming, ...past];

  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty">イベントがありません</div>';
    return;
  }

  list.innerHTML = filtered.map(ev => renderCard(ev, child, today)).join('');
}

function renderCard(ev, child, today) {
  const dateStr = ev['日付'] || '';
  const date = new Date(dateStr);
  const title = ev['行事名'] || '';
  const place = ev['場所'] || '';
  const itemsRaw = ev['持ち物'] || '';
  const itemsKanaRaw = ev['持ち物(ふりがな)'] || '';
  const items = itemsRaw ? itemsRaw.split('、').filter(Boolean) : [];
  const itemsKana = itemsKanaRaw ? itemsKanaRaw.split('、').filter(Boolean) : [];

  const key = `${currentChild}|${dateStr}|${title}`;

  // 日付フォーマット
  const dateLabel = formatDate(date);
  const daysLabel = getDaysLabel(date, today);

  // 持ち物プレビュー（折り畳み状態でも見える）
  let itemsPreviewHtml = '';
  if (items.length > 0) {
    const hasKana = child.needsKana && itemsKana.length > 0;
    const previewList = items.slice(0, 4).map((item, i) => {
      if (hasKana && itemsKana[i]) return `<span class="preview-item">${escHtml(item)}<small>（${escHtml(itemsKana[i])}）</small></span>`;
      return `<span class="preview-item">${escHtml(item)}</span>`;
    }).join('');
    const more = items.length > 4 ? `<span class="preview-more">…他${items.length - 4}件</span>` : '';
    itemsPreviewHtml = `<div class="items-preview">🎒 ${previewList}${more}</div>`;
  }

  // 持ち物チェックリスト HTML
  const itemsHtml = renderChecklist(key, items, itemsKana, child);

  return `
<div class="event-card ${child.cls}" data-key="${escHtml(key)}">
  <div class="event-header" onclick="toggleCard(this.closest('.event-card'))">
    <div class="event-date">
      ${escHtml(dateLabel)}
      <span class="days-badge ${daysLabel.cls}">${escHtml(daysLabel.text)}</span>
    </div>
    <div class="event-title">
      <span>${escHtml(title)}</span>
      <span class="expand-icon">▼</span>
    </div>
    ${place ? `<div class="event-meta"><span class="meta-tag">📍 ${escHtml(place)}</span></div>` : ''}
    ${itemsPreviewHtml}
  </div>
  <div class="checklist-section">
    <div class="checklist-inner">
      ${itemsHtml}
    </div>
  </div>
</div>`;
}

function renderChecklist(key, items, itemsKana, child) {
  if (items.length === 0) {
    return '<div class="no-items">持ち物の記載なし</div>';
  }

  const hasKana = child.needsKana && itemsKana.length > 0;

  // ゆきは漢字＋ひらがなを常時両方表示（トグルなし）
  const itemsHtml = items.map((item, i) => {
    const itemKey = `${key}|${i}`;
    const isChecked = !!checkedState[itemKey];

    let labelHtml;
    if (hasKana && itemsKana[i]) {
      // 漢字とひらがなを両行で表示
      labelHtml = `<span class="check-label">
        <span class="check-kanji">${escHtml(item)}</span>
        <span class="check-kana-line">${escHtml(itemsKana[i])}</span>
      </span>`;
    } else {
      labelHtml = `<span class="check-label">${escHtml(item)}</span>`;
    }

    return `
<label class="check-item ${isChecked ? 'checked' : ''}" onclick="toggleItem('${escHtml(itemKey)}', this, event)">
  <div class="check-box">${isChecked ? '✓' : ''}</div>
  ${labelHtml}
</label>`;
  }).join('');

  const allChecked = items.every((_, i) => !!checkedState[`${key}|${i}`]);

  return `
<div class="checklist" id="cl-${escHtml(key)}">${itemsHtml}</div>
<div class="check-all-row">
  <button class="btn-check-all" onclick="checkAll('${escHtml(key)}', ${items.length}, event)">
    ${allChecked ? '✅ チェック済み' : '全部チェック'}
  </button>
</div>`;
}

// ===== インタラクション =====
function toggleCard(card) {
  card.classList.toggle('expanded');
}

function toggleItem(itemKey, label, e) {
  e.stopPropagation();
  checkedState[itemKey] = !checkedState[itemKey];
  label.classList.toggle('checked', checkedState[itemKey]);
  const box = label.querySelector('.check-box');
  box.textContent = checkedState[itemKey] ? '✓' : '';
  saveCheckedState();

  // 全チェックボタン更新
  updateCheckAllBtn(itemKey);
}

function checkAll(key, count, e) {
  e.stopPropagation();
  const allChecked = Array.from({length: count}, (_, i) => !!checkedState[`${key}|${i}`]).every(Boolean);
  for (let i = 0; i < count; i++) {
    const itemKey = `${key}|${i}`;
    checkedState[itemKey] = !allChecked;
  }
  saveCheckedState();
  renderEvents(allEvents); // 再描画
}

function setKanaMode(key, mode, e) {
  e.stopPropagation();
  kanaMode[key] = mode;
  renderEvents(allEvents); // 再描画
}

function updateCheckAllBtn(itemKey) {
  const keyParts = itemKey.split('|');
  keyParts.pop(); // 末尾のindex削除
  const key = keyParts.join('|');
  const cl = document.getElementById('cl-' + key);
  if (!cl) return;
  const items = cl.querySelectorAll('.check-item');
  const allChecked = Array.from(items).every(el => el.classList.contains('checked'));
  const btn = cl.parentElement.querySelector('.btn-check-all');
  if (btn) btn.textContent = allChecked ? '✅ チェック済み' : '全部チェック';
}

// ===== 日付ユーティリティ =====
function formatDate(date) {
  if (isNaN(date)) return '日付不明';
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const w = days[date.getDay()];
  return `${m}/${d}（${w}）`;
}

function getDaysLabel(date, today) {
  if (isNaN(date)) return { text: '', cls: 'far' };
  const diff = Math.round((date - today) / (1000 * 60 * 60 * 24));
  if (diff < 0)  return { text: '終了', cls: 'past' };
  if (diff === 0) return { text: '今日', cls: 'soon' };
  if (diff === 1) return { text: '明日', cls: 'soon' };
  if (diff <= 7)  return { text: `あと${diff}日`, cls: 'near' };
  return { text: `あと${diff}日`, cls: 'far' };
}

// ===== ローカルストレージ =====
function saveCheckedState() {
  try { localStorage.setItem('kidsapp_checks', JSON.stringify(checkedState)); } catch(e) {}
}
function loadCheckedState() {
  try { checkedState = JSON.parse(localStorage.getItem('kidsapp_checks') || '{}'); } catch(e) {}
}

// ===== トースト =====
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(processTimer);
  processTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

// ===== エスケープ =====
function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ===== サンプルデータ（GAS未設定時のプレビュー） =====
function getSampleEvents(child) {
  const today = new Date();
  const fmt = d => d.toISOString().split('T')[0];
  const d = (n) => { const r = new Date(today); r.setDate(r.getDate() + n); return fmt(r); };

  const data = {
    'はると': [
      { '日付': d(3),  '行事名': '遠足',     '場所': '○○公園',   '持ち物': 'お弁当、水筒、レジャーシート', '持ち物(ふりがな)': '', '説明': '' },
      { '日付': d(10), '行事名': '授業参観',  '場所': '体育館',    '持ち物': '',                           '持ち物(ふりがな)': '', '説明': '' },
      { '日付': d(-5), '行事名': '運動会',    '場所': '',          '持ち物': '体操服、タオル',             '持ち物(ふりがな)': '', '説明': '' },
    ],
    'ゆき': [
      { '日付': d(2),  '行事名': '遠足',      '場所': '動物園',    '持ち物': 'お弁当、水筒、雨具',         '持ち物(ふりがな)': 'おべんとう、すいとう、あまぐ', '説明': '' },
      { '日付': d(7),  '行事名': '授業参観',  '場所': '教室',      '持ち物': '',                           '持ち物(ふりがな)': '', '説明': '' },
      { '日付': d(21), '行事名': '音楽発表会', '場所': '体育館',   '持ち物': '黒いズボン、白いシャツ',    '持ち物(ふりがな)': 'くろいずぼん、しろいしゃつ', '説明': '' },
    ],
    'ななみ': [
      { '日付': d(5),  '行事名': 'お遊戯会',  '場所': 'ホール',    '持ち物': '衣装、カメラ',               '持ち物(ふりがな)': '', '説明': '' },
      { '日付': d(14), '行事名': '誕生日会',  '場所': '',          '持ち物': '',                           '持ち物(ふりがな)': '', '説明': '' },
    ],
  };
  return data[child] || [];
}
