
'use strict';

const STORAGE_KEY = 'jee-os-one-shot-v1';
const DATA_URL = './one-shots.json';
const SUPABASE_URL = 'https://bztsnkejidzjjlaghtly.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Cef2U5pCDcDJp9DUpe36KA_8DrAetWc';
const supabaseClient = (window.supabase && window.supabase.createClient)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;
const REVISION_CYCLES = [
  { days: 1, label: 'R1 · 1 day' },
  { days: 3, label: 'R2 · 3 days' },
  { days: 7, label: 'R3 · 7 days' },
  { days: 14, label: 'R4 · 14 days' },
  { days: 30, label: 'R5 · 30 days' }
];
const TABS = [
  ['dashboard', 'Dashboard'],
  ['planner', 'Planner'],
  ['calendar', 'Calendar'],
  ['one-shots', 'One-Shots'],
  ['revision', 'Revision'],
  ['settings', 'Settings']
];

let curriculum = [];
let S = defaultState();
let cloudUser = null;
let cloudReady = false;
let cloudMsg = 'Local progress is saved in this browser.';
let cloudTimer = null;
let booted = false;

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function fromISO(s) {
  const [y,m,d] = String(s || todayISO()).split('-').map(Number);
  return new Date(y, (m || 1)-1, d || 1);
}
function addDays(iso, days) {
  const d = fromISO(iso); d.setDate(d.getDate() + days); return isoDate(d);
}
function daysBetween(a, b) {
  return Math.round((fromISO(b) - fromISO(a)) / 86400000);
}
function monthFirst(iso) { return `${String(iso || todayISO()).slice(0,7)}-01`; }
function monthShift(iso, n) {
  const d = fromISO(monthFirst(iso)); d.setMonth(d.getMonth()+n); return monthFirst(isoDate(d));
}
function validISO(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s||'')) && !Number.isNaN(fromISO(s).getTime()); }
function formatDate(iso, options) {
  if (!validISO(iso)) return '—';
  return fromISO(iso).toLocaleDateString('en-IN', options || { day:'numeric', month:'short', year:'numeric' });
}
function weekday(iso) { return fromISO(iso).toLocaleDateString('en-IN', {weekday:'long'}); }
function htmlEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[ch]);
}
function percent(a,b) { return b ? Math.round(100*a/b) : 0; }
function clamp(n, lo, hi) { n = Number(n); return Number.isFinite(n) ? Math.min(hi,Math.max(lo,n)) : lo; }
function defaultState() {
  const t = todayISO();
  return {
    version: 2, updatedAt: '', completed: {}, notes: {}, revisionDone: {}, revisionSnooze: {},
    planStart: t, theme: 'dark', tab: 'dashboard', plannerDate: t, calendarMonth: monthFirst(t),
    shotFilter: 'all', shotSearch: '', revisionFilter: 'due', openEntry: ''
  };
}
function normalizeState(raw) {
  const d = defaultState();
  const x = Object.assign(d, raw && typeof raw === 'object' ? raw : {});
  ['completed','notes','revisionDone','revisionSnooze'].forEach(k => {
    if (!x[k] || typeof x[k] !== 'object' || Array.isArray(x[k])) x[k] = {};
  });
  // Ignore obsolete planner fields from older saved backups.
  ['sessions','dailyHours','playbackSpeed','restDay'].forEach(k => { delete x[k]; });
  if (!validISO(x.planStart)) x.planStart = todayISO();
  if (!validISO(x.plannerDate)) x.plannerDate = todayISO();
  if (!validISO(x.calendarMonth)) x.calendarMonth = monthFirst(todayISO());
  x.calendarMonth = monthFirst(x.calendarMonth);
  x.theme = x.theme === 'light' ? 'light' : 'dark';
  if (!TABS.some(t => t[0] === x.tab)) x.tab = 'dashboard';
  if (!['all','remaining','completed'].includes(x.shotFilter)) x.shotFilter = 'all';
  x.shotSearch = String(x.shotSearch || '');
  x.revisionFilter = ['due','upcoming','done','all'].includes(x.revisionFilter) ? x.revisionFilter : 'due';
  x.version = 2;
  return x;
}
function persistLocal() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(S)); return true; }
  catch (e) { console.warn('Could not save Jee OneShot OS state', e); return false; }
}
function save() {
  S.updatedAt = new Date().toISOString();
  persistLocal();
  if (cloudUser && cloudReady) {
    clearTimeout(cloudTimer);
    cloudMsg = 'Saving cloud progress…';
    cloudTimer = setTimeout(() => cloudPush(), 650);
  }
  updateCloudPill();
}
function byId(id) { return curriculum.find(v => v.id === id); }
function completionDate(id) { return S.completed[id] || ''; }
function isCompleted(id) { return Boolean(completionDate(id)); }
function completedEntries() { return curriculum.filter(v => isCompleted(v.id)); }
function remainingEntries() { return curriculum.filter(v => !isCompleted(v.id)); }
function maxISO(a,b) { return a > b ? a : b; }
function scheduledEntryForDate(iso) {
  if (!validISO(iso) || iso < S.planStart) return null;
  const index = daysBetween(S.planStart, iso);
  return index >= 0 && index < curriculum.length ? curriculum[index] : null;
}
function predictedFinishDate() {
  const remaining = remainingEntries().length;
  if (!remaining) return null;
  return addDays(maxISO(todayISO(), S.planStart), remaining - 1);
}
function revisionKey(id, idx) { return `${id}:${idx}`; }
function revisions() {
  const today = todayISO(), out = [];
  for (const entry of completedEntries()) {
    const completedOn = completionDate(entry.id);
    for (let idx=0; idx<REVISION_CYCLES.length; idx++) {
      const key = revisionKey(entry.id,idx), cycle = REVISION_CYCLES[idx];
      const baseDue = addDays(completedOn, cycle.days);
      const due = (S.revisionSnooze[key] && S.revisionSnooze[key] > baseDue) ? S.revisionSnooze[key] : baseDue;
      const doneOn = S.revisionDone[key] || '';
      const status = doneOn ? 'done' : due < today ? 'overdue' : due === today ? 'due' : 'upcoming';
      out.push({ entry, idx, key, cycle, baseDue, due, doneOn, status });
    }
  }
  return out.sort((a,b) => {
    const ra = ({overdue:0,due:1,upcoming:2,done:3})[a.status], rb = ({overdue:0,due:1,upcoming:2,done:3})[b.status];
    return ra-rb || a.due.localeCompare(b.due) || a.entry.order-b.entry.order || a.idx-b.idx;
  });
}
function revisionsDueOn(iso) {
  return revisions().filter(x => !x.doneOn && x.due === iso);
}
function todayRevisionCount() {
  return revisions().filter(x => !x.doneOn && x.due <= todayISO()).length;
}
function entryNotes(id) { return String(S.notes[id] || ''); }
function pillHTML() {
  if (cloudUser && cloudReady) return '<i></i>Cloud sync on';
  if (cloudUser && !cloudReady) return '<i></i>Cloud not ready';
  return '<i></i>Local saved';
}
function updateCloudPill() {
  document.querySelectorAll('#savepill,#cloud-pill').forEach(pill => {
    pill.className = 'pill ' + (cloudUser&&cloudReady?'ok':cloudUser?'off':'');
    pill.innerHTML = pillHTML();
  });
  const status = document.getElementById('cloud-status');
  if (status) status.textContent = cloudMsg;
}
function navHTML() {
  return TABS.map(([id,label]) => `<button class="${S.tab===id?'on':''}" data-tab="${id}">${label}</button>`).join('');
}
function headerHTML() {
  return `<header class="top">
    <div class="brand">
      <div class="brandmark">JEE</div>
      <div><div class="brandtitle">Jee OneShot OS</div><div class="brand-sub">JEE ONE-SHOT TRACKER</div></div>
    </div>
    <div class="top-right">
      <div class="top-date"><b>${htmlEscape(formatDate(todayISO(),{weekday:'short',day:'numeric',month:'short',year:'numeric'}))}</b><div>54 one-shots · one ordered playlist</div></div>
      <span class="pill" id="savepill">${pillHTML()}</span>
    </div>
  </header>`;
}
function statCard(label,value,sub='') {
  return `<div class="stat"><small>${htmlEscape(label)}</small><b>${htmlEscape(value)}</b>${sub?`<div class="substat">${htmlEscape(sub)}</div>`:''}</div>`;
}
function emptyState(title, message) {
  return `<div class="empty-state"><b>${htmlEscape(title)}</b>${htmlEscape(message)}</div>`;
}
function progressBar(done,total) {
  const p=percent(done,total);
  return `<div class="progress-line"><div class="bar"><span style="width:${p}%;background:var(--ac)"></span></div><b>${p}%</b></div>`;
}
function watchLink(entry, cls='btn') {
  return `<a class="${cls}" href="${htmlEscape(entry.url)}" target="_blank" rel="noopener noreferrer">Watch on YouTube ↗</a>`;
}
function miniEntry(entry, meta, right='') {
  return `<div class="listline"><span class="pip ${isCompleted(entry.id)?'done':''}"></span><div class="linebody"><div class="listline-title">${entry.order}. ${htmlEscape(entry.name)}</div><div class="listline-meta">${htmlEscape(meta || (isCompleted(entry.id) ? 'Completed' : 'Not completed'))}${isCompleted(entry.id)?` · Completed ${htmlEscape(formatDate(completionDate(entry.id)))}`:''}</div>${right?`<div class="listline-actions">${right}</div>`:''}</div></div>`;
}

