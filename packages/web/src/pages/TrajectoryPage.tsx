import { Component, useEffect, useRef, useState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

// ─── Error boundary to catch render crashes ───────────────────────────────────

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('TrajectoryPage crash:', error, info) }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 40, color: 'red' }}>
        <h2>Render error</h2>
        <pre>{this.state.error.message}</pre>
        <pre>{this.state.error.stack}</pre>
      </div>
    )
    return this.props.children
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface TrajectoryStep {
  id: string
  type: 'tool_call' | 'decision' | 'observation' | 'error' | 'retry'
  label: string
  detail?: string
  status: 'success' | 'failure' | 'pending' | 'skipped'
  timestamp?: number
  duration?: number
  error?: { message: string; code?: string; stackTrace?: string }
  children?: TrajectoryStep[]
}

interface TrajectoryPayload {
  title: string
  description?: string
  steps: TrajectoryStep[]
  context?: Record<string, string>
}

interface StepRevision {
  stepId: string
  action: 'mark_wrong' | 'provide_guidance' | 'skip'
  correction?: string
  guidance?: string
  shouldLearn?: boolean
}

// ─── Step type badge ──────────────────────────────────────────────────────────

const STEP_TYPE_STYLES: Record<string, { bg: string; border: string; text: string }> = {
  tool_call:   { bg: 'var(--c-step-tool-bg)',        border: 'var(--c-step-tool-border)',        text: 'var(--c-step-tool-text)' },
  decision:    { bg: 'var(--c-step-decision-bg)',     border: 'var(--c-step-decision-border)',     text: 'var(--c-step-decision-text)' },
  observation: { bg: 'var(--c-step-observation-bg)',  border: 'var(--c-step-observation-border)',  text: 'var(--c-step-observation-text)' },
  error:       { bg: 'var(--c-step-error-bg)',        border: 'var(--c-step-error-border)',        text: 'var(--c-step-error-text)' },
  retry:       { bg: 'var(--c-step-retry-bg)',        border: 'var(--c-step-retry-border)',        text: 'var(--c-step-retry-text)' },
}

function StepTypeBadge({ type }: { type: string }) {
  const s = STEP_TYPE_STYLES[type] ?? STEP_TYPE_STYLES.observation
  return (
    <span
      className="inline-block text-xs font-medium px-2 py-0.5 rounded"
      style={{ backgroundColor: s.bg, border: `1px solid ${s.border}`, color: s.text }}
    >
      {type.replace('_', ' ')}
    </span>
  )
}

// ─── Status icon ──────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: TrajectoryStep['status'] }) {
  const map: Record<string, { symbol: string; color: string }> = {
    success: { symbol: '\u25CF', color: '#22C55E' },
    failure: { symbol: '\u2716', color: 'var(--c-red)' },
    pending: { symbol: '\u25CB', color: 'var(--c-text-muted)' },
    skipped: { symbol: '\u25CC', color: 'var(--c-text-subtle)' },
  }
  const { symbol, color } = map[status] ?? map.pending
  return <span className="text-sm font-bold" style={{ color }}>{symbol}</span>
}

