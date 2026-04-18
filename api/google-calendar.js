/**
 * Proxy for Google Calendar API
 */
module.exports = async (req, res) => {
  const { action } = req.query;

  if (action === 'auth') {
    // Generate auth URL
    // In real prod, this redirects to https://accounts.google.com/o/oauth2/v2/auth
    return res.redirect('/?simulate_gcal_auth=success');
  }

  if (action === 'sync') {
    // Expected to receive invoice data and sync
    return res.status(200).json({ success: true, message: 'Simulated sync to Google Calendar.' });
  }

  res.status(400).json({ error: 'Unknown action' });
};
