import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

type CompressionDecision = 'include' | 'disregard'

interface MemoryFile {
  id: string
  path: string
  relativePath: string
  size: number
  lastModified: number
  categories: string[]
  inCurrentContent: boolean
  inProject: boolean
  inAgentCache: boolean
  relatedMarkdown: boolean
  preview: string
  sections: Array<{ id: string; title: string }>
}

interface MemoryGroup {
  id: string
  label: string
  fileIds: string[]
}

interface MemoryModification {
  id: string
  fileId: string
  filePath: string
  location: string
  oldContent: string
  newContent: string
  generatedContent: string
}

interface CompressionRecommendation {
  fileId: string
  recommendation: CompressionDecision
  reason: string
}

interface MemoryPayload {
  title: string
  description?: string
  groups: MemoryGroup[]
  files: MemoryFile[]
  defaultIncludedFileIds: string[]
  modifications: MemoryModification[]
  compressionRecommendations: CompressionRecommendation[]
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function computeSimpleDiff(oldText: string, newText: string): Array<{ type: 'context' | 'add' | 'remove'; text: string }> {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const out: Array<{ type: 'context' | 'add' | 'remove'; text: string }> = []

  let i = 0
  let j = 0
  while (i < oldLines.length || j < newLines.length) {
    const oldLine = oldLines[i]
    const newLine = newLines[j]

    if (i < oldLines.length && j < newLines.length && oldLine === newLine) {
      out.push({ type: 'context', text: oldLine })
      i += 1
      j += 1
      continue
    }

    if (i < oldLines.length) {
      out.push({ type: 'remove', text: oldLine ?? '' })
      i += 1
    }
    if (j < newLines.length) {
      out.push({ type: 'add', text: newLine ?? '' })
      j += 1
    }
  }
  return out
}

export default function MemoryReviewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [payload, setPayload] = useState<MemoryPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [globalNote, setGlobalNote] = useState('')

  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
  const [includedFileIds, setIncludedFileIds] = useState<Set<string>>(new Set())
  const [compressionDecisionMap, setCompressionDecisionMap] = useState<Map<string, CompressionDecision>>(new Map())
  const [modAcceptMap, setModAcceptMap] = useState<Map<string, boolean>>(new Map())

  useEffect(() => {
    fetch(`/api/sessions/${id}`)
      .then(r => r.json())
      .then(data => {
        const p = data.payload as MemoryPayload
        setPayload(p)
        setLoading(false)
        setIncludedFileIds(new Set(p.defaultIncludedFileIds ?? []))
        setSelectedFileId(p.defaultIncludedFileIds?.[0] ?? p.files?.[0]?.id ?? null)

        const comp = new Map<string, CompressionDecision>()
        for (const rec of p.compressionRecommendations ?? []) comp.set(rec.fileId, rec.recommendation)
        setCompressionDecisionMap(comp)

        const modMap = new Map<string, boolean>()
        for (const mod of p.modifications ?? []) modMap.set(mod.id, true)
        setModAcceptMap(modMap)
      })
      .catch(() => { setFetchError(true); setLoading(false) })
  }, [id])

  const fileMap = useMemo(() => {
    const m = new Map<string, MemoryFile>()
    for (const f of payload?.files ?? []) m.set(f.id, f)
    return m
  }, [payload])

  const selectedFile = selectedFileId ? fileMap.get(selectedFileId) ?? null : null
  const selectedModification = useMemo(() => {
    if (!selectedFileId || !payload) return null
    return payload.modifications.find(mod => mod.fileId === selectedFileId) ?? null
  }, [payload, selectedFileId])

  const diffLines = useMemo(() => {
    if (!selectedModification) return []
    return computeSimpleDiff(selectedModification.oldContent, selectedModification.newContent)
  }, [selectedModification])

  const toggleCollapse = (idValue: string) => {
    setCollapsedIds(prev => {
      const next = new Set(prev)
      if (next.has(idValue)) next.delete(idValue)
      else next.add(idValue)
      return next
    })
  }

  const toggleInclude = (fileId: string) => {
    setIncludedFileIds(prev => {
      const next = new Set(prev)
      if (next.has(fileId)) next.delete(fileId)
      else next.add(fileId)
      return next
    })
  }

