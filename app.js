'use strict';
// ===== 設定 =====
var KEY = 'gakushu-shien:v1';   // 保存キー（アプリ固有）
var FMT = 1, APP_VER = '0.4.0'; // データ形式とアプリのバージョン
var $ = function (id) { return document.getElementById(id); };
var blocked = false;            // 壊れたデータを上書きしないための目印
var editingId = null, period = '7';

// ===== 保存 =====
// 操作のたびに localStorage から読み直す → 別タブで更新された内容を壊さない
function load() {
  try {
    var raw = localStorage.getItem(KEY);
    if (!raw) return { version: FMT, records: [] };
    var d = JSON.parse(raw);
    if (!d || !Array.isArray(d.records)) throw new Error('bad');
    blocked = false; return d;
  } catch (e) {
    blocked = true;
    showErr('保存されたデータを読めませんでした。上書きを防ぐため保存を止めています。ブラウザの設定を確認してください。');
    return { version: FMT, records: [] };
  }
}
function save(d) {
  if (blocked) return false;
  try { localStorage.setItem(KEY, JSON.stringify(d)); hideErr(); return true; }
  catch (e) { showErr('保存できませんでした。ブラウザの容量や、プライベートモードの設定を確認してください。この記録はまだ保存されていません。'); return false; }
}
// 読み直し→変更→保存。保存できたときだけ true
function update(fn) { var d = load(); if (blocked) return false; var ok = fn(d); if (ok === false) return false; return save(d); }
function showErr(m) { $('err').textContent = m; $('err').hidden = false; }
function hideErr() { $('err').hidden = true; }
function uid() { return (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2)); }
function find(d, id) { return d.records.filter(function (r) { return r.id === id; })[0]; }
function active(d) { return d.records.filter(function (r) { return r.status === 'running' || r.status === 'paused'; })[0]; }

