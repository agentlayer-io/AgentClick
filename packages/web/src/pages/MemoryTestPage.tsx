import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function MemoryTestPage() {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const createSession = async () => {
    setCreating(true)
    setError('')
    try {
      const response = await fetch('/api/memory/review/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          noOpen: true,
          currentContextFiles: ['SKILL.md', 'README.md'],
        }),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json() as { sessionId: string }
      navigate(`/memory/${data.sessionId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950">
      <div className="max-w-2xl mx-auto py-16 px-4">
        <p className="text-xs text-zinc-400 dark:text-slate-500 uppercase tracking-wider mb-1">Memory Test</p>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-slate-100">Memory Review Test Page</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-slate-400">
          Creates a memory review session with project, cache, and markdown classifications.
        </p>
        <button
          onClick={createSession}
          disabled={creating}
          className="mt-5 px-4 py-2 text-sm rounded-lg font-medium bg-zinc-900 dark:bg-slate-100 text-white dark:text-slate-900"
        >
          {creating ? 'Creating Session...' : 'Open Memory Review'}
        </button>
        {error && <p className="mt-3 text-xs text-red-500">{error}</p>}
      </div>
    </div>
  )
}

