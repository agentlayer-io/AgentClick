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

Use this for file browsing (not approval completion):
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
