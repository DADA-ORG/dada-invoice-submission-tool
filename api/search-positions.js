// api/search-positions.js
// Autocomplete lookup for Q3 ("Position of Candidate").
// Searches the SSOC reference Lark Base for records whose "Occupation" field
// contains the query string, and returns the matching "SSOC" code so the
// frontend can auto-fill "Occupation of position referred to(SSOC 2015
// 5-digit code)" (Q13, DADA SG only).
//
// Base: https://dadaconsultants.sg.larksuite.com/base/Ag3Obd63CahRZgstJRZlRlLKgFd?table=tblW0AGJFAWTUB6C&view=vewgrAmM4f

const LARK_BASE = 'https://open.larksuite.com/open-apis';
const APP_TOKEN  = process.env.LARK_SSOC_BASE_APP_TOKEN  || 'Ag3Obd63CahRZgstJRZlRlLKgFd';
const TABLE_ID   = process.env.LARK_SSOC_BASE_TABLE_ID   || 'tblW0AGJFAWTUB6C';

const OCCUPATION_FIELD = 'Occupation';
const SSOC_FIELD       = 'SSOC';

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
            { field_name: OCCUPATION_FIELD, operator: 'contains', value: [q] },
          ],
        },
      }),
    });
    const searchData = await searchRes.json();

    if (searchData.code !== 0) {
      console.error('[search-positions] Lark API error:', searchData);
      return res.status(200).json({ matches: [], warning: 'Lark search error', detail: searchData });
    }

    const matches = (searchData.data?.items || [])
      .map(item => ({
        title: fieldToText(item.fields?.[OCCUPATION_FIELD]).trim(),
        code:  fieldToText(item.fields?.[SSOC_FIELD]).trim(),
      }))
      .filter(m => m.title)
      .slice(0, MAX_RESULTS);

    return res.status(200).json({ matches });
  } catch (err) {
    console.error('[search-positions] Unexpected error:', err);
    // Fail soft — autocomplete is a convenience, not a blocker. The user can
    // still type the position and SSOC code manually.
    return res.status(200).json({ matches: [], error: err.message });
  }
};