function renderDashboard() {
  const done=completedEntries(), remaining=remainingEntries();
  const due=revisions().filter(x=>!x.doneOn && x.due<=todayISO());
  const next=remaining[0];
  const todayShot=scheduledEntryForDate(todayISO());
  const finish=predictedFinishDate();
  const progress=percent(done.length,curriculum.length);
  const weekDays=[];
  for(let i=6;i>=0;i--) {
    const d=addDays(todayISO(),-i);
    weekDays.push({date:d,count:done.filter(x=>completionDate(x.id)===d).length});
  }
  const maxWeek=Math.max(1,...weekDays.map(x=>x.count));
  const todayContent = todayShot
    ? `<div class="listline"><span class="pip ${isCompleted(todayShot.id)?'done':''}"></span><div class="linebody"><div class="listline-title">${todayShot.order}. ${htmlEscape(todayShot.name)}</div><div class="listline-meta">${isCompleted(todayShot.id)?`Completed ${htmlEscape(formatDate(completionDate(todayShot.id)))}`:'Your one-shot for today'}</div><div class="listline-actions">${watchLink(todayShot,'btn g s')}<button class="btn s" data-action="toggle-complete" data-id="${todayShot.id}">${isCompleted(todayShot.id)?'Reopen one-shot':'Mark complete'}</button></div></div></div>`
    : emptyState('The 54-day plan is complete', 'All scheduled one-shot days are covered. Finish any remaining entries in the tracker.');
  return `
  <section class="card hero-one">
    <div>
      <div class="eyebrow">Your JEE one-shot mission</div>
      <h1>One playlist. One one-shot every day.</h1>
      <p class="mu">Follow the 54 entries in the exact order you supplied. Every calendar day is a study day, including Sundays.</p>
      ${progressBar(done.length,curriculum.length)}
      <div class="btns" style="margin-top:16px">
        ${next?`<button class="btn" data-action="continue">Continue · #${next.order}</button>`:`<button class="btn" data-tab="revision">Review revisions</button>`}
        <button class="btn g" data-tab="one-shots">Open one-shot tracker</button>
        <a class="btn g" href="${htmlEscape(DATA.playlistUrl)}" target="_blank" rel="noopener noreferrer">Open playlist ↗</a>
      </div>
    </div>
    <div class="hero-side">
      <div class="eyebrow">Today’s one-shot</div>
      ${todayShot?`<div style="font-weight:800;font-size:17px;line-height:1.3">${todayShot.order}. ${htmlEscape(todayShot.name)}</div><div class="mu" style="margin-top:6px">Day ${todayShot.order} of 54</div><div style="margin-top:12px">${watchLink(todayShot,'btn')}</div>`:`<div style="font-weight:800;font-size:18px">Scheduled sequence complete</div><div class="mu">Check the tracker for any unfinished entries.</div>`}
    </div>
  </section>
  <div class="stats">
    ${statCard('One-shots complete',`${done.length}/54`,`${remaining.length} remaining`)}
    ${statCard('Progress',`${progress}%`,'Completion across all entries')}
    ${statCard('Revisions due',String(due.length),due.length?'Overdue and due today':'Nothing due today')}
    ${statCard('Expected finish',finish?formatDate(finish,{day:'numeric',month:'short'}):'Complete',finish?formatDate(finish,{year:'numeric'}):'All one-shots completed')}
  </div>
  <div class="two-col">
    <section class="card">
      <div class="section-head"><div><h2>Today’s plan</h2><p>${htmlEscape(weekday(todayISO()))} · ${htmlEscape(formatDate(todayISO()))}</p></div><button class="btn g s" data-tab="planner">Open planner</button></div>
      ${todayContent}
    </section>
    <section class="card">
      <div class="section-head"><div><h2>Revision queue</h2><p>Spaced revision after completing a one-shot.</p></div><button class="btn g s" data-tab="revision">Open revision</button></div>
      ${due.length?due.slice(0,5).map(x=>miniEntry(x.entry,`${x.cycle.label} · ${x.status==='overdue'?'Overdue':'Due today'}`,`<button class="btn s" data-action="revision-done" data-id="${x.entry.id}" data-cycle="${x.idx}">Mark revised</button>`)).join(''):emptyState('No revisions due','Mark a one-shot complete to start its revision schedule.')}
    </section>
  </div>
  <section class="card">
    <div class="section-head"><div><h2>Last seven days</h2><p>Completed one-shots by date.</p></div></div>
    <div class="week-chart">${weekDays.map(x=>`<div class="week-bar"><b>${x.count}</b><div class="barouter"><div class="barinner" style="height:${Math.max(x.count?5:0,80*x.count/maxWeek)}px"></div></div><span>${htmlEscape(formatDate(x.date,{weekday:'short'}))}</span></div>`).join('')}</div>
  </section>`;
}

function renderPlanner() {
  const date=S.plannerDate||todayISO();
  const entry=scheduledEntryForDate(date);
  const isPast=date<todayISO();
  const status=entry?(isCompleted(entry.id)?`Completed ${formatDate(completionDate(entry.id))}`:date>todayISO()?`Scheduled for ${formatDate(date)}`:isPast?'Not marked complete':'Not completed yet'):'No one-shot is assigned to this date.';
  const offset=validISO(date)&&validISO(S.planStart)?daysBetween(S.planStart,date):-1;
  const entryCard=entry?`<div class="plan-shot-row ${isCompleted(entry.id)?'done':''}">
      <div class="plan-shot-check">${isCompleted(entry.id)?'✓':entry.order}</div>
      <div><div class="plan-shot-title">${entry.order}. ${htmlEscape(entry.name)}</div><div class="plan-shot-actions" style="margin-top:10px">${watchLink(entry,'btn g s')}${date>todayISO()?'<button class="btn" disabled>Upcoming</button>':`<button class="btn ${isCompleted(entry.id)?'g':''}" data-action="toggle-complete" data-id="${entry.id}">${isCompleted(entry.id)?'Reopen one-shot':'Mark one-shot complete'}</button>`}</div></div>
    </div>`:emptyState(date<S.planStart?'Your plan has not started yet':'The 54 scheduled days are complete','Choose a date within your plan, or check unfinished entries in the tracker.');
  return `<section class="card">
    <div class="section-head"><div><div class="eyebrow">Daily planner · one entry every day</div><h1>${htmlEscape(formatDate(date,{weekday:'long',day:'numeric',month:'long',year:'numeric'}))}</h1><p>Exactly one scheduled one-shot per calendar day, including Sundays.</p></div>
      <div class="day-switch"><button class="btn g" data-action="planner-shift" data-shift="-1">←</button><input aria-label="Planner date" type="date" id="planner-date" value="${date}"><button class="btn g" data-action="planner-shift" data-shift="1">→</button><button class="btn g" data-action="planner-today">Today</button></div>
    </div>
    <div class="stats">
      ${statCard('Day in sequence',entry?`${entry.order} / 54`:(offset>=54?'54 / 54':'Not started'),'One entry assigned per calendar day')}
      ${statCard('Overall completion',`${completedEntries().length}/54`,`${remainingEntries().length} entries remaining`)}
      ${statCard('Status',entry?(isCompleted(entry.id)?'Complete':'Pending'):(date<S.planStart?'Not started':'Sequence complete'),status)}
    </div>
    <section class="card" style="background:var(--soft);box-shadow:none;margin-bottom:14px"><div class="section-head"><div><h2>Today’s assigned one-shot</h2><p>${htmlEscape(status)}</p></div></div>${entryCard}</section>
    <div class="two-col">
      <section class="card"><div class="section-head"><div><h2>Revision due this day</h2><p>Revision dates are independent of the daily one-shot schedule.</p></div></div>
        ${revisionsDueOn(date).map(x=>miniEntry(x.entry,`${x.cycle.label} · Revision due`,`<button class="btn s" data-action="revision-done" data-id="${x.entry.id}" data-cycle="${x.idx}">Mark revised</button>`)).join('')||emptyState('No revisions due','Use the Revision section to see upcoming revision dates.')}
      </section>
      <section class="card"><div class="section-head"><div><h2>Schedule rules</h2><p>Simple and fixed.</p></div></div><div class="listline"><span class="pip"></span><div class="linebody"><div class="listline-title">One-shot every day</div><div class="listline-meta">Monday through Sunday, with the same one-shot cadence all week.</div></div></div><div class="listline"><span class="pip"></span><div class="linebody"><div class="listline-title">Playlist order is locked</div><div class="listline-meta">One-shot #1 on the plan start date, then one entry on each following date.</div></div></div><div class="listline"><span class="pip"></span><div class="linebody"><div class="listline-title">Progress stays yours</div><div class="listline-meta">Mark a one-shot complete in the planner or tracker; revisions begin from completion.</div></div></div></section>
    </div>
  </section>`;
}

function renderCalendar() {
  const first=monthFirst(S.calendarMonth), startDate=fromISO(first);
  const gridStart=addDays(first,-startDate.getDay());
  const doneByDate={};
  for(const e of completedEntries()) doneByDate[completionDate(e.id)]=(doneByDate[completionDate(e.id)]||0)+1;
  const monthLabel=fromISO(first).toLocaleDateString('en-IN',{month:'long',year:'numeric'});
  const cells=[], dayLabels=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  for(let i=0;i<42;i++) {
    const date=addDays(gridStart,i), inMonth=date.slice(0,7)===first.slice(0,7);
    const done=doneByDate[date]||0, due=revisionsDueOn(date).length, planned=scheduledEntryForDate(date);
    const classes=['calendar-day',inMonth?'':'outside',date===todayISO()?'today':'',date===S.plannerDate?'selected':''].filter(Boolean).join(' ');
    cells.push(`<button class="${classes}" data-action="calendar-day" data-date="${date}" aria-label="${htmlEscape(formatDate(date,{weekday:'long',day:'numeric',month:'long',year:'numeric'}))}"><span class="day-num">${fromISO(date).getDate()}</span><span class="calendar-labels">
      ${done?`<span class="done">${done} completed</span>`:''}
      ${planned?`<span>#${planned.order} · ${htmlEscape(planned.name)}</span>`:''}
      ${due?`<span class="rev">${due} rev due</span>`:''}
    </span></button>`);
  }
  const selected=scheduledEntryForDate(S.plannerDate);
  return `<section class="card">
    <div class="section-head"><div><div class="eyebrow">Study calendar</div><h1>${htmlEscape(monthLabel)}</h1><p>Every date is available for a one-shot. Click a day to view its assignment.</p></div>
    <div class="btns"><button class="btn g" data-action="month-shift" data-shift="-1">← Previous</button><button class="btn g" data-action="month-today">This month</button><button class="btn g" data-action="month-shift" data-shift="1">Next →</button></div></div>
    <div class="calendar-wrap">${dayLabels.map(d=>`<div class="calendar-week">${d}</div>`).join('')}${cells.join('')}</div>
    <div class="mu" style="margin-top:12px">Entry numbers show the one-shot assigned to that date. Green = completed · Purple = revision due.</div>
  </section>
  <section class="card"><div class="section-head"><div><h2>Selected day</h2><p>${htmlEscape(formatDate(S.plannerDate))}</p></div><button class="btn" data-action="calendar-open-planner">Open planner</button></div>
    ${selected?miniEntry(selected, isCompleted(selected.id)?`Completed ${formatDate(completionDate(selected.id))}`:'Scheduled one-shot',`${watchLink(selected,'btn g s')} <button class="btn s" data-action="toggle-complete" data-id="${selected.id}">${isCompleted(selected.id)?'Reopen':'Mark complete'}</button>`):emptyState('No one-shot assigned','This date is before the start date or after the 54-day schedule.')}
    ${revisionsDueOn(S.plannerDate).map(x=>miniEntry(x.entry,`${x.cycle.label} · Revision due`,`<button class="btn s" data-action="revision-done" data-id="${x.entry.id}" data-cycle="${x.idx}">Mark revised</button>`)).join('')}
  </section>`;
}

function renderOneShots() {
  const query=S.shotSearch.trim().toLowerCase();
  const filtered=curriculum.filter(e=>{
    const done=isCompleted(e.id);
    const matches=S.shotFilter==='all'||(S.shotFilter==='completed'&&done)||(S.shotFilter==='remaining'&&!done);
    return matches&&(!query||`${e.order} ${e.name}`.toLowerCase().includes(query));
  });
  return `<section class="card">
    <div class="section-head"><div><div class="eyebrow">Single source of truth</div><h1>One-shot tracker</h1><p>Exactly 54 entries, in your supplied order. One scheduled entry per calendar day.</p></div>
      <a class="btn g" href="${htmlEscape(DATA.playlistUrl)}" target="_blank" rel="noopener noreferrer">Open full playlist ↗</a>
    </div>
    <div class="filters" style="margin-bottom:12px">
      ${[['all','All 54'],['remaining','Remaining'],['completed','Completed']].map(([id,label])=>`<button class="chip ${S.shotFilter===id?'on':''}" data-action="shot-filter" data-filter="${id}">${label}</button>`).join('')}
      <input class="searchbox" style="margin-left:auto" type="search" id="shot-search" placeholder="Search chapter or topic…" value="${htmlEscape(S.shotSearch)}" aria-label="Search one-shots">
    </div>
    <div class="mu" id="shot-count" style="margin-bottom:10px">${filtered.length} entries shown · ${completedEntries().length}/54 complete · Playlist order is locked.</div>
    <div class="shot-list">${filtered.length?filtered.map(e=>{
      const done=isCompleted(e.id);
      return `<details class="shot-entry ${done?'completed':''}" data-entry="${e.id}" ${S.openEntry===e.id?'open':''}>
        <summary><span class="shot-num">${done?'✓':String(e.order).padStart(2,'0')}</span><span class="shot-name">${e.order}. ${htmlEscape(e.name)}</span><span class="tag ${done?'ok':''}">${done?'Complete':'Remaining'}</span></summary>
        <div class="shot-detail"><div class="mu">One-shot ${e.order} of 54${scheduledEntryForDate(addDays(S.planStart,e.order-1))?` · Scheduled ${htmlEscape(formatDate(addDays(S.planStart,e.order-1)))}`:''}</div>
          <div class="entry-actions" style="margin-top:10px">${watchLink(e)}<button class="btn ${done?'g':''}" data-action="toggle-complete" data-id="${e.id}">${done?'Reopen one-shot':'Mark complete'}</button></div>
          ${done?`<div class="mu" style="margin-top:8px">Completed on ${htmlEscape(formatDate(completionDate(e.id)))} · its revision cycle has started.</div>`:''}
          <div class="entry-note"><label for="note-${e.id}">Personal note (optional)</label><textarea id="note-${e.id}" data-note="${e.id}" placeholder="Key concepts to revisit, doubts, or quick reminders…">${htmlEscape(entryNotes(e.id))}</textarea></div>
        </div></details>`;
    }).join(''):emptyState('No matching entries','Try another search or filter.')}</div>
  </section>`;
}
function renderRevision() {
  const items=revisions();
  const due=items.filter(x=>!x.doneOn && x.due<=todayISO());
  const upcoming=items.filter(x=>!x.doneOn && x.due>todayISO());
  const done=items.filter(x=>x.doneOn);
  const filter=S.revisionFilter||'due';
  const shown=filter==='due'?due:filter==='upcoming'?upcoming:filter==='done'?done:items;
  const list=shown.map(x=>{
    const statusText=x.doneOn?`Completed ${formatDate(x.doneOn)}`:x.due<todayISO()?'Overdue':x.due===todayISO()?'Due today':`Due ${formatDate(x.due)}`;
    return `<div class="listline"><span class="pip ${x.doneOn?'done':x.status==='overdue'?'warn':''}"></span><div class="linebody">
      <div class="listline-title">${x.entry.order}. ${htmlEscape(x.entry.name)}</div>
      <div class="listline-meta">${htmlEscape(x.cycle.label)} · ${htmlEscape(statusText)}</div>
      <div class="listline-actions">
        ${!x.doneOn?`<button class="btn s" data-action="revision-done" data-id="${x.entry.id}" data-cycle="${x.idx}">Mark revised</button><button class="btn g s" data-action="revision-snooze" data-id="${x.entry.id}" data-cycle="${x.idx}" data-days="1">Snooze 1 day</button><button class="btn g s" data-action="revision-snooze" data-id="${x.entry.id}" data-cycle="${x.idx}" data-days="3">Snooze 3 days</button>`:`<button class="btn g s" data-action="revision-undo" data-id="${x.entry.id}" data-cycle="${x.idx}">Undo revision</button>`}
        ${watchLink(x.entry,'btn g s')}
      </div>
      ${entryNotes(x.entry.id)?`<div class="mu" style="margin-top:7px">${htmlEscape(entryNotes(x.entry.id))}</div>`:''}
    </div></div>`;
  }).join('');
  return `<section class="card">
    <div class="section-head"><div><div class="eyebrow">Retention system</div><h1>Revision queue</h1><p>Revision reminders begin when you mark a one-shot complete.</p></div></div>
    <div class="stats">
      ${statCard('Overdue / due',String(due.length),'Complete or snooze to clear the queue')}
      ${statCard('Upcoming',String(upcoming.length),'Scheduled revision dates')}
      ${statCard('Revisions completed',String(done.length),'Across completed one-shots')}
      ${statCard('Revision cycle','1 · 3 · 7 · 14 · 30','Days after completing a one-shot')}
    </div>
    <div class="filters" style="margin-bottom:12px">
      ${[['due','Due & overdue'],['upcoming','Upcoming'],['done','Completed'],['all','All revisions']].map(([id,label])=>`<button class="chip ${filter===id?'on':''}" data-action="revision-filter" data-filter="${id}">${label}</button>`).join('')}
    </div>
    ${list||emptyState(filter==='due'?'Nothing due right now':'No revisions in this view',filter==='due'?'Complete a one-shot to start its revision schedule.':'Change the filter or complete a one-shot to create revision dates.')}
  </section>`;
}

function renderSettings() {
  const cloudDetail=cloudUser?`Signed in as ${htmlEscape(cloudUser.email||'user')}. ${htmlEscape(cloudReady?'Cloud sync is enabled.':cloudMsg)}`:'Progress saves locally by default. Optional cloud sync can be enabled using your existing Supabase account.';
  return `<section class="card">
    <div class="eyebrow">Personalize your system</div><h1>Settings</h1><p class="mu">Set when your 54-day one-shot sequence begins and choose your appearance.</p>
    <form id="settings-form"><div class="setting-grid" style="margin-top:18px">
      <div class="setting-field"><label for="planStart">Plan start date</label><input type="date" id="planStart" name="planStart" value="${S.planStart}"><div class="hint">One-shot #1 is assigned to this date; the next entry is assigned every following day.</div></div>
      <div class="setting-field"><label for="theme">Appearance</label><select id="theme" name="theme"><option value="dark" ${S.theme==='dark'?'selected':''}>Dark</option><option value="light" ${S.theme==='light'?'selected':''}>Light</option></select><div class="hint">Applied after saving.</div></div>
    </div><div class="btns" style="margin-top:16px"><button class="btn">Save settings</button></div><div id="settings-msg" class="status-note"></div></form>
  </section>
  <section class="card"><div class="section-head"><div><h2>Progress backup</h2><p>Export a backup before moving browsers or computers.</p></div></div>
    <div class="btns"><button class="btn" data-action="export-backup">Export backup</button><label class="btn g" for="import-backup" style="cursor:pointer">Import backup</label><input type="file" id="import-backup" accept=".json,application/json" hidden><button class="btn g" data-action="reset-progress">Reset all progress</button></div><div class="status-note" id="backup-msg"></div>
  </section>
  <section class="card"><div class="section-head"><div><h2>Optional cloud sync</h2><p>Uses one dedicated saved-state row per signed-in user.</p></div><span class="pill" id="cloud-pill">${pillHTML()}</span></div>
    <div id="cloud-status" class="mu">${htmlEscape(cloudDetail)}</div><div class="btns" style="margin-top:12px">${cloudUser?`<button class="btn" data-action="cloud-sync">Sync now</button><button class="btn g" data-action="cloud-signout">Sign out</button>`:`<button class="btn" data-action="auth-open">Sign in / create account</button>`}</div>
    <div class="mu" style="margin-top:10px">Cloud sync requires running the included <b>SUPABASE-SETUP.sql</b> once in Supabase. Local saving and backups work without it.</div>
  </section>
  <section class="card"><h2>Playlist source</h2><p class="mu">54 ordered one-shots · all video links come from your supplied playlist data.</p><a class="btn g" href="${htmlEscape(DATA.playlistUrl)}" target="_blank" rel="noopener noreferrer">Open playlist on YouTube ↗</a><div class="divider"></div><div class="mu">Jee OneShot OS · v3.1.1 · One one-shot per calendar day · Revision included.</div></section>`;
}
function render() {
  document.documentElement.dataset.theme = S.theme || 'dark';
  document.getElementById('top').innerHTML = headerHTML();
  document.getElementById('nav').innerHTML = navHTML();
  const app=document.getElementById('app');
  const page = {
    dashboard:renderDashboard,
    planner:renderPlanner,
    calendar:renderCalendar,
    'one-shots':renderOneShots,
    revision:renderRevision,
    settings:renderSettings
  }[S.tab] || renderDashboard;
  app.innerHTML = page();
  updateCloudPill();
}
function goTab(tab) {
  if (!TABS.some(t=>t[0]===tab)) return;
  S.tab = tab; save(); render(); window.scrollTo({top:0,behavior:'smooth'});
}
function markComplete(id) {
  const entry=byId(id); if(!entry) return;
  if(isCompleted(id)) {
    const hasDoneRevision=Object.keys(S.revisionDone).some(k=>k.startsWith(id+':'));
    const prompt=hasDoneRevision
      ? `Reopen "${entry.name}"? This clears its revision history and scheduled revisions.`
      : `Reopen "${entry.name}"? This clears its revision schedule.`;
    if(!confirm(prompt)) return;
    delete S.completed[id];
    for(const key of Object.keys(S.revisionDone)) if(key.startsWith(id+':')) delete S.revisionDone[key];
    for(const key of Object.keys(S.revisionSnooze)) if(key.startsWith(id+':')) delete S.revisionSnooze[key];
  } else {
    S.completed[id]=todayISO();
  }
  save(); render();
}
function markRevision(id, idx, done=true) {
  const e=byId(id); if(!e || !isCompleted(id) || idx<0 || idx>=REVISION_CYCLES.length) return;
  const key=revisionKey(id,idx);
  if(done){S.revisionDone[key]=todayISO();delete S.revisionSnooze[key];}
  else delete S.revisionDone[key];
  save(); render();
}
function snoozeRevision(id, idx, days) {
  const item=revisions().find(x=>x.entry.id===id&&x.idx===idx);
  if(!item||item.doneOn) return;
  S.revisionSnooze[item.key]=addDays(maxISO(todayISO(),item.due),Number(days)||1);
  save(); render();
}
function openEntry(id) {
  S.openEntry=id;S.shotFilter='all';S.shotSearch='';
  const e=byId(id);
  if(e) S.plannerDate=todayISO();
  save();goTab('one-shots');
  setTimeout(()=>{const node=document.querySelector(`details[data-entry="${CSS.escape(id)}"]`); if(node){node.open=true;node.scrollIntoView({behavior:'smooth',block:'center'});}},0);
}
function exportBackup() {
  const bundle={app:'Jee OneShot OS',version:1,playlistId:DATA.playlistId,exportedAt:new Date().toISOString(),state:S};
  const blob=new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`jee-os-one-shot-backup-${todayISO()}.json`;a.click();URL.revokeObjectURL(url);
  const msg=document.getElementById('backup-msg');if(msg)msg.textContent='Backup exported.';
}
async function importBackup(file) {
  const msg=document.getElementById('backup-msg');
  try {
    const raw=JSON.parse(await file.text());
    const incoming=raw && raw.state ? raw.state : raw;
    if(!incoming || typeof incoming!=='object' || Array.isArray(incoming) || !(incoming.completed||incoming.version))
      throw new Error('This does not look like a Jee OneShot OS backup.');
    if(raw.playlistId && raw.playlistId!==DATA.playlistId) throw new Error('This backup belongs to a different playlist.');
    if(!confirm('Import this backup and replace the progress currently saved in this browser?')) return;
    S=normalizeState(incoming);
    save();render();if(msg)msg.textContent='Backup imported successfully.';
  } catch(e) { if(msg)msg.textContent=`Import failed: ${e.message||e}`; }
}
function resetProgress() {
  if(!confirm('Reset all completed one-shots, revisions, and notes? Settings will be kept. This cannot be undone unless you have a backup.')) return;
  S.completed={};S.notes={};S.revisionDone={};S.revisionSnooze={};S.updatedAt='';
  save();render();
  const msg=document.getElementById('backup-msg');if(msg)msg.textContent='Progress reset.';
}
function setAuthMessage(text,bad=false) {
  const el=document.getElementById('authmsg');
  if(el){el.textContent=text;el.className='authmsg '+(bad?'bad':'ok');}
}
function openAuth() {
  const box=document.getElementById('authbox');
  if(box)box.classList.add('on');
  setAuthMessage(cloudUser?`Signed in as ${cloudUser.email||'user'}.`:'');
}
function closeAuth() { document.getElementById('authbox')?.classList.remove('on'); }
async function cloudPush() {
  if(!supabaseClient||!cloudUser||!cloudReady) return false;
  try {
    const result=await supabaseClient.from('jeeo_one_shot_state').upsert({
      user_id:cloudUser.id, state:S, client_updated_at:new Date().toISOString()
    },{onConflict:'user_id'});
    if(result.error) throw result.error;
    cloudMsg='Cloud sync is up to date.';
    updateCloudPill();
    return true;
  } catch(e) {
    cloudMsg=`Cloud sync failed. Check SUPABASE-SETUP.sql: ${e.message||e}`;
    updateCloudPill();return false;
  }
}
async function cloudLoadOrMerge() {
  if(!supabaseClient||!cloudUser)return;
  cloudReady=false;cloudMsg='Connecting to cloud…';updateCloudPill();
  try {
    const r=await supabaseClient.from('jeeo_one_shot_state').select('state,client_updated_at').eq('user_id',cloudUser.id).maybeSingle();
    if(r.error) throw r.error;
    const localRaw=localStorage.getItem(STORAGE_KEY);
    if(r.data && r.data.state) {
      const remote=normalizeState(r.data.state);
      const remoteStamp=Date.parse(remote.updatedAt||r.data.client_updated_at||0)||0;
      const localStamp=Date.parse(S.updatedAt||0)||0;
      if(!localRaw || remoteStamp>localStamp) {
        S=remote; persistLocal();
        cloudMsg='Restored the latest saved state from cloud.';
      } else {
        cloudReady=true;
        await cloudPush();
      }
    } else {
      cloudReady=true;
      await cloudPush();
    }
    cloudReady=true;
  } catch(e) {
    cloudReady=false;
    cloudMsg=`Cloud sync unavailable. If this is the first setup, run SUPABASE-SETUP.sql in Supabase. (${e.message||e})`;
  }
  updateCloudPill();render();
}
async function signIn() {
  if(!supabaseClient) return setAuthMessage('Cloud client did not load. Check your internet connection.',true);
  const email=document.getElementById('authEmail')?.value.trim();
  const password=document.getElementById('authPassword')?.value||'';
  if(!email||!password) return setAuthMessage('Enter your email and password.',true);
  setAuthMessage('Signing in…');
  const {data,error}=await supabaseClient.auth.signInWithPassword({email,password});
  if(error) return setAuthMessage(error.message,true);
  cloudUser=data.user;closeAuth();await cloudLoadOrMerge();
}
async function signUp() {
  if(!supabaseClient) return setAuthMessage('Cloud client did not load. Check your internet connection.',true);
  const email=document.getElementById('authEmail')?.value.trim();
  const password=document.getElementById('authPassword')?.value||'';
  if(!email||password.length<6) return setAuthMessage('Enter an email and a password of at least 6 characters.',true);
  setAuthMessage('Creating account…');
  const {data,error}=await supabaseClient.auth.signUp({email,password});
  if(error) return setAuthMessage(error.message,true);
  if(data.session&&data.user){cloudUser=data.user;closeAuth();await cloudLoadOrMerge();}
  else setAuthMessage('Account created. Check your email to confirm it, then sign in.');
}
async function signOutCloud() {
  if(supabaseClient) await supabaseClient.auth.signOut();
  cloudUser=null;cloudReady=false;cloudMsg='Local progress is saved in this browser.';
  updateCloudPill();render();
}
async function initCloud() {
  if(!supabaseClient) { cloudMsg='Cloud client unavailable. Local saving still works.';return; }
  try {
    const {data,error}=await supabaseClient.auth.getSession();
    if(error) throw error;
    if(data.session?.user){cloudUser=data.session.user;await cloudLoadOrMerge();}
  } catch(e) { cloudMsg=`Cloud not connected: ${e.message||e}`; }
  updateCloudPill();
}

function handleClick(event) {
  const tabBtn=event.target.closest('[data-tab]');
  if(tabBtn) { goTab(tabBtn.dataset.tab); return; }
  const btn=event.target.closest('[data-action]');
  if(!btn) return;
  const action=btn.dataset.action;
  if(action==='continue') { const next=remainingEntries()[0]; if(next) openEntry(next.id); else goTab('revision'); }
  else if(action==='toggle-complete') markComplete(btn.dataset.id);
  else if(action==='shot-filter') { S.shotFilter=btn.dataset.filter;save();render(); }
  else if(action==='revision-filter') { S.revisionFilter=btn.dataset.filter;render(); }
  else if(action==='revision-done') markRevision(btn.dataset.id,Number(btn.dataset.cycle),true);
  else if(action==='revision-undo') markRevision(btn.dataset.id,Number(btn.dataset.cycle),false);
  else if(action==='revision-snooze') snoozeRevision(btn.dataset.id,Number(btn.dataset.cycle),Number(btn.dataset.days));
  else if(action==='planner-shift') { S.plannerDate=addDays(S.plannerDate,Number(btn.dataset.shift));save();render(); }
  else if(action==='planner-today') { S.plannerDate=todayISO();save();render(); }
  else if(action==='calendar-day') { S.plannerDate=btn.dataset.date;save();goTab('planner'); }
  else if(action==='calendar-open-planner') goTab('planner');
  else if(action==='month-shift') { S.calendarMonth=monthShift(S.calendarMonth,Number(btn.dataset.shift));save();render(); }
  else if(action==='month-today') { S.calendarMonth=monthFirst(todayISO());S.plannerDate=todayISO();save();render(); }
  else if(action==='export-backup') exportBackup();
  else if(action==='reset-progress') resetProgress();
  else if(action==='auth-open') openAuth();
  else if(action==='auth-close') closeAuth();
  else if(action==='auth-signin') signIn();
  else if(action==='auth-signup') signUp();
  else if(action==='cloud-sync') cloudPush().then(render);
  else if(action==='cloud-signout') signOutCloud();
}
function handleSubmit(event) {
  if(event.target.id==='settings-form') {
    event.preventDefault();
    const f=new FormData(event.target);
    S.planStart=validISO(f.get('planStart'))?String(f.get('planStart')):todayISO();
    S.theme=f.get('theme')==='light'?'light':'dark';
    save();render();
    const msg=document.getElementById('settings-msg');if(msg)msg.textContent='Settings saved.';
  }
}
function handleChange(event) {
  const el=event.target;
  if(el.id==='planner-date' && validISO(el.value)) { S.plannerDate=el.value;save();render(); }
  else if(el.id==='shot-search') { S.shotSearch=el.value;save();render();const n=document.getElementById('shot-search');if(n){n.focus();n.setSelectionRange(n.value.length,n.value.length);} }
  else if(el.id==='import-backup' && el.files?.[0]) importBackup(el.files[0]);
  else if(el.dataset.note) { S.notes[el.dataset.note]=el.value;save(); }
}
function handleInput(event) {
  const el=event.target;
  if(el.id==='shot-search') {
    const pos=el.selectionStart;S.shotSearch=el.value;
    const list=document.querySelector('.shot-list');if(list) {
      const tmp=document.createElement('div');tmp.innerHTML=renderOneShots();
      const next=tmp.querySelector('.shot-list');
      const nextCount=tmp.querySelector('#shot-count');
      if(next) list.replaceWith(next);
      const count=document.getElementById('shot-count');if(count&&nextCount)count.textContent=nextCount.textContent;
      const input=document.getElementById('shot-search');if(input){input.focus();input.setSelectionRange(pos,pos);}
    }
  }
}
async function boot() {
  try {
    const r=await fetch(DATA_URL,{cache:'no-store'});
    if(!r.ok) throw new Error(`Could not load ${DATA_URL} (${r.status}). Start the app with start.bat.`);
    const d=await r.json();
    if(!d || !Array.isArray(d.videos) || d.videos.length!==54) throw new Error('one-shots.json must contain the 54 ordered videos.');
    DATA=d;curriculum=d.videos;
  } catch(e) {
    document.getElementById('app').innerHTML=`<div class="card err"><b>Jee OneShot OS could not load its 54-video playlist data.</b><p>${htmlEscape(e.message||e)}</p></div>`;
    return;
  }
  const raw=localStorage.getItem(STORAGE_KEY);
  S=normalizeState(raw?JSON.parse(raw):defaultState());
  booted=true;
  render();
  initCloud();
}
let DATA={playlistUrl:'https://www.youtube.com/playlist?list=PLe2OLDq3OCGA',playlistId:'PLe2OLDq3OCGA'};
document.addEventListener('click',handleClick);
document.addEventListener('submit',handleSubmit);
document.addEventListener('change',handleChange);
document.addEventListener('input',handleInput);
boot();
