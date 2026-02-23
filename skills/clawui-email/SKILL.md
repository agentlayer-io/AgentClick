---
name: clawui-email
description: Use this skill when you have finished writing an email draft and need the user to review it before sending.
---

# ClawUI Email Review

When you have an email draft ready for user review, execute these steps using the bash tool.

## Step 1: Submit draft for review

```bash
RESPONSE=$(curl -s -X POST http://host.docker.internal:3001/api/review \
  -H "Content-Type: application/json" \
  -d '{
    "type": "email_review",
    "payload": {
      "to": "RECIPIENT_EMAIL",
      "subject": "EMAIL_SUBJECT",
      "paragraphs": [
        {"id": "p1", "content": "PARAGRAPH_1"},
        {"id": "p2", "content": "PARAGRAPH_2"},
        {"id": "p3", "content": "PARAGRAPH_3"}
      ]
    }
  }')
echo "$RESPONSE"
```

Replace the placeholder values with the actual email content. Split the body into 2–4 logical paragraphs.

Save the `sessionId` value from the response.

## Step 2: Notify the user

Tell the user:

> "Your email draft is ready for review. Please open http://localhost:5173 in your browser to review and confirm."

## Step 3: Wait for the user to finish (blocks up to 5 minutes)

```bash
SESSION_ID="<sessionId from Step 1>"
curl -s "http://host.docker.internal:3001/api/sessions/${SESSION_ID}/wait"
```

This call blocks until the user submits their decision. Do not proceed until it returns.

## Step 4: Read the result and act

The response contains a `result` field with the user's decisions:

- `result.confirmed: true` → user approved, proceed with sending
- `result.confirmed: false` / `result.regenerate: true` → user wants changes, rewrite accordingly
- `result.actions` → list of paragraph-level delete/rewrite instructions to apply
- `result.userIntention` → optional user note on what they want the reply to say
- `result.markedAsRead` → email IDs the user chose to ignore

Apply any changes and proceed.
