---
name: clickui-memory
description: Submit memory updates for human review and browse memory files through AgentClick.
---

# ClickUI Memory Review

Use this skill for memory inclusion decisions, memory modifications, and memory file browsing.

## Memory Review (`memory_review`)

### Payload schema

```json
{
  "type": "memory_review",
  "sessionKey": "<your-session-key>",
  "payload": {
    "title": "Memory Review",
    "groups": [{ "id": "group_project", "label": "In This Project", "fileIds": ["mem_a"] }],
    "files": [
      {
        "id": "mem_a",
        "path": "/abs/path/MEMORY.md",
        "relativePath": "MEMORY.md",
        "categories": ["project", "related_markdown"],
        "preview": "..."
      }
    ],
    "defaultIncludedFileIds": ["mem_a"],
    "modifications": [
      {
        "id": "mod_1",
        "fileId": "mem_a",
        "filePath": "/abs/path/MEMORY.md",
        "location": "MEMORY.md",
        "oldContent": "...",
        "newContent": "...",
        "generatedContent": "..."
      }
    ],
    "compressionRecommendations": [
      { "fileId": "mem_a", "recommendation": "include|disregard", "reason": "..." }
    ]
  }
}
```

### Result schema

```json
{
  "approved": true,
  "includedFileIds": ["mem_a"],
  "disregardedFileIds": [],
  "compressionDecisions": { "mem_a": "include" },
  "modificationReview": { "mod_1": true },
  "globalNote": "optional"
}
```

Execution rule:
- `approved: true` -> apply selected memory modifications and inclusion set
- `approved: false` -> do not apply memory changes

## Memory Management (`memory_management`)

### Core Rules

- Always create an AgentClick session with `type: "memory_management"`.
- The same agent that creates the session must monitor and update it.
- Do not start a helper process, fake monitor, or detached subagent monitor.
- The agent stays attached to the session and reacts to user actions in real-time.

### Step 1: Ensure AgentClick is running

```bash
if curl -s --max-time 1 http://localhost:38173/api/health > /dev/null 2>&1; then
  AGENTCLICK_BASE="http://localhost:38173"
else
  AGENTCLICK_BASE="http://host.docker.internal:38173"
fi

if ! curl -s --max-time 1 "$AGENTCLICK_BASE/api/health" > /dev/null 2>&1; then
  npm start >/tmp/agentclick.log 2>&1 &

  for _ in $(seq 1 30); do
    if curl -s --max-time 1 "$AGENTCLICK_BASE/api/health" > /dev/null 2>&1; then
      break
    fi
    sleep 1
  done
fi

curl -s --max-time 1 "$AGENTCLICK_BASE/api/health"
```

If health still fails, stop and fix the server problem before creating a session.

### Step 2: Create the session

```bash
RESPONSE=$(curl -s -X POST "$AGENTCLICK_BASE/api/memory/management/create" \
  -H 'Content-Type: application/json' \
  -d '{}')

SESSION_ID=$(echo "$RESPONSE" | grep -o '"sessionId":"[^"]*"' | cut -d'"' -f4)
echo "$SESSION_ID"
```

Optional body fields:
- `currentContextFiles`: array of file paths already in agent context
- `extraMarkdownDirs`: array of additional directories to scan
- `searchQuery`: optional search filter
- `noOpen`: set to true to suppress opening browser
- `sessionKey`: optional dedup key

### Step 3: Monitor the session as the agent

After creating the session, the same agent must stay attached to it.

**Environment detection:** `GOG_ACCOUNT` is set in Docker (via docker-compose.yml) and absent elsewhere.

```bash
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
- Inspect `status`, `result`, and `pageStatus`
- If `pageStatus.stopMonitoring` is `true` -> stop
- If `status` is `"completed"` -> stop
- If `status` is `"rewriting"` -> handle the action (see Action Handling below), then poll again
- Otherwise -> wait 1 second (`sleep 1` as a separate exec), then poll again

### Step 4: Action Handling

When the session returns `status: "rewriting"`, inspect `result` and handle the user's action:

The `result` contains:
- `action`: `"include"` | `"exclude"` | `"delete"`
- `path`: the absolute file path the user acted on
- `regenerate`: `true`

#### Include action

The UI has already persisted the include preference. The agent should:
1. **Read the file content** and add it to the agent's working context
2. Rebuild the catalog and PUT updated payload back to the session
3. Resume polling

```bash
# Read the newly included file
cat "$RESULT_PATH"

# Update the session payload with refreshed catalog
curl -s -X PUT "$AGENTCLICK_BASE/api/sessions/${SESSION_ID}/payload" \
  -H "Content-Type: application/json" \
  -d @/tmp/clickui_memory_payload.json
```

#### Exclude action

The UI has already persisted the exclude preference. The agent should:
1. Remove the file from the agent's working context
2. Rebuild the catalog and PUT updated payload
3. Resume polling

#### Delete action

The agent must delete the file from disk:
1. Delete the file: `rm "$RESULT_PATH"`
2. Rebuild the catalog and PUT updated payload
3. Resume polling

### PUT payload updates

Rebuild the catalog after each action and PUT the updated payload:

```bash
# Fetch fresh catalog
CATALOG=$(curl -s "$AGENTCLICK_BASE/api/memory/files")

# Write payload update
echo "{\"payload\": $CATALOG}" > /tmp/clickui_memory_payload.json

curl -s -X PUT "$AGENTCLICK_BASE/api/sessions/${SESSION_ID}/payload" \
  -H "Content-Type: application/json" \
  -d @/tmp/clickui_memory_payload.json
```

### Standalone browsing (no session)

For simple file browsing without agent interaction:
- List memory files: `GET /api/memory/files`
- Open a file: `GET /api/memory/file?path=<absolute-path>`
- UI route: `/memory-management`

## Poll Protocol

After creating a `memory_review` session, poll for the decision:

```bash
if curl -s --max-time 1 http://localhost:38173/api/health > /dev/null 2>&1; then
  AGENTCLICK_BASE="http://localhost:38173"
else
  AGENTCLICK_BASE="http://host.docker.internal:38173"
fi

# Detect environment: GOG_ACCOUNT is set in Docker (docker-compose.yml), absent elsewhere
if [ -n "$GOG_ACCOUNT" ]; then
  # Docker: use short-poll (one curl per exec, you are the loop controller)
  curl -s "$AGENTCLICK_BASE/api/sessions/${SESSION_ID}"
else
  # Non-Docker: use blocking /wait
  curl -s --max-time 310 "$AGENTCLICK_BASE/api/sessions/${SESSION_ID}/wait"
fi
```

- In Docker (`GOG_ACCOUNT` set): run ONE curl per exec call, check result in your context, then poll again. Do NOT use a bash while loop. You are the loop controller.
- In non-Docker: the `/wait` call blocks until state changes, then process the result.

If status is `rewriting`, update payload via `PUT /api/sessions/:id/payload` and poll again.
