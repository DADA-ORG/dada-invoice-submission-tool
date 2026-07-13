// api/search-clients.js
// Autocomplete lookup for Q1 ("Name of client to bill").
// Searches the "Client UEN List" Lark Base for records whose "Client Name"
// field contains the query string, and returns the matching "MCF UEN" so the
// frontend can auto-fill "UEN of Company Referred to" (Q14, DADA SG only).
//
// Base: https://dadaconsultants.sg.larksuite.com/base/Ag3Obd63CahRZgstJRZlRlLKgFd?table=tbl67bFoqCNW8rol&view=vewQzop8z7

const LARK_BASE = 'https://open.larksuite.com/open-apis';
const APP_TOKEN  = process.env.LARK_UEN_BASE_APP_TOKEN  || 'Ag3Obd63CahRZgstJRZlRlLKgFd';
const TABLE_ID   = process.env.LARK_UEN_BASE_TABLE_ID   || 'tbl67bFoqCNW8rol';

const CLIENT_NAME_FIELD = 'Client Name';
const UEN_FIELD         = 'MCF UEN';

const MAX_RESULTS = 20;

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

// Lark Base text-type fields can come back as a plain string, a number, or an
// array of rich-text segments like [{ type: 'text', text: '...' }]. Normalise
// to a plain string regardless of shape.
function fieldToText(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string' || typeof val === 'number') return String(val);
  if (Array.isArray(val)) {
    return val.map(seg => (typeof seg === 'string' ? seg : seg?.text || '')).join('');
  }
  if (typeof val === 'object' && 'text' in val) return String(val.text || '');
  return String(val);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  const q = String((req.query && req.query.q) || '').trim();
  if (!q || q.length < 2) return res.status(200).json({ matches: [] });

  const APP_ID     = process.env.LARK_APP_ID;
  const APP_SECRET = process.env.LARK_APP_SECRET;
  if (!APP_ID || !APP_SECRET) {
    return res.status(500).json({ error: 'Server misconfiguration: missing Lark credentials' });
  }

  try {
    const tenantToken = await getTenantToken(APP_ID, APP_SECRET);

    // Ask Lark Base to filter server-side ("contains", case-insensitive).
    const searchUrl = `${LARK_BASE}/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records/search?page_size=${MAX_RESULTS}`;
    const searchRes = await fetch(searchUrl, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${tenantToken}`,
      },
      body: JSON.stringify({
        filter: {
          conjunction: 'and',
          conditions: [
            { field_name: CLIENT_NAME_FIELD, operator: 'contains', value: [q] },
          ],
        },
      }),
    });
    const searchData = await searchRes.json();

    if (searchData.code !== 0) {
      console.error('[search-clients] Lark API error:', searchData);
      return res.status(200).json({ matches: [], warning: 'Lark search error', detail: searchData });
    }

    const matches = (searchData.data?.items || [])
      .map(item => ({
        name: fieldToText(item.fields?.[CLIENT_NAME_FIELD]).trim(),
        uen:  fieldToText(item.fields?.[UEN_FIELD]).trim(),
      }))
      .filter(m => m.name)
      .slice(0, MAX_RESULTS);

    return res.status(200).json({ matches });
  } catch (err) {
    console.error('[search-clients] Unexpected error:', err);
    // Fail soft — autocomplete is a convenience, not a blocker. The user can
    // still type the client name and UEN manually.
    return res.status(200).json({ matches: [], error: err.message });
  }
};
