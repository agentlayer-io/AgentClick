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

## Wait Protocol

After creating a `memory_review` session, block on:

```bash
curl -s "${AGENTCLICK_URL:-http://localhost:${AGENTCLICK_PORT:-38173}}/api/sessions/${SESSION_ID}/wait"
```

If status is `rewriting`, update payload via `PUT /api/sessions/:id/payload` and wait again.
