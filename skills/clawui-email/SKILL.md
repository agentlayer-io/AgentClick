---
name: clawui-email
description: Use this skill when you have finished writing an email draft and need the user to review it before sending.
---

# ClawUI Email Review

## Trigger Conditions (high priority)

Use this skill by default when the user asks you to draft an email and review it before sending.

Common trigger phrases include (Chinese or English):
- "写好后让我审阅"
- "先让我在浏览器里审阅"
- "发之前让我看一下"
- "先草拟邮件给我确认"
- "write the email and let me review first"
- "before sending, let me review"
- "draft it and I will approve"

If the request is an email draft + human review, prefer this skill over generic chat drafting.

## Do Not Use These Alternatives

For email review requests handled by this skill:
- Do NOT use the `browser` tool to manually render a draft
- Do NOT use the `canvas` tool to manually render a draft
- Do NOT ask the user to review the draft directly in chat first

Always submit to AgentClick via `POST /api/review` and let the user review in the AgentClick UI.

---

## Main Agent: Two Steps Only

The main agent submits the draft and immediately hands off to a sub-agent. It does NOT poll.

### Step 1: Submit draft for review

```bash
RESPONSE=$(curl -s -X POST http://host.docker.internal:3001/api/review \
  -H "Content-Type: application/json" \
  -d '{
    "type": "email_review",
    "payload": {
      "inbox": [
        {
          "id": "e1",
          "from": "SENDER_EMAIL",
          "subject": "ORIGINAL_SUBJECT",
          "preview": "ORIGINAL_EMAIL_PREVIEW_TEXT",
          "category": "Work",
          "isRead": false,
          "timestamp": UNIX_MS_TIMESTAMP
        }
      ],
      "draft": {
        "replyTo": "e1",
        "to": "RECIPIENT_EMAIL",
        "subject": "Re: ORIGINAL_SUBJECT",
        "paragraphs": [
          {"id": "p1", "content": "PARAGRAPH_1"},
          {"id": "p2", "content": "PARAGRAPH_2"},
          {"id": "p3", "content": "PARAGRAPH_3"}
        ],
        "intentSuggestions": [
          {"id": "i1", "text": "Agree to the proposal"},
          {"id": "i2", "text": "Schedule a follow-up meeting"}
        ]
      }
    }
  }')
SESSION_ID=$(echo "$RESPONSE" | grep -o '"sessionId":"[^"]*"' | cut -d'"' -f4)
echo "Session: $SESSION_ID"
```

Replace placeholders with actual content. Split body into 2–4 logical paragraphs.

### Step 2: Spawn a monitor sub-agent

Use the Task tool to spawn a sub-agent. Pass it:
- The `SESSION_ID`
- The full inbox array (exactly as submitted)
- The original paragraphs array (exactly as submitted)

Tell the sub-agent to follow the **Sub-Agent Instructions** section below.

The main agent's job is done. The sub-agent handles all user interaction from here.
Do NOT poll. Do NOT call `/wait` yourself. Do NOT start a new session.

When the sub-agent finishes, it returns the final confirmed result. Use that to send the email.

---

## Sub-Agent Instructions

You are a dedicated monitor for an AgentClick email review session. You own the full interaction loop until the user confirms or the session times out.

You have been given:
- `SESSION_ID` — the active session
- `inbox` — the inbox array (never changes)
- `paragraphs` — the current draft paragraphs (update this in memory after each rewrite)

Maintain a `ROUND` counter starting at 0 and a `LOG` list of actions taken each round.

### Your loop

Repeat until done (max 10 rewrite rounds):

#### A. Block until user acts

```bash
RESULT=$(curl -s --max-time 310 \
  "http://host.docker.internal:3001/api/sessions/${SESSION_ID}/wait")
STATUS=$(echo "$RESULT" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "STATUS=$STATUS"
echo "$RESULT"
```

`/wait` blocks server-side for up to 5 minutes. It returns the moment the user clicks Confirm or Regenerate. Do not add `sleep` before or after this call.

#### B. Branch on STATUS

**`completed`** → The user confirmed. Go to **Exit: Success** below.

**`rewriting`** → The user wants changes. Go to step C, then loop back to A.

**HTTP 408 / empty STATUS** → `/wait` timed out. Go to **Exit: Timeout** below.

#### C. Rewrite and PUT (only when STATUS is `rewriting`)

Read `result.actions` and `result.userIntention` from the `/wait` response.

Rewrite rules:
- Apply the **minimum** change needed to satisfy the feedback
- Only modify paragraphs referenced in `result.actions`
- Keep all other paragraph text exactly unchanged
- Keep `inbox`, `draft.subject`, `draft.to`, and `draft.replyTo` unchanged

Write the payload to a temp file (required for stability with special characters), then PUT:

```bash
cat > /tmp/clawui_payload.json <<'JSON'
{
  "payload": {
    "inbox": [SAME_INBOX_AS_SUBMITTED],
    "draft": {
      "replyTo": "e1",
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

HTTP_CODE=$(curl -s -o /tmp/clawui_put_response.txt -w "%{http_code}" \
  -X PUT "http://host.docker.internal:3001/api/sessions/${SESSION_ID}/payload" \
  -H "Content-Type: application/json" \
  -d @/tmp/clawui_payload.json)
echo "PUT_HTTP=$HTTP_CODE"
cat /tmp/clawui_put_response.txt
```

If HTTP is not `200`, fix the JSON and retry the PUT. Do not loop back to A with a failed PUT.

If HTTP is not `200`, fix the JSON and retry the PUT. Do not loop back to A with a failed PUT.

#### D. Report to main agent after each rewrite round

After a successful PUT, the server automatically notifies the main agent via webhook with a progress summary. You do not need to call the webhook yourself.

However, you must update your local state before looping:
- Increment `ROUND`
- Update your in-memory `paragraphs` to the new content
- Append to `LOG`: `"Round N: rewrote [paragraph IDs] — [user instruction]"`

Then **go back to step A**. The user will see the updated draft in the same browser tab.

**IMPORTANT:** Do NOT create a new session. Always reuse the same `SESSION_ID`.

---

### Exit: Success (STATUS = `completed`)

Extract from the final `/wait` response:
- `result.actions` — deletions and rewrites the user marked
- `result.confirmed` — should be `true`
- The final paragraph list from the session payload

Output a structured report for the main agent:

```
SUBAGENT_RESULT: success
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
INSTRUCTION_TO_MAIN_AGENT: Send the email using the FINAL_DRAFT above. Do not ask the user again.
```

---

### Exit: Timeout (HTTP 408 or empty STATUS)

```
SUBAGENT_RESULT: timeout
SESSION_ID: <id>
ROUNDS_COMPLETED: <N>
LOG:
  - Round 1: <what changed>
INSTRUCTION_TO_MAIN_AGENT: User did not respond within 5 minutes. Ask the user if they want to resume or cancel.
```

---

### Exit: Max rounds reached

If `ROUND` reaches 10 without a `completed` status:

```
SUBAGENT_RESULT: max_rounds_reached
SESSION_ID: <id>
INSTRUCTION_TO_MAIN_AGENT: The user requested 10+ rewrites without confirming. Ask the user how they want to proceed.
```
