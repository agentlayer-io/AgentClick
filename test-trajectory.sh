#!/bin/bash
# Test AgentClick trajectory review system

AGENTCLICK_URL="http://localhost:3001"

echo "Creating trajectory review session..."

SESSION_PAYLOAD='{
  "type": "trajectory_review",
  "sessionKey": "main-session",
  "payload": {
    "title": "Deploying to staging",
    "description": "Orchestrator agent delegated to sub-agents for build verification before deploying via SSH.",
    "steps": [
      {
        "id": "s1",
        "type": "tool_call",
        "label": "Searched source tree for config files",
        "detail": "grep -r \"deploy\" src/ config/",
        "status": "success",
        "duration": 85,
        "children": [
          {
            "id": "s1.1",
            "type": "observation",
            "label": "Found 3 config files: config/staging.yaml, config/prod.yaml, src/deploy.ts",
            "status": "success"
          }
        ]
      },
      {
        "id": "s2",
        "type": "decision",
        "label": "Selected config/staging.yaml for deployment target",
        "detail": "Chose staging.yaml because it contains the correct host and credentials path for the staging environment.",
        "status": "success"
      },
      {
        "id": "s3",
        "type": "tool_call",
        "label": "Read staging.yaml for connection details",
        "detail": "host: staging.example.com\nport: 22\nuser: deploy\nkey: ~/.ssh/deploy_staging",
        "status": "success",
        "duration": 12
      },
      {
        "id": "s4",
        "type": "terminal",
        "label": "SSH to staging server",
        "status": "failure",
        "duration": 5023,
        "terminal": {
          "command": "ssh -i ~/.ssh/deploy_staging deploy@staging.example.com",
          "exitCode": 1,
          "output": "ssh: connect to host staging.example.com port 22: Connection refused"
        },
        "error": {
          "message": "Connection refused",
          "code": "ECONNREFUSED",
          "stackTrace": "Error: connect ECONNREFUSED 10.0.0.5:22\n    at TCPConnectWrap.afterConnect [as oncomplete] (net.js:1141:16)\n    at TCPConnectWrap.callbackTrampoline (node:internal/async_hooks:130:17)"
        },
        "children": [
          {
            "id": "s4.1",
            "type": "decision",
            "label": "Check if VPN is connected before retrying",
            "status": "success"
          },
          {
            "id": "s4.2",
            "type": "terminal",
            "label": "Verified VPN status",
            "status": "success",
            "duration": 340,
            "terminal": {
              "command": "vpn status",
              "exitCode": 0,
              "output": "connected (corp-vpn-west-2)"
            }
          },
          {
            "id": "s4.3",
            "type": "retry",
            "label": "Retry SSH to staging server",
            "detail": "ssh -i ~/.ssh/deploy_staging deploy@staging.example.com",
            "status": "success",
            "duration": 1800
          }
        ]
      },
      {
        "id": "s5",
        "type": "terminal",
        "label": "Pulled latest code on staging server",
        "status": "success",
        "duration": 4200,
        "terminal": {
          "command": "cd /opt/app && git pull origin main",
          "exitCode": 0,
          "output": "Already up to date.\n * branch main -> FETCH_HEAD"
        }
      },
      {
        "id": "s6",
        "type": "agent_call",
        "label": "Delegated build verification to CI agent",
        "status": "success",
        "duration": 23400,
        "agent": { "name": "ci-verifier", "model": "claude-haiku-4-5" },
        "children": [
          {
            "id": "s6.1",
            "type": "terminal",
            "label": "Install dependencies",
            "status": "success",
            "duration": 12000,
            "terminal": {
              "command": "npm ci --production",
              "exitCode": 0
            }
          },
          {
            "id": "s6.2",
            "type": "terminal",
            "label": "Run linter",
            "status": "success",
            "duration": 3200,
            "parallel": true,
            "terminal": {
              "command": "npm run lint",
              "exitCode": 0
            }
          },
          {
            "id": "s6.3",
            "type": "terminal",
            "label": "Run tests",
            "status": "failure",
            "duration": 8100,
            "parallel": true,
            "terminal": {
              "command": "npm test",
              "exitCode": 1,
              "output": "FAIL src/deploy.test.ts\n  \u2715 should validate config (12ms)\n  \u2715 should handle timeout (45ms)"
            },
            "error": {
              "message": "2 tests failed",
              "code": "TEST_FAILURE"
            },
            "children": [
              {
                "id": "s6.3.1",
                "type": "retry",
                "label": "Re-run failed tests with --retry",
                "status": "success",
                "duration": 6500,
                "terminal": {
                  "command": "npm test -- --retry 1",
                  "exitCode": 0
                }
              }
            ]
          },
          {
            "id": "s6.4",
            "type": "observation",
            "label": "All checks passed after retry",
            "status": "success"
          }
        ]
      },
      {
        "id": "s7",
        "type": "agent_call",
        "label": "Delegated database migration to DBA agent",
        "status": "success",
        "duration": 9200,
        "agent": { "name": "dba-agent", "model": "claude-sonnet-4-6" },
        "parallel": true,
        "children": [
          {
            "id": "s7.1",
            "type": "tool_call",
            "label": "Checked pending migrations",
            "detail": "2 pending: 042_add_index.sql, 043_alter_users.sql",
            "status": "success",
            "duration": 700
          },
          {
            "id": "s7.2",
            "type": "terminal",
            "label": "Applied migrations",
            "status": "success",
            "duration": 8500,
            "terminal": {
              "command": "npm run migrate",
              "exitCode": 0,
              "output": "Migration 042_add_index.sql applied\nMigration 043_alter_users.sql applied"
            }
          }
        ]
      },
      {
        "id": "s8",
        "type": "agent_call",
        "label": "Delegated service restart to infra agent",
        "status": "success",
        "duration": 3100,
        "agent": { "name": "infra-agent" },
        "parallel": true,
        "children": [
          {
            "id": "s8.1",
            "type": "terminal",
            "label": "Restarted application service",
            "status": "success",
            "duration": 2100,
            "terminal": {
              "command": "sudo systemctl restart app.service",
              "exitCode": 0
            }
          },
          {
            "id": "s8.2",
            "type": "terminal",
            "label": "Health check",
            "status": "success",
            "duration": 450,
            "terminal": {
              "command": "curl -f http://staging.example.com/health",
              "exitCode": 0,
              "output": "{\"status\":\"ok\",\"version\":\"2.4.1\"}"
            }
          }
        ]
      },
      {
        "id": "s9",
        "type": "observation",
        "label": "Deploy complete \u2014 staging is running v2.4.1",
        "status": "success"
      }
    ],
    "context": {
      "model": "claude-sonnet-4-6",
      "taskId": "deploy-staging-042",
      "trigger": "user request"
    }
  }
}'

