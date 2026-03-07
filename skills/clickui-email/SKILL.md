---
name: clickui-email
description: Use this skill when the user needs to review, triage, read, or reply to email in AgentClick UI before anything is sent.
---

# ClickUI Email Review

## Trigger Conditions (high priority)

Use this skill by default when the user asks to review an inbox, read email in UI, triage email, or draft a reply in browser before sending.

Common trigger phrases include (Chinese or English):
- "写好后让我审阅"
- "先让我在浏览器里审阅"
- "发之前让我看一下"
- "先草拟邮件给我确认"
- "write the email and let me review first"
- "before sending, let me review"
- "draft it and I will approve"

If the request is email work plus human review in UI, prefer this skill over generic chat drafting.

## Do Not Use These Alternatives

For email review requests handled by this skill:
- Do NOT use the `browser` tool to manually render a draft
- Do NOT use the `canvas` tool to manually render a draft
- Do NOT ask the user to review the draft directly in chat first

Always submit to AgentClick via `POST /api/review` and let the user work inside the AgentClick UI.
Submission opens the email review page for the active session. Treat that page as the user's email client for this task.

---

## Live Session Workflow

The same agent must create and monitor the session. Do not rely on a sub-agent, Task tool, or separate monitor process. Treat every email review as a live session.

### Step 1: Ensure AgentClick is running

```bash
AGENTCLICK_BASE="${AGENTCLICK_URL:-http://localhost:${AGENTCLICK_PORT:-${PORT:-38173}}}"

if ! curl -s --max-time 1 "$AGENTCLICK_BASE/api/health" > /dev/null 2>&1; then
  npm run start &

  for _ in $(seq 1 30); do
    if curl -s --max-time 1 "$AGENTCLICK_BASE/api/health" > /dev/null 2>&1; then
      break
    fi
    sleep 1
  done
fi

curl -s --max-time 1 "$AGENTCLICK_BASE/api/health" > /dev/null 2>&1
```

If the health check still fails after startup, stop and fix the server problem before creating a review session.

### Step 2: Build the inbox payload

Fetch full email bodies in parallel when you need multiple messages. Do not fetch messages serially unless the provider or CLI forces it.

Use the bundled script:
- Script: `skills/clickui-email/scripts/fetch_gmail_inbox_parallel.mjs`
- Purpose: search Gmail with `gog`, fetch each full message in parallel, normalize it into AgentClick inbox format, and write JSON to disk

Basic usage:

```bash
node skills/clickui-email/scripts/fetch_gmail_inbox_parallel.mjs \
  --query 'is:unread' \
  --max 10 \
  --out /tmp/clickui_inbox.json
```

With explicit Gmail account and tuned concurrency:

```bash
node skills/clickui-email/scripts/fetch_gmail_inbox_parallel.mjs \
  --query 'category:primary is:unread' \
  --max 10 \
  --account you@gmail.com \
  --concurrency 5 \
  --out /tmp/clickui_inbox.json
```

The script prints a small JSON summary and writes the inbox array to the path passed via `--out`.
Load that file into the review payload instead of rebuilding the inbox JSON inline.

### Step 3: Submit the email session

Write the request body to a temp file before POSTing. This is more reliable for full email bodies and special characters.

```bash
cat > /tmp/clickui_review.json <<'JSON'
{
  "type": "email_review",
  "sessionKey": "SESSION_KEY",
  "payload": {
    "inbox": [],
    "draft": {
      "replyTo": "",
      "to": "",
      "subject": "",
      "paragraphs": []
    }
  }
}
JSON

RESPONSE=$(curl -s -X POST "$AGENTCLICK_BASE/api/review" \
  -H "Content-Type: application/json" \
  -d @/tmp/clickui_review.json)
SESSION_ID=$(echo "$RESPONSE" | grep -o '"sessionId":"[^"]*"' | cut -d'"' -f4)
echo "Session: $SESSION_ID"
```

