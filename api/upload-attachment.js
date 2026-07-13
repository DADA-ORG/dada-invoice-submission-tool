// api/upload-attachment.js
// Uploads a single file (sent from the browser as base64 JSON) to Lark Drive
// and returns a file_token that can be attached to a Bitable record's
// attachment field. Used for Q22 "请上传入职证明".
//
// The frontend calls this once per selected file *before* calling
// /api/submit, then passes the resulting file_token(s) as the value for the
// attachment field, e.g. fields['请上传入职证明'] = [{ file_token: '...' }, ...]

const LARK_BASE = 'https://open.larksuite.com/open-apis';
const APP_TOKEN  = process.env.LARK_BASE_APP_TOKEN || 'XpJKbk59AaKjQEswC1Gl8n7Rgsd';

// Keep comfortably under Vercel's default request body limit (4.5MB) once
// base64-encoded (~33% larger than the original file).
const MAX_FILE_BYTES = 6 * 1024 * 1024;

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
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { file_name, mime_type, data_base64 } = req.body || {};
  if (!file_name || !data_base64) {
    return res.status(400).json({ error: 'Missing file_name or data_base64' });
  }

  const APP_ID     = process.env.LARK_APP_ID;
  const APP_SECRET = process.env.LARK_APP_SECRET;
  if (!APP_ID || !APP_SECRET) {
    return res.status(500).json({ error: 'Server misconfiguration: missing Lark credentials' });
  }

  try {
    const buffer = Buffer.from(data_base64, 'base64');
    if (buffer.length > MAX_FILE_BYTES) {
      return res.status(400).json({
        error: `File too large (max ${Math.floor(MAX_FILE_BYTES / (1024 * 1024))}MB per file)`,
      });
    }

    const tenantToken = await getTenantToken(APP_ID, APP_SECRET);

    // Lark Drive "upload_all" — the standard way to get a file_token that can
    // be written into a Bitable attachment field (parent_type: bitable_file,
    // parent_node: the Base's app_token).
    const form = new FormData();
    form.append('file_name', file_name);
    form.append('parent_type', 'bitable_file');
    form.append('parent_node', APP_TOKEN);
    form.append('size', String(buffer.length));
    form.append('file', new Blob([buffer], { type: mime_type || 'application/octet-stream' }), file_name);

    const uploadRes = await fetch(`${LARK_BASE}/drive/v1/medias/upload_all`, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${tenantToken}` },
      body:    form,
    });
    const uploadData = await uploadRes.json();

    if (uploadData.code !== 0) {
      console.error('[upload-attachment] Lark API error:', uploadData);
      return res.status(400).json({
        error: `Lark upload error: ${uploadData.msg}`,
        code:  uploadData.code,
        detail: uploadData,
      });
    }

    return res.status(200).json({ success: true, file_token: uploadData.data?.file_token });
  } catch (err) {
    console.error('[upload-attachment] Unexpected error:', err);
    return res.status(500).json({ error: err.message });
  }
};
