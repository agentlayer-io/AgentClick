#!/bin/bash
# Test AgentClick trajectory review system

AGENTCLICK_URL="http://localhost:3001"

echo "Creating trajectory review session..."

SESSION_PAYLOAD='{
  "type": "trajectory_review",
  "sessionKey": "main-session",
  "payload": {
    "title": "Deploying to staging",
    "description": "Attempted to deploy the latest build to the staging environment via SSH after locating the correct config.",
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
        "type": "tool_call",
        "label": "SSH to staging server",
        "detail": "ssh -i ~/.ssh/deploy_staging deploy@staging.example.com",
        "status": "failure",
        "duration": 5023,
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
            "type": "tool_call",
            "label": "Verified VPN status: connected to corp network",
            "detail": "vpn status => connected (corp-vpn-west-2)",
            "status": "success",
            "duration": 340
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
        "type": "tool_call",
        "label": "Pulled latest code on staging server",
        "detail": "cd /opt/app && git pull origin main",
        "status": "success",
        "duration": 4200
      },
      {
        "id": "s6",
        "type": "tool_call",
        "label": "Ran database migrations",
        "detail": "npm run migrate",
        "status": "success",
        "duration": 8500
      },
      {
        "id": "s7",
        "type": "tool_call",
        "label": "Restarted application service",
        "detail": "sudo systemctl restart app.service",
        "status": "success",
        "duration": 2100
      },
      {
        "id": "s8",
        "type": "tool_call",
        "label": "Health check on staging",
        "detail": "curl -f http://staging.example.com/health => {\"status\":\"ok\",\"version\":\"2.4.1\"}",
        "status": "success",
        "duration": 450
      },
      {
        "id": "s9",
        "type": "observation",
        "label": "Deploy complete — staging is running v2.4.1",
        "status": "success"
      }
    ],
    "context": {
      "model": "claude-sonnet-4-20250514",
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
echo "  - Expand step details (click Show detail)"
echo "  - View error panel + stack trace on step s4"
echo "  - Mark Wrong on any step (e.g. s4 — SSH without VPN check)"
echo "  - Add Guidance on any step"
echo "  - Check 'Remember this for future runs' to persist a rule"
echo "  - Set Resume From Step dropdown"
echo "  - Add a global note"
echo "  - Approve, Request Retry, or Reject"
echo ""
echo "Check session status:"
echo "  curl $AGENTCLICK_URL/api/sessions/$SESSION_ID"