function StatusBadge({ status }: { status: TrajectoryStep['status'] }) {
  const styles: Record<string, string> = {
    success: 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-500',
    failure: 'bg-red-50 dark:bg-red-950 text-red-500 dark:text-red-400',
    pending: 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400',
    skipped: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400',
  }
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded uppercase ${styles[status] ?? styles.pending}`}>
      {status}
    </span>
  )
}

// ─── Error panel ──────────────────────────────────────────────────────────────

function ErrorPanel({ err }: { err: NonNullable<TrajectoryStep['error']> }) {
  const [showTrace, setShowTrace] = useState(false)
  return (
    <div
      className="mt-2 rounded-lg border p-3 text-sm"
      style={{ backgroundColor: 'var(--c-diff-remove)', borderColor: 'var(--c-diff-remove-border)' }}
    >
      <p className="font-medium" style={{ color: 'var(--c-step-error-text)' }}>
        {err.code ? `[${err.code}] ` : ''}{err.message}
      </p>
      {err.stackTrace && (
        <>
          <button
            onClick={() => setShowTrace(t => !t)}
            className="text-xs mt-1 hover:underline"
            style={{ color: 'var(--c-text-muted)' }}
          >
            {showTrace ? '\u25BE Hide stack trace' : '\u25B8 Show stack trace'}
          </button>
          {showTrace && (
            <pre className="mt-1 text-xs font-mono whitespace-pre-wrap break-all" style={{ color: 'var(--c-text-muted)' }}>
              {err.stackTrace}
            </pre>
          )}
        </>
      )}
    </div>
  )
}

// ─── Step revision inline form ────────────────────────────────────────────────

function StepRevisionForm({
  revision,
  onSave,
  onCancel,
}: {
  revision: StepRevision
  onSave: (rev: StepRevision) => void
  onCancel: () => void
}) {
  const [correction, setCorrection] = useState(revision.correction ?? '')
  const [guidance, setGuidance] = useState(revision.guidance ?? '')
  const [shouldLearn, setShouldLearn] = useState(revision.shouldLearn ?? false)
  const isWrong = revision.action === 'mark_wrong'

  return (
    <div className="mt-2 p-3 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg space-y-2">
      {isWrong && (
        <div>
          <label className="text-xs font-medium text-zinc-600 dark:text-slate-400 block mb-1">What went wrong?</label>
          <textarea
            className="w-full text-sm border border-gray-200 dark:border-zinc-700 rounded px-2 py-1.5 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-slate-300 placeholder-zinc-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            rows={2}
            placeholder="Describe what was incorrect..."
            value={correction}
            onChange={e => setCorrection(e.target.value)}
          />
        </div>
      )}
      <div>
        <label className="text-xs font-medium text-zinc-600 dark:text-slate-400 block mb-1">What should the agent do instead?</label>
        <textarea
          className="w-full text-sm border border-gray-200 dark:border-zinc-700 rounded px-2 py-1.5 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-slate-300 placeholder-zinc-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          rows={2}
          placeholder="Provide guidance for future runs..."
          value={guidance}
          onChange={e => setGuidance(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id={`learn-${revision.stepId}`}
          checked={shouldLearn}
          onChange={e => setShouldLearn(e.target.checked)}
          className="rounded border-gray-300 dark:border-zinc-600"
        />
        <label htmlFor={`learn-${revision.stepId}`} className="text-xs text-zinc-500 dark:text-slate-400">
          Remember this for future runs
        </label>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onSave({ ...revision, correction, guidance, shouldLearn })}
          className="text-xs px-3 py-1.5 bg-zinc-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded hover:bg-zinc-700 dark:hover:bg-slate-200 transition-colors font-medium"
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="text-xs px-3 py-1.5 text-zinc-500 dark:text-slate-400 border border-gray-200 dark:border-zinc-700 rounded hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── Step node ────────────────────────────────────────────────────────────────

function StepNode({
  step,
  depth,
  revisions,
  editingStep,
  expandedSteps,
  onStartEdit,
  onSaveRevision,
  onCancelEdit,
  onClearRevision,
  onToggleExpand,
}: {
  step: TrajectoryStep
  depth: number
  revisions: Map<string, StepRevision>
  editingStep: string | null
  expandedSteps: Set<string>
  onStartEdit: (stepId: string, action: 'mark_wrong' | 'provide_guidance') => void
  onSaveRevision: (rev: StepRevision) => void
  onCancelEdit: () => void
  onClearRevision: (stepId: string) => void
  onToggleExpand: (stepId: string) => void
}) {
  const hasChildren = step.children && step.children.length > 0
  const isExpanded = expandedSteps.has(step.id)
  const existing = revisions.get(step.id)
  const isEditing = editingStep === step.id
  const hasDetail = !!step.detail

  return (
    <div className={depth > 0 ? 'ml-6 border-l-2 border-gray-200 dark:border-zinc-700 pl-4' : ''}>
      {/* Step row */}
      <div className="py-2 group">
        <div className="flex items-start gap-2">
          {/* Icon */}
          <div className="flex flex-col items-center pt-0.5 shrink-0">
            <StatusIcon status={step.status} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono text-zinc-400 dark:text-slate-500">{step.id}</span>
              <StepTypeBadge type={step.type} />
              <span className="text-sm text-zinc-800 dark:text-slate-200">{step.label}</span>
              <StatusBadge status={step.status} />
              {step.duration != null && (
                <span className="text-xs text-zinc-400 dark:text-slate-500">{step.duration}ms</span>
              )}
            </div>

            {/* Detail toggle */}
            {hasDetail && (
              <div className="mt-1">
                <button
                  onClick={() => onToggleExpand(step.id)}
                  className="text-xs hover:underline"
                  style={{ color: 'var(--c-text-muted)' }}
                >
                  {isExpanded ? '\u25BE Hide detail' : '\u25B8 Show detail'}
                </button>
                {isExpanded && (
                  <pre className="mt-1 text-xs font-mono whitespace-pre-wrap break-all p-2 rounded bg-gray-50 dark:bg-zinc-800 text-zinc-600 dark:text-slate-400 border border-gray-100 dark:border-zinc-700">
                    {step.detail}
                  </pre>
                )}
              </div>
            )}

            {/* Error */}
            {step.error && <ErrorPanel err={step.error} />}

            {/* Action buttons */}
            {!isEditing && !existing && (
              <div className="mt-1.5 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => onStartEdit(step.id, 'mark_wrong')}
                  className="text-xs px-2 py-1 text-red-500 border border-red-200 dark:border-red-800 rounded hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                >
                  Mark Wrong
                </button>
                <button
                  onClick={() => onStartEdit(step.id, 'provide_guidance')}
                  className="text-xs px-2 py-1 text-blue-500 border border-blue-200 dark:border-blue-800 rounded hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"
                >
                  Add Guidance
                </button>
              </div>
            )}

            {/* Existing revision badge */}
            {existing && !isEditing && (
              <div className="mt-1.5 flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                  existing.action === 'mark_wrong'
                    ? 'bg-red-50 dark:bg-red-950 text-red-500'
                    : 'bg-blue-50 dark:bg-blue-950 text-blue-500'
                }`}>
                  {existing.action === 'mark_wrong' ? 'Marked wrong' : 'Guidance added'}
                </span>
                {existing.correction && (
                  <span className="text-xs text-zinc-500 dark:text-slate-400 truncate">{existing.correction}</span>
                )}
                {existing.guidance && (
                  <span className="text-xs text-zinc-500 dark:text-slate-400 truncate">{existing.guidance}</span>
                )}
                <button
                  onClick={() => onClearRevision(step.id)}
                  className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-slate-300"
                >
                  x
                </button>
              </div>
            )}

            {/* Editing form */}
            {isEditing && existing && (
              <StepRevisionForm
                revision={existing}
                onSave={onSaveRevision}
                onCancel={onCancelEdit}
              />
            )}
          </div>
        </div>
      </div>

      {/* Children */}
      {hasChildren && step.children!.map(child => (
        <StepNode
          key={child.id}
          step={child}
          depth={depth + 1}
          revisions={revisions}
          editingStep={editingStep}
          expandedSteps={expandedSteps}
          onStartEdit={onStartEdit}
          onSaveRevision={onSaveRevision}
          onCancelEdit={onCancelEdit}
          onClearRevision={onClearRevision}
          onToggleExpand={onToggleExpand}
        />
      ))}
    </div>
  )
}

