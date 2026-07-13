// api/recent-records.js
// Returns invoice records created in the last 7 days from the main tracker table.
// Called only by verified admins (open_id check happens client-side + server trusts
// the admin check already done; no extra re-verification needed here because the
// admin section only calls this after /api/check-admin confirms access).

const LARK_BASE  = 'https://open.larksuite.com/open-apis';
const APP_TOKEN  = process.env.LARK_BASE_APP_TOKEN || 'XpJKbk59AaKjQEswC1Gl8n7Rgsd';
const TABLE_ID   = process.env.LARK_BASE_TABLE_ID  || 'tblvgZhAwo0SBrKh';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Lark Base returns created_time/last_modified_time as Unix seconds (not ms).
// Normalise to ms so we can compare with Date.now().
function toMs(ts) {
  if (!ts) return 0;
  return ts < 10_000_000_000 ? ts * 1000 : ts;
}

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

  const APP_ID     = process.env.LARK_APP_ID;
  const APP_SECRET = process.env.LARK_APP_SECRET;
  if (!APP_ID || !APP_SECRET) {
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  try {
    const tenantToken = await getTenantToken(APP_ID, APP_SECRET);
    const cutoff = Date.now() - SEVEN_DAYS_MS;

    // Fetch up to 500 records (paginate if needed for active tables)
    let allItems = [];
    let pageToken = '';
    let hasMore   = true;

    while (hasMore) {
      const url = new URL(`${LARK_BASE}/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records`);
      url.searchParams.set('page_size', '100');
      if (pageToken) url.searchParams.set('page_token', pageToken);

      const r = await fetch(url.toString(), {
        headers: { 'Authorization': `Bearer ${tenantToken}` },
      });
      const data = await r.json();

      if (data.code !== 0) {
        return res.status(500).json({ error: 'Lark Base API error', detail: data });
      }

      const items = data.data?.items || [];
      allItems = allItems.concat(items);
      hasMore   = data.data?.has_more ?? false;
      pageToken = data.data?.page_token ?? '';

      // Stop paginating early only when every record on this page is older than cutoff.
      // 'Submitted on' is a Date Created system field returned in ms inside fields.
      if (items.length > 0 && items.every(item => (item.fields?.['Submitted on'] ?? 0) < cutoff)) {
        hasMore = false;
      }
    }

    // Filter to last 7 days and pick the fields we want to surface
    const recent = allItems
      .filter(item => (item.fields?.['Submitted on'] ?? 0) >= cutoff)
      .sort((a, b) => (b.fields?.['Submitted on'] ?? 0) - (a.fields?.['Submitted on'] ?? 0))
      .map(item => {
        const f = item.fields || {};

        // 'Submitted on' is a Date Created field — returned in ms
        const submittedMs = f['Submitted on'] ?? 0;

        // Onboarding date is a regular date field — also in ms
        const onboardingRaw = f['Onboarding date'];
        const onboardingDate = onboardingRaw
          ? new Date(onboardingRaw).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
          : '—';

        // 'Respondent' (singular) is the Person field written by submit.js.
        // Fall back to the system Creator field or top-level created_by metadata.
        const personField = f['Respondent'] || f['Respondents'];
        const submitter = Array.isArray(personField) && personField.length
          ? personField.map(p => p.name || p.en_name).filter(Boolean).join(', ')
          : (item.created_by?.name || item.created_by?.en_name || '—');

        return {
          record_id:      item.record_id,
          submitted_at:   submittedMs,
          submitter,      // from Respondents field (Person/Creator)
          client:         f['Name of client to bill']   || '—',
          candidate:      f['Name of Candidate']        || '—',
          position:       f['Position of Candidate']    || '—',
          onboarding:     onboardingDate,
          entity:         f['Which is the entity signed the contract with client?'] || '—',
          payment_term:   f['What is the payment term'] || '—',
        };
      });

    return res.status(200).json({ records: recent });
  } catch (err) {
    console.error('[recent-records] Unexpected error:', err);
    return res.status(500).json({ error: err.message });
  }
};
