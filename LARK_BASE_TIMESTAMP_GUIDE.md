# Lark Base Timestamp Gotchas

Use this as a reference prompt when building any app that reads dates/times from Lark Base via the API.

---

## The Core Problem

Lark Base exposes timestamps in **two different places**, with **different units**:

| Source | Where it lives | Unit |
|---|---|---|
| System metadata (`created_time`, `last_modified_time`) | Top-level record field: `item.created_time` | **Seconds** (Unix) |
| "Date Created" system field (e.g. "Submitted on") | Inside `item.fields['Submitted on']` | **Milliseconds** |
| Regular date fields (e.g. "Onboarding date") | Inside `item.fields['Onboarding date']` | **Milliseconds** |

`Date.now()` in JavaScript returns **milliseconds**. If you compare it directly against `item.created_time` (which is in seconds), every record will appear to be ~50 years old and get filtered out.

---

## Rules to Follow

**1. Never filter by `item.created_time` directly.**
It's unreliable and in seconds. Instead, add a "Date Created" system field to your Lark Base table (Lark calls it "Submitted on", "Created Time", etc.) — it appears inside `item.fields` and is always in milliseconds.

**2. Always read submission dates from `item.fields['Your Date Created Field Name']`**, not from `item.created_time`.

**3. If you must use `item.created_time`**, normalise it first:
```js
function toMs(ts) {
  if (!ts) return 0;
  return ts < 10_000_000_000 ? ts * 1000 : ts; // seconds → ms if needed
}
```

**4. Person fields** (e.g. "Respondent") return an array of objects:
```json
[{ "id": "ou_xxx", "name": "Yijia", "en_name": "Yijia" }]
```
Read the name with: `field.map(p => p.name || p.en_name).join(', ')`

**5. The system "Creator" field** (shown as "Respondents" in Lark UI, type 1003) **cannot be written via API**. If you need to track who submitted a record, create a separate **Person field** (type 11) and write the `open_id` to it manually on submission.

---

## Prompt Template for AI Assistants

When building a Lark Base integration that filters records by date, include this in your prompt:

> **Lark Base API notes:**
> - `item.created_time` is in **Unix seconds**, not milliseconds. Do not compare it directly to `Date.now()`.
> - Date Created system fields live inside `item.fields['Field Name']` and are in **milliseconds**.
> - Always filter by the date field inside `item.fields`, not top-level metadata.
> - Person fields return `[{ id, name, en_name }]` — extract `.name` or `.en_name`.
> - The auto-populated "Respondents" Creator field (type 1003) cannot be written via API. Use a separate Person field (type 11) instead.
