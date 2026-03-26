#!/usr/bin/env node
/**
 * Capture demo screenshots of each AgentClick page type using Playwright.
 * Requires: npx playwright install chromium
 * Usage: node scripts/capture-screenshots.mjs
 */

import { chromium } from 'playwright'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '..', 'assets', 'screenshots')
const BASE = 'http://localhost:38173'

const DEMO_EMAILS = [
  {
    id: 'demo_mail_1', from: 'Acme Cloud <billing@acmecloud.io>', to: 'team@company.com',
    subject: 'Your March usage report is ready',
    preview: 'Monthly usage summary — compute up 12%, storage stable.',
    body: 'Hi Team,\n\nYour monthly usage summary is now ready for review.\n\n- Compute spend increased by 12%\n- Storage spend remained stable\n- Two projects crossed their forecast threshold\n\nPlease review the billing dashboard before Friday at 5 PM PT.\n\nThanks,\nAcme Cloud Billing',
    read: false, category: 'Updates',
  },
  {
    id: 'demo_mail_2', from: 'Design Weekly <editors@designweekly.io>', to: 'team@company.com',
    subject: 'Ten landing pages worth stealing from',
    preview: 'Curated experiments in motion, copy, and pricing hierarchy.',
    body: 'This week:\n\n1. Stripe-style enterprise pricing comparison blocks\n2. Editorial product storytelling from three AI-native apps\n3. Lightweight motion systems that clarify hierarchy\n\nOpen the issue for screenshots and teardown notes.',
    read: true, category: 'Promotions',
  },
  {
    id: 'demo_mail_3', from: 'Sarah Chen <sarah@startup.co>', to: 'team@company.com',
    subject: 'Quick sync on API migration timeline',
    preview: 'Can we push the v2 cutover to next Thursday?',
    body: 'Hey,\n\nI spoke with the infrastructure team and they need two more days for the load testing results. Can we push the v2 API cutover from Tuesday to Thursday?\n\nThe client SDK update is ready to go — just waiting on the green light from ops.\n\nLet me know if that works.\n\nSarah',
    read: false, category: 'Primary',
  },
  {
    id: 'demo_mail_4', from: 'GitHub <notifications@github.com>', to: 'team@company.com',
    subject: '[agentclick] PR #47 merged: Add preference learning',
    preview: 'PR #47 by @harvenstar was merged into main.',
    body: 'Pull request #47 was merged into main.\n\n## Summary\n- Added user preference persistence via click_preferences.md\n- New API endpoints for style preferences\n- Conflict detection with 3-action resolution\n\nFiles changed: 6\nCommits: 3',
    read: true, category: 'Updates',
  },
  {
    id: 'demo_mail_5', from: 'Ops Alert <alerts@monitoring.io>', to: 'oncall@company.com',
    subject: 'RESOLVED: API latency spike on us-east-1',
    preview: 'p95 latency returned to normal at 14:32 UTC.',
    body: 'RESOLVED\n\nThe API latency spike on us-east-1 that began at 13:58 UTC has been resolved.\n\n- Peak p95: 1,240ms (normal: ~180ms)\n- Root cause: connection pool exhaustion in the auth service\n- Auto-scaled at 14:28 UTC, fully resolved by 14:32 UTC\n\nNo customer-facing errors were observed.',
    read: false, category: 'Primary',
  },
]

const DEMO_PLAN = {
  title: 'Migrate authentication from sessions to JWT',
  description: 'Replace legacy session-based auth with JWT tokens across all API endpoints.',
  steps: [
    { id: 's1', type: 'research', label: 'Audit authentication boundaries across API, worker, and cron jobs', description: 'Inspect all entry points that trust session cookies. Document where token-based auth is required.', risk: 'low', estimatedDuration: '4m', files: ['src/routes/', 'src/middleware/auth.ts'] },
    { id: 's2', type: 'code', label: 'Implement JWT utility layer with key rotation', description: 'Build a service that signs access tokens, validates claims, and exposes an API for middleware.', risk: 'medium', estimatedDuration: '8m', files: ['src/services/jwt.ts'] },
    { id: 's3', type: 'checkpoint', label: 'Run integration tests for refresh-token flow', risk: 'high', estimatedDuration: '5m',
      children: [
        { id: 's3.1', type: 'terminal', label: 'npm test -- --suite=auth', risk: 'low' },
        { id: 's3.2', type: 'action', label: 'Record pass/fail summary', risk: 'medium' },
      ],
    },
    { id: 's4', type: 'action', label: 'Deploy to staging and run smoke tests', risk: 'medium', estimatedDuration: '3m' },
    { id: 's5', type: 'decision', label: 'Evaluate: proceed to production or rollback?', risk: 'high' },
  ],
}

