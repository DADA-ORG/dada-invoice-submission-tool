// api/update-record.js
// Updates (PATCHes) an *existing* invoice-request record with the
// candidate-onboarded follow-up fields (Q21 "本次入职确认的证据来源（可多选）"
// and Q22 "请上传入职证明"). Used by the "Complete Onboarding Proof" view —
// this must never create a new record, only write into the record_id that
// was created at the first submission.

const LARK_BASE  = 'https://open.larksuite.com/open-apis';
const APP_TOKEN  = process.env.LARK_BASE_APP_TOKEN || 'XpJKbk59AaKjQEswC1Gl8n7Rgsd';
const TABLE_ID   = process.env.LARK_BASE_TABLE_ID  || 'tblvgZhAwo0SBrKh';

async function getTenantToken(appId, appSecret) {
  const r = await fetch(`${LARK_BASE}/auth/v3/tenant_access_token/internal`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ app_id: appId, app_secret: appSecret }),
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
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { record_id, fields } = req.body || {};
  if (!record_id) return res.status(400).json({ error: 'Missing record_id' });
  if (!fields || typeof fields !== 'object') {
    return res.status(400).json({ error: 'Missing or invalid fields payload' });
  }

  const APP_ID     = process.env.LARK_APP_ID;
  const APP_SECRET = process.env.LARK_APP_SECRET;
  if (!APP_ID || !APP_SECRET) {
    return res.status(500).json({ error: 'Server misconfiguration: missing Lark credentials' });
  }

  try {
    // Drop empty values, same convention as /api/submit.
    const processedFields = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value === null || value === undefined) continue;
      if (Array.isArray(value) && value.length === 0) continue;
      processedFields[key] = value;
    }

    if (!Object.keys(processedFields).length) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const tenantToken = await getTenantToken(APP_ID, APP_SECRET);
    const url = `${LARK_BASE}/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records/${encodeURIComponent(record_id)}`;

    const r = await fetch(url, {
      method:  'PUT', // Lark's Bitable "update record" endpoint uses PUT (partial field update)
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${tenantToken}`,
      },
      body: JSON.stringify({ fields: processedFields }),
    });
    const data = await r.json();

    if (data.code !== 0) {
      console.error('[update-record] Lark API error:', data);
      return res.status(400).json({
        error: `Lark Base API error: ${data.msg}`,
        code:  data.code,
        detail: data,
      });
    }

    return res.status(200).json({ success: true, record_id: data.data?.record?.record_id || record_id });
  } catch (err) {
    console.error('[update-record] Unexpected error:', err);
    return res.status(500).json({ error: err.message });
  }
};
