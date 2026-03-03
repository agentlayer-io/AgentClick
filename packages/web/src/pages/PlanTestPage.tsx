import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const samplePayload = {
  title: 'Plan Visualization Test - Rich Full Text Cards',
  description: 'This test session verifies that each plan step renders as a readable full-text card rather than a compressed node.',
  steps: [
    {
      id: 's1',
      type: 'research',
      label: 'Audit authentication and access boundaries across API, worker, and scheduled jobs',
      description: 'Inspect all entry points that currently trust session cookies and document where token-based auth is required. Include middleware usage, service-to-service calls, and cron tasks.',
      risk: 'low',
      estimatedDuration: '4m',
      files: ['src/routes/', 'src/middleware/auth.ts', 'src/jobs/'],
      constraints: ['Do not change behavior in this step', 'Focus on inventory only'],
    },
    {
      id: 's2',
      type: 'code',
      label: 'Implement a JWT utility layer with explicit key rotation and strict verification defaults',
      description: 'Build a dedicated service that signs access tokens, validates issuer/audience claims, and exposes a small API for middleware. Include migration notes in comments where legacy logic exists.',
      risk: 'medium',
      estimatedDuration: '8m',
      files: ['src/services/jwt.ts', 'src/middleware/tokenAuth.ts'],
      constraints: ['Use RS256', 'Token expiry: 15 minutes', 'No silent fallback to legacy session'],
    },
    {
      id: 's3',
      type: 'checkpoint',
      label: 'Run integration tests and verify refresh-token flow end-to-end with failure-path assertions',
      description: 'Run existing suites and add focused assertions for expired token behavior, revoked refresh token handling, and invalid signature rejection.',
      risk: 'high',
      estimatedDuration: '5m',
      children: [
        {
          id: 's3.1',
          type: 'terminal',
          label: 'npm test -- --suite=auth',
          risk: 'low',
        },
        {
          id: 's3.2',
          type: 'action',
          label: 'Record pass/fail summary and rollback trigger criteria',
          description: 'Document exact conditions that should halt rollout and trigger rollback.',
          risk: 'medium',
        },
      ],
    },
  ],
  context: {
    taskId: 'plan-visualization-test',
    env: 'local',
  },
}

export default function PlanTestPage() {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [sessionId, setSessionId] = useState('')

  const createTestSession = async () => {
    setCreating(true)
    setError('')
    try {
      const response = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'plan_review',
          sessionKey: 'plan-visualization-test',
          noOpen: true,
          payload: samplePayload,
        }),
      })
      if (!response.ok) {
        throw new Error(`Create session failed: ${response.status}`)
      }
      const data = await response.json() as { sessionId: string }
      setSessionId(data.sessionId)
      navigate(`/plan/${data.sessionId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950">
      <div className="max-w-3xl mx-auto py-16 px-4">
        <p className="text-xs text-zinc-400 dark:text-slate-500 uppercase tracking-wider mb-1">Plan Test</p>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-slate-100">Plan Review Visualization Test Page</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-slate-400">
          Creates a sample <code>plan_review</code> session with long labels and descriptions, then opens the standard plan review page.
        </p>

        <div className="mt-6 p-4 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
          <button
            onClick={createTestSession}
            disabled={creating}
            className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors ${
              creating
                ? 'bg-zinc-300 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 cursor-not-allowed'
                : 'bg-zinc-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-zinc-700 dark:hover:bg-slate-200'
            }`}
          >
            {creating ? 'Creating Session...' : 'Open Plan Visualization Test'}
          </button>
          {sessionId && (
            <p className="mt-3 text-xs text-zinc-500 dark:text-slate-400">
              Last session: <code>{sessionId}</code>
            </p>
          )}
          {error && (
            <p className="mt-3 text-xs text-red-500">{error}</p>
          )}
        </div>
      </div>
    </div>
  )
}