RESPONSE=$(curl -s -X POST "$AGENTCLICK_URL/api/review" \
  -H "Content-Type: application/json" \
  -d "$SESSION_PAYLOAD")

SESSION_ID=$(echo "$RESPONSE" | grep -o '"sessionId":"[^"]*"' | cut -d'"' -f4)
URL=$(echo "$RESPONSE" | grep -o '"url":"[^"]*"' | cut -d'"' -f4)

echo ""
echo "Trajectory review session created!"
echo "   Session ID: $SESSION_ID"
echo "   Review URL: $URL"
echo ""
echo "The browser should open automatically."
echo ""
echo "What you can test in the UI:"
echo "  - DAG with parallel branches (s7 DBA + s8 infra side-by-side)"
echo "  - Agent call nodes (s6 ci-verifier, s7 dba-agent, s8 infra-agent)"
echo "  - Terminal nodes with command/output (s4, s5, s6.x)"
echo "  - Nested sub-agent steps (click s6 to see ci-verifier's children)"
echo "  - Failure branch with retry (s6.3 -> s6.3.1)"
echo "  - Collapse/expand any node with children"
echo "  - Hover to highlight connected path"
echo "  - Click node for detail panel with Mark Wrong / Add Guidance"
echo ""
echo "Check session status:"
echo "  curl $AGENTCLICK_URL/api/sessions/$SESSION_ID"