// ─── Collect all step IDs (flattened) ─────────────────────────────────────────

function collectStepIds(steps: TrajectoryStep[]): string[] {
  const ids: string[] = []
  for (const s of steps) {
    ids.push(s.id)
    if (s.children) ids.push(...collectStepIds(s.children))
  }
  return ids
}

// ─── Main page (inner) ───────────────────────────────────────────────────────

function TrajectoryPageInner() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [payload, setPayload] = useState<TrajectoryPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [callbackFailed, setCallbackFailed] = useState(false)

  // Revision state
  const [revisions, setRevisions] = useState<Map<string, StepRevision>>(new Map())
  const [editingStep, setEditingStep] = useState<string | null>(null)
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())
  const [globalNote, setGlobalNote] = useState('')
  const [resumeFromStep, setResumeFromStep] = useState('')

  // Rewrite cycle
  const [sessionStatus, setSessionStatus] = useState<string>('pending')
  const statusRef = useRef(sessionStatus)
  statusRef.current = sessionStatus

  // Initial fetch
  useEffect(() => {
    fetch(`/api/sessions/${id}`)
      .then(r => r.json())
      .then(data => {
        setPayload(data.payload as TrajectoryPayload)
        setSessionStatus(data.status)
        setLoading(false)
      })
      .catch(() => { setFetchError(true); setLoading(false) })
  }, [id])

  // Poll for rewrite cycle updates
  useEffect(() => {
    const interval = setInterval(() => {
      if (statusRef.current !== 'rewriting') return
      fetch(`/api/sessions/${id}`)
        .then(r => r.json())
        .then(data => {
          const newStatus = data.status as string
          if (newStatus === 'pending') {
            setPayload(data.payload as TrajectoryPayload)
            setRevisions(new Map())
            setEditingStep(null)
            setGlobalNote('')
            setResumeFromStep('')
          }
          setSessionStatus(newStatus)
        })
        .catch(() => {})
    }, 2000)

    return () => clearInterval(interval)
  }, [id])

  const allStepIds = payload ? collectStepIds(payload.steps) : []

  const startEdit = (stepId: string, action: 'mark_wrong' | 'provide_guidance') => {
    const existing = revisions.get(stepId)
    setRevisions(new Map(revisions).set(stepId, existing ?? { stepId, action }))
    setEditingStep(stepId)
  }

  const saveRevision = (rev: StepRevision) => {
    setRevisions(new Map(revisions).set(rev.stepId, rev))
    setEditingStep(null)
  }

  const cancelEdit = () => {
    if (editingStep) {
      const existing = revisions.get(editingStep)
      if (existing && !existing.correction && !existing.guidance) {
        const next = new Map(revisions)
        next.delete(editingStep)
        setRevisions(next)
      }
    }
    setEditingStep(null)
  }

  const clearRevision = (stepId: string) => {
    const next = new Map(revisions)
    next.delete(stepId)
    setRevisions(next)
  }

  const toggleExpand = (stepId: string) => {
    const next = new Set(expandedSteps)
    if (next.has(stepId)) next.delete(stepId)
    else next.add(stepId)
    setExpandedSteps(next)
  }

  const submit = async (approved: boolean) => {
    setSubmitting(true)
    const body = {
      approved,
      revisions: Array.from(revisions.values()).filter(r => r.action !== 'skip'),
      globalNote: globalNote || undefined,
      resumeFromStep: resumeFromStep || undefined,
    }
    const result = await fetch(`/api/sessions/${id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => r.json())

    if (result.callbackFailed) {
      setCallbackFailed(true)
      setSubmitted(true)
      setTimeout(() => navigate('/'), 1500)
    } else {
      setSubmitted(true)
      navigate('/')
    }
  }

  const requestRetry = async () => {
    setSubmitting(true)
    const body = {
      regenerate: true,
      approved: false,
      revisions: Array.from(revisions.values()).filter(r => r.action !== 'skip'),
      globalNote: globalNote || undefined,
      resumeFromStep: resumeFromStep || undefined,
    }
    await fetch(`/api/sessions/${id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSessionStatus('rewriting')
    setSubmitting(false)
  }

  // ─── Render states ──────────────────────────────────────────────────────────

  if (fetchError) return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 flex items-center justify-center">
      <p className="text-red-400 text-sm">Server not reachable — is AgentClick running?</p>
    </div>
  )

  if (loading) return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 flex items-center justify-center">
      <p className="text-zinc-400 dark:text-slate-500">Loading...</p>
    </div>
  )

  if (!payload) return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 flex items-center justify-center">
      <p className="text-red-400">Session not found.</p>
    </div>
  )

  if (submitted) return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 flex items-center justify-center">
      <div className="text-center">
        <p className="text-zinc-700 dark:text-slate-200 font-medium">Done. Your agent is continuing.</p>
        {callbackFailed && (
          <p className="text-amber-500 text-xs mt-2">Note: agent may not have received the callback.</p>
        )}
        <p className="text-zinc-400 dark:text-slate-500 text-sm mt-1">You can close this tab.</p>
      </div>
    </div>
  )

  if (sessionStatus === 'rewriting') return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 flex items-center justify-center">
      <div className="text-center">
        <p className="text-zinc-700 dark:text-slate-200 font-medium">Agent is retrying...</p>
        <p className="text-zinc-400 dark:text-slate-500 text-sm mt-1">Waiting for updated trajectory.</p>
      </div>
    </div>
  )

  // ─── Main UI ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950">
      <div className="max-w-3xl mx-auto py-10 px-4">

        {/* Header */}
        <div className="mb-6">
          <p className="text-xs text-zinc-400 dark:text-slate-500 uppercase tracking-wider mb-1">Trajectory Review</p>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-slate-100">{payload.title}</h1>
          {payload.description && (
            <p className="text-sm text-zinc-500 dark:text-slate-400 mt-1">{payload.description}</p>
          )}
          {payload.context && Object.keys(payload.context).length > 0 && (
            <div className="flex gap-2 mt-2 flex-wrap">
              {Object.entries(payload.context).map(([k, v]) => (
                <span key={k} className="text-xs px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                  {k}: {v}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="mb-6 p-4 bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-lg">
          {payload.steps.map(step => (
            <StepNode
              key={step.id}
              step={step}
              depth={0}
              revisions={revisions}
              editingStep={editingStep}
              expandedSteps={expandedSteps}
              onStartEdit={startEdit}
              onSaveRevision={saveRevision}
              onCancelEdit={cancelEdit}
              onClearRevision={clearRevision}
              onToggleExpand={toggleExpand}
            />
          ))}
        </div>

        {/* Global note */}
        <div className="mb-4">
          <label className="text-xs font-medium text-zinc-600 dark:text-slate-400 block mb-1">Global note</label>
          <textarea
            className="w-full text-sm border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-2.5 text-zinc-700 dark:text-slate-300 bg-white dark:bg-zinc-900 placeholder-zinc-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            rows={2}
            placeholder="Add a note for the agent (optional)"
            value={globalNote}
            onChange={e => setGlobalNote(e.target.value)}
          />
        </div>

        {/* Resume from step */}
        {allStepIds.length > 0 && (
          <div className="mb-6">
            <label className="text-xs font-medium text-zinc-600 dark:text-slate-400 block mb-1">Resume from step</label>
            <select
              className="text-sm border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-700 dark:text-slate-300 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={resumeFromStep}
              onChange={e => setResumeFromStep(e.target.value)}
            >
              <option value="">(from beginning)</option>
              {allStepIds.map(sid => (
                <option key={sid} value={sid}>{sid}</option>
              ))}
            </select>
          </div>
        )}

        {/* Revision summary */}
        {revisions.size > 0 && (
          <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
              {revisions.size} step revision{revisions.size !== 1 ? 's' : ''} pending
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => submit(true)}
            disabled={submitting}
            className={`flex-1 bg-zinc-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 dark:hover:bg-slate-200 transition-colors ${submitting ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Approve
          </button>
          <button
            onClick={requestRetry}
            disabled={submitting}
            className={`px-5 text-sm text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950 transition-colors ${submitting ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Request Retry
          </button>
          <button
            onClick={() => submit(false)}
            disabled={submitting}
            className={`px-5 text-sm text-red-400 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-950 transition-colors ${submitting ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Reject
          </button>
        </div>

      </div>
    </div>
  )
}

// ─── Exported page with error boundary ────────────────────────────────────────

export default function TrajectoryPage() {
  return (
    <ErrorBoundary>
      <TrajectoryPageInner />
    </ErrorBoundary>
  )
}
