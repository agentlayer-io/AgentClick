#!/bin/bash
# Test AgentClick code review — mind-map file tree + diff viewer

AGENTCLICK_URL="http://localhost:3001"

echo "Creating code review session..."

SESSION_PAYLOAD='{
  "type": "code_review",
  "sessionKey": "main-session",
  "payload": {
    "command": "git apply feature/retry-client.patch",
    "cwd": "/project/src",
    "explanation": "Introduces a generic retry helper and updates the API client to use it. Removes the deprecated legacy client module.",
    "risk": "medium",
    "affectedFiles": [
      {
        "path": "src/utils/retry.ts",
        "status": "added",
        "diff": "@@ -0,0 +1,14 @@\n+/**\n+ * Retries an async function up to `times` attempts.\n+ */\n+export async function retry<T>(\n+  fn: () => Promise<T>,\n+  times = 3,\n+  delayMs = 200,\n+): Promise<T> {\n+  let last: unknown\n+  for (let i = 0; i < times; i++) {\n+    try { return await fn() } catch (e) { last = e }\n+    if (i < times - 1) await new Promise(r => setTimeout(r, delayMs))\n+  }\n+  throw last\n+}"
      },
      {
        "path": "src/api/client.ts",
        "status": "modified",
        "diff": "@@ -1,10 +1,11 @@\n import axios from 'axios'\n+import { retry } from '../utils/retry'\n \n-export async function fetchUser(id: string) {\n-  return axios.get(`/users/${id}`)\n+export async function fetchUser(id: string) {\n+  return retry(() => axios.get(`/users/${id}`))\n }\n \n-export async function updateUser(id: string, data: object) {\n-  return axios.put(`/users/${id}`, data)\n+export async function updateUser(id: string, data: object) {\n+  return retry(() => axios.put(`/users/${id}`, data))\n }"
      },
      {
        "path": "src/api/legacyClient.ts",
        "status": "deleted",
        "diff": "@@ -1,7 +0,0 @@\n-// Deprecated — use client.ts\n-import axios from 'axios'\n-\n-export const get = (url: string) => axios.get(url)\n-export const post = (url: string, body: object) => axios.post(url, body)\n-export const del = (url: string) => axios.delete(url)"
      },
      {
        "path": "src/api/index.ts",
        "status": "renamed",
        "oldPath": "src/api/exports.ts",
        "diff": "@@ -1,3 +1,3 @@\n-export * from '\''./legacyClient'\''\n+export * from '\''./client'\''\n export * from '\''./types'\''"
      },
      {
        "path": "src/config/constants.ts",
        "status": "modified"
      },
      {
        "path": "tests/api/client.test.ts",
        "status": "added"
      }
    ]
  }
}'

RESPONSE=$(curl -s -X POST "$AGENTCLICK_URL/api/review" \
  -H "Content-Type: application/json" \
  -d "$SESSION_PAYLOAD")

SESSION_ID=$(echo "$RESPONSE" | grep -o '"sessionId":"[^"]*"' | cut -d'"' -f4)
URL=$(echo "$RESPONSE" | grep -o '"url":"[^"]*"' | cut -d'"' -f4)

if [ -z "$SESSION_ID" ]; then
  echo "❌ Failed to create session. Is AgentClick running?"
  echo "   Start it with: npm run dev"
  echo "   Response: $RESPONSE"
  exit 1
fi

echo ""
echo "✅ Code review session created!"
echo "   Session ID: $SESSION_ID"
echo "   Review URL: $URL"
echo ""
echo "What to check in the UI:"
echo "  • Mind-map file tree — pills connected by spine + arms"
echo "  • src/ directory auto-expanded (all files are on-path)"
echo "  • Diffs shown below the tree for 4 files"
echo "  • Added file (retry.ts)  → green pill"
echo "  • Modified files         → blue pill"
echo "  • Deleted file           → red pill"
echo "  • Renamed file           → amber pill with '← exports.ts'"
echo "  • Two entries without diffs (constants.ts, client.test.ts) show in tree only"
echo ""

# Open browser (macOS)
open "$URL" 2>/dev/null || echo "Open in browser: $URL"
