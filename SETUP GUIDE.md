# DADA Invoice Form — Setup Guide

## What this is

A Lark workplace gadget that lets employees submit invoice requests directly from Lark.
Data goes straight into the "Client Invoice Tracker" Lark Base table — same table as the existing form.

---

## Step 1 — Create a Lark Open Platform App

1. Go to **https://open.larksuite.com** and sign in as an admin.
2. Click **Create App** → choose **Custom App**.
3. Give it a name, e.g. `DADA Invoice Form`.
4. Note your **App ID** and **App Secret** — you'll need these later.

### Set permissions

Go to **Permissions & Scopes** and add:

| Scope | Why |
|---|---|
| `contact:user.base:readonly` | Read user name/avatar after OAuth |
| `bitable:app` | Read & write Lark Base records |

Click **Publish** after adding scopes (changes don't take effect until published).

### Add redirect URIs

Go to **Security Settings** → **Redirect URLs** and add:

```
https://YOUR-APP-NAME.vercel.app
https://YOUR-APP-NAME.vercel.app/
```

(You'll know the exact URL after Step 3. You can come back and update this.)

---

## Step 2 — Deploy to Vercel

### Option A: Using the Vercel website (easiest)

1. Create a free account at **https://vercel.com** (sign up with GitHub).
2. Upload this project folder to a GitHub repository (just drag and drop in GitHub.com).
3. In Vercel, click **Add New Project** → import your GitHub repo.
4. Before deploying, go to **Environment Variables** and add:

| Key | Value |
|---|---|
| `LARK_APP_ID` | Your App ID from Step 1 |
| `LARK_APP_SECRET` | Your App Secret from Step 1 |
| `LARK_BASE_APP_TOKEN` | `XpJKbk59AaKjQEswC1Gl8n7Rgsd` |
| `LARK_BASE_TABLE_ID` | `tblvgZhAwo0SBrKh` |

5. Click **Deploy**. Vercel gives you a URL like `https://dada-invoice-form.vercel.app`.

### Option B: Using Vercel CLI

```bash
npm i -g vercel
cd "DADA Invoice Submission Tool"
vercel
# Follow prompts; set env vars in the Vercel dashboard after first deploy
```

---

## Step 3 — Update redirect URI

Now that you have a Vercel URL, go back to **Lark Open Platform → Security Settings → Redirect URLs** and add:

```
https://YOUR-ACTUAL-URL.vercel.app
https://YOUR-ACTUAL-URL.vercel.app/
```

---

## Step 4 — Register as a Lark Workplace Gadget

1. In Lark Open Platform, go to your app → **App Capabilities**.
2. Enable **Web App**.
3. Set the **Desktop URL** and **Mobile URL** to your Vercel URL:
   ```
   https://YOUR-APP-NAME.vercel.app
   ```
4. Go to **Workplace** → **Workplace gadget** and enable it.
5. Under **Availability**, set it to your organisation (so only internal employees can see it).

---

## Step 5 — Publish & Test

1. Click **Publish** in Lark Open Platform.
2. Wait for admin approval if required by your org.
3. Once approved, employees find the gadget by:
   - Opening Lark → tap **Workplace** (the grid icon)
   - Search for `DADA Invoice Form`
   - Open it and submit a test form
4. Check your **Client Invoice Tracker** base — the record should appear.

---

## How employee verification works

When an employee opens the gadget from within Lark:
- The page automatically redirects to Lark OAuth.
- Because they're already logged into Lark, it redirects back instantly (no manual login needed).
- The backend verifies they belong to your organisation by exchanging the OAuth code for their identity.
- Only then is the form shown.

Employees outside your organisation cannot obtain an OAuth code and will not be able to access the form.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "App ID not configured" | Check `LARK_APP_ID` env var is set in Vercel |
| OAuth redirects to error page | Add the redirect URI in Lark Open Platform → Security Settings |
| Form submits but record doesn't appear | Check `bitable:app` permission is added and app is re-published |
| "Lark Base API error" | Confirm `LARK_BASE_APP_TOKEN` and `LARK_BASE_TABLE_ID` are correct |
| Gadget not visible in Workplace | Make sure "Workplace gadget" is enabled and availability includes your org |
