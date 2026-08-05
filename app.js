// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
const config = window.PLANNER_CONFIG || { supabaseUrl: '', supabaseAnonKey: '' };
const hasCloud = Boolean(config.supabaseUrl && config.supabaseAnonKey);
let supabase = null;

if (hasCloud) {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
}

// Markdown rendering for notes (sanitized — never trust raw HTML from user input)
const { marked } = await import('https://esm.sh/marked@12');
const DOMPurify = (await import('https://esm.sh/dompurify@3')).default;
marked.setOptions({ breaks: true });

const $ = (selector) => document.querySelector(selector);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let activeView = 'today';
let user = null;
let items = [];
let calendarMonthOffset = 0; // 0 = current month, -1 = previous, +1 = next
let activeTagFilter = null;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

const TYPE_ICON = { task: '\u2713', event: '\u25a6', note: '\u25a4' };

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------
function applyTheme(value) {
  if (value === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', value);
  }
  localStorage.setItem('momentum-theme', value);
}

function initTheme() {
  const saved = localStorage.getItem('momentum-theme') || 'system';
  const select = $('#theme-select');
  if (select) {
    select.value = saved;
    select.addEventListener('change', () => applyTheme(select.value));
  }
}

// ---------------------------------------------------------------------------
// Status messages
// ---------------------------------------------------------------------------
let messageTimer = null;

function showMessage(text, isError = false) {
  const el = $('#app-message');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('error', isError);
  el.hidden = false;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => { el.hidden = true; }, 4000);
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------
function parseTags(raw) {
  return [...new Set(raw.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))];
}

function tagPills(tags = []) {
  return tags.map((t) => `<button type="button" class="tag-pill" data-tag="${escape(t)}">#${escape(t)}</button>`).join('');
}

function setTagFilter(tag) {
  activeTagFilter = tag;
  render();
}

// ---------------------------------------------------------------------------
// Persistence (Supabase when configured, localStorage otherwise)
// ---------------------------------------------------------------------------
function localItems() {
  return JSON.parse(localStorage.getItem('momentum-items') || '[]');
}

function saveLocal() {
  localStorage.setItem('momentum-items', JSON.stringify(items));
}

function seedItems() {
  const date = todayKey();
  return [
    { id: crypto.randomUUID(), type: 'event', title: 'Weekly planning', date, time: '09:30', body: '', tags: ['planning'], parent_id: null },
    { id: crypto.randomUUID(), type: 'task', title: 'Choose this week\u2019s top priorities', date, done: false, body: '', tags: ['planning'], parent_id: null },
    { id: crypto.randomUUID(), type: 'note', title: 'Welcome to Momentum', date, body: '# Welcome\n\nCapture a thought here, then connect it to the work and time it needs.\n\n- Notes support **markdown**\n- Tag items to link them together', tags: ['planning'], parent_id: null },
  ];
}

async function loadItems() {
  if (hasCloud) {
    const { data, error } = await supabase.from('items').select('*').order('created_at', { ascending: false });
    if (error) {
      showMessage('Could not load your items: ' + error.message, true);
      return;
    }
    items = data || [];
  } else {
    items = localItems();
    if (!items.length) {
      items = seedItems();
      saveLocal();
    }
  }
  render();
}

async function saveItem(item, isNew) {
  if (hasCloud) {
    const payload = { ...item, user_id: user.id };
    delete payload.id;
    const result = isNew
      ? await supabase.from('items').insert(payload)
      : await supabase.from('items').update(payload).eq('id', item.id);
    if (result.error) {
      showMessage('Could not save: ' + result.error.message, true);
      return false;
    }
    await loadItems();
    return true;
  }

  const i = items.findIndex((x) => x.id === item.id);
  if (i < 0) items.unshift(item); else items[i] = item;
  saveLocal();
  render();
  return true;
}