Rules for the initial payload:
- Include the full original email in `body`. Do not rely on `preview` for review.
- `preview` is only a short list snippet for the sidebar.
- Do not generate a reply draft up front unless the user explicitly asked for one before opening the UI.
- Default to `draft.paragraphs: []` until the user clicks `Reply`.
- Normalize categories to Gmail-style values when possible: `Primary`, `Social`, `Promotions`, `Updates`, `Forums`.

### Step 4: Monitor the live session

After creating the session, the same agent must own the monitor loop. Do NOT start a new session.

---

## Monitor Instructions

You are the dedicated monitor for an AgentClick email review session. You own the full interaction loop until the user confirms or the session times out.

You have been given:
- `SESSION_ID` — the active session
- `inbox` — the inbox array
- `draft` — the current reply draft object, which may be empty until the user clicks `Reply`

Maintain a `ROUND` counter starting at 0 and a `LOG` list of actions taken each round.
Maintain per-email UI state in memory:
- `reply_loading[emailId]` — true while you are generating a reply draft
- `reply_ready[emailId]` — true when the draft has arrived
- `reply_unread[emailId]` — true when a newly generated reply draft is ready but the user has not opened it yet

### Your loop

Repeat until done (max 10 rewrite rounds):

#### A. Block until user acts

```bash
RESULT=$(curl -s --max-time 310 \
  "$AGENTCLICK_BASE/api/sessions/${SESSION_ID}/wait")
STATUS=$(echo "$RESULT" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "STATUS=$STATUS"
echo "$RESULT"
```

`/wait` blocks server-side for up to 5 minutes. It returns the moment the user clicks Confirm or Regenerate. Do not add `sleep` before or after this call.

Fallback if blocking is not possible:

```bash
while true; do
  RESULT=$(curl -s "$AGENTCLICK_BASE/api/sessions/${SESSION_ID}")
  STATUS=$(echo "$RESULT" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
  echo "STATUS=$STATUS"
  echo "$RESULT"
  sleep 10
done
```

When using the fallback:
- Check `status`
- Check `result`
- Check `pageStatus`
- If `pageStatus.stopMonitoring` is `true`, stop the monitor loop immediately

#### B. Branch on STATUS

**`completed`** → The user confirmed. Go to **Exit: Success** below.

**`rewriting`** → The user wants changes. Go to step C, then loop back to A.

**HTTP 408 / empty STATUS** → `/wait` timed out. Go to **Exit: Timeout** below.

#### C. Rewrite and PUT (only when STATUS is `rewriting`)

Read the full `result` object from the `/wait` response.

The UI is an email client, not only a final approval page:
- The user may open multiple emails while you work.
- The user may click `Reply` on one email while continuing to read others.
- Do not block the user from browsing other emails while a reply is being prepared.
- When a reply is requested, update the session payload promptly so the UI can show loading state for that email.
- When the reply draft is ready, update the same email row so the UI can show a ready ring and an unread red dot for that email.
- If the user clicks `Back` or the stop-monitor button in UI, the page will send `pageStatus.stopMonitoring = true`. Treat that as a direct signal to stop monitoring.

Rewrite rules:
- If `result.readMore` is true, fetch more emails for the requested categories and PUT an updated inbox payload. Keep existing email IDs and append or merge new ones.
- If the user marked emails as read, reflect that in your local state and sync that status back to the real email system if you control it.
- If the user requested `Reply` for an email and no draft exists yet, generate the draft then PUT it into the payload for that email.
- If `result.actions` contains paragraph edits, apply the minimum change needed to satisfy the feedback.
- Only modify paragraphs referenced in `result.actions` unless the user explicitly requested a full rewrite.
- Keep all other paragraph text exactly unchanged.
- Keep `inbox`, `draft.subject`, `draft.to`, and `draft.replyTo` unchanged unless the user explicitly edited them in UI-supported fields.

Write the payload to a temp file (required for stability with special characters), then PUT:

