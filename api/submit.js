// api/submit.js
// Creates a new record in the Lark Base "Client Invoice Tracker" table.
//
// Token strategy:
//   1. Try with user_access_token first — this makes Lark record the real submitter
//      as the Creator (shown as "Respondent" in form-linked tables).
//   2. If the user token is absent OR the Bitable call fails (e.g. permission error),
//      fall back to tenant_access_token so the form can still be submitted.

const LARK_BASE = 'https://open.larksuite.com/open-apis';

const DATE_FIELDS = new Set([
  'Onboarding date',
  'Offer accept date of candidate',
]);

// Number-type Base fields — the frontend sends these as strings (from
// <input type="number">), but Lark's Bitable API expects an actual JSON
// number for Number fields, so convert before sending.
const NUMBER_FIELDS = new Set([
  'Basic Salary/ Month',
  'Month',
  'Annual Salary',
]);

async function getTenantToken(appId, appSecret) {
  const r = await fetch(`${LARK_BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const data = await r.json();
  if (!data.tenant_access_token) throw new Error('Failed to get tenant token: ' + JSON.stringify(data));
  return data.tenant_access_token;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { fields, user_access_token, open_id } = req.body || {};
  if (!fields || typeof fields !== 'object') {
    return res.status(400).json({ error: 'Missing or invalid fields payload' });
  }

  const APP_ID     = process.env.LARK_APP_ID;
  const APP_SECRET = process.env.LARK_APP_SECRET;
  const APP_TOKEN  = process.env.LARK_BASE_APP_TOKEN || 'XpJKbk59AaKjQEswC1Gl8n7Rgsd';
  const TABLE_ID   = process.env.LARK_BASE_TABLE_ID  || 'tblvgZhAwo0SBrKh';

  if (!APP_ID || !APP_SECRET) {
    return res.status(500).json({ error: 'Server misconfiguration: missing Lark credentials' });
  }

  try {
    // ── Build the fields payload ────────────────────────────────────────────
    const processedFields = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value === null || value === undefined || value === '') continue;
      if (DATE_FIELDS.has(key) && typeof value === 'string') {
        const ts = new Date(value).getTime();
        if (!isNaN(ts)) processedFields[key] = ts;
      } else if (NUMBER_FIELDS.has(key) && typeof value === 'string') {
        const num = Number(value);
        if (!isNaN(num)) processedFields[key] = num;
      } else {
        processedFields[key] = value;
      }
    }

    // Set "Respondent" (Person field, type 11) with the submitter's open_id.
    // Note: "Respondents" (type 1003) is the Creator field and cannot be written via API.
    if (open_id) {
      processedFields['Respondent'] = [{ id: open_id }];
    }

    const recordUrl = `${LARK_BASE}/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records`;

    // ── Try with user_access_token first ────────────────────────────────────
    // When a record is created with a user token, Lark automatically sets the
    // Creator (= "Respondent" in form view) to that user — no extra field needed.
    if (user_access_token) {
      console.log('[submit] Attempting with user_access_token...');
      const userRes = await fetch(recordUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user_access_token}`,
        },
        body: JSON.stringify({ fields: processedFields }),
      });
      const userData = await userRes.json();

      if (userData.code === 0) {
        return res.status(200).json({
          success: true,
          record_id: userData.data?.record?.record_id,
        });
      }
      // User token failed — fall through to tenant token
    }

    // ── Fall back to tenant_access_token ────────────────────────────────────
    const tenantToken = await getTenantToken(APP_ID, APP_SECRET);
    const tenantRes = await fetch(recordUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
      },
      body: JSON.stringify({ fields: processedFields }),
    });
    const tenantData = await tenantRes.json();

    if (tenantData.code !== 0) {
      return res.status(400).json({
        error: `Lark Base API error: ${tenantData.msg}`,
        code: tenantData.code,
        detail: tenantData,
      });
    }

    return res.status(200).json({
      success: true,
      record_id: tenantData.data?.record?.record_id,
    });

  } catch (err) {
    console.error('[submit] Unexpected error:', err);
    return res.status(500).json({ error: err.message });
  }
};
