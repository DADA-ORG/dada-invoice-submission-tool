// api/auth-login.js
// Exchanges a Lark OAuth authorization code for the user's open_id, name, and user_access_token.

const LARK_BASE = 'https://open.larksuite.com/open-apis';

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Missing code' });

  const APP_ID     = process.env.LARK_APP_ID;
  const APP_SECRET = process.env.LARK_APP_SECRET;
  if (!APP_ID || !APP_SECRET) {
    return res.status(500).json({ error: 'Server misconfiguration: missing LARK_APP_ID or LARK_APP_SECRET' });
  }

  try {
    // Step 1: Get app_access_token
    const appTokenRes = await fetch(`${LARK_BASE}/auth/v3/app_access_token/internal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }),
    });
    const appTokenData = await appTokenRes.json();
    const appToken = appTokenData.app_access_token;
    if (!appToken) {
      return res.status(500).json({ error: 'Failed to get app_access_token', detail: appTokenData });
    }

    // Step 2: Exchange authorization code for user_access_token.
    // CRITICAL: app_access_token goes in the REQUEST BODY (not Authorization header).
    const tokenRes = await fetch(`${LARK_BASE}/authen/v1/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        app_access_token: appToken,
      }),
    });
    const tokenData = await tokenRes.json();

    const d = tokenData.data || {};
    const userAccessToken = d.access_token || d.user_access_token || '';
    const open_id         = d.open_id  || '';
    const name            = d.name     || d.en_name || '';
    const avatar_url      = d.avatar_url || d.avatar_middle || '';

    if (!userAccessToken || !open_id) {
      return res.status(401).json({
        error:     'Failed to exchange code for user token',
        lark_code: tokenData.code,
        lark_msg:  tokenData.msg,
      });
    }

    return res.status(200).json({ open_id, name, avatar_url, user_access_token: userAccessToken });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
