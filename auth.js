const config = window.PLANNER_CONFIG || { supabaseUrl: '', supabaseAnonKey: '' };
const hasCloud = Boolean(config.supabaseUrl && config.supabaseAnonKey);
let supabase = null;

if (hasCloud) {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
}

const $ = (selector) => document.querySelector(selector);
const form = $('#auth-form');
const signInButton = $('#signin-button');
const signUpButton = $('#signup-button');

function setMessage(message, isError = false) {
  const el = $('#auth-message');
  el.textContent = message;
  el.classList.toggle('error', isError);
}

function setBusy(busy) {
  signInButton.disabled = busy;
  signUpButton.disabled = busy;
}

async function redirectIfSignedIn() {
  if (!hasCloud) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (session) window.location.href = 'app.html';
}

function getCredentials() {
  const email = $('#email').value.trim();
  const password = $('#password').value;
  if (!email) return { error: 'Enter your email address.' };
  if (password.length < 6) return { error: 'Password must be at least 6 characters.' };
  return { email, password };
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!hasCloud) { window.location.href = 'app.html'; return; }

  const creds = getCredentials();
  if (creds.error) return setMessage(creds.error, true);

  setBusy(true);
  setMessage('Signing in…');
  try {
    const { error } = await supabase.auth.signInWithPassword(creds);
    if (error) setMessage(error.message, true);
    else window.location.href = 'app.html';
  } catch (err) {
    setMessage('Could not reach the server. Check your connection and try again.', true);
  } finally {
    setBusy(false);
  }
});

signUpButton.addEventListener('click', async () => {
  if (!hasCloud) return setMessage('Demo mode does not require an account — use Sign in.');

  const creds = getCredentials();
  if (creds.error) return setMessage(creds.error, true);

  setBusy(true);
  setMessage('Creating account…');
  try {
    const { error } = await supabase.auth.signUp(creds);
    setMessage(
      error ? 'Could not create account: ' + error.message : 'Account created — check your email to confirm it.',
      Boolean(error)
    );
  } catch (err) {
    setMessage('Could not reach the server. Check your connection and try again.', true);
  } finally {
    setBusy(false);
  }
});

redirectIfSignedIn();
