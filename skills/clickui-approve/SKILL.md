---
name: clickui-approve
description: Use this skill when you are about to take a consequential or irreversible action and need explicit user approval before proceeding.
---

# ClickUI Action Approval

When you are about to take a high-risk action (sending messages, deleting data, calling external APIs), use these steps.

## Step 1: Submit for approval

```bash
if curl -s --max-time 1 http://localhost:38173/api/health > /dev/null 2>&1; then
  AGENTCLICK_BASE="http://localhost:38173"
else
  AGENTCLICK_BASE="http://host.docker.internal:38173"
fi

RESPONSE=$(curl -s -X POST "$AGENTCLICK_BASE/api/review" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "action_approval",
    "sessionKey": "'"$SESSION_KEY"'",
    "payload": {
      "action": "ONE_LINE_DESCRIPTION",
      "description": "FULL_DETAIL_OF_WHAT_YOU_WILL_DO",
      "risk": "low|medium|high"
    }
  }')
echo "$RESPONSE"
```

Save the `sessionId` from the response.

## Step 2: Wait for decision (blocks up to 5 minutes)

```bash
SESSION_ID="<sessionId from Step 1>"
curl -s "$AGENTCLICK_BASE/api/sessions/${SESSION_ID}/wait"
```

The browser opens automatically. This call blocks until the user submits.

## Step 3: Act on the decision

- `result.approved: true` → **Execute immediately. Do NOT ask the user again.** The user already approved in the UI. If `result.note` is set, incorporate it.
- `result.approved: false` → Stop. Inform the user the action was rejected.