const DEMO_CODE_REVIEW = {
  command: 'git apply auth-migration.patch',
  cwd: '/app',
  explanation: 'Apply the JWT authentication migration patch — replaces session middleware with token verification.',
  risk: 'high',
  affectedFiles: [
    { path: 'src/services/jwt.ts', status: 'added', diff: '@@ -0,0 +1,18 @@\n+import jwt from "jsonwebtoken"\n+\n+const SECRET = process.env.JWT_SECRET!\n+\n+export function sign(payload: object): string {\n+  return jwt.sign(payload, SECRET, { expiresIn: "15m" })\n+}\n+\n+export function verify(token: string) {\n+  return jwt.verify(token, SECRET)\n+}\n+\n+export function refresh(token: string): string {\n+  const decoded = verify(token) as jwt.JwtPayload\n+  delete decoded.exp\n+  delete decoded.iat\n+  return sign(decoded)\n+}' },
    { path: 'src/middleware/auth.ts', status: 'modified', diff: '@@ -1,8 +1,12 @@\n-import session from "express-session"\n+import { verify } from "../services/jwt"\n \n-export const authMiddleware = session({\n-  secret: process.env.SESSION_SECRET!,\n-  resave: false,\n-  saveUninitialized: false,\n-})\n+export function authMiddleware(req, res, next) {\n+  const token = req.headers.authorization?.split(" ")[1]\n+  if (!token) return res.status(401).json({ error: "Missing token" })\n+  try {\n+    req.user = verify(token)\n+    next()\n+  } catch {\n+    res.status(401).json({ error: "Invalid token" })\n+  }\n+}' },
    { path: 'src/middleware/session.ts', status: 'deleted', diff: '@@ -1,6 +0,0 @@\n-// Legacy session middleware\n-import session from "express-session"\n-export default session({\n-  secret: process.env.SESSION_SECRET!,\n-  resave: false,\n-})' },
  ],
}

const DEMO_TRAJECTORY = {
  title: 'Deploy v2.1 to staging environment',
  description: 'Attempted deployment of the latest build with auth migration.',
  steps: [
    { id: 't1', type: 'tool_call', label: 'Pull latest from main branch', detail: 'git pull origin main', status: 'success', duration: 1200 },
    { id: 't2', type: 'tool_call', label: 'Run test suite', detail: 'npm test', status: 'success', duration: 45000,
      children: [
        { id: 't2.1', type: 'observation', label: '142 tests passed, 0 failed', status: 'success' },
      ],
    },
    { id: 't3', type: 'decision', label: 'Use rolling deploy strategy', status: 'success' },
    { id: 't4', type: 'tool_call', label: 'SSH to staging server', detail: 'ssh deploy@staging.example.com', status: 'failure',
      error: { message: 'Connection refused', code: 'ECONNREFUSED' },
      children: [
        { id: 't4.1', type: 'retry', label: 'Retry with VPN check', status: 'success', duration: 3400 },
      ],
    },
    { id: 't5', type: 'tool_call', label: 'Apply database migrations', detail: 'npx prisma migrate deploy', status: 'success', duration: 8200 },
    { id: 't6', type: 'observation', label: 'Health check passed on all endpoints', status: 'success' },
  ],
}

const DEMO_APPROVAL = {
  action: 'Delete stale feature branches',
  description: 'Remove 12 merged feature branches older than 30 days from the remote repository. Branches: feature/auth-v2, feature/billing-ui, fix/rate-limiter, feature/onboarding-flow, and 8 others.',
  risk: 'medium',
}

async function createSession(type, payload) {
  const res = await fetch(`${BASE}/api/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, sessionKey: `demo-${type}`, payload }),
  })
  const data = await res.json()
  return data.sessionId
}

async function captureScreenshot(page, url, filename, opts = {}) {
  const { waitFor, clickBefore } = opts
  await page.goto(url, { waitUntil: 'networkidle' })
  if (waitFor) await page.waitForSelector(waitFor, { timeout: 5000 }).catch(() => {})
  if (clickBefore) {
    for (const sel of clickBefore) {
      await page.click(sel).catch(() => {})
      await page.waitForTimeout(300)
    }
  }
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(OUT_DIR, filename), fullPage: false })
  console.log(`  ✓ ${filename}`)
}

async function main() {
  console.log('Creating demo sessions...')

  const emailId = await createSession('email_review', { inbox: DEMO_EMAILS, draft: { replyTo: '', to: '', subject: '', paragraphs: [] } })
  const planId = await createSession('plan_review', DEMO_PLAN)
  const codeId = await createSession('code_review', DEMO_CODE_REVIEW)
  const trajId = await createSession('trajectory_review', DEMO_TRAJECTORY)
  const approvalId = await createSession('action_approval', DEMO_APPROVAL)

  console.log('Sessions created. Launching browser...\n')

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  })
  const page = await context.newPage()

  // Force light mode
  await page.emulateMedia({ colorScheme: 'light' })

  console.log('Capturing screenshots...')

  // 1. Email Review
  await captureScreenshot(page, `${BASE}/review/${emailId}`, 'email-review.png')

  // 2. Plan Review (DAG view)
  await captureScreenshot(page, `${BASE}/plan/${planId}`, 'plan-review.png')

  // 3. Code Review
  await captureScreenshot(page, `${BASE}/code-review/${codeId}`, 'code-review.png')

  // 4. Trajectory Review
  await captureScreenshot(page, `${BASE}/trajectory/${trajId}`, 'trajectory-review.png')

  // 5. Action Approval
  await captureScreenshot(page, `${BASE}/approval/${approvalId}`, 'action-approval.png')

  // 6. Home page
  await captureScreenshot(page, `${BASE}/`, 'home.png')

  await browser.close()
  console.log(`\nDone! Screenshots saved to assets/screenshots/`)
}

main().catch(err => { console.error(err); process.exit(1) })
