// api/config.js
// Returns the public Lark app ID to the frontend (app secret stays server-side)
module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({ app_id: process.env.LARK_APP_ID || '' });
};
