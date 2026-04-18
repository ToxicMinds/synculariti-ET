/**
 * Serverless function to securely provide Supabase Environment Variables to the frontend.
 */
module.exports = (req, res) => {
  // Try multiple naming conventions common in Vercel/Next setups
  const sbUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sbKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!sbUrl || !sbKey) {
    console.error("Environment Variable Missing:", { url: !!sbUrl, key: !!sbKey });
    return res.status(500).json({ 
      error: "Supabase credentials not found in Vercel environment.",
      details: "Check Vercel Dashboard > Settings > Environment Variables. Ensure SUPABASE_URL and SUPABASE_ANON_KEY are set for the 'Preview' environment."
    });
  }

  res.status(200).json({
    SB_URL: sbUrl,
    SB_KEY: sbKey
  });
};
