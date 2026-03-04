import { useCallback, useEffect, useState } from 'react'

interface PortsStatus {
  checkedAt: number
  server: {
    port: number
    reachable: boolean
    isAgentClick: boolean
    mode: string
    identityEndpoint: string
  }
  web: {
    origin: string
    port: number | null
    reachable: boolean
    status: number
    error?: string
  }
}

export default function PortsPage() {
  const [status, setStatus] = useState<PortsStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (initial = false) => {
    try {
      const response = await fetch('/api/ports-status')
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json() as PortsStatus
      setStatus(data)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch status')
    } finally {
      if (initial) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(true)
    const t = setInterval(() => load(), 4000)
    return () => clearInterval(t)
  }, [load])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950">
      <div className="max-w-4xl mx-auto py-10 px-4">
        <p className="text-xs text-zinc-400 dark:text-slate-500 uppercase tracking-wider mb-1">Infrastructure</p>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-slate-100">Ports Status</h1>

        {loading && <p className="text-sm text-zinc-400 dark:text-slate-500 mt-4">Loading...</p>}
        {!loading && error && <p className="text-sm text-red-500 mt-4">Failed to load: {error}</p>}

        {status && (
          <>
            <p className="text-xs text-zinc-400 dark:text-slate-500 mt-2">
              Last checked: {new Date(status.checkedAt).toLocaleString()}
            </p>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                <p className="text-xs uppercase text-zinc-400 dark:text-slate-500 mb-2">Server Port</p>
                <p className="text-lg font-semibold text-zinc-900 dark:text-slate-100">{status.server.port}</p>
                <p className={`text-sm mt-1 ${status.server.isAgentClick ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                  {status.server.isAgentClick ? 'AgentClick detected' : 'Not AgentClick'}
                </p>
                <p className="text-xs text-zinc-500 dark:text-slate-400 mt-1">Mode: {status.server.mode}</p>
                <p className="text-xs text-zinc-500 dark:text-slate-400 mt-1">Identity: {status.server.identityEndpoint}</p>
              </div>

              <div className="p-4 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                <p className="text-xs uppercase text-zinc-400 dark:text-slate-500 mb-2">Web Port</p>
                <p className="text-lg font-semibold text-zinc-900 dark:text-slate-100">{status.web.port ?? 'N/A'}</p>
                <p className={`text-sm mt-1 ${status.web.reachable ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                  {status.web.reachable ? `Reachable (${status.web.status})` : 'Unreachable'}
                </p>
                <p className="text-xs text-zinc-500 dark:text-slate-400 mt-1 break-all">Origin: {status.web.origin}</p>
                {status.web.error && (
                  <p className="text-xs text-red-500 mt-1 break-all">Error: {status.web.error}</p>
                )}
              </div>
            </div>

            <div className="mt-6 p-4 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
              <p className="text-xs uppercase text-zinc-400 dark:text-slate-500 mb-3">Port Check Flow</p>
              <div className="flex flex-col md:flex-row items-start md:items-center gap-2 text-sm">
                <div className="px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800">
                  Probe server port
                </div>
                <span className="text-zinc-400">→</span>
                <div className="px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800">
                  Verify `/api/identity`
                </div>
                <span className="text-zinc-400">→</span>
                <div className="px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800">
                  Check web origin reachability
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
