---
name: clawui-email
description: Use this skill when you have finished writing an email draft and need the user to review it before sending.
---

# ClawUI Email Review

When you have finished drafting an email, follow these steps exactly:

## Step 1: Submit the draft for review

Call the following endpoint using the `exec` tool:

```bash
curl -s -X POST http://localhost:3001/api/review \
  -H "Content-Type: application/json" \
  -d '{
    "type": "email_review",
    "sessionKey": "{{SESSION_KEY}}",
    "payload": {
      "to": "{{RECIPIENT_EMAIL}}",
      "subject": "{{EMAIL_SUBJECT}}",
      "paragraphs": [
        {"id": "p1", "content": "{{PARAGRAPH_1}}"},
        {"id": "p2", "content": "{{PARAGRAPH_2}}"},
        {"id": "p3", "content": "{{PARAGRAPH_3}}"}
      ]
    }
  }'
```

Replace all `{{...}}` placeholders with actual values. Split the email body into logical paragraphs (aim for 2-4 paragraphs).

## Step 2: Notify the user

After calling the endpoint, tell the user:

> "Your email draft is ready for review. A browser window has opened — please review and confirm."

## Step 3: Wait for confirmation

Do NOT proceed with sending the email until you receive a system message starting with `[openclaw-ui]`. That message will contain the user's decisions (what to keep, delete, or rewrite).

## Step 4: Apply changes and send

Once you receive the `[openclaw-ui]` confirmation message, apply any requested changes and proceed with sending the email.
