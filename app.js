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

const $ = (selector) => document.querySelector(selector);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let activeView = 'today';
let user = null;
let items = [];
let calendarMonthOffset = 0; // 0 = current month, -1 = previous, +1 = next

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Status messages (visible feedback for the user, not just console.error)
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
    { id: crypto.randomUUID(), type: 'event', title: 'Weekly planning', date, time: '09:30', body: '' },
    { id: crypto.randomUUID(), type: 'task', title: 'Choose this week\u2019s top priorities', date, done: false, body: '' },
    { id: crypto.randomUUID(), type: 'note', title: 'Welcome to Momentum', date, body: 'Capture a thought here, then connect it to the work and time it needs.' },
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

  items = items.filter((x) => x.id !== id);
  saveLocal();
  render();
  return true;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function escape(s = '') {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function itemRow(item, withCheck = true) {
  const checkHidden = item.type !== 'task' || !withCheck ? 'style="visibility:hidden"' : '';
  return `
    <div class="item">
      <button class="check ${item.done ? 'done' : ''}" data-toggle="${item.id}" ${checkHidden} aria-label="Toggle done"></button>
      <div class="item-main">
        <div class="item-title">${escape(item.title)}</div>
        <div class="item-meta">${item.time || item.date || 'No date'}${item.body ? ' \u00b7 ' + escape(item.body.slice(0, 45)) : ''}</div>
      </div>
      <button class="text-button" data-edit="${item.id}">Edit</button>
      <button class="text-button danger" data-delete="${item.id}" aria-label="Delete ${escape(item.title)}">Delete</button>
    </div>`;
}

function renderToday() {
  const todays = items.filter((i) => i.date === todayKey());
  const tasksAndEvents = todays.filter((i) => i.type !== 'note').map((i) => itemRow(i)).join('') || '<p class="empty">Nothing scheduled yet. Enjoy the space.</p>';
  const notes = items.filter((i) => i.type === 'note').slice(0, 3).map((i) => itemRow(i, false)).join('') || '<p class="empty">Write a note to hold onto an idea.</p>';
  return `
    <div class="grid today-grid">
      <section class="card"><h2>Today\u2019s plan</h2><div class="item-list">${tasksAndEvents}</div></section>
      <section class="card"><h2>Notes for today</h2><div class="item-list">${notes}</div></section>
    </div>`;
}

function renderTasks() {
  const tasks = items.filter((i) => i.type === 'task');
  const open = tasks.filter((t) => !t.done).length;
  const rows = tasks.map((i) => itemRow(i)).join('') || '<p class="empty">No tasks yet.</p>';
  return `<section class="card"><h2>${open} open task${open === 1 ? '' : 's'}</h2><div class="item-list">${rows}</div></section>`;
}

function renderNotes() {
  const notes = items.filter((i) => i.type === 'note');
  const cards = notes.map((n) => `
    <article class="card note-card">
      <div class="item-title">${escape(n.title)}</div>
      <p>${escape(n.body || 'No details yet.')}</p>
      <time>${n.date || 'Undated'}</time>
      <div class="note-card-actions">
        <button class="text-button" data-edit="${n.id}">Edit</button>
        <button class="text-button danger" data-delete="${n.id}" aria-label="Delete ${escape(n.title)}">Delete</button>
      </div>
    </article>`).join('') || '<p class="empty">No notes yet.</p>';
  return `<div class="grid notes">${cards}</div>`;
}

function renderCalendar() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + calendarMonthOffset;
  const start = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const pad = start.getDay();

  const cells = Array(pad).fill('<div class="calendar-day"></div>');
  for (let d = 1; d <= days; d++) {
    const date = new Date(year, month, d).toISOString().slice(0, 10);
    const events = items
      .filter((i) => i.type === 'event' && i.date === date)
      .map((i) => `<div class="event-pill" data-edit="${i.id}">${escape(i.time ? i.time + ' ' : '') + escape(i.title)}</div>`)
      .join('');
    cells.push(`<div class="calendar-day"><div class="day-number">${d}</div>${events}</div>`);
  }

  const monthLabel = start.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  return `
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
}

// ---------------------------------------------------------------------------
// Form dialog
// ---------------------------------------------------------------------------
function openForm(item = {}) {
  $('#dialog-title').textContent = item.id ? 'Edit item' : 'Add item';
  $('#item-id').value = item.id || '';
  $('#item-type').value = item.type || 'task';
  $('#item-title').value = item.title || '';
  $('#item-date').value = item.date || todayKey();
  $('#item-time').value = item.time || '';
  $('#item-body').value = item.body || '';
  $('#delete-button').hidden = !item.id;
  $('#item-dialog').showModal();
}

$('#new-button').onclick = () => openForm();

$('#view-root').addEventListener('click', async (e) => {
  const toggleId = e.target.dataset.toggle;
  const editId = e.target.dataset.edit;
  const deleteId = e.target.dataset.delete;

  if (toggleId) {
    const item = items.find((i) => i.id === toggleId);
    if (item) { item.done = !item.done; await saveItem(item); }
    return;
  }
  if (deleteId) {
    const item = items.find((i) => i.id === deleteId);
    if (item && confirm(`Delete "${item.title}"? This can't be undone.`)) {
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
    type: $('#item-type').value,
    title,
    date: $('#item-date').value,
    time: $('#item-time').value,
    body: $('#item-body').value.trim(),
    done: existing.done || false,
  }, isNew);

  if (ok) $('#item-dialog').close();
});

$('#delete-button').addEventListener('click', async () => {
  const id = $('#item-id').value;
  if (!id) return;
  const item = items.find((i) => i.id === id);
  if (item && confirm(`Delete "${item.title}"? This can't be undone.`)) {
    const ok = await removeItem(id);
    if (ok) $('#item-dialog').close();
  }
});

document.querySelectorAll('.nav-link').forEach((b) => {
  b.onclick = () => { activeView = b.dataset.view; render(); };
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
  const ok = await requireSession();
  if (!ok) return;
  $('#sync-status').textContent = hasCloud ? 'Synced securely' : 'Stored on this device';
  await loadItems();
}

$('#signout-button').onclick = async () => {
  if (hasCloud) await supabase.auth.signOut();
  window.location.href = 'index.html';
};

start();