async function removeItem(id) {
  if (hasCloud) {
    const { error } = await supabase.from('items').delete().eq('id', id);
    if (error) {
      showMessage('Could not delete: ' + error.message, true);
      return false;
    }
    await loadItems();
    return true;
  }

  items = items.filter((x) => x.id !== id && x.parent_id !== id);
  saveLocal();
  render();
  return true;
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------
function escape(s = '') {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function visibleItems() {
  if (!activeTagFilter) return items;
  return items.filter((i) => i.tags?.includes(activeTagFilter));
}

function itemRow(item, { indent = false } = {}) {
  const checkHidden = item.type !== 'task' ? 'style="visibility:hidden"' : '';
  return `
    <div class="item ${indent ? 'item-indent' : ''}">
      <button class="check ${item.done ? 'done' : ''}" data-toggle="${item.id}" ${checkHidden} aria-label="Toggle done"></button>
      <div class="item-main">
        <div class="item-title">${escape(item.title)}</div>
        <div class="item-meta">${item.time || item.date || 'No date'}${item.body ? ' \u00b7 ' + escape(item.body.slice(0, 45)) : ''}</div>
        ${item.tags?.length ? `<div class="tag-row">${tagPills(item.tags)}</div>` : ''}
      </div>
      <button class="text-button" data-edit="${item.id}">Edit</button>
      <button class="text-button danger" data-delete="${item.id}" aria-label="Delete ${escape(item.title)}">Delete</button>
    </div>`;
}

function renderFilterBanner() {
  if (!activeTagFilter) return '';
  return `<div class="filter-banner">Filtered by <strong>#${escape(activeTagFilter)}</strong> <button type="button" class="text-button" id="clear-filter">Clear</button></div>`;
}

function renderToday() {
  const pool = visibleItems();
  const todays = pool.filter((i) => i.date === todayKey() && !i.parent_id);
  const tasksAndEvents = todays.filter((i) => i.type !== 'note').map((i) => itemRow(i)).join('') || '<p class="empty">Nothing scheduled yet. Enjoy the space.</p>';
  const notes = pool.filter((i) => i.type === 'note' && !i.parent_id).slice(0, 3).map((i) => itemRow(i)).join('') || '<p class="empty">Write a note to hold onto an idea.</p>';
  return `
    ${renderFilterBanner()}
    <div class="grid today-grid">
      <section class="card"><h2>Today\u2019s plan</h2><div class="item-list">${tasksAndEvents}</div></section>
      <section class="card"><h2>Notes for today</h2><div class="item-list">${notes}</div></section>
    </div>`;
}

function renderTasks() {
  const pool = visibleItems();
  const topLevel = pool.filter((i) => i.type === 'task' && !i.parent_id);
  const open = topLevel.filter((t) => !t.done).length;

  const rows = topLevel.map((task) => {
    const subtasks = items.filter((i) => i.parent_id === task.id);
    const doneCount = subtasks.filter((s) => s.done).length;
    const progress = subtasks.length ? `<span class="subtask-progress">${doneCount}/${subtasks.length} subtasks</span>` : '';
    const subRows = subtasks.length ? `<div class="subtask-group">${subtasks.map((s) => itemRow(s, { indent: true })).join('')}</div>` : '';
    return `<div class="task-group">${itemRow(task)}${progress ? `<div class="task-group-meta">${progress}</div>` : ''}${subRows}</div>`;
  }).join('') || '<p class="empty">No tasks yet.</p>';

  return `${renderFilterBanner()}<section class="card"><h2>${open} open task${open === 1 ? '' : 's'}</h2><div class="item-list">${rows}</div></section>`;
}

function renderNotes() {
  const pool = visibleItems();
  const notes = pool.filter((i) => i.type === 'note' && !i.parent_id);
  const cards = notes.map((n) => `
    <article class="card note-card">
      <div class="item-title">${escape(n.title)}</div>
      <div class="markdown-body">${n.body ? DOMPurify.sanitize(marked.parse(n.body)) : '<p class="empty-inline">No details yet.</p>'}</div>
      ${n.tags?.length ? `<div class="tag-row">${tagPills(n.tags)}</div>` : ''}
      <time>${n.date || 'Undated'}</time>
      <div class="note-card-actions">
        <button class="text-button" data-edit="${n.id}">Edit</button>
        <button class="text-button danger" data-delete="${n.id}" aria-label="Delete ${escape(n.title)}">Delete</button>
      </div>
    </article>`).join('') || '<p class="empty">No notes yet.</p>';
  return `${renderFilterBanner()}<div class="grid notes">${cards}</div>`;
}

function renderCalendar() {
  const pool = visibleItems();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + calendarMonthOffset;
  const start = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const pad = start.getDay();

  const cells = Array(pad).fill('<div class="calendar-day"></div>');
  for (let d = 1; d <= days; d++) {
    const date = new Date(year, month, d).toISOString().slice(0, 10);
    const events = pool
      .filter((i) => i.type === 'event' && i.date === date)
      .map((i) => `<div class="event-pill" data-edit="${i.id}">${escape(i.time ? i.time + ' ' : '') + escape(i.title)}</div>`)
      .join('');
    cells.push(`<div class="calendar-day"><div class="day-number">${d}</div>${events}</div>`);
  }

  const monthLabel = start.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  return `
    ${renderFilterBanner()}
    <section class="card">
      <div class="calendar-header">
        <button class="text-button" id="prev-month" aria-label="Previous month">\u2039</button>
        <h2>${monthLabel}</h2>
        <button class="text-button" id="next-month" aria-label="Next month">\u203a</button>
      </div>
      <div class="calendar">${cells.join('')}</div>
    </section>`;
}

function render() {
  $('#date-label').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  $('#page-title').textContent = activeView === 'today' ? 'Good morning' : activeView[0].toUpperCase() + activeView.slice(1);
  document.querySelectorAll('.nav-link').forEach((b) => b.classList.toggle('active', b.dataset.view === activeView));

  const renderers = { today: renderToday, tasks: renderTasks, notes: renderNotes, calendar: renderCalendar };
  $('#view-root').innerHTML = renderers[activeView] ? renderers[activeView]() : '';

  if (activeView === 'calendar') {
    $('#prev-month').onclick = () => { calendarMonthOffset -= 1; render(); };
    $('#next-month').onclick = () => { calendarMonthOffset += 1; render(); };
  }
  const clearBtn = $('#clear-filter');
  if (clearBtn) clearBtn.onclick = () => setTagFilter(null);
}

// ---------------------------------------------------------------------------
// Form dialog
// ---------------------------------------------------------------------------
function updateFieldsForType() {
  const type = $('#item-type').value;
  $('#date-field-label').textContent = type === 'task' ? 'Due date' : 'Date';
  $('#time-field').hidden = type === 'note';
  $('#markdown-hint').hidden = type !== 'note';
  $('#note-field-label').textContent = type === 'note' ? 'Content (markdown supported)' : 'Details';
}

function refreshRelated() {
  const tags = parseTags($('#item-tags').value);
  const excludeId = $('#item-id').value;
  const related = tags.length ? items.filter((i) => i.id !== excludeId && i.tags?.some((t) => tags.includes(t))) : [];
  $('#related-section').hidden = !tags.length;
  $('#related-list').innerHTML = related.length
    ? related.map((r) => `<button type="button" class="related-chip" data-open="${r.id}">${TYPE_ICON[r.type] || ''} ${escape(r.title)}</button>`).join('')
    : '<p class="empty-inline">No other items share these tags yet.</p>';
}

function refreshSubtasks() {
  const parentId = $('#item-id').value;
  const type = $('#item-type').value;
  const isTopLevelTask = type === 'task' && parentId && !$('#item-parent').value;
  $('#subtasks-section').hidden = !isTopLevelTask;
  if (!isTopLevelTask) return;

  const subtasks = items.filter((i) => i.parent_id === parentId);
  $('#subtask-list').innerHTML = subtasks.length
    ? subtasks.map((s) => `
      <div class="item">
        <button class="check ${s.done ? 'done' : ''}" data-sub-toggle="${s.id}" aria-label="Toggle done"></button>
        <div class="item-main"><div class="item-title">${escape(s.title)}</div></div>
        <button class="text-button danger" data-sub-delete="${s.id}" aria-label="Delete ${escape(s.title)}">Delete</button>
      </div>`).join('')
    : '<p class="empty-inline">No subtasks yet.</p>';
}

function openForm(item = {}) {
  $('#dialog-title').textContent = item.id ? 'Edit item' : 'Add item';
  $('#item-id').value = item.id || '';
  $('#item-parent').value = item.parent_id || '';
  $('#item-type').value = item.type || 'task';
  $('#item-title').value = item.title || '';
  $('#item-date').value = item.date || todayKey();
  $('#item-time').value = item.time || '';
  $('#item-body').value = item.body || '';
  $('#item-tags').value = (item.tags || []).join(', ');
  $('#delete-button').hidden = !item.id;
  updateFieldsForType();
  refreshRelated();
  refreshSubtasks();
  $('#item-dialog').showModal();
}

$('#new-button').onclick = () => openForm();
$('#item-type').addEventListener('change', updateFieldsForType);
$('#item-tags').addEventListener('input', refreshRelated);

$('#related-list').addEventListener('click', (e) => {
  const openId = e.target.dataset.open;
  if (!openId) return;
  const item = items.find((i) => i.id === openId);
  if (item) openForm(item);
});

$('#subtask-list').addEventListener('click', async (e) => {
  const toggleId = e.target.dataset.subToggle;
  const deleteId = e.target.dataset.subDelete;
  if (toggleId) {
    const sub = items.find((i) => i.id === toggleId);
    if (sub) { sub.done = !sub.done; await saveItem(sub); refreshSubtasks(); }
  }
  if (deleteId) {
    if (confirm('Delete this subtask?')) { await removeItem(deleteId); refreshSubtasks(); }
  }
});

async function addSubtask() {
  const title = $('#subtask-input').value.trim();
  const parentId = $('#item-id').value;
  if (!title || !parentId) return;
  await saveItem({
    id: crypto.randomUUID(),
    type: 'task',
    parent_id: parentId,
    title,
    date: null,
    time: '',
    body: '',
    tags: [],
    done: false,
  }, true);
  $('#subtask-input').value = '';
  refreshSubtasks();
}

$('#subtask-add-button').onclick = addSubtask;
$('#subtask-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); addSubtask(); }
});

$('#view-root').addEventListener('click', async (e) => {
  const toggleId = e.target.dataset.toggle;
  const editId = e.target.dataset.edit;
  const deleteId = e.target.dataset.delete;
  const tag = e.target.dataset.tag;

  if (tag) { setTagFilter(tag); return; }

  if (toggleId) {
    const item = items.find((i) => i.id === toggleId);
    if (item) { item.done = !item.done; await saveItem(item); }
    return;
  }
  if (deleteId) {
    const item = items.find((i) => i.id === deleteId);
    const hasSubtasks = items.some((i) => i.parent_id === deleteId);
    const warning = hasSubtasks ? ` and its subtasks` : '';
    if (item && confirm(`Delete "${item.title}"${warning}? This can't be undone.`)) {
      await removeItem(deleteId);
    }
    return;
  }
  if (editId) {
    const item = items.find((i) => i.id === editId);
    if (item) openForm(item);
  }
});

$('#item-form').addEventListener('submit', async (e) => {
  if (e.submitter?.value === 'cancel') return;
  e.preventDefault();

  const id = $('#item-id').value;
  const isNew = !id;
  const existing = items.find((i) => i.id === id) || {};
  const title = $('#item-title').value.trim();

  if (!title) {
    showMessage('Give it a title before saving.', true);
    return;
  }

  const ok = await saveItem({
    ...existing,
    id: id || crypto.randomUUID(),
    parent_id: $('#item-parent').value || null,
    type: $('#item-type').value,
    title,
    date: $('#item-date').value || null,
    time: $('#item-time').value,
    body: $('#item-body').value.trim(),
    tags: parseTags($('#item-tags').value),
    done: existing.done || false,
  }, isNew);

  if (ok) $('#item-dialog').close();
});

$('#delete-button').addEventListener('click', async () => {
  const id = $('#item-id').value;
  if (!id) return;
  const item = items.find((i) => i.id === id);
  const hasSubtasks = items.some((i) => i.parent_id === id);
  const warning = hasSubtasks ? ` and its subtasks` : '';
  if (item && confirm(`Delete "${item.title}"${warning}? This can't be undone.`)) {
    const ok = await removeItem(id);
    if (ok) $('#item-dialog').close();
  }
});

document.querySelectorAll('.nav-link').forEach((b) => {
  b.onclick = () => { activeView = b.dataset.view; activeTagFilter = null; render(); };
});

// ---------------------------------------------------------------------------
// Session + boot
// ---------------------------------------------------------------------------
async function requireSession() {
  if (hasCloud) {
    const { data: { session } } = await supabase.auth.getSession();
    user = session?.user || null;
    if (!user) { window.location.href = 'index.html'; return false; }
  } else {
    user = { id: 'local' };
  }
  return true;
}

async function start() {
  initTheme();
  const ok = await requireSession();
  if (!ok) return;
  $('#sync-status').textContent = hasCloud ? 'Synced securely' : 'Stored on this device';
  const avatar = $('#user-avatar');
  if (avatar) avatar.textContent = ((hasCloud && user?.email?.[0]) || 'D').toUpperCase();
  await loadItems();
}

const sidebarToggle = $('#sidebar-toggle');
if (sidebarToggle) {
  sidebarToggle.onclick = () => document.body.classList.toggle('sidebar-hidden');
}

$('#signout-button').onclick = async () => {
  if (hasCloud) await supabase.auth.signOut();
  window.location.href = 'index.html';
};

start();
