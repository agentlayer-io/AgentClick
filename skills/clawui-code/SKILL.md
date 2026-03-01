---
name: clawui-code
description: Use this skill when you want to run a shell command that could be destructive or irreversible and need user confirmation first.
---

# ClawUI Code Review

Before running risky shell commands, get user approval via this skill. You can also show the user exactly which files will change and what the diff looks like.

## Step 1: Submit the command for review

### Basic (file list only)

```bash
RESPONSE=$(curl -s -X POST http://host.docker.internal:3001/api/review \
  -H "Content-Type: application/json" \
  -d '{
    "type": "code_review",
    "payload": {
      "command": "THE_EXACT_COMMAND_YOU_WANT_TO_RUN",
      "cwd": "WORKING_DIRECTORY",
      "explanation": "WHAT_THIS_COMMAND_DOES_AND_WHY",
      "risk": "low|medium|high",
      "files": ["src/index.ts", "src/pages/Home.tsx"]
    }
  }')
echo "$RESPONSE"
```

`files` is the legacy form — a plain list of affected paths shown as a file tree. Use `affectedFiles` (below) when you can provide diffs.

### With diffs (recommended)

Use `affectedFiles` instead of `files` to show the user exactly what will change. Each entry includes the file path, change type, and an optional unified diff.

```bash
RESPONSE=$(curl -s -X POST http://host.docker.internal:3001/api/review \
  -H "Content-Type: application/json" \
  -d '{
    "type": "code_review",
    "payload": {
      "command": "git apply feature.patch",
      "cwd": "/project",
      "explanation": "Applies the feature patch: adds a retry helper and updates the API client to use it.",
      "risk": "medium",
      "affectedFiles": [
        {
          "path": "src/utils/retry.ts",
          "status": "added",
          "diff": "@@ -0,0 +1,12 @@\n+export async function retry<T>(fn: () => Promise<T>, times = 3): Promise<T> {\n+  let last: unknown\n+  for (let i = 0; i < times; i++) {\n+    try { return await fn() } catch (e) { last = e }\n+  }\n+  throw last\n+}"
        },
        {
          "path": "src/api/client.ts",
          "status": "modified",
          "diff": "@@ -1,8 +1,9 @@\n import axios from 'axios'\n+import { retry } from '../utils/retry'\n \n export async function fetchUser(id: string) {\n-  return axios.get(`/users/${id}`)\n+  return retry(() => axios.get(`/users/${id}`))\n }"
        },
        {
          "path": "src/api/legacyClient.ts",
          "status": "deleted",
          "diff": "@@ -1,5 +0,0 @@\n-// deprecated — use client.ts\n-import axios from 'axios'\n-export const get = (url: string) => axios.get(url)"
        }
      ]
    }
  }')
echo "$RESPONSE"
```

#### `affectedFiles` entry fields

| Field | Required | Description |
|-------|----------|-------------|
| `path` | yes | File path relative to `cwd` |
| `status` | yes | `"added"` \| `"modified"` \| `"deleted"` \| `"renamed"` |
| `diff` | no | Unified diff string (shown as GitHub-style diff in the UI) |
| `oldPath` | no | Previous path, only for `"renamed"` files |

#### How to generate the diff string

```bash
# For a patch you're about to apply:
git diff --unified=3 HEAD -- src/api/client.ts

# For staged changes:
git diff --cached --unified=3

# For a specific commit:
git show abc123 --unified=3 -- src/utils/retry.ts
```

Escape the output as a JSON string (replace newlines with `\n`) before embedding in the payload.

Save the `sessionId` from the response.

## Step 2: Wait for decision (blocks up to 5 minutes)

```bash
SESSION_ID="<sessionId from Step 1>"
curl -s "http://host.docker.internal:3001/api/sessions/${SESSION_ID}/wait"
```

The browser opens automatically. This call blocks until the user submits.

## Step 3: Act on the decision

- `result.approved: true` → **Run the command immediately. Do NOT ask the user again.** The user already approved in the UI. If `result.note` is set, adjust the command accordingly.
- `result.approved: false` → Do not run the command. Inform the user.
