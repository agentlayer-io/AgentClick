import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

interface SessionItem {
  id: string
  type: string
  status: 'pending' | 'completed'
  createdAt: number
  subject?: string
  to?: string
  risk?: string
  command?: string
}

const TYPE_LABELS: Record<string, string> = {
  email_review:     'Email',
  code_review:      'Code',
  action_approval:  'Approval',
  form_review:      'Form',
  selection_review: 'Selection',
}

function sessionPath(s: SessionItem): string {
  if (s.type === 'action_approval') return `/approval/${s.id}`
  if (s.type === 'code_review') return `/code-review/${s.id}`
  if (s.type === 'form_review') return `/form-review/${s.id}`
  if (s.type === 'selection_review') return `/selection/${s.id}`
  return `/review/${s.id}`
}

function sessionTitle(s: SessionItem): string {
  if (s.subject) return s.subject
  if (s.type === 'code_review' && s.command) return s.command
  return TYPE_LABELS[s.type] ?? s.type
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = Date.now()
  const diffMs = now - ts
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return d.toLocaleDateString()
}

export default function CompletedPage() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/sessions')
      .then(r => r.json())
      .then((data: SessionItem[]) => {
        setSessions(data.filter(s => s.status === 'completed'))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950">
      <div className="max-w-2xl mx-auto py-10 px-4">

        <div className="flex items-center gap-2 mb-1">
          <button
            onClick={() => navigate('/')}
            className="text-sm text-zinc-400 dark:text-slate-500 hover:text-zinc-600 dark:hover:text-slate-300 transition-colors"
          >
            ← Back
          </button>
        </div>

        <div className="mb-8">
          <p className="text-xs text-zinc-400 dark:text-slate-500 uppercase tracking-wider mb-1 font-medium">agentclick</p>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-slate-100">Completed</h1>
          <p className="text-sm text-zinc-500 dark:text-slate-400 mt-1">Sessions you've already reviewed.</p>
        </div>

        {loading && (
          <p className="text-sm text-zinc-400 dark:text-slate-500">Loading...</p>
        )}

        {!loading && sessions.length === 0 && (
          <p className="text-sm text-zinc-400 dark:text-slate-500">No completed sessions yet.</p>
        )}

        {!loading && sessions.length > 0 && (
          <div className="space-y-2">
            {sessions.map(s => (
              <Link
                key={s.id}
                to={sessionPath(s)}
                className="flex items-center justify-between p-4 bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-lg hover:border-gray-200 dark:hover:border-zinc-700 transition-colors"
              >
                <div className="min-w-0 flex items-center gap-2">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 font-medium shrink-0">
                    {TYPE_LABELS[s.type] ?? s.type}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-500 dark:text-slate-400 truncate">
                      {sessionTitle(s)}
                    </p>
                    {s.to && (
                      <p className="text-xs text-zinc-400 dark:text-slate-500 mt-0.5 truncate">To: {s.to}</p>
                    )}
                  </div>
                </div>
                <span className="text-xs text-zinc-400 dark:text-slate-500 shrink-0 ml-4">{formatTime(s.createdAt)}</span>
              </Link>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
