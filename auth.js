const config = window.PLANNER_CONFIG || { supabaseUrl: '', supabaseAnonKey: '' };
const hasCloud = Boolean(config.supabaseUrl && config.supabaseAnonKey);
let supabase = null;
if (hasCloud) {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
}

const $ = (selector) => document.querySelector(selector);
function setMessage(message) { $('#auth-message').textContent = message; }

async function redirectIfSignedIn() {
  if (!hasCloud) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (session) window.location.href = 'app.html';
}

$('#auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!hasCloud) { window.location.href = 'app.html'; return; }
  const { error } = await supabase.auth.signInWithPassword({ email: $('#email').value, password: $('#password').value });
  if (error) setMessage(error.message);
  else window.location.href = 'app.html';
});

$('#signup-button').onclick = async () => {
  if (!hasCloud) return setMessage('Demo mode does not require an account — use Sign in.');
  const { error } = await supabase.auth.signUp({ email: $('#email').value, password: $('#password').value });
  setMessage(error ? 'Could not create account: ' + error.message : 'Account created — check your email to confirm it.');
};

redirectIfSignedIn();