  const submit = async (approved: boolean) => {
    setSubmitting(true)
    const compressionDecisions = Object.fromEntries(Array.from(compressionDecisionMap.entries()))
    const disregardedFileIds = Array.from(compressionDecisionMap.entries())
      .filter(([, decision]) => decision === 'disregard')
      .map(([fileId]) => fileId)
    const modificationReview = Object.fromEntries(Array.from(modAcceptMap.entries()))

    await fetch(`/api/sessions/${id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        approved,
        includedFileIds: Array.from(includedFileIds),
        disregardedFileIds,
        compressionDecisions,
        modificationReview,
        globalNote: globalNote || undefined,
      }),
    })
    setSubmitted(true)
    navigate('/')
  }

  if (fetchError) return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 flex items-center justify-center">
      <p className="text-red-500 text-sm">Unable to load memory review session.</p>
    </div>
  )

  if (loading) return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 flex items-center justify-center">
      <p className="text-zinc-400 dark:text-slate-500">Loading...</p>
    </div>
  )

  if (!payload) return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 flex items-center justify-center">
      <p className="text-red-500 text-sm">Session not found.</p>
    </div>
  )

  if (submitted) return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 flex items-center justify-center">
      <p className="text-zinc-700 dark:text-slate-200">Submitted.</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950">
      <div className="max-w-7xl mx-auto py-8 px-4">
        <p className="text-xs text-zinc-400 dark:text-slate-500 uppercase tracking-wider mb-1">Memory Review</p>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-slate-100">{payload.title}</h1>
        {payload.description && <p className="text-sm text-zinc-500 dark:text-slate-400 mt-1">{payload.description}</p>}

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-4">
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-zinc-800 dark:text-slate-200">Memory Mindgraph</p>
              <button
                className="text-xs text-blue-500 hover:text-blue-600"
                onClick={() => setCollapsedIds(new Set())}
              >
                Expand All
              </button>
            </div>
            <div className="space-y-2">
              {payload.groups.map(group => {
                const groupCollapsed = collapsedIds.has(group.id)
                return (
                  <div key={group.id} className="border border-gray-100 dark:border-zinc-800 rounded">
                    <button
                      onClick={() => toggleCollapse(group.id)}
                      className="w-full text-left px-2 py-1.5 text-sm font-medium text-zinc-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-zinc-800 flex items-center gap-2"
                    >
                      <span className="text-xs">{groupCollapsed ? '▸' : '▾'}</span>
                      <span>{group.label}</span>
                      <span className="ml-auto text-xs text-zinc-400 dark:text-slate-500">{group.fileIds.length}</span>
                    </button>

                    {!groupCollapsed && (
                      <div className="px-2 pb-2 space-y-1">
                        {group.fileIds.map(fileId => {
                          const file = fileMap.get(fileId)
                          if (!file) return null
                          const fileNodeId = `${group.id}:${file.id}`
                          const fileCollapsed = collapsedIds.has(fileNodeId)
                          const selected = selectedFileId === file.id
                          return (
                            <div key={fileNodeId} className={`rounded border ${selected ? 'border-blue-300 dark:border-blue-700' : 'border-gray-100 dark:border-zinc-800'}`}>
                              <div className="flex items-center gap-1 px-2 py-1">
                                <button
                                  onClick={() => toggleCollapse(fileNodeId)}
                                  className="text-xs text-zinc-400 dark:text-slate-500"
                                >
                                  {fileCollapsed ? '▸' : '▾'}
                                </button>
                                <input
                                  type="checkbox"
                                  checked={includedFileIds.has(file.id)}
                                  onChange={() => toggleInclude(file.id)}
                                />
                                <button
                                  onClick={() => setSelectedFileId(file.id)}
                                  className="text-left flex-1 text-xs font-mono text-zinc-700 dark:text-slate-300 truncate"
                                  title={file.path}
                                >
                                  {file.relativePath}
                                </button>
                              </div>
                              {!fileCollapsed && (
                                <div className="px-7 pb-1 space-y-1">
                                  <div className="flex gap-1 flex-wrap">
                                    {file.categories.map(cat => (
                                      <span key={cat} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-slate-400">{cat}</span>
                                    ))}
                                  </div>
                                  {file.sections.slice(0, 8).map(sec => (
                                    <div key={sec.id} className="text-[11px] text-zinc-500 dark:text-slate-400 truncate"># {sec.title}</div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg p-4">
            {!selectedFile && (
              <p className="text-sm text-zinc-500 dark:text-slate-400">Select a memory file node to inspect details.</p>
            )}

            {selectedFile && (
              <>
                <div className="mb-3">
                  <p className="text-xs text-zinc-400 dark:text-slate-500 uppercase">Selected File</p>
                  <h2 className="text-sm font-mono text-zinc-800 dark:text-slate-200 break-all">{selectedFile.path}</h2>
                  <p className="text-xs text-zinc-500 dark:text-slate-400 mt-1">
                    {formatBytes(selectedFile.size)} · updated {selectedFile.lastModified ? new Date(selectedFile.lastModified).toLocaleString() : 'unknown'}
                  </p>
                </div>

                <div className="mb-4">
                  <p className="text-xs text-zinc-400 dark:text-slate-500 uppercase mb-1">Preview</p>
                  <p className="text-sm text-zinc-600 dark:text-slate-300">{selectedFile.preview || 'No preview.'}</p>
                </div>

                <div className="mb-4">
                  <p className="text-xs text-zinc-400 dark:text-slate-500 uppercase mb-1">Compression Decision</p>
                  <div className="flex gap-3">
                    <label className="text-sm text-zinc-700 dark:text-slate-300">
                      <input
                        className="mr-1"
                        type="radio"
                        checked={(compressionDecisionMap.get(selectedFile.id) ?? 'include') === 'include'}
                        onChange={() => setCompressionDecisionMap(prev => new Map(prev).set(selectedFile.id, 'include'))}
                      />
                      include
                    </label>
                    <label className="text-sm text-zinc-700 dark:text-slate-300">
                      <input
                        className="mr-1"
                        type="radio"
                        checked={(compressionDecisionMap.get(selectedFile.id) ?? 'include') === 'disregard'}
                        onChange={() => setCompressionDecisionMap(prev => new Map(prev).set(selectedFile.id, 'disregard'))}
                      />
                      disregard
                    </label>
                  </div>
                  {payload.compressionRecommendations.find(r => r.fileId === selectedFile.id)?.reason && (
                    <p className="text-xs text-zinc-500 dark:text-slate-400 mt-1">
                      {payload.compressionRecommendations.find(r => r.fileId === selectedFile.id)?.reason}
                    </p>
                  )}
                </div>

                {selectedModification && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-zinc-400 dark:text-slate-500 uppercase">Memory Modification Review</p>
                      <label className="text-xs text-zinc-600 dark:text-slate-300">
                        <input
                          className="mr-1"
                          type="checkbox"
                          checked={modAcceptMap.get(selectedModification.id) ?? true}
                          onChange={e => setModAcceptMap(prev => new Map(prev).set(selectedModification.id, e.target.checked))}
                        />
                        accept modification
                      </label>
                    </div>
                    <p className="text-xs font-mono text-zinc-500 dark:text-slate-400 mb-1">Target: {selectedModification.location}</p>
                    <div className="p-2 border border-gray-200 dark:border-zinc-700 rounded bg-gray-50 dark:bg-zinc-950 mb-2">
                      <p className="text-[11px] text-zinc-500 dark:text-slate-400 mb-1">New Generated Content</p>
                      <pre className="text-xs whitespace-pre-wrap break-words text-zinc-700 dark:text-slate-300">{selectedModification.generatedContent}</pre>
                    </div>
                    <div className="border border-gray-200 dark:border-zinc-700 rounded overflow-hidden">
                      <div className="px-2 py-1 text-[11px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-slate-400">Unified Diff</div>
                      <pre className="text-xs whitespace-pre-wrap break-words p-2 max-h-80 overflow-y-auto">
                        {diffLines.map((line, idx) => (
                          <div
                            key={`${line.type}-${idx}`}
                            className={
                              line.type === 'add'
                                ? 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300'
                                : line.type === 'remove'
                                  ? 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300'
                                  : 'text-zinc-600 dark:text-slate-400'
                            }
                          >
                            {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '} {line.text}
                          </div>
                        ))}
                      </pre>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="mt-4">
          <label className="text-xs font-medium text-zinc-600 dark:text-slate-400 block mb-1">Note for agent</label>
          <textarea
            className="w-full text-sm border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-slate-300"
            rows={2}
            value={globalNote}
            onChange={e => setGlobalNote(e.target.value)}
            placeholder="Optional note on memory inclusion or modification."
          />
        </div>

        <div className="mt-4 flex gap-3">
          <button
            onClick={() => submit(true)}
            disabled={submitting}
            className="flex-1 bg-zinc-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium py-2.5 rounded-lg"
          >
            Approve Memory Review
          </button>
          <button
            onClick={() => submit(false)}
            disabled={submitting}
            className="px-5 text-sm text-red-500 border border-red-200 dark:border-red-800 rounded-lg"
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  )
}

