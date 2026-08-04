const config = window.PLANNER_CONFIG || { supabaseUrl: '', supabaseAnonKey: '' };
const hasCloud = Boolean(config.supabaseUrl && config.supabaseAnonKey);
let supabase = null;

if (hasCloud) {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
}

const $ = (selector) => document.querySelector(selector);
const authShell = $('#auth-shell') || $('#auth-container');
const appShell = $('#app-shell') || $('#app-container');
const dialog = $('#item-dialog');

let activeView = 'today', user = null, items = [];
const dateKey = new Date().toISOString().slice(0, 10);

function localItems() {
  return JSON.parse(localStorage.getItem('momentum-items') || '[]');
}

function seedItems() {
  return [
    { id: crypto.randomUUID(), type: 'event', title: 'Weekly planning', date: dateKey, time: '09:30', body: '' },
    { id: crypto.randomUUID(), type: 'task', title: 'Choose this week’s top priorities', date: dateKey, done: false, body: '' },
    { id: crypto.randomUUID(), type: 'note', title: 'Welcome to Momentum', date: dateKey, body: 'Capture a thought here, then connect it to the work and time it needs.' }
  ];
}

async function loadItems() {
  if (hasCloud) {
    const { data, error } = await supabase.from('items').select('*').order('created_at', { ascending: false });
    if (error) return setMessage(error.message);
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

function saveLocal() {
  localStorage.setItem('momentum-items', JSON.stringify(items));
}

async function saveItem(item, isNew) {
  if (hasCloud) {
    const payload = { ...item, user_id: user.id };
    delete payload.id;
    const result = isNew
      ? await supabase.from('items').insert(payload)
      : await supabase.from('items').update(payload).eq('id', item.id);
    if (result.error) return setMessage(result.message);
    await loadItems();
  } else {
    const i = items.findIndex(x => x.id === item.id);
    i < 0 ? items.unshift(item) : items[i] = item;
    saveLocal();
    render();
  }
}

async function removeItem(id) {
  if (hasCloud) {
    await supabase.from('items').delete().eq('id', id);
    await loadItems();
  } else {
    items = items.filter(x => x.id !== id);
    saveLocal();
    render();
  }
}

function setMessage(message) {
  const msgEl = $('#auth-message');
  if (msgEl) msgEl.textContent = message;
}

function itemRow(item, withCheck = true) {
  return `<div class="item">
    <button class="check ${item.done ? 'done' : ''}" data-toggle="${item.id}" ${item.type !== 'task' || !withCheck ? 'style="visibility:hidden"' : ''}></button>
    <div class="item-main">
      <div class="item-title">${escape(item.title)}</div>
      <div class="item-meta">${item.time || item.date || 'No date'}${item.body ? ' · ' + escape(item.body.slice(0, 45)) : ''}</div>
    </div>
    <button class="text-button" data-edit="${item.id}">Edit</button>
  </div>`;
}

function escape(s = '') {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function render() {
  const dateLabel = $('#date-label');
  const pageTitle = $('#page-title');
  if (dateLabel) dateLabel.textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  if (pageTitle) pageTitle.textContent = activeView === 'today' ? 'Good morning' : activeView[0].toUpperCase() + activeView.slice(1);

  document.querySelectorAll('.nav-link').forEach(b => b.classList.toggle('active', b.dataset.view === activeView));

  let html = '';
  if (activeView === 'today') {
    const todays = items.filter(i => i.date === dateKey);
    html = `<div class="grid today-grid">
      <section class="card">
        <h2>Today’s plan</h2>
        <div class="item-list">
          ${todays.filter(i => i.type !== 'note').map(i => itemRow(i)).join('') || '<p class="empty">Nothing scheduled yet. Enjoy the space.</p>'}
        </div>
      </section>
      <section class="card">
        <h2>Notes for today</h2>
        <div class="item-list">
          ${items.filter(i => i.type === 'note').slice(0, 3).map(i => itemRow(i, false)).join('') || '<p class="empty">Write a note to hold onto an idea.</p>'}
        </div>
      </section>
    </div>`;
  }

  if (activeView === 'tasks') {
    const tasks = items.filter(i => i.type === 'task');
    html = `<section class="card">
      <h2>${tasks.filter(t => !t.done).length} open tasks</h2>
      <div class="item-list">
        ${tasks.map(i => itemRow(i)).join('') || '<p class="empty">No tasks yet.</p>'}
      </div>
    </section>`;
  }

  if (activeView === 'notes') {
    const notes = items.filter(i => i.type === 'note');
    html = `<div class="grid notes">
      ${notes.map(n => `<article class="card note-card">
        <div class="item-title">${escape(n.title)}</div>
        <p>${escape(n.body || 'No details yet.')}</p>
        <time>${n.date || 'Undated'}</time>
        <button class="text-button" data-edit="${n.id}">Edit</button>
      </article>`).join('') || '<p class="empty">No notes yet.</p>'}
    </div>`;
  }

  if (activeView === 'calendar') {
    const now = new Date(), year = now.getFullYear(), month = now.getMonth();
    const start = new Date(year, month, 1), days = new Date(year, month + 1, 0).getDate(), pad = start.getDay();
    let cells = Array(pad).fill('<div class="calendar-day"></div>');

    for (let d = 1; d <= days; d++) {
      const date = new Date(year, month, d).toISOString().slice(0, 10);
      cells.push(`<div class="calendar-day">
        <div class="day-number">${d}</div>
        ${items.filter(i => i.type === 'event' && i.date === date).map(i => `<div class="event-pill" data-edit="${i.id}">${escape(i.time ? i.time + ' ' : '') + escape(i.title)}</div>`).join('')}
      </div>`);
    }

    html = `<section class="card">
      <h2>${now.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</h2>
      <div class="calendar">${cells.join('')}</div>
    </section>`;
  }

  const viewRoot = $('#view-root');
  if (viewRoot) viewRoot.innerHTML = html;
}

function openForm(item = {}) {
  if (!dialog) return;
  $('#dialog-title').textContent = item.id ? 'Edit item' : 'Add item';
  $('#item-id').value = item.id || '';
  $('#item-type').value = item.type || 'task';
  $('#item-title').value = item.title || '';
  $('#item-date').value = item.date || dateKey;
  $('#item-time').value = item.time || '';
  $('#item-body').value = item.body || '';
  dialog.showModal();
}

// UI Event Listeners
const newButton = $('#new-button');
if (newButton) newButton.onclick = () => openForm();

const viewRoot = $('#view-root');
if (viewRoot) {
  viewRoot.onclick = async (e) => {
    const id = e.target.dataset.toggle || e.target.dataset.edit;
    if (!id) return;
    const item = items.find(i => i.id === id);
    if (e.target.dataset.toggle) {
      item.done = !item.done;
      await saveItem(item);
    } else {
      openForm(item);
    }
  };
}

const itemForm = $('#item-form');
if (itemForm) {
  itemForm.addEventListener('submit', async (e) => {
    if (e.submitter?.value === 'cancel') return;
    e.preventDefault();
    const id = $('#item-id').value;
    const isNew = !id;
    const existing = items.find(i => i.id === id) || {};
    await saveItem({
      ...existing,
      id: id || crypto.randomUUID(),
      type: $('#item-type').value,
      title: $('#item-title').value.trim(),
      date: $('#item-date').value,
      time: $('#item-time').value,
      body: $('#item-body').value.trim(),
      done: existing.done || false
    }, isNew);
    dialog.close();
  });
}

document.querySelectorAll('.nav-link').forEach(b => {
  b.onclick = () => {
    activeView = b.dataset.view;
    render();
  };
});

// View Toggle Helper preserving original interface layout
function updateUI(session) {
  if (session) {
    if (authShell) authShell.classList.add('hidden');
    if (appShell) appShell.classList.remove('hidden');
    const syncStatus = $('#sync-status');
    if (syncStatus) syncStatus.textContent = hasCloud ? 'Synced securely' : 'Stored on this device';
    loadItems();
  } else {
    if (authShell) authShell.classList.remove('hidden');
    if (appShell) appShell.classList.add('hidden');
  }
}

// Original Auth Interface Initialization
async function start() {
  if (hasCloud) {
    const { data: { session } } = await supabase.auth.getSession();
    user = session?.user || null;

    supabase.auth.onAuthStateChange((event, session) => {
      user = session?.user || null;
      updateUI(session);
    });
  } else {
    user = { id: 'local' };
  }

  updateUI(user);
}

const authForm = $('#auth-form');
if (authForm) {
  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!hasCloud) return updateUI({ id: 'local' });

    const email = $('#email').value;
    const password = $('#password').value;

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMessage(error.message);
  });
}

const signupButton = $('#signup-button');
if (signupButton) {
  signupButton.onclick = async () => {
    if (!hasCloud) return setMessage('Demo mode does not require an account — use Sign in.');
    const email = $('#email').value;
    const password = $('#password').value;
    const { error } = await supabase.auth.signUp({ email, password });
    setMessage(error ? 'Could not create account: ' + error.message : 'Account created — check your email to confirm it.');
  };
}

const signoutButton = $('#signout-button');
if (signoutButton) {
  signoutButton.onclick = async () => {
    if (hasCloud) await supabase.auth.signOut();
    user = null;
    updateUI(null);
  };
}

start();
