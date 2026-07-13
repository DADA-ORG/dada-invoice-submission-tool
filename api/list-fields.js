// api/list-fields.js
// Diagnostic: lists all fields in the Lark Base table so we can confirm exact field names.
// Visit /api/list-fields after deploying.

const LARK_BASE = 'https://open.larksuite.com/open-apis';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const APP_ID     = process.env.LARK_APP_ID;
  const APP_SECRET = process.env.LARK_APP_SECRET;
  const APP_TOKEN  = process.env.LARK_BASE_APP_TOKEN || 'XpJKbk59AaKjQEswC1Gl8n7Rgsd';
  const TABLE_ID   = process.env.LARK_BASE_TABLE_ID  || 'tblvgZhAwo0SBrKh';

  try {
    // Get tenant token
    const tokenRes = await fetch(`${LARK_BASE}/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }),
    });
    const tokenData = await tokenRes.json();
    const token = tokenData.tenant_access_token;

    // List all fields
    const fieldsRes = await fetch(
      `${LARK_BASE}/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/fields`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const fieldsData = await fieldsRes.json();

    // Return field name + type for each field
    const fields = (fieldsData.data?.items || []).map(f => ({
      field_name: f.field_name,
      field_id: f.field_id,
      type: f.type, // 11 = Person, 1 = Text, 1003 = Creator
    }));

    return res.json({ fields, raw_lark_code: fieldsData.code, raw_lark_msg: fieldsData.msg });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
