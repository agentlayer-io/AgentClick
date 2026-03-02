#!/usr/bin/env bash
# Test script for plan_review session type
# Creates a plan with parallel steps, children, alternatives, all risk levels, and an optional step

curl -s -X POST http://localhost:3001/api/review \
  -H 'Content-Type: application/json' \
  -d '{
    "type": "plan_review",
    "sessionKey": "test-plan-session",
    "payload": {
      "title": "Deploy new authentication system",
      "description": "Migrate from session-based auth to JWT with refresh tokens",
      "steps": [
        {
          "id": "s1",
          "type": "research",
          "label": "Audit current auth endpoints",
          "description": "Scan all routes using session middleware and catalog dependencies",
          "risk": "low",
          "estimatedDuration": "2m",
          "files": ["src/middleware/auth.ts", "src/routes/index.ts"]
        },
        {
          "id": "s2",
          "type": "code",
          "label": "Implement JWT token service",
          "description": "Create JWT sign/verify utilities with RS256 and refresh token rotation",
          "risk": "medium",
          "estimatedDuration": "5m",
          "files": ["src/services/jwt.ts", "src/types/auth.ts"],
          "constraints": ["Use RS256 algorithm", "Access token expiry: 15 minutes", "Refresh token expiry: 7 days"]
        },
        {
          "id": "s3",
          "type": "terminal",
          "label": "Install dependencies",
          "description": "npm install jsonwebtoken @types/jsonwebtoken",
          "risk": "low",
          "estimatedDuration": "30s"
        },
        {
          "id": "s4",
          "type": "agent_delegate",
          "label": "Generate DB migration for refresh tokens",
          "description": "Delegate to migration agent to create refresh_tokens table",
          "risk": "medium",
          "estimatedDuration": "3m",
          "parallel": true
        },
        {
          "id": "s5",
          "type": "decision",
          "label": "Choose rollback strategy",
          "description": "Decide whether to keep dual-auth during transition or do a hard cutover",
          "optional": true
        },
        {
          "id": "s6",
          "type": "checkpoint",
          "label": "Run integration test suite",
          "description": "Verify all auth flows work end-to-end before deployment",
          "risk": "high",
          "estimatedDuration": "4m",
          "children": [
            {
              "id": "s6.1",
              "type": "terminal",
              "label": "npm test -- --suite=auth",
              "risk": "low",
              "estimatedDuration": "2m"
            },
            {
              "id": "s6.2",
              "type": "action",
              "label": "Verify token refresh flow manually",
              "risk": "medium",
              "estimatedDuration": "1m"
            }
          ]
        }
      ],
      "context": {
        "model": "claude-sonnet-4-20250514",
        "taskId": "auth-migration-001",
        "branch": "feature/jwt-auth"
      },
      "alternatives": [
        {
          "name": "Gradual rollout",
          "description": "Migrate one route group at a time using feature flags",
          "steps": [
            {
              "id": "a1",
              "type": "code",
              "label": "Add feature flag system",
              "description": "Implement a simple feature flag module for auth routes",
              "risk": "low",
              "estimatedDuration": "2m",
              "files": ["src/flags.ts"]
            },
            {
              "id": "a2",
              "type": "code",
              "label": "Wrap auth middleware in feature flags",
              "risk": "medium",
              "estimatedDuration": "3m"
            },
            {
              "id": "a3",
              "type": "terminal",
              "label": "Deploy with flags disabled",
              "risk": "low",
              "estimatedDuration": "1m"
            },
            {
              "id": "a4",
              "type": "checkpoint",
              "label": "Enable flags per route group",
              "risk": "high",
              "estimatedDuration": "5m"
            },
            {
              "id": "a5",
              "type": "action",
              "label": "Monitor error rates for 24h",
              "risk": "medium",
              "estimatedDuration": "24h"
            }
          ]
        }
      ]
    }
  }' | python3 -m json.tool

echo ""
echo "Plan review session created. Check your browser."
