/* ═══════════════════════════════════════════════
   AUTHENTICATION & HOUSEHOLD MANAGEMENT
   Extracted from ui.js for cleaner architecture.
   ═══════════════════════════════════════════════ */

/**
 * Main entry point for all authentication modes.
 * Unified mode handles both legacy PINs and new Handles.
 */
async function executeAuth(mode) {
  var err = document.getElementById('auth-error');
  var codeInp = document.getElementById('auth-code')?.value?.trim();
  
  if (mode === 'unified') {
    if (!codeInp) { 
      err.textContent = 'Please enter a PIN or Handle'; 
      return; 
    }
    
    // 1. LEGACY 4-DIGIT PIN (Bridge to /api/pin-auth)
    if (/^\d{4}$/.test(codeInp)) {
      err.style.color = 'var(--nikhil)';
      err.textContent = 'Unlocking family household...';
      try {
        const res = await fetch('/api/pin-auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: codeInp })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'PIN validation failed');

        await supabaseClient.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token
        });
        window.location.reload();
      } catch (e) {
        err.style.color = 'var(--danger)';
        err.textContent = e.message;
      }
      return;
    }

    // 2. HANDLE ENTRY
    // Check if it exists and then prompt Google login to link identity
    err.style.color = 'var(--accent)';
    err.textContent = 'Checking handle...';
    try {
       // Search case-insensitively for handles
       const lowerCode = codeInp.toLowerCase();
       const { data, error } = await supabaseClient.rpc('verify_household_access', { input_code: lowerCode });
       
       if (error) {
         console.error("Auth lookup failed:", error);
         throw new Error("Could not verify handle. Ensure database migration is applied.");
       }
       
       if (!data || data.length === 0) throw new Error("Invalid code or handle.");
       
       err.textContent = "Household found! Please sign in with Google to continue.";
       localStorage.setItem('pending_join_handle', codeInp);
       setTimeout(() => executeAuth('google'), 1500);
    } catch(e) {
       err.style.color = 'var(--danger)';
       err.textContent = e.message;
    }
    return;
  }

  if (mode === 'google') {
    err.textContent = 'Connecting to Google...';
    try {
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin.replace(/\/$/, "").trim()
        }
      });
      if (error) throw error;
    } catch(e) { err.textContent = e.message; }
    return;
  }
}

/**
 * Allows a user to join an existing household via Handle and PIN.
 */
async function joinHousehold() {
  const handle = document.getElementById('ob-join-handle').value.trim();
  const pin = document.getElementById('ob-join-pin').value.trim();
  const err = document.getElementById('ob-join-err');
  
  if (!handle || !pin) { err.textContent = 'Enter both Handle and PIN'; return; }
  
  const lowerHandle = handle.toLowerCase();
  if (typeof setSyncing === 'function') setSyncing('s');
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) throw new Error("No active session. Please sign in first.");
    
    // 1. Verify handle and PIN
    const { data: house, error: hErr } = await supabaseClient
      .from('households')
      .select('id, access_pin')
      .eq('handle', lowerHandle)
      .maybeSingle();
      
    if (hErr) {
        console.error("Join lookup error:", hErr);
        throw new Error("Query failed. Please ensure the SQL migration is applied to your database.");
    }
    if (!house) throw new Error("Household handle not found.");
    if (house.access_pin !== pin) throw new Error("Incorrect Household PIN.");
    
    // 2. Link user to this household
    const { error: linkErr } = await supabaseClient
      .from('app_users')
      .insert({ id: session.user.id, household_id: house.id });
      
    if (linkErr) throw linkErr;
    
    HOUSEHOLD_ID = house.id;
    document.getElementById('onboarding-modal').classList.remove('open');
    location.reload();
  } catch(e) {
    if (err) err.textContent = e.message;
    if (typeof setSyncing === 'function') setSyncing('e');
  }
}

function copyHID() {
  const handle = document.getElementById('set-h-handle')?.value || '';
  const pin = document.getElementById('set-h-pin')?.value || '';
  const shareText = `Join my household on ET Expense!\nHandle: ${handle}\nPIN: ${pin}`;
  
  if (navigator.share) {
    navigator.share({ title: 'Join ET Expense', text: shareText });
  } else {
    navigator.clipboard.writeText(shareText);
    if (typeof flash === 'function') flash('Join details copied to clipboard!');
    else alert('Join details copied to clipboard!');
  }
}

/**
 * Creates a brand new household with a generated handle and PIN.
 */
async function provisionHousehold(name) {
  if (!supabaseClient) throw new Error("Storage engine not ready");
  
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) throw new Error("No active session");
    
    // 1. Generate Friendly Handle & PIN
    const base = name.split(' ')[0].replace(/[^a-z0-9]/gi, '').toLowerCase();
    const handle = base + '-' + Math.floor(Math.random() * 90 + 10);
    const pin = Math.floor(Math.random() * 9000 + 1000).toString();

    // 2. Create Household Row 
    const { data: house, error: houseErr } = await supabaseClient
      .from('households')
      .insert({ name: name, handle: handle, access_pin: pin })
      .select('id')
      .single();
      
    if (houseErr) throw houseErr;
    if (!house) throw new Error("Household creation failed (no data)");

    // 3. Link User to Household 
    const { error: mappingErr } = await supabaseClient
      .from('app_users')
      .insert({ id: session.user.id, household_id: house.id });
    
    if (mappingErr) throw mappingErr;

    HOUSEHOLD_ID = house.id;
    HOUSEHOLD_HANDLE = handle;
    HOUSEHOLD_PIN = pin;
    return true;
  } catch(e) {
    console.error("Provisioning failed:", e.message);
    throw e;
  }
}

/**
 * Finalizes onboarding by creating a household and setting initial member names.
 */
async function finishOB() {
  if (typeof setSyncing === 'function') setSyncing('s');
  
  // 1. Collect names
  const members = Array.from(document.querySelectorAll('.ob-m-name'))
    .map(i => i.value.trim())
    .filter(v => v !== '');
  
  var newNames = {};
  var newInc = {};
  members.forEach((m, idx) => {
    newNames['u' + (idx+1)] = m;
    newInc['u' + (idx+1)] = 1;
  });
  
  NAMES = newNames;
  INCOME = newInc;
  
  const langEl = document.getElementById('ob-lang');
  if (langEl) {
    LANG = langEl.value;
    localStorage.setItem('sf_lang', LANG);
  }
  
  localStorage.setItem('sf_names', JSON.stringify(NAMES));
  localStorage.setItem('sf_income', JSON.stringify(INCOME));
  
  try {
    const hname = document.getElementById('ob-hname').value || 'My Household';
    await provisionHousehold(hname);
    
    // Save state (names, etc)
    if (typeof sbSaveState === 'function') await sbSaveState();
    
    document.getElementById('onboarding-modal').classList.remove('open');
    location.reload();
  } catch(e) {
    console.error("Onboarding failed:", e);
    alert("Onboarding failed: " + e.message);
    if (typeof setSyncing === 'function') setSyncing('e');
  }
}

/**
 * Sign out and reload.
 */
async function logout() {
  if (!confirm("Are you sure you want to log out?")) return;
  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    if (typeof flash === 'function') flash(error.message, true);
    else alert(error.message);
  }
  location.reload();
}
