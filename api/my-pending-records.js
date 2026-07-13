// api/my-pending-records.js
// Returns the invoice-request records that:
//   1. Were submitted by this user (Respondent person field contains open_id)
//   2. Still don't have Q21 ("本次入职确认的证据来源（可多选）") or Q22
//      ("请上传入职证明") filled in yet
// so the "候选人已入职？补交证明" list can show only what still needs action —
// no link, no search box, just identity-based lookup.

const LARK_BASE  = 'https://open.larksuite.com/open-apis';
const APP_TOKEN  = process.env.LARK_BASE_APP_TOKEN || 'XpJKbk59AaKjQEswC1Gl8n7Rgsd';
const TABLE_ID   = process.env.LARK_BASE_TABLE_ID  || 'tblvgZhAwo0SBrKh';

const EVIDENCE_FIELD   = '本次入职确认的证据来源（可多选）';
const ATTACHMENT_FIELD = '请上传入职证明';

// Cap how many records we'll scan so a very large table can't time out the
// function. Increase if the org's submission volume grows a lot.
const MAX_RECORDS_SCANNED = 2000;

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

function isEmptyValue(v) {
  if (v === null || v === undefined) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'string') return v.trim() === '';
  return false;
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

  const { open_id } = req.body || {};
  if (!open_id) return res.status(400).json({ error: 'Missing open_id' });

  const APP_ID     = process.env.LARK_APP_ID;
  const APP_SECRET = process.env.LARK_APP_SECRET;
  if (!APP_ID || !APP_SECRET) {
    return res.status(500).json({ error: 'Server misconfiguration: missing Lark credentials' });
  }

  try {
    const tenantToken = await getTenantToken(APP_ID, APP_SECRET);

    let allItems = [];
    let pageToken = '';
    let hasMore   = true;

    while (hasMore && allItems.length < MAX_RECORDS_SCANNED) {
      const url = new URL(`${LARK_BASE}/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records`);
      url.searchParams.set('page_size', '100');
      if (pageToken) url.searchParams.set('page_token', pageToken);

      const r = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${tenantToken}` },
      });
      const data = await r.json();

      if (data.code !== 0) {
        return res.status(500).json({ error: 'Lark Base API error', detail: data });
      }

      const items = data.data?.items || [];
      allItems = allItems.concat(items);
      hasMore   = data.data?.has_more ?? false;
      pageToken = data.data?.page_token ?? '';
    }

    const mine = allItems.filter(item => {
      const persons = item.fields?.Respondent;
      return Array.isArray(persons) && persons.some(p => p.id === open_id);
    });

    const pending = mine.filter(item => {
      const f = item.fields || {};
      return isEmptyValue(f[EVIDENCE_FIELD]) || isEmptyValue(f[ATTACHMENT_FIELD]);
    });

    const records = pending
      .sort((a, b) => (b.fields?.['Submitted on'] ?? 0) - (a.fields?.['Submitted on'] ?? 0))
      .map(item => {
        const f = item.fields || {};
        const onboardingRaw = f['Onboarding date'];
        const onboarding = onboardingRaw
          ? new Date(onboardingRaw).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
          : '—';
        const submittedRaw = f['Submitted on'];
        const submitted = submittedRaw
          ? new Date(submittedRaw).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
          : '—';

        return {
          record_id: item.record_id,
          client:    f['Name of client to bill'] || '—',
          candidate: f['Name of Candidate']      || '—',
          position:  f['Position of Candidate']  || '—',
          onboarding,
          submitted,
        };
      });

    return res.status(200).json({ records });
  } catch (err) {
    console.error('[my-pending-records] Unexpected error:', err);
    return res.status(500).json({ error: err.message });
  }
};
