#!/bin/bash
# Test: large monorepo code review — many dirs, only key files have diffs
# Dirs with diffs auto-expand; the rest start folded but can be clicked open.

AGENTCLICK_URL="http://localhost:3001"

echo "Creating large code review session..."

SESSION_PAYLOAD='{
  "type": "code_review",
  "sessionKey": "main-session",
  "payload": {
    "command": "git merge feature/auth-overhaul",
    "cwd": "/monorepo",
    "explanation": "Merges the auth overhaul branch: adds OAuth2 provider, updates the user model, and touches middleware, routes, tests, and config across the monorepo. Only the core auth changes have diffs shown.",
    "risk": "high",
    "affectedFiles": [
      {
        "path": "packages/server/src/auth/oauth2.ts",
        "status": "added",
        "diff": "@@ -0,0 +1,10 @@\n+import { OAuth2Client } from '\''google-auth-library'\''\n+\n+export function createOAuth2Client() {\n+  return new OAuth2Client(\n+    process.env.GOOGLE_CLIENT_ID,\n+    process.env.GOOGLE_CLIENT_SECRET,\n+  )\n+}\n+\n+export type { OAuth2Client }"
      },
      {
        "path": "packages/server/src/auth/session.ts",
        "status": "modified",
        "diff": "@@ -1,5 +1,8 @@\n import { Request } from '\''express'\''\n+import { createOAuth2Client } from '\''./oauth2'\''\n \n export function getSession(req: Request) {\n-  return req.cookies.session\n+  const client = createOAuth2Client()\n+  return client.verifyIdToken({ idToken: req.cookies.token })\n }"
      },
      { "path": "packages/server/src/auth/index.ts", "status": "modified" },
      { "path": "packages/server/src/auth/permissions.ts", "status": "added" },
      { "path": "packages/server/src/middleware/cors.ts", "status": "modified" },
      { "path": "packages/server/src/middleware/rateLimit.ts", "status": "added" },
      { "path": "packages/server/src/middleware/authGuard.ts", "status": "added" },
      { "path": "packages/server/src/routes/auth.ts", "status": "modified" },
      { "path": "packages/server/src/routes/users.ts", "status": "modified" },
      { "path": "packages/server/src/routes/admin.ts", "status": "modified" },
      { "path": "packages/server/src/models/user.ts", "status": "modified" },
      { "path": "packages/server/src/models/session.ts", "status": "added" },
      { "path": "packages/server/src/config/env.ts", "status": "modified" },
      {
        "path": "packages/web/src/hooks/useAuth.ts",
        "status": "added",
        "diff": "@@ -0,0 +1,15 @@\n+import { useState, useEffect } from '\''react'\''\n+import { api } from '\''../lib/api'\''\n+\n+export function useAuth() {\n+  const [user, setUser] = useState(null)\n+  const [loading, setLoading] = useState(true)\n+\n+  useEffect(() => {\n+    api.get('\''/auth/me'\'').then(r => setUser(r.data))\n+      .catch(() => setUser(null))\n+      .finally(() => setLoading(false))\n+  }, [])\n+\n+  return { user, loading, isAuthenticated: !!user }\n+}"
      },
      { "path": "packages/web/src/components/LoginForm.tsx", "status": "modified" },
      { "path": "packages/web/src/components/AuthGuard.tsx", "status": "added" },
      { "path": "packages/web/src/components/UserMenu.tsx", "status": "modified" },
      { "path": "packages/web/src/pages/Login.tsx", "status": "modified" },
      { "path": "packages/web/src/pages/Dashboard.tsx", "status": "modified" },
      { "path": "packages/web/src/pages/Settings.tsx", "status": "modified" },
      { "path": "packages/web/src/lib/api.ts", "status": "modified" },
      {
        "path": "packages/shared/types/user.ts",
        "status": "modified",
        "diff": "@@ -1,4 +1,8 @@\n export interface User {\n   id: string\n   name: string\n+  email: string\n+  avatar?: string\n+  role: '\''admin'\'' | '\''user'\'' | '\''viewer'\''\n+  lastLoginAt?: string\n }"
      },
      { "path": "packages/shared/types/auth.ts", "status": "added" },
      { "path": "packages/shared/utils/token.ts", "status": "added" },
      { "path": "packages/shared/constants/roles.ts", "status": "added" },
      { "path": "tests/server/auth.test.ts", "status": "modified" },
      { "path": "tests/server/middleware.test.ts", "status": "added" },
      { "path": "tests/web/login.test.tsx", "status": "modified" },
      { "path": "tests/web/auth-guard.test.tsx", "status": "added" },
      { "path": "tests/e2e/auth-flow.spec.ts", "status": "added" },
      { "path": "config/jest.config.ts", "status": "modified" },
      { "path": "config/tsconfig.base.json", "status": "modified" },
      { "path": ".github/workflows/ci.yml", "status": "modified" },
      { "path": "docs/auth-architecture.md", "status": "added" },
      { "path": "scripts/migrate-sessions.ts", "status": "added" }
    ]
  }
}'

RESPONSE=$(curl -s -X POST "$AGENTCLICK_URL/api/review" \
  -H "Content-Type: application/json" \
  -d "$SESSION_PAYLOAD")

SESSION_ID=$(echo "$RESPONSE" | grep -o '"sessionId":"[^"]*"' | cut -d'"' -f4)
URL=$(echo "$RESPONSE" | grep -o '"url":"[^"]*"' | cut -d'"' -f4)

if [ -z "$SESSION_ID" ]; then
  echo "Failed to create session. Is AgentClick running?"
  echo "Response: $RESPONSE"
  exit 1
fi

echo ""
echo "Session created: $SESSION_ID"
echo "URL: $URL"
echo ""
echo "35 affected files, only 4 have diffs (the core auth changes)."
echo "Expected: auth/, hooks/, shared/types/ auto-expand (contain diffs)."
echo "Everything else starts folded. Click any dir to expand."
echo ""

open "$URL" 2>/dev/null || echo "Open: $URL"
