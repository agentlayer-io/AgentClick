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

## Step 2: Poll for decision

```bash
SESSION_ID="<sessionId from Step 1>"
# Detect environment: GOG_ACCOUNT is set in Docker (docker-compose.yml), absent elsewhere
if [ -n "$GOG_ACCOUNT" ]; then
  # Docker: use short-poll (one curl per exec, you are the loop controller)
  curl -s "$AGENTCLICK_BASE/api/sessions/${SESSION_ID}"
else
  # Non-Docker: use blocking /wait
  curl -s --max-time 310 "$AGENTCLICK_BASE/api/sessions/${SESSION_ID}/wait"
fi
```

After each poll:
- If `status` is `"completed"` → proceed to Step 3.
- If `status` is still `"pending"` → wait 1 second (`sleep 1` as a separate exec in Docker), then poll again.

In Docker (`GOG_ACCOUNT` set): run ONE curl per exec call. Do NOT use a bash while loop. You are the loop controller.
In non-Docker: the `/wait` call blocks until the user submits, then process the result.

## Step 3: Act on the decision

- `result.approved: true` → **Execute immediately. Do NOT ask the user again.** The user already approved in the UI. If `result.note` is set, incorporate it.
- `result.approved: false` → Stop. Inform the user the action was rejected.