```bash
cat > /tmp/clickui_payload.json <<'JSON'
{
  "payload": {
      "inbox": [SAME_INBOX_AS_SUBMITTED],
      "draft": {
        "replyTo": "SENDER_EMAIL",
        "to": "RECIPIENT_EMAIL",
        "subject": "Re: ORIGINAL_SUBJECT",
        "paragraphs": [
          {"id": "p1", "content": "UPDATED_OR_UNCHANGED_PARAGRAPH_1"},
          {"id": "p2", "content": "UPDATED_OR_UNCHANGED_PARAGRAPH_2"},
        {"id": "p3", "content": "UPDATED_OR_UNCHANGED_PARAGRAPH_3"}
      ]
    }
  }
}
JSON

HTTP_CODE=$(curl -s -o /tmp/clickui_put_response.txt -w "%{http_code}" \
  -X PUT "$AGENTCLICK_BASE/api/sessions/${SESSION_ID}/payload" \
  -H "Content-Type: application/json" \
  -d @/tmp/clickui_payload.json)
echo "PUT_HTTP=$HTTP_CODE"
cat /tmp/clickui_put_response.txt
```

If HTTP is not `200`, fix the JSON and retry the PUT. Do not loop back to A with a failed PUT.

When preparing a first reply draft after the user clicks `Reply`, use the same PUT path:
- First PUT a lightweight state update as soon as possible so the UI can show loading for that email.
- Then generate the draft.
- Then PUT the completed draft so the UI shows it as ready.

#### D. Report to main agent after each rewrite round

After a successful PUT, update your local state before looping:
- Increment `ROUND`
- Update your in-memory `draft` to the new content
- Append to `LOG`: `"Round N: rewrote [paragraph IDs] — [user instruction]"`

Then **go back to step A**. The user will see the updated draft in the same browser tab.

**IMPORTANT:** Do NOT create a new session. Always reuse the same `SESSION_ID`.

---

### Exit: Success (STATUS = `completed`)

Extract from the final `/wait` response:
- `result.actions` — deletions and rewrites the user marked
- `result.confirmed` — should be `true`
- The final paragraph list from the session payload
- Any emails marked read by the user
- Any reply draft fields edited by the user in UI

Output a structured report for the main agent:

```
MONITOR_RESULT: success
SESSION_ID: <id>
ROUNDS: <N>
LOG:
  - Round 1: <what changed>
  - Round 2: <what changed>
FINAL_DRAFT:
  subject: <subject>
  to: <recipient>
  paragraphs:
    - p1: <final content>
    - p2: <final content>
    - p3: <final content>
EMAIL_STATE_CHANGES:
  marked_read:
    - <email id>
INSTRUCTION: Send the email using the FINAL_DRAFT above, and sync any marked-read state. Do not ask the user again.
```

## UI Behavior Requirements

Follow these UI assumptions when preparing or updating payloads:
- The main email view should show the full email body, not only a preview snippet.
- The sidebar snippet is only for compact scanning.
- Reply draft generation is lazy: do not send a ready draft before the user clicks `Reply`, unless the user explicitly asked for an immediate draft.
- The reply draft panel is folded by default when it first appears.
- While a reply is being generated, the UI should be able to show loading for that email and still let the user browse other emails.
- When a reply draft becomes ready, the corresponding email row should show a visible ready state and an unread red dot until the user opens that reply.
- The UI may send a stop-monitor signal when the user leaves the page. Respect it and stop the monitor loop cleanly.
- Fast updates matter. Prefer sending an immediate "loading" payload update, then a second payload update with the completed draft.

---

### Exit: Timeout (HTTP 408 or empty STATUS)

```
MONITOR_RESULT: timeout
SESSION_ID: <id>
ROUNDS_COMPLETED: <N>
LOG:
  - Round 1: <what changed>
INSTRUCTION: User did not respond within 5 minutes. Ask the user if they want to resume or cancel.
```

---

### Exit: Max rounds reached

If `ROUND` reaches 10 without a `completed` status:

```
MONITOR_RESULT: max_rounds_reached
SESSION_ID: <id>
INSTRUCTION: The user requested 10+ rewrites without confirming. Ask the user how they want to proceed.
```
