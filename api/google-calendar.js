/**
 * Proxy for Google Calendar API
 */
module.exports = async (req, res) => {
  const { action, code } = req.query;

  // Real implementers will read Vercel env variables:
  // process.env.GCAL_CLIENT_ID
  // process.env.GCAL_CLIENT_SECRET
  // Doing a dummy simulation for frontend completion.

  if (action === 'auth') {
    // Generate auth URL
    // In real prod, this redirects to Google's standard OAuth window
    
    // Simulating user clicking "Allow":
    return res.redirect('/api/google-calendar?action=callback&code=simulated_auth_code_from_google');
  }

  if (action === 'callback' && code) {
    // In reality this fetches token exchange logic -> access_token & refresh_token
    const simulated_token = "oauth2_refresh_token_" + Math.random().toString(36).substring(7);
    
    // Redirect the frontend to parse the parameters and update app_state
    return res.redirect('/?gcal_success=true&token=' + simulated_token);
  }

  if (action === 'sync') {
    // Expected to receive invoice data and sync
    return res.status(200).json({ success: true, message: 'Simulated sync to Google Calendar.' });
  }

  res.status(400).json({ error: 'Unknown action' });
};
