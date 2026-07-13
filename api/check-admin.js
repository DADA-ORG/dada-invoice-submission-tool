// api/check-admin.js
// Checks whether a logged-in user (identified by open_id) is in the
// "Admin for Invoice Submission" table (Person field).

const LARK_BASE       = 'https://open.larksuite.com/open-apis';
const APP_TOKEN       = process.env.LARK_BASE_APP_TOKEN || 'XpJKbk59AaKjQEswC1Gl8n7Rgsd';
const ADMIN_TABLE_ID  = 'tblLDQH1SWfePmwB';

async function getTenantToken(appId, appSecret) {
  const r = await fetch(`${LARK_BASE}/auth/v3/tenant_access_token/internal`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const data = await r.json();
  if (!data.tenant_access_token) throw new Error('Failed to get tenant token');
  return data.tenant_access_token;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { open_id } = req.body || {};
  if (!open_id) return res.status(400).json({ error: 'Missing open_id' });

  const APP_ID     = process.env.LARK_APP_ID;
  const APP_SECRET = process.env.LARK_APP_SECRET;
  if (!APP_ID || !APP_SECRET) {
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  try {
    const tenantToken = await getTenantToken(APP_ID, APP_SECRET);

    // Fetch all records from the admin table (small table, single page is fine)
    const url = `${LARK_BASE}/bitable/v1/apps/${APP_TOKEN}/tables/${ADMIN_TABLE_ID}/records?page_size=100`;
    const r = await fetch(url, {
      headers: { 'Authorization': `Bearer ${tenantToken}` },
    });
    const data = await r.json();

    if (data.code !== 0) {
      console.error('[check-admin] Lark API error:', data);
      return res.status(500).json({ error: 'Failed to fetch admin table', detail: data });
    }

    // The Person field returns an array of { id, name, en_name, ... }
    // where `id` is the user's open_id.
    const adminIds = new Set();
    for (const record of (data.data?.items || [])) {
      const persons = record.fields?.Person;
      if (Array.isArray(persons)) {
        for (const p of persons) {
          if (p.id) adminIds.add(p.id);
        }
      }
    }

    return res.status(200).json({ is_admin: adminIds.has(open_id) });
  } catch (err) {
    console.error('[check-admin] Unexpected error:', err);
    return res.status(500).json({ error: err.message });
  }
};