// ===== 時間計算 =====
// 保存した時刻と「今」の差から求める。setIntervalの回数は使わない
function measuredMs(r, now) {
  if (!r.startedAt) return 0;
  var end = r.endedAt ? Date.parse(r.endedAt) : now;
  var total = end - Date.parse(r.startedAt);
  (r.pauses || []).forEach(function (p) {
    total -= (p.to ? Date.parse(p.to) : end) - Date.parse(p.from); // 一時停止の時間は引く
  });
  return Math.max(0, total);
}
function fmtClock(ms) {
  var s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  var p = function (n) { return (n < 10 ? '0' : '') + n; };
  return (h ? h + ':' + p(m) : m) + ':' + p(x);
}
function fmtDate(iso) { return iso ? new Date(iso).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' }) : ''; }
function nowIso() { return new Date().toISOString(); }

// ===== 画面切り替え（同じHTML内） =====
function show(name) {
  ['tasks', 'today', 'run', 'reflect', 'log', 'peers', 'data'].forEach(function (n) { $('v-' + n).hidden = n !== name; });
  document.querySelectorAll('[data-go]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.go === name)); }); // 今いるタブを示す
  $('toast').hidden = true; document.body.classList.toggle('focus', name === 'run'); // 学習中はメニューを隠す
  setWake(name === 'run'); if (name === 'reflect') renderLeaveNote();
  if (name === 'tasks') renderTasksView();
  if (name === 'run') renderRunTasks();
  if (name === 'peers') renderPeers();
  if (name === 'today') renderToday();
  if (name === 'log') renderLog();
  if (name === 'run') renderRun();
  window.scrollTo(0, 0);
}
function routeByState(first) {
  var d = load(), a = active(d);
  if (a) return show('run');
  var u = d.records.filter(function (r) { return r.status === 'ended'; })[0]; // 振り返り待ち
  if (u) return show('reflect');
  var cur = ['tasks', 'today', 'log', 'peers', 'data'].filter(function (n) { return !$('v-' + n).hidden; })[0];
  // 起動時、今日のタスクが未入力ならタスク画面から始める。それ以外は今いる画面を保つ
  show(first ? (getDay(d, dayKey()).tasks.length ? 'today' : 'tasks') : (cur || 'today'));
}

// ===== 1. 今日の計画 =====
function localInputValue(date) {
  var z = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 16);
}
function renderToday() {
  var d = load();
  var box = $('planned'); box.textContent = '';
  var plans = d.records.filter(function (r) { return r.status === 'planned'; });
  if (!plans.length) { var e = document.createElement('p'); e.textContent = 'まだ計画がありません。上のフォームから作れます。'; box.appendChild(e); }
  plans.forEach(function (r) {
    var c = document.createElement('div'); c.className = 'card';
    c.appendChild(document.createTextNode(r.subject + '／' + r.task + (r.plannedStart ? '（' + fmtDate(r.plannedStart) + '）' : '')));
    c.appendChild(document.createElement('br'));
    c.appendChild(btn('学習を始める', function () { startRecord(r.id); }));
    c.appendChild(btn('編集', function () { editPlan(r); }));
    c.appendChild(btn('削除', function () { if (confirm('この計画を削除しますか？')) { update(function (d2) { d2.records = d2.records.filter(function (x) { return !(x.id === r.id && x.status === 'planned'); }); }); renderToday(); } }));
    box.appendChild(c);
  });
  // 過去の「次回試すこと」
  var tries = d.records.filter(function (r) { return r.nextTry; }).slice(-3).reverse();
  $('next-box').hidden = !tries.length;
  var nl = $('next-list'); nl.textContent = '';
  tries.forEach(function (r) { nl.appendChild(btn(r.nextTry, function () { $('f-step').value = r.nextTry; })); });
  if (!$('f-when').value) $('f-when').value = localInputValue(new Date());
  renderWeek(d); renderUsual(d);
}
function btn(text, fn) { var b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.onclick = fn; return b; }
function editPlan(r) {
  editingId = r.id;
  $('f-subject').value = r.subject; $('f-task').value = r.task; $('f-step').value = r.firstStep; $('f-end').value = r.endCondition;
  $('f-when').value = r.plannedStart ? localInputValue(new Date(r.plannedStart)) : '';
  $('f-pomo').checked = !!r.pomo; $('f-pw').value = r.pomo ? r.pomo.work : 25; $('f-pb').value = r.pomo ? r.pomo.brk : 5;
  setChips('mp', 'f-mcustom', r.methodsPlanned || []);
  document.querySelectorAll('input[name=pp]').forEach(function (i) { i.checked = (r.prep || []).indexOf(i.value) >= 0; });
  $('f-sleep').value = r.sleepHours === null || r.sleepHours === undefined ? '' : r.sleepHours;
  $('btn-save').textContent = '変更を保存';
}
function readForm(mode) {
  var w = $('f-when').value, pomo = null;
  if ($('f-pomo').checked) {
    var pw = Number($('f-pw').value), pb = Number($('f-pb').value);
    if (!(pw >= 1 && pw <= 180 && pb >= 1 && pb <= 60)) { showErr('作業は1〜180分、休憩は1〜60分で入力してください。'); return null; }
    pomo = { work: Math.round(pw), brk: Math.round(pb) };
  }
  return { prep: getChips('pp', null), sleepHours: $('f-sleep').value === '' ? null : Number($('f-sleep').value),
    methodsPlanned: getChips('mp', 'f-mcustom'), pomo: pomo, subject: $('f-subject').value.trim(), task: $('f-task').value.trim(), firstStep: $('f-step').value.trim(),
    endCondition: $('f-end').value.trim(), startMode: mode, plannedStart: (mode === 'planned' && w) ? new Date(w).toISOString() : null };
}
function submitPlan(mode) {
  var f = $('plan-form');
  if (!f.reportValidity()) return;
  var data = readForm(mode);
  if (!data) return;
  var newId = uid(), ok;
  if (editingId && mode === 'planned') {
    ok = update(function (d) { var r = find(d, editingId); if (!r || r.status !== 'planned') return false; Object.assign(r, data); });
  } else {
    ok = update(function (d) {
      if (mode === 'now' && active(d)) { showErr('すでに学習中です。'); return false; }
      d.records.push(Object.assign({ id: newId, v: FMT, appVersion: APP_VER, status: 'planned', startedAt: null, endedAt: null, pauses: [],
        achievement: null, focus: null, methodsUsed: [], troubleTags: [], leaves: 0, leaveMs: 0, trouble: '', nextTry: '', adjusted: false }, data));
    });
  }
  if (!ok) return;
  editingId = null; f.reset(); $('btn-save').textContent = '計画を保存';
  if (mode === 'now') startRecord(newId); else renderToday();
}

// ===== 2. 学習を始める・止める・終える =====
// 状態: planned → running ⇄ paused → ended（振り返り待ち）→ done
function startRecord(id) {
  var ok = update(function (d) {
    var r = find(d, id);
    if (!r || r.status !== 'planned' || active(d)) return false; // 二重開始・連打を防ぐ
    r.status = 'running'; r.startedAt = nowIso();
    if (r.pomo) r.pomoNext = r.pomo.work * 60000; // 計測時間がこの値になったら区切りを知らせる
  });
  if (ok) { chime('start'); show('run'); } else routeByState();
}
function pauseResume() {
  update(function (d) {
    var r = active(d); if (!r) return false;
    if (r.status === 'running') { r.status = 'paused'; r.pauses.push({ from: nowIso(), to: null, kind: 'manual' }); }
    else { applyPauseFields(r); chime('start'); r.status = 'running'; r.pauses[r.pauses.length - 1].to = nowIso(); }
  });
  renderRun();
}
function finishRecord() {
  update(function (d) {
    var r = active(d); if (!r) return false; // 終了後の再終了は何もしない
    var t = nowIso();
    if (r.status === 'paused') r.pauses[r.pauses.length - 1].to = t;
    r.status = 'ended'; r.endedAt = t;
  });
  routeByState();
}
function renderRun() {
  var d = load(), a = active(d);
  if (!a) return;
  $('r-task').textContent = a.task; $('r-end').textContent = a.endCondition;
  renderDonut(a);
  $('r-state').textContent = a.status === 'paused' ? '一時停止中（この時間は含まれません）' : '学習中';
  $('btn-pause').textContent = a.status === 'paused' ? '再開' : '一時停止';
  renderPomo(a); renderPauseUi(a);
}
// ===== 区切りタイマー（ポモドーロ式） =====
// 休憩は「一時停止（kind:'break'）」として保存するので、休憩中の時間は計測時間に入らない。
// 区切りは画面で知らせるだけ。自動で止めたり、休憩を強制したりしない。
function renderPomo(a) {
  var pm = a.pomo; $('r-pomo').hidden = !pm;
  if (!pm) return;
  var now = Date.now(), last = a.pauses[a.pauses.length - 1], info = $('r-pomo-info'), al = $('r-pomo-alert');
  al.hidden = true;
  if (a.status === 'paused' && last && last.kind === 'break') {
    var left = Date.parse(last.from) + pm.brk * 60000 - now;
    if (left <= 0) alertOnce('b' + last.from, 'end');
    info.textContent = left > 0 ? '休憩中。予定の休憩時間まであと ' + fmtClock(left) : '予定の休憩時間（' + pm.brk + '分）が過ぎました。準備ができたら「再開」を押してください。';
  } else if (a.status === 'running') {
    var rem = a.pomoNext - measuredMs(a, now);
    if (rem <= 0) alertOnce('w' + a.pomoNext, 'end');
    info.textContent = rem > 0 ? '次の区切りまで ' + fmtClock(rem) : '設定した作業時間（' + pm.work + '分）が経ちました。休憩するか、続けるか選べます。';
    al.hidden = rem > 0;
  } else { info.textContent = '一時停止中'; }
}
function startBreak() {
  update(function (d) {
    var r = active(d); if (!r || r.status !== 'running' || !r.pomo) return false;
    r.pauses.push({ from: nowIso(), to: null, kind: 'break' });
    r.status = 'paused';
    r.pomoNext = measuredMs(r, Date.now()) + r.pomo.work * 60000; // 再開後は新しい作業ブロック
  });
  renderRun();
}
function keepGoing() {
  update(function (d) {
    var r = active(d); if (!r || !r.pomo) return false;
    r.pomoNext = measuredMs(r, Date.now()) + r.pomo.work * 60000;
  });
  renderRun();
}
setInterval(function () { if (!$('v-run').hidden) renderRun(); }, 1000);
// 別タブ・画面ロックから戻ったら、保存した時刻から再計算
// スマホから気がそれた回数を、責める意味ではなく「気づくため」に数える（2秒以上画面を離れたとき）
var hiddenAt = 0;
document.addEventListener('visibilitychange', function () {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  var dur = hiddenAt ? Date.now() - hiddenAt : 0; hiddenAt = 0;
  if (dur >= 2000) update(function (d) {
    var r = active(d); if (!r || r.status !== 'running') return false;
    r.leaves = (r.leaves || 0) + 1; r.leaveMs = (r.leaveMs || 0) + dur;
  });
  routeByState(); if (!$('v-run').hidden) setWake(true);
});
window.addEventListener('storage', function (e) { if (e.key === KEY) routeByState(); }); // 他のタブの変更を反映

// ===== 3. 振り返り =====
function buildFocus() {
  var box = $('focus');
  for (var i = 1; i <= 5; i++) {
    var l = document.createElement('label'); l.className = 'r';
    var inp = document.createElement('input'); inp.type = 'radio'; inp.name = 'focus'; inp.value = i; // 初期選択なし
    l.appendChild(inp); l.appendChild(document.createTextNode(String(i))); box.appendChild(l);
  }
}
function submitReflect(ev) {
  ev.preventDefault();
  var ach = document.querySelector('input[name=ach]:checked'), fc = document.querySelector('input[name=focus]:checked');
  var ok = update(function (d) {
    var r = d.records.filter(function (x) { return x.status === 'ended'; })[0]; if (!r) return false;
    r.achievement = ach.value; r.focus = fc ? Number(fc.value) : null; // 未回答はnull（0や3にしない）
    r.methodsUsed = getChips('mu', 'f-ucustom'); r.troubleTags = getChips('tg', null);
    r.trouble = $('f-trouble').value.trim(); r.nextTry = $('f-next').value.trim(); r.status = 'done';
  });
  if (ok) { $('ref-form').reset(); show('log'); showToast(); }
}

// ===== 4. 記録 =====
var ACH = { achieved: '達成', partial: '一部達成', not: '未達成' };
function renderLog() {
  var d = load(), now = Date.now();
  var recs = d.records.filter(function (r) { return r.status === 'done' && (period === 'all' || Date.parse(r.startedAt) >= now - 7 * 864e5); });
  $('p7').setAttribute('aria-pressed', period === '7'); $('pall').setAttribute('aria-pressed', period === 'all');
  var s = $('summary'), l = $('list'); s.textContent = ''; l.textContent = ''; $('insights').textContent = '';
  if (!recs.length) { s.textContent = 'この期間の記録は0件です。学習を終えて振り返りを保存すると、ここに表示されます。'; return; }
  var tot = recs.reduce(function (a, r) { return a + measuredMs(r, now); }, 0);
  var pl = recs.filter(function (r) { return r.startMode === 'planned' && r.plannedStart; }); // 「今から始める」は除く
  var txt = (period === '7' ? '直近7日' : '全期間') + '：' + recs.length + '件／操作記録の合計 ' + Math.round(tot / 60000) + '分';
  if (pl.length) {
    var avg = pl.reduce(function (a, r) { return a + (Date.parse(r.startedAt) - Date.parse(r.plannedStart)); }, 0) / pl.length / 60000;
    txt += '／予定との差（平均、' + pl.length + '件）：' + (avg >= 0 ? Math.round(avg) + '分遅れ' : Math.round(-avg) + '分早め');
  }
  var ac = { achieved: 0, partial: 0, not: 0 }; recs.forEach(function (r) { ac[r.achievement]++; });
  txt += '／達成 ' + ac.achieved + '・一部達成 ' + ac.partial + '・未達成 ' + ac.not;
  s.textContent = txt + '。計測時間はアプリの操作から求めた値で、実際に勉強していた時間を保証しません。';
  renderInsights(recs); renderDayReviews(d);
  recs.slice().reverse().forEach(function (r) {
    var c = document.createElement('div'); c.className = 'card';
    var lines = [r.subject + '／' + r.task, '予定：' + (r.plannedStart ? fmtDate(r.plannedStart) : '（今から始める）') + '　開始：' + fmtDate(r.startedAt),
      '計測 ' + Math.round(measuredMs(r, now) / 60000) + '分　' + ACH[r.achievement] + '　集中：' + (r.focus === null ? '未回答' : r.focus),
      r.methodsUsed && r.methodsUsed.length ? '行った方法：' + r.methodsUsed.join('、') : '',
      resumeText(r),
      r.leaves ? '学習中に画面を離れた回数：' + r.leaves + '回' : '',
      r.pomo ? '区切りタイマー：作業' + r.pomo.work + '分／休憩' + r.pomo.brk + '分、休憩 ' + breaks(r).n + '回' : '',
      r.trouble ? '困ったこと：' + r.trouble : '', r.nextTry ? '次回試すこと：' + r.nextTry : ''];
    lines.filter(Boolean).forEach(function (t) { var p = document.createElement('div'); p.textContent = t; c.appendChild(p); });
    l.appendChild(c);
  });
}

// ===== 5. 書き出し・読み込み・削除 =====
function download(name, text, type) {
  var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}
function stamp() { return new Date().toISOString().slice(0, 10); }
function exportJson() { download('gakushu-' + stamp() + '.json', JSON.stringify(load(), null, 1), 'application/json'); }
function validRecord(r) {
  return r && typeof r.id === 'string' && typeof r.subject === 'string' && typeof r.task === 'string' &&
    ['planned', 'running', 'paused', 'ended', 'done'].indexOf(r.status) >= 0 &&
    (r.startedAt === null || !isNaN(Date.parse(r.startedAt))) && Array.isArray(r.pauses) &&
    (r.pomo == null || (typeof r.pomo.work === 'number' && typeof r.pomo.brk === 'number')) &&
    strArr(r.methodsPlanned) && strArr(r.methodsUsed) && strArr(r.troubleTags) && strArr(r.prep) &&
    r.pauses.every(function (p) { return p && !isNaN(Date.parse(p.from)); });
}
function importJson(file) {
  var fr = new FileReader();
  fr.onload = function () {
    var inc;
    try { inc = JSON.parse(fr.result); } catch (e) { return msg('JSONとして読めませんでした。現在の記録は変わっていません。'); }
    if (!inc || !Array.isArray(inc.records) || !inc.records.every(validRecord)) return msg('このアプリの記録の形式ではありません。現在の記録は変わっていません。');
    var added = 0, same = 0, conflict = 0;
    var ok = update(function (d) {
      inc.records.forEach(function (r) {
        if (r.status === 'running' || r.status === 'paused') return; // 読み込みで計測中の状態は持ち込まない
        var cur = find(d, r.id);
        if (!cur) { d.records.push(r); added++; }
        else if (JSON.stringify(cur) === JSON.stringify(r)) same++;
        else conflict++; // 同じIDで内容が違う→上書きしない
      });
      mergeDays(d, inc.days); // タスクと1日の振り返りも統合（同じIDは追加しない）
    });
    if (ok) { msg('追加 ' + added + '件／同じ記録 ' + same + '件／IDが重複して内容が違うため追加しなかった ' + conflict + '件'); }
  };
  fr.readAsText(file);
}
function msg(t) { $('data-msg').textContent = t; }

var COLS = [ // [キー, 列名, 初期で含める?, 取り出し方]
  ['id', 'id', 1, function (r) { return r.id; }],
  ['subject', 'subject', 1, function (r) { return r.subject; }],
  ['mode', 'start_mode', 1, function (r) { return r.startMode; }],
  ['plan', 'planned_start_iso', 1, function (r) { return r.plannedStart || ''; }],
  ['st', 'started_at_iso', 1, function (r) { return r.startedAt || ''; }],
  ['en', 'ended_at_iso', 1, function (r) { return r.endedAt || ''; }],
  ['min', 'measured_minutes', 1, function (r) { return r.endedAt ? (measuredMs(r, 0) / 60000).toFixed(1) : ''; }],
  ['late', 'start_diff_minutes(+遅れ/-早め)', 1, function (r) { return (r.startMode === 'planned' && r.plannedStart && r.startedAt) ? ((Date.parse(r.startedAt) - Date.parse(r.plannedStart)) / 60000).toFixed(1) : ''; }],
  ['ach', 'achievement', 1, function (r) { return r.achievement || ''; }],
  ['foc', 'focus_1to5', 1, function (r) { return r.focus === null ? '' : r.focus; }],
  ['pw', 'pomo_work_minutes_set', 1, function (r) { return r.pomo ? r.pomo.work : ''; }],
  ['pb', 'pomo_break_minutes_set', 1, function (r) { return r.pomo ? r.pomo.brk : ''; }],
  ['bn', 'break_count', 1, function (r) { return r.pomo ? breaks(r).n : ''; }],
  ['bm', 'break_minutes', 1, function (r) { return r.pomo ? (breaks(r).ms / 60000).toFixed(1) : ''; }],
  ['slp', 'sleep_hours_prev_night', 1, function (r) { return r.sleepHours === null || r.sleepHours === undefined ? '' : r.sleepHours; }],
  ['lv', 'screen_leave_count', 1, function (r) { return r.leaves || 0; }],
  ['lvs', 'screen_leave_seconds', 1, function (r) { return Math.round((r.leaveMs || 0) / 1000); }],
  ['ppc', 'prep_checked', 1, function (r) { return (r.prep || []).join('|'); }],
  ['mpl', 'methods_planned', 1, function (r) { return presets(r.methodsPlanned); }],
  ['mus', 'methods_used', 1, function (r) { return presets(r.methodsUsed); }],
  ['tag', 'trouble_tags', 1, function (r) { return (r.troubleTags || []).join('|'); }],
  ['rc', 'resume_planned_count', 1, function (r) { return resumeDiffs(r).length; }],
  ['rd', 'resume_diff_minutes_mean(+遅れ/-早め)', 1, function (r) { var d = resumeDiffs(r); return d.length ? (d.reduce(function (a, b) { return a + b; }, 0) / d.length).toFixed(1) : ''; }],
  ['mcu', 'methods_custom（自由記述）', 0, function (r) { return (r.methodsPlanned || []).concat(r.methodsUsed || []).filter(function (m) { return METHODS.indexOf(m) < 0; }).join('|'); }],
  ['task', 'task（自由記述）', 0, function (r) { return r.task; }],
  ['step', 'first_step（自由記述）', 0, function (r) { return r.firstStep; }],
  ['cond', 'end_condition（自由記述）', 0, function (r) { return r.endCondition; }],
  ['tro', 'trouble（自由記述）', 0, function (r) { return r.trouble; }],
  ['nxt', 'next_try（自由記述）', 0, function (r) { return r.nextTry; }]
];
// 休憩（kind:'break' の一時停止）の回数と合計時間
function breaks(r) {
  var n = 0, ms = 0, end = r.endedAt ? Date.parse(r.endedAt) : Date.now();
  (r.pauses || []).forEach(function (p) { if (p.kind === 'break') { n++; ms += (p.to ? Date.parse(p.to) : end) - Date.parse(p.from); } });
  return { n: n, ms: ms };
}
function csvCell(v) {
  v = String(v);
  if (/^[=+\-@\t\r]/.test(v) && isNaN(Number(v))) v = "'" + v; // 表計算で数式にならないようにする
  return '"' + v.replace(/"/g, '""') + '"';
}
function exportCsv() {
  var cols = COLS.filter(function (c) { return $('c-' + c[0]).checked; });
  var rows = [cols.map(function (c) { return csvCell(c[1]); }).join(',')];
  load().records.filter(function (r) { return r.status === 'done'; }).forEach(function (r) {
    rows.push(cols.map(function (c) { return csvCell(c[3](r)); }).join(','));
  });
  download('gakushu-' + stamp() + '.csv', '\ufeff' + rows.join('\r\n'), 'text/csv'); // BOM付きでExcelの文字化けを防ぐ
}
function buildCsvOpts() {
  COLS.forEach(function (c) {
    var l = document.createElement('label'); l.className = 'opt';
    var i = document.createElement('input'); i.type = 'checkbox'; i.id = 'c-' + c[0]; i.checked = !!c[2];
    l.appendChild(i); l.appendChild(document.createTextNode(c[1])); $('csv-opts').appendChild(l);
  });
}
function deleteAll() {
  if (!confirm('このアプリの記録をすべて削除します。元に戻せません。先にJSONで書き出しておくと安心です。削除しますか？')) return;
  try { localStorage.removeItem(KEY); localStorage.removeItem(PK); blocked = false; msg('削除しました。'); } catch (e) { showErr('削除できませんでした。'); }
}

// ===== 学習方法・困りごと・再開支援 =====
// 方法や困りごとは「選んだ記録」を数えるだけ。効果の判定や学習タイプの診断はしない。
var METHODS = ['何も見ずに思い出す', '問題を解く', '間違えた問題を解き直す', '説明を読む', '自分の言葉で説明する'];
var TAGS = ['何から始めるか分からない', '勉強法が分からない', '始めるまでに時間がかかった', '集中が続かない', '眠気・疲れ',
  '音や周りが気になる', 'スマホ・動画が気になった', '休憩後に戻りにくかった', '覚えにくい'];
function strArr(x) { return x == null || (Array.isArray(x) && x.every(function (s) { return typeof s === 'string'; })); }
function presets(a) { return (a || []).filter(function (m) { return METHODS.indexOf(m) >= 0; }).join('|'); }
function buildChips(boxId, name, list) {
  list.forEach(function (t) {
    var l = document.createElement('label'); l.className = 'r';
    var i = document.createElement('input'); i.type = 'checkbox'; i.name = name; i.value = t;
    l.appendChild(i); l.appendChild(document.createTextNode(t)); $(boxId).appendChild(l);
  });
}
function getChips(name, customId) {
  var out = [];
  document.querySelectorAll('input[name=' + name + ']:checked').forEach(function (i) { out.push(i.value); });
  if (customId) $(customId).value.split(/[,、，]/).forEach(function (t) {
    t = t.trim().slice(0, 30); if (t && out.indexOf(t) < 0 && out.length < 12) out.push(t);
  });
  return out;
}
function setChips(name, customId, vals) {
  document.querySelectorAll('input[name=' + name + ']').forEach(function (i) { i.checked = vals.indexOf(i.value) >= 0; });
  $(customId).value = vals.filter(function (v) { return METHODS.indexOf(v) < 0; }).join('、');
}
// 再開支援：休憩・一時停止の記録（pauses の最後）に「最初にすること」「再開予定」を持たせる。
// 実際の再開日時は pause.to に入る。予定との差は「予定がある場合だけ」計算する。
function lastPause(r) { return r.pauses[r.pauses.length - 1]; }
function renderPauseUi(a) {
  var p = lastPause(a), panel = $('r-paused');
  $('r-methods').textContent = (a.methodsPlanned && a.methodsPlanned.length) ? '今回試す方法：' + a.methodsPlanned.join('、') : '';
  $('r-resume').textContent = (a.status === 'running' && p && p.resumeStep) ? '再開したら最初に：' + p.resumeStep : '';
  if (a.status === 'paused' && p) {
    if (panel.hidden) { // 開いた直後だけ保存済みの値を入れる（入力中は上書きしない）
      $('f-rstep').value = p.resumeStep || '';
      $('f-rat').value = p.resumeAt ? new Date(p.resumeAt).toTimeString().slice(0, 5) : '';
      $('f-rbrk').value = a.pomo ? a.pomo.brk : '';
    }
    $('rb-wrap').hidden = !a.pomo; panel.hidden = false;
  } else panel.hidden = true;
}
function applyPauseFields(r) {
  var p = lastPause(r); if (!p) return;
  p.resumeStep = $('f-rstep').value.trim().slice(0, 80);
  var t = $('f-rat').value; // 「時:分」を、一時停止を始めた日の日時に直す
  if (t) {
    var d = new Date(p.from), hm = t.split(':'); d.setHours(Number(hm[0]), Number(hm[1]), 0, 0);
    if (d.getTime() < Date.parse(p.from)) d.setDate(d.getDate() + 1); // 過ぎた時刻なら翌日
    p.resumeAt = d.toISOString();
  } else p.resumeAt = null;
  var b = Number($('f-rbrk').value);
  if (r.pomo && b >= 1 && b <= 60) r.pomo.brk = Math.round(b); // 休憩時間は利用者が変えられる
}
function savePauseFields() { update(function (d) { var r = active(d); if (!r || r.status !== 'paused') return false; applyPauseFields(r); }); }
function resumeDiffs(r) { // 分。+は遅れ、-は早め。終了で閉じた一時停止は「再開」ではないので除く
  return (r.pauses || []).filter(function (p) { return p.resumeAt && p.to && p.to !== r.endedAt; })
    .map(function (p) { return (Date.parse(p.to) - Date.parse(p.resumeAt)) / 60000; });
}
function resumeText(r) {
  var ds = resumeDiffs(r); if (!ds.length) return '';
  return '再開予定との差：' + ds.map(function (m) { return m >= 0 ? Math.round(m) + '分遅れ' : Math.round(-m) + '分早め'; }).join('、');
}
function renderInsights(recs) {
  var box = $('insights'), m = {}, tags = {};
  function add(tag, text, cls) { var e = document.createElement(tag); if (cls) e.className = cls; e.textContent = text; box.appendChild(e); return e; }
  recs.forEach(function (r) {
    (r.methodsUsed || []).forEach(function (n) {
      var e = m[n] || (m[n] = { n: 0, subj: {}, tasks: {} });
      e.n++; e.subj[r.subject] = (e.subj[r.subject] || 0) + 1; e.tasks[r.task] = 1;
    });
    (r.troubleTags || []).forEach(function (t) { tags[t] = (tags[t] || 0) + 1; });
  });
  var names = Object.keys(m).sort(function (a, b) { return m[b].n - m[a].n; });
  if (names.length) {
    add('h3', '方法別の履歴');
    add('p', '選んだ方法ごとの件数です。教科や課題が違うため、方法どうしを単純に比べたり、良し悪しを決めたりはしません。', 'hint');
    names.forEach(function (n) {
      var e = m[n];
      add('div', n + '：' + e.n + '件／教科：' + Object.keys(e.subj).map(function (k) { return k + e.subj[k]; }).join('、') + '／課題：' + Object.keys(e.tasks).length + '種類', 'card');
    });
  }
  var tn = Object.keys(tags).sort(function (a, b) { return tags[b] - tags[a]; });
  if (tn.length) {
    add('h3', '困りごと（複数選択の件数）');
    add('div', tn.map(function (t) { return t + ' ' + tags[t]; }).join('／'), 'card');
  }
}

// ===== 集中・音・見た目の工夫 =====
var PREP = ['スマホを見えない所に置いた', '通知を切った', '机の上を片づけた', '飲み物を用意した'];
var TPL = [ // 「何から始めるか分からない」ときの出発点。効果の保証はしない
  { t: '5分・思い出す', task: 'さっき習ったこと', step: '教科書を閉じて、覚えたことを紙に書き出す', end: '5分たったら見直して、合っているか確かめる', m: ['何も見ずに思い出す'] },
  { t: '10分・解き直す', task: '前に間違えた問題', step: '間違えた問題を1問選ぶ', end: '何も見ずに解き直せたら終わり', m: ['間違えた問題を解き直す'] },
  { t: '10分・説明する', task: '今日の授業のポイント', step: '友だちに話すつもりで声に出す', end: '3文で説明できたら終わり', m: ['自分の言葉で説明する'] },
  { t: '15分・まず1問', task: '問題集', step: 'いちばん簡単な問題を1問だけ解く', end: '3問解いて答えを確認する', m: ['問題を解く'] }
];
function buildTemplates() {
  TPL.forEach(function (t) {
    $('tpl').appendChild(btn(t.t, function () {
      $('f-task').value = t.task; $('f-step').value = t.step; $('f-end').value = t.end;
      setChips('mp', 'f-mcustom', t.m); $('f-subject').focus();
    }));
  });
}
// 直近7日の積み上げ。0分の日は責めずに「灰色の棒」で表すだけ（連続記録の罰はない）
function renderWeek(d) {
  var box = $('week'); box.textContent = ''; var days = [], now = new Date(), total = 0, n = 0;
  for (var i = 6; i >= 0; i--) days.push({ d: new Date(now.getFullYear(), now.getMonth(), now.getDate() - i), ms: 0 });
  d.records.forEach(function (r) {
    if (r.status !== 'done') return;
    var s = new Date(r.startedAt).toDateString();
    days.forEach(function (y) { if (y.d.toDateString() === s) y.ms += measuredMs(r, 0); });
  });
  var max = Math.max(20 * 60000, Math.max.apply(null, days.map(function (y) { return y.ms; })));
  days.forEach(function (y) {
    total += y.ms; if (y.ms) n++;
    var c = document.createElement('div'); c.className = 'wk';
    var bar = document.createElement('div'); bar.className = 'bar' + (y.ms ? ' on' : ''); bar.style.height = Math.max(4, Math.round(y.ms / max * 56)) + 'px';
    var t = document.createElement('span'); t.textContent = '日月火水木金土'.charAt(y.d.getDay());
    c.appendChild(bar); c.appendChild(t); box.appendChild(c);
  });
  var p = document.createElement('p'); p.className = 'hint wide';
  p.textContent = n ? '直近7日：' + n + '日・操作記録で合計' + Math.round(total / 60000) + '分。短い日も、ちゃんと積み上がっています。' : 'まだ記録がありません。今日が最初の一歩になります。';
  box.appendChild(p);
}
// 「いつもの開始時刻」：同じ時刻に始める習慣づくりの手助け（予定を2回以上つくると出る）
function renderUsual(d) {
  var box = $('usual'); box.textContent = ''; var c = {}, best = null;
  d.records.forEach(function (r) {
    if (r.startMode !== 'planned' || !r.plannedStart) return;
    var t = new Date(r.plannedStart).toTimeString().slice(0, 5); c[t] = (c[t] || 0) + 1;
    if (c[t] >= 2 && (!best || c[t] > c[best])) best = t;
  });
  if (best) box.appendChild(btn('いつもの時刻 ' + best + ' にする', function () {
    var n = new Date(), h = best.split(':'); n.setHours(Number(h[0]), Number(h[1]), 0, 0); $('f-when').value = localInputValue(n);
  }));
}
function renderLeaveNote() {
  var r = load().records.filter(function (x) { return x.status === 'ended'; })[0];
  $('leave-note').textContent = !r ? '' : (r.leaves ? '学習中に画面を離れた回数：' + r.leaves + '回。気づけたことが次の工夫につながります（責める意味はありません）。' : '学習中、画面を離れませんでした。');
}
function showToast() {
  var d = load(), now = new Date().toDateString(), ms = 0;
  d.records.forEach(function (r) { if (r.status === 'done' && new Date(r.startedAt).toDateString() === now) ms += measuredMs(r, 0); });
  $('toast').textContent = '保存しました。今日は操作記録で合計' + Math.round(ms / 60000) + '分。始められたことが、いちばんの一歩です。';
  $('toast').hidden = false;
}
// ドーナツ：休憩中・作業中は区切りの進み具合、区切りなしのときは1分ごとに一周
function renderDonut(a) {
  var now = Date.now(), ms = measuredMs(a, now), pm = a.pomo, last = a.pauses[a.pauses.length - 1];
  var main = ms, frac = (ms % 60000) / 60000, phase = a.status === 'paused' ? '一時停止中' : '学習中', brk = false;
  if (pm && a.status === 'paused' && last && last.kind === 'break') {
    var tb = pm.brk * 60000, lb = Math.max(0, Date.parse(last.from) + tb - now);
    main = lb; frac = 1 - lb / tb; phase = '休憩中'; brk = true;
  } else if (pm && a.status === 'running') {
    var tw = pm.work * 60000, rem = Math.max(0, a.pomoNext - ms);
    main = rem; frac = 1 - Math.min(1, rem / tw); phase = '作業中';
  }
  $('ring').setAttribute('stroke-dasharray', (frac * 100).toFixed(2) + ' 100');
  $('ring').setAttribute('class', 'bar' + (brk ? ' brk' : ''));
  $('r-time').textContent = fmtClock(main); $('r-phase').textContent = phase;
  $('r-total').textContent = '計測時間 ' + fmtClock(ms);
}
function tickClock() { $('now-clock').textContent = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
// 音：Web Audioで短い音を鳴らす（音声ファイル不要）。画面を一度さわった後に鳴る
var SK = 'gakushu-shien:sound', AC = null, lastAlert = '';
function audioOn() { try { return localStorage.getItem(SK) !== 'off'; } catch (e) { return true; } }
function initAudio() { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch (e) {} }
function chime(kind) { // start：上がる2音／end：3回
  if (!audioOn()) return; initAudio(); if (!AC) return;
  var seq = kind === 'start' ? [[660, 0], [880, 0.18]] : [[880, 0], [880, 0.3], [660, 0.6]];
  seq.forEach(function (n) {
    var o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime + n[1];
    o.type = 'sine'; o.frequency.value = n[0];
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + 0.3);
  });
  if (navigator.vibrate) navigator.vibrate(kind === 'start' ? 100 : [150, 80, 150]);
}
function alertOnce(key, kind) { if (lastAlert === key) return; lastAlert = key; chime(kind); } // 同じ区切りで何度も鳴らさない
function initSound() {
  var lab = function () { $('b-sound').textContent = audioOn() ? '音：オン' : '音：オフ'; };
  $('b-sound').onclick = function () { try { localStorage.setItem(SK, audioOn() ? 'off' : 'on'); } catch (e) {} lab(); if (audioOn()) chime('start'); };
  document.addEventListener('pointerdown', initAudio); lab();
}
// 学習中は画面を点けたままにして、スマホを触らずに済むようにする（使えない端末では何もしない）
var wake = null;
function setWake(on) {
  try {
    if (on && navigator.wakeLock && !wake) navigator.wakeLock.request('screen').then(function (w) { wake = w; w.addEventListener('release', function () { wake = null; }); }).catch(function () {});
    if (!on && wake) { wake.release(); wake = null; }
  } catch (e) {}
}

// ===== 今日のタスク・優先度・1日の振り返り =====
// d.days['YYYY-MM-DD'] = { tasks:[{id,title,subject,priority(1高/2中/3低),done,doneAt,order}], review:{good,next,at} }
var PL = ['', '高', '中', '低'];
function p2(n) { return (n < 10 ? '0' : '') + n; }
function dayKey(t) { var d = t ? new Date(t) : new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
function daysAgo(n) { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() - n); }
function getDay(d, k) { d.days = d.days || {}; return d.days[k] || (d.days[k] = { tasks: [], review: null }); }
function sortTasks(ts) { return ts.slice().sort(function (a, b) { return a.priority - b.priority || a.order - b.order; }); } // 優先度の高い順
function validTask(t) { return t && typeof t.id === 'string' && typeof t.title === 'string' && t.title.length <= 100 && t.priority >= 1 && t.priority <= 3 && typeof t.done === 'boolean'; }
function mergeDays(d, days) {
  if (!days || typeof days !== 'object') return;
  Object.keys(days).forEach(function (k) {
    var s = days[k]; if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !s || !Array.isArray(s.tasks)) return;
    var cur = getDay(d, k);
    s.tasks.forEach(function (t) { if (validTask(t) && !cur.tasks.some(function (x) { return x.id === t.id; })) cur.tasks.push(t); });
    if (!cur.review && s.review && typeof s.review.good === 'string' && typeof s.review.next === 'string') cur.review = s.review;
  });
}
function progressEl(done, total) {
  var w = document.createElement('div'), p = document.createElement('div'), i = document.createElement('i'), t = document.createElement('p');
  p.className = 'prog'; p.setAttribute('role', 'progressbar'); p.setAttribute('aria-valuemin', 0); p.setAttribute('aria-valuemax', total); p.setAttribute('aria-valuenow', done);
  i.style.width = (total ? Math.round(done / total * 100) : 0) + '%'; p.appendChild(i);
  t.textContent = total ? '進み具合：' + done + ' / ' + total + ' 完了' : 'タスクはまだありません'; t.style.margin = '0';
  w.appendChild(t); w.appendChild(p); return w;
}
function taskRow(t, full) {
  var c = document.createElement('div'); c.className = 'card';
  var l = document.createElement('label'); l.className = 'tk' + (t.done ? ' done' : '');
  var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = t.done; cb.onchange = function () { toggleTask(t.id); };
  var s = document.createElement('span'); s.className = 't'; s.textContent = t.title + (t.subject ? '（' + t.subject + '）' : '');
  var pr = document.createElement('span'); pr.className = 'pr pr' + t.priority; pr.textContent = '優先度：' + PL[t.priority];
  l.appendChild(cb); l.appendChild(s); l.appendChild(pr); c.appendChild(l);
  if (full) {
    c.appendChild(btn('優先度を変える', function () { cyclePrio(t.id); }));
    if (!t.done) c.appendChild(btn('これで学習する', function () { useForStudy(t); }));
    c.appendChild(btn('削除', function () { if (confirm('このタスクを削除しますか？')) delTask(t.id); }));
  }
  return c;
}
function todayTasks(d) { return getDay(d, dayKey()).tasks; }
function mutateTask(id, fn) { update(function (d) { var t = todayTasks(d).filter(function (x) { return x.id === id; })[0]; if (!t) return false; fn(t); }); renderTaskList(); renderRunTasks(); }
function toggleTask(id) { mutateTask(id, function (t) { t.done = !t.done; t.doneAt = t.done ? nowIso() : null; }); }
function cyclePrio(id) { mutateTask(id, function (t) { t.priority = t.priority % 3 + 1; }); }
function delTask(id) { update(function (d) { var day = getDay(d, dayKey()); day.tasks = day.tasks.filter(function (x) { return x.id !== id; }); }); renderTaskList(); }
function useForStudy(t) { show('today'); $('f-subject').value = t.subject || $('f-subject').value; $('f-task').value = t.title; $('f-step').focus(); }
function addTask() {
  var f = $('task-form'); if (!f.reportValidity()) return;
  var pr = Number(document.querySelector('input[name=prio]:checked').value);
  var ok = update(function (d) {
    var day = getDay(d, dayKey());
    if (day.tasks.length >= 30) { showErr('1日に追加できるタスクは30個までです。'); return false; }
    day.tasks.push({ id: uid(), title: $('t-title').value.trim(), subject: $('t-subject').value.trim(), priority: pr, done: false, doneAt: null, order: Date.now() });
  });
  if (ok) { $('t-title').value = ''; renderTaskList(); $('t-title').focus(); }
}
function carryOver() {
  update(function (d) {
    var src = d.days && d.days[dayKey(daysAgo(1))]; if (!src) return false;
    var day = getDay(d, dayKey());
    src.tasks.filter(function (x) { return !x.done; }).forEach(function (x, i) {
      if (day.tasks.length < 30 && !day.tasks.some(function (z) { return z.title === x.title; }))
        day.tasks.push({ id: uid(), title: x.title, subject: x.subject, priority: x.priority, done: false, doneAt: null, order: Date.now() + i });
    });
  });
  renderTaskList();
}
function renderTaskList() {
  var d = load(), ts = sortTasks(todayTasks(d)), box = $('t-list'); box.textContent = '';
  var done = ts.filter(function (t) { return t.done; }).length;
  box.appendChild(progressEl(done, ts.length));
  ts.forEach(function (t) { box.appendChild(taskRow(t, true)); });
  var y = d.days && d.days[dayKey(daysAgo(1))], left = y ? y.tasks.filter(function (x) { return !x.done; }).length : 0;
  $('t-carry').textContent = '';
  if (left) $('t-carry').appendChild(btn('昨日の残り ' + left + ' 件を今日に持ち越す', carryOver));
  var now = new Date().toDateString(), ms = 0, n = 0;
  d.records.forEach(function (r) { if (r.status === 'done' && new Date(r.startedAt).toDateString() === now) { ms += measuredMs(r, 0); n++; } });
  $('rv-stat').textContent = 'タスク ' + done + '/' + ts.length + ' 完了／今日の学習 ' + n + '回・操作記録で合計' + Math.round(ms / 60000) + '分';
}
function renderRunTasks() { // 学習中：残りのタスクをチェックで消していく
  var box = $('r-tasks'); box.textContent = '';
  var ts = sortTasks(todayTasks(load())); if (!ts.length) return;
  var rest = ts.filter(function (t) { return !t.done; });
  box.appendChild(progressEl(ts.length - rest.length, ts.length));
  if (!rest.length) { var p = document.createElement('p'); p.textContent = '今日のタスクは全部終わりました。'; box.appendChild(p); }
  rest.forEach(function (t) { box.appendChild(taskRow(t, false)); });
}
function renderTasksView() {
  $('t-date').textContent = new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' }) + '　まず、今日やりたいことを書き出して、優先度を決めましょう。';
  var r = getDay(load(), dayKey()).review;
  $('rv-good').value = r ? r.good : ''; $('rv-next').value = r ? r.next : ''; $('rv-msg').textContent = '';
  renderTaskList();
}
function saveReview(e) {
  e.preventDefault();
  var g = $('rv-good').value.trim(), n = $('rv-next').value.trim();
  if (!g && !n) { $('rv-msg').textContent = 'どちらか1つでも書くと保存できます。'; return; }
  var ok = update(function (d) { getDay(d, dayKey()).review = { good: g, next: n, at: nowIso() }; });
  if (ok) $('rv-msg').textContent = '保存しました。おつかれさま。';
}
function renderDayReviews(d) {
  var keys = Object.keys(d.days || {}).filter(function (k) {
    var v = d.days[k].review; return v && (v.good || v.next) && (period === 'all' || Date.parse(k) >= Date.now() - 7 * 864e5);
  }).sort().reverse();
  if (!keys.length) return;
  var box = $('insights'), h = document.createElement('h3'); h.textContent = '1日の振り返り'; box.appendChild(h);
  keys.forEach(function (k) {
    var v = d.days[k].review, c = document.createElement('div'); c.className = 'card';
    c.textContent = k + '　できたこと：' + (v.good || '―') + '／明日に生かすこと：' + (v.next || '―'); box.appendChild(c);
  });
}
function initTasks() {
  $('task-form').onsubmit = function (e) { e.preventDefault(); addTask(); };
  $('rv-form').onsubmit = saveReview;
  $('pc-make').onclick = exportCard;
  $('pc-import').onchange = function (e) { if (e.target.files[0]) importCard(e.target.files[0]); e.target.value = ''; };
}

// ===== 仲間の状況カード =====
// サーバーなし。本人が書き出したカード（ファイル）を、見る人が読み込む。順位づけはしない。
var PK = 'gakushu-shien:peers', CK = 'gakushu-shien:cardid';
function loadPeers() { try { var a = JSON.parse(localStorage.getItem(PK) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function savePeers(a) { try { localStorage.setItem(PK, JSON.stringify(a)); return true; } catch (e) { showErr('保存できませんでした。ブラウザの設定を確認してください。'); return false; } }
function myCardId() { try { var v = localStorage.getItem(CK); if (!v) { v = uid(); localStorage.setItem(CK, v); } return v; } catch (e) { return 'local'; } }
function makeCard(name) {
  var d = load(), days = [];
  for (var i = 6; i >= 0; i--) days.push({ d: dayKey(daysAgo(i)), min: 0 });
  d.records.forEach(function (r) {
    if (r.status !== 'done') return;
    var k = dayKey(r.startedAt); days.forEach(function (y) { if (y.d === k) y.min += measuredMs(r, 0) / 60000; });
  });
  days.forEach(function (y) { y.min = Math.round(y.min); });
  var ts = todayTasks(d);
  return { kind: 'gakushu-card', v: 1, id: myCardId(), name: (name || '').trim().slice(0, 12) || '名無し', made: nowIso(), days: days,
    taskDone: ts.filter(function (t) { return t.done; }).length, taskTotal: ts.length };
}
function exportCard() { var c = makeCard($('pc-name').value); download('card-' + stamp() + '.json', JSON.stringify(c), 'application/json'); renderPeers(); }
function cleanCard(c) { // 形式を検査し、必要な項目だけ作り直す（余計な項目は捨てる）
  var num = function (x, max) { return typeof x === 'number' && x >= 0 && x <= max && isFinite(x); };
  if (!c || c.kind !== 'gakushu-card' || c.v !== 1 || typeof c.id !== 'string' || c.id.length > 64 || typeof c.name !== 'string' || isNaN(Date.parse(c.made))) return null;
  if (!Array.isArray(c.days) || !c.days.length || c.days.length > 7 || !num(c.taskDone, 99) || !num(c.taskTotal, 99)) return null;
  for (var i = 0; i < c.days.length; i++) if (!c.days[i] || !/^\d{4}-\d{2}-\d{2}$/.test(c.days[i].d) || !num(c.days[i].min, 1440)) return null;
  return { id: c.id, name: c.name.slice(0, 12) || '名無し', made: c.made, taskDone: c.taskDone, taskTotal: c.taskTotal,
    days: c.days.map(function (y) { return { d: y.d, min: Math.round(y.min) }; }) };
}
function importCard(file) {
  var fr = new FileReader();
  fr.onload = function () {
    var raw, c;
    try { raw = JSON.parse(fr.result); } catch (e) { $('pc-msg').textContent = 'カードとして読めませんでした。'; return; }
    c = cleanCard(raw);
    if (!c) { $('pc-msg').textContent = '状況カードの形式ではありません。'; return; }
    if (c.id === myCardId()) { $('pc-msg').textContent = '自分のカードです。'; return; }
    var a = loadPeers().filter(function (x) { return x.id !== c.id; }); // 同じ人のカードは新しいもので置き換える
    if (a.length >= 20) { $('pc-msg').textContent = '読み込めるのは20人分までです。不要なカードを削除してください。'; return; }
    a.push(c); if (savePeers(a)) { $('pc-msg').textContent = c.name + ' さんのカードを読み込みました。'; renderPeers(); }
  };
  fr.readAsText(file);
}
function cardEl(c, mine) {
  var el = document.createElement('div'); el.className = 'card';
  var h = document.createElement('div'); h.style.fontWeight = '700';
  var ago = Math.floor((Date.now() - Date.parse(c.made)) / 864e5);
  h.textContent = c.name + (mine ? '（自分）' : '') + '　' + (ago <= 0 ? '今日のカード' : ago + '日前のカード'); el.appendChild(h);
  var w = document.createElement('div'); w.className = 'week';
  var max = Math.max(20, Math.max.apply(null, c.days.map(function (y) { return y.min; }))), tot = 0, n = 0;
  c.days.forEach(function (y) {
    tot += y.min; if (y.min) n++;
    var col = document.createElement('div'); col.className = 'wk';
    var bar = document.createElement('div'); bar.className = 'bar' + (y.min ? ' on' : ''); bar.style.height = Math.max(4, Math.round(y.min / max * 48)) + 'px';
    var t = document.createElement('span'); t.textContent = '日月火水木金土'.charAt(new Date(y.d + 'T00:00:00').getDay());
    col.appendChild(bar); col.appendChild(t); w.appendChild(col);
  });
  el.appendChild(w);
  var p = document.createElement('div'); p.textContent = n + '日・合計' + tot + '分／カード作成日のタスク ' + c.taskDone + '/' + c.taskTotal + ' 完了'; el.appendChild(p);
  return el;
}
function renderPeers() {
  var box = $('pc-list'); box.textContent = '';
  var mine = makeCard($('pc-name').value); box.appendChild(cardEl(mine, true));
  var a = loadPeers().sort(function (x, y) { return Date.parse(y.made) - Date.parse(x.made); });
  if (!a.length) { var p = document.createElement('p'); p.textContent = 'まだ仲間のカードはありません。友だちにカードを書き出してもらい、ここで読み込みましょう。'; box.appendChild(p); }
  a.forEach(function (c) {
    var el = cardEl(c, false);
    el.appendChild(btn('このカードを削除', function () { savePeers(loadPeers().filter(function (x) { return x.id !== c.id; })); renderPeers(); }));
    box.appendChild(el);
  });
}

// ===== 起動 =====
document.querySelectorAll('[data-go]').forEach(function (b) { b.onclick = function () { show(b.dataset.go); }; });
$('plan-form').onsubmit = function (e) { e.preventDefault(); submitPlan('planned'); };
$('btn-now').onclick = function () { submitPlan('now'); };
$('btn-pause').onclick = pauseResume; $('pm-break').onclick = startBreak; $('pm-go').onclick = keepGoing; $('btn-finish').onclick = finishRecord;
$('ref-form').onsubmit = submitReflect;
$('p7').onclick = function () { period = '7'; renderLog(); }; $('pall').onclick = function () { period = 'all'; renderLog(); };
$('b-json').onclick = exportJson; $('b-csv').onclick = exportCsv; $('b-del').onclick = deleteAll;
$('b-import').onchange = function (e) { if (e.target.files[0]) importJson(e.target.files[0]); e.target.value = ''; };
buildChips('ch-prep', 'pp', PREP); buildTemplates(); initSound(); tickClock(); setInterval(tickClock, 1000);
buildChips('ch-plan', 'mp', METHODS); buildChips('ch-used', 'mu', METHODS); buildChips('ch-trouble', 'tg', TAGS);
['f-rstep', 'f-rat', 'f-rbrk'].forEach(function (id) { $(id).onchange = savePauseFields; });
initTasks(); buildFocus(); buildCsvOpts(); routeByState(true);
