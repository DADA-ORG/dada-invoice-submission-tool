// api/get-record.js
// Read-only lookup of a single invoice-request record by record_id, used by
// the "Complete Onboarding Proof" follow-up view (opened via a dedicated
// "?complete=recXXXX" link) so the submitter can confirm which invoice
// request they're about to update before filling in Q21/Q22.

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
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  const recordId = String((req.query && req.query.record_id) || '').trim();
  if (!recordId) return res.status(400).json({ error: 'Missing record_id' });

  const APP_ID     = process.env.LARK_APP_ID;
  const APP_SECRET = process.env.LARK_APP_SECRET;
  if (!APP_ID || !APP_SECRET) {
    return res.status(500).json({ error: 'Server misconfiguration: missing Lark credentials' });
  }

  try {
    const tenantToken = await getTenantToken(APP_ID, APP_SECRET);

    const url = `${LARK_BASE}/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records/${encodeURIComponent(recordId)}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${tenantToken}` } });
    const data = await r.json();

    if (data.code !== 0) {
      // Most common cause: bad/old record_id, or record was deleted.
      return res.status(404).json({ error: 'Record not found', detail: data });
    }

    const f = data.data?.record?.fields || {};
    const onboardingRaw = f['Onboarding date'];
    const onboarding = onboardingRaw
      ? new Date(onboardingRaw).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      : '—';

    return res.status(200).json({
      record: {
        record_id: recordId,
        client:     f['Name of client to bill']  || '—',
        candidate:  f['Name of Candidate']       || '—',
        position:   f['Position of Candidate']   || '—',
        onboarding,
      },
    });
  } catch (err) {
    console.error('[get-record] Unexpected error:', err);
    return res.status(500).json({ error: err.message });
  }
};
