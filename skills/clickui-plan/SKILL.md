---
name: clickui-plan
description: Submit an execution plan for human review and approval before executing
---

# Plan Review Skill

Submit a multi-step execution plan to AgentClick for human review. The human can inspect, edit, constrain, remove, insert, and skip steps, then approve, reject, or request regeneration.

## When to Use

- Agent has a multi-step plan that needs human approval before execution
- Agent wants to present alternative approaches for the human to choose from
- High-risk operations that require human sign-off on the execution strategy
- Complex workflows where the human should be able to modify the plan

## Payload Schema

```json
{
  "type": "plan_review",
  "sessionKey": "<your-session-key>",
  "payload": {
    "title": "Deploy new authentication system",
    "description": "Plan to migrate from session-based to JWT authentication",
    "steps": [
      {
        "id": "s1",
        "type": "research",
        "label": "Audit current auth endpoints",
        "description": "Scan all routes using session middleware",
        "risk": "low",
        "estimatedDuration": "2m",
        "files": ["src/middleware/auth.ts", "src/routes/"]
      },
      {
        "id": "s2",
        "type": "code",
        "label": "Implement JWT token service",
        "description": "Create JWT sign/verify utilities with refresh token support",
        "risk": "medium",
        "estimatedDuration": "5m",
        "files": ["src/services/jwt.ts"],
        "constraints": ["Use RS256 algorithm", "Token expiry: 15min"]
      },
      {
        "id": "s3",
        "type": "terminal",
        "label": "Install jsonwebtoken package",
        "risk": "low",
        "estimatedDuration": "30s"
      },
      {
        "id": "s4",
        "type": "agent_delegate",
        "label": "Generate migration script",
        "risk": "medium",
        "parallel": true
      },
      {
        "id": "s5",
        "type": "decision",
        "label": "Choose rollback strategy",
        "description": "Decide whether to keep dual-auth or cut over immediately",
        "optional": true
      },
      {
        "id": "s6",
        "type": "checkpoint",
        "label": "Run integration tests",
        "risk": "high",
        "estimatedDuration": "3m",
        "children": [
          {
            "id": "s6.1",
            "type": "terminal",
            "label": "npm test -- --suite=auth",
            "risk": "low"
          },
          {
            "id": "s6.2",
            "type": "action",
            "label": "Verify token refresh flow",
            "risk": "medium"
          }
        ]
      }
    ],
    "context": {
      "model": "claude-sonnet-4-20250514",
      "taskId": "auth-migration-001"
    },
    "alternatives": [
      {
        "name": "Gradual rollout",
        "description": "Migrate one route at a time with feature flags",
        "steps": [
          {
            "id": "a1",
            "type": "code",
            "label": "Add feature flag system",
            "risk": "low"
          },
          {
            "id": "a2",
            "type": "code",
            "label": "Wrap auth routes in feature flags",
            "risk": "medium"
          }
        ]
      }
    ]
  }
}
```

## Step Types

| Type              | Description                                    |
|-------------------|------------------------------------------------|
| `action`          | A general action or task to perform            |
| `research`        | Information gathering or analysis              |
| `code`            | Writing or modifying code                      |
| `terminal`        | Shell command execution                        |
| `agent_delegate`  | Delegating to a sub-agent                      |
| `decision`        | A decision point or branch                     |
| `checkpoint`      | A verification or testing milestone            |

## Risk Levels

| Level    | Description                          |
|----------|--------------------------------------|
| `low`    | Safe, easily reversible              |
| `medium` | Some risk, may need attention        |
| `high`   | Dangerous, hard to reverse           |

## Submitting a Plan

```bash
if curl -s --max-time 1 http://localhost:38173/api/health > /dev/null 2>&1; then
  AGENTCLICK_BASE="http://localhost:38173"
else
  AGENTCLICK_BASE="http://host.docker.internal:38173"
fi

RESPONSE=$(curl -s -X POST "$AGENTCLICK_BASE/api/review" \
  -H 'Content-Type: application/json' \
  -d '{
    "type": "plan_review",
    "sessionKey": "my-session",
    "payload": {
      "title": "Test plan",
      "steps": [
        { "id": "s1", "type": "research", "label": "Gather requirements", "risk": "low" },
        { "id": "s2", "type": "code", "label": "Implement feature", "risk": "medium" },
        { "id": "s3", "type": "checkpoint", "label": "Run tests", "risk": "low" }
      ]
    }
  }')
SESSION_ID=$(echo "$RESPONSE" | grep -o '"sessionId":"[^"]*"' | cut -d'"' -f4)
echo "Session: $SESSION_ID"
```

## Poll Protocol (Required)

After creating the session, poll for the decision. Do not continue execution before the session reaches a completed or rewriting state.

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

- In Docker (`GOG_ACCOUNT` set): run ONE curl per exec call, check result in your context, then poll again. Do NOT use a bash while loop. You are the loop controller.
- In non-Docker: the `/wait` call blocks until state changes, then process the result.

Rules:

- Do not ask the user for duplicate confirmation in chat while polling.
- Do not create a second review session for the same plan unless the first one is abandoned.
- Treat the session status field as the single source of truth for approval state.

## Result Schema

The human's response is returned via `/api/sessions/:id` (poll) or `/api/sessions/:id/wait` (non-Docker blocking):

```json
{
  "approved": true,
  "selectedAlternative": null,
  "modifications": {
    "s2": { "label": "Implement feature with error handling", "description": "Updated description" }
  },
  "insertions": [
    {
      "afterId": "s2",
      "step": { "id": "inserted_1234", "type": "terminal", "label": "Run linter" }
    }
  ],
  "removals": ["s5"],
  "skipped": ["s5"],
  "constraints": {
    "s2": ["Must use TypeScript strict mode"]
  },
  "globalConstraints": ["No external API calls"],
  "globalNote": "Looks good, just add linting step"
}
```

## Rewrite Cycle

1. Human reviews plan and clicks "Regenerate"
2. Agent's poll (or `/wait` in non-Docker) resolves with `status: "rewriting"` and the human's feedback
3. Agent revises the plan based on the human's feedback:
   - Read `result.constraints` for per-step comments — these tell you what the user wants changed about specific steps
   - Read `result.globalNote` for overall feedback
   - Adjust the plan to address all user comments before PUTting the updated payload
4. Agent PUTs updated payload: `PUT /api/sessions/:id/payload`
5. Human reviews again (status resets to `pending`)

## Act on Decision

- **approved**: Execute the plan incorporating all user feedback:
  1. Apply `modifications` — use modified labels/descriptions instead of originals
  2. Apply `insertions` — add inserted steps at the specified positions
  3. Skip `removals` and `skipped` steps
  4. **Read `constraints`** — these are per-step user comments. For each step ID in `constraints`, read the user's comments and adjust that step's execution accordingly. User comments take priority over the original step description.
  5. **Read `globalConstraints`** — apply these rules across all steps
  6. **Read `globalNote`** — treat as an overarching instruction from the user
  Do not ask for confirmation again in chat.
- **rejected**: Stop execution, do not proceed
- **regenerate**: Revise the plan incorporating human feedback, then PUT updated payload for re-review

If the session has been `pending` for a very long time with no user action (or `/wait` returns HTTP 408 in non-Docker), ask the user whether to keep polling or cancel.
