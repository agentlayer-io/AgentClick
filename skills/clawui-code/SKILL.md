---
name: clawui-code
description: Use this skill when you are about to execute a shell command and want the user to review it before running.
---

# ClawUI Code Review

When you need to run a shell command that could have significant effects, follow these steps:

## Step 1: Submit for review

```bash
curl -s -X POST http://localhost:3001/api/review \
  -H "Content-Type: application/json" \
  -d '{
    "type": "code_review",
    "sessionKey": "{{SESSION_KEY}}",
    "payload": {
      "command": "{{FULL_COMMAND}}",
      "cwd": "{{WORKING_DIRECTORY}}",
      "explanation": "{{WHAT_THIS_COMMAND_DOES_AND_WHY}}",
      "risk": "{{low|medium|high}}"
    }
  }'
```

## Step 2: Notify the user

> "I need your approval before running this command. A browser window has opened — please review."

## Step 3: Wait for confirmation

Do NOT run the command until you receive a system message starting with `[openclaw-ui]`.

## Step 4: Act on the decision

- If approved: run the command as specified.
- If approved with note: incorporate the user's note (e.g. modified flags or path).
- If rejected: do not run the command, explain to the user.
