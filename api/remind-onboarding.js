// api/remind-onboarding.js
// Cron job (see vercel.json "crons") — runs daily at 09:00 Asia/Singapore.
// Finds every invoice-request record whose "Onboarding date" is TODAY and
// that still hasn't had Q21/Q22 (onboarding proof) filled in, then sends
// each Respondent a Lark DM reminding them to come back and upload the
// proof of onboarding.
//
// Trigger: Vercel Cron calls this with `Authorization: Bearer <CRON_SECRET>`
// automatically when CRON_SECRET is set in the project's env vars. Set
// CRON_SECRET in Vercel (any random string) so this endpoint can't be
// triggered by outsiders who guess the URL.

const LARK_BASE  = 'https://open.larksuite.com/open-apis';
const APP_TOKEN  = process.env.LARK_BASE_APP_TOKEN || 'XpJKbk59AaKjQEswC1Gl8n7Rgsd';
const TABLE_ID   = process.env.LARK_BASE_TABLE_ID  || 'tblvgZhAwo0SBrKh';
const TOOL_URL   = process.env.TOOL_URL || 'https://dada-invoice-submission-tool.vercel.app';

const EVIDENCE_FIELD   = '本次入职确认的证据来源（可多选）';
const ATTACHMENT_FIELD = '请上传入职证明';

// Same cap used by my-pending-records.js, for the same reason (avoid
// function timeout on a very large table).
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

// "Onboarding date" (and every other regular date field) comes back from
// Lark Base as a millisecond timestamp — see LARK_BASE_TIMESTAMP_GUIDE.md.
// Compare by calendar day in Singapore time, not by raw ms, so the
// reminder fires on the correct local day regardless of what time the
// cron server itself is in.
function toSGTDateString(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
}

async function sendReminderDM(tenantToken, openId, records) {
  const lines = records.map(r =>
    `• ${r.candidate}（${r.client}）— Position: ${r.position}`
  );
  const text =
    `【入职证明提醒】候选人今天（${records[0].onboardingLabel}）入职，请记得回到 DADA Invoice Tool 补交入职证明：\n\n` +
    lines.join('\n') +
    `\n\n打开工具补交：${TOOL_URL}`;

  const url = `${LARK_BASE}/im/v1/messages?receive_id_type=open_id`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tenantToken}`,
    },
    body: JSON.stringify({
      receive_id: openId,
      msg_type: 'text',
      content: JSON.stringify({ text }),
    }),
  });
  const data = await r.json();
  if (data.code !== 0) {
    console.error('[remind-onboarding] Failed to DM', openId, data);
    return false;
  }
  return true;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }

  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. If CRON_SECRET
  // is configured, require it so this can't be triggered by anyone who
  // finds the URL. If it isn't configured yet, allow through (so this can
  // still be tested manually before the env var is set up) but log a
  // warning.
  const CRON_SECRET = process.env.CRON_SECRET;
  if (CRON_SECRET) {
    const authHeader = req.headers.authorization || '';
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  } else {
    console.warn('[remind-onboarding] CRON_SECRET not set — endpoint is unauthenticated');
  }

  const APP_ID     = process.env.LARK_APP_ID;
  const APP_SECRET = process.env.LARK_APP_SECRET;
  if (!APP_ID || !APP_SECRET) {
    return res.status(500).json({ error: 'Server misconfiguration: missing Lark credentials' });
  }

  try {
    const tenantToken = await getTenantToken(APP_ID, APP_SECRET);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });

    // ── Pull every record, same pagination pattern as my-pending-records.js ──
    let allItems  = [];
    let pageToken = '';
    let hasMore   = true;

    while (hasMore && allItems.length < MAX_RECORDS_SCANNED) {
      const url = new URL(`${LARK_BASE}/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records`);
      url.searchParams.set('page_size', '100');
      if (pageToken) url.searchParams.set('page_token', pageToken);

      const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${tenantToken}` } });
      const data = await r.json();
      if (data.code !== 0) {
        return res.status(500).json({ error: 'Lark Base API error', detail: data });
      }

      const items = data.data?.items || [];
      allItems = allItems.concat(items);
      hasMore   = data.data?.has_more ?? false;
      pageToken = data.data?.page_token ?? '';
    }

    // ── Filter: onboarding date is today AND proof still missing ───────────
    const dueToday = allItems.filter(item => {
      const f = item.fields || {};
      const onboardingMs = f['Onboarding date'];
      if (!onboardingMs) return false;
      if (toSGTDateString(onboardingMs) !== today) return false;
      return isEmptyValue(f[EVIDENCE_FIELD]) || isEmptyValue(f[ATTACHMENT_FIELD]);
    });

    // ── Group by respondent open_id (one person can have multiple candidates
    //    onboarding the same day — send one combined DM, not several) ──────
    const byRespondent = new Map();
    for (const item of dueToday) {
      const f = item.fields || {};
      const persons = f['Respondent'];
      if (!Array.isArray(persons) || persons.length === 0) continue;
      const openId = persons[0].id;
      if (!openId) continue;

      const record = {
        record_id: item.record_id,
        client:    f['Name of client to bill'] || '—',
        candidate: f['Name of Candidate']      || '—',
        position:  f['Position of Candidate']  || '—',
        onboardingLabel: new Date(f['Onboarding date']).toLocaleDateString('en-GB', {
          day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore',
        }),
      };
      if (!byRespondent.has(openId)) byRespondent.set(openId, []);
      byRespondent.get(openId).push(record);
    }

    let sent = 0, failed = 0;
    for (const [openId, records] of byRespondent.entries()) {
      const ok = await sendReminderDM(tenantToken, openId, records);
      if (ok) sent++; else failed++;
    }

    return res.status(200).json({
      success: true,
      date: today,
      records_due: dueToday.length,
      respondents_notified: sent,
      failed,
    });
  } catch (err) {
    console.error('[remind-onboarding] Unexpected error:', err);
    return res.status(500).json({ error: err.message });
  }
};
