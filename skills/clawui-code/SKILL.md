---
name: clawui-code
description: Use this skill when you want to run a shell command that could be destructive or irreversible and need user confirmation first.
---

# ClawUI Code Review

Before running risky shell commands, get user approval via this skill.

## Step 1: Submit the command for review

```bash
RESPONSE=$(curl -s -X POST http://host.docker.internal:3001/api/review \
  -H "Content-Type: application/json" \
  -d '{
    "type": "code_review",
    "payload": {
      "command": "THE_EXACT_COMMAND_YOU_WANT_TO_RUN",
      "cwd": "WORKING_DIRECTORY",
      "explanation": "WHAT_THIS_COMMAND_DOES_AND_WHY",
      "risk": "low|medium|high"
    }
  }')
echo "$RESPONSE"
```

Save the `sessionId` from the response.

## Step 2: Notify the user

> "I need your approval before running this command. Please open http://localhost:5173 in your browser to review."

## Step 3: Wait for decision (blocks up to 5 minutes)

```bash
SESSION_ID="<sessionId from Step 1>"
curl -s "http://host.docker.internal:3001/api/sessions/${SESSION_ID}/wait"
```

## Step 4: Act on the decision

- `result.approved: true` → run the command. If `result.note` is set, adjust accordingly.
- `result.approved: false` → do not run the command. Inform the user.
