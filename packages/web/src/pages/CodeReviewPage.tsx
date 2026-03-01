import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AffectedFile {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'renamed'
  diff?: string       // unified diff string
  oldPath?: string    // for renamed files
}

interface CodePayload {
  command: string
  cwd: string
  explanation: string
  risk: 'low' | 'medium' | 'high'
  files?: string[]            // legacy: plain list
  affectedFiles?: AffectedFile[]
}

interface FileTreeNode {
  name: string
  path: string
  type: 'file' | 'dir'
  affected?: AffectedFile     // set if this node is an affected file
  onPath: boolean             // true if this node or a descendant is affected
  children?: FileTreeNode[]
}

// ─── Risk badge ───────────────────────────────────────────────────────────────

function RiskBadge({ risk }: { risk: 'low' | 'medium' | 'high' }) {
  const styles: Record<string, string> = {
    low:    'bg-green-50 text-green-700 border border-green-200',
    medium: 'bg-amber-50 text-amber-700 border border-amber-200',
    high:   'bg-red-50 text-red-500 border border-red-200',
  }
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${styles[risk]}`}>
      {risk} risk
    </span>
  )
}

// ─── File status badge ────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AffectedFile['status'] }) {
  const cfg: Record<string, { label: string; bg: string; color: string }> = {
    modified: { label: 'M', bg: '#EBF4FA', color: '#457B9D' },
    added:    { label: 'A', bg: '#E8F5F0', color: '#2A9D8F' },
    deleted:  { label: 'D', bg: '#FEF0F0', color: '#E63946' },
    renamed:  { label: 'R', bg: '#FFF8EC', color: '#E2A12A' },
  }
  const { label, bg, color } = cfg[status] ?? cfg.modified
  return (
    <span
      className="inline-flex items-center justify-center w-4 h-4 rounded text-xs font-bold shrink-0"
      style={{ backgroundColor: bg, color }}
      title={status}
    >
      {label}
    </span>
  )
}

// ─── Tree builder ─────────────────────────────────────────────────────────────

function buildFileTree(affectedFiles: AffectedFile[]): FileTreeNode[] {
  type MutableNode = {
    name: string
    path: string
    type: 'file' | 'dir'
    affected?: AffectedFile
    children?: Map<string, MutableNode>
  }

  const root = new Map<string, MutableNode>()

  for (const af of affectedFiles) {
    const parts = af.path.trim().replace(/^\/+/, '').split('/').filter(Boolean)
    let current = root
    let currentPath = ''

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      currentPath = currentPath ? `${currentPath}/${part}` : part
      const isLeaf = i === parts.length - 1

      if (!current.has(part)) {
        current.set(part, {
          name: part,
          path: currentPath,
          type: isLeaf ? 'file' : 'dir',
          affected: isLeaf ? af : undefined,
          children: isLeaf ? undefined : new Map(),
        })
      }
      const node = current.get(part)!
      if (!isLeaf) {
        if (!node.children) node.children = new Map()
        current = node.children
      }
    }
  }

  const toArray = (nodes: Map<string, MutableNode>): FileTreeNode[] => {
    const result: FileTreeNode[] = []
    for (const node of nodes.values()) {
      const children = node.children ? toArray(node.children) : undefined
      const onPath = !!(node.affected || children?.some(c => c.onPath))
      result.push({
        name: node.name,
        path: node.path,
        type: node.type,
        affected: node.affected,
        onPath,
        children,
      })
    }
    return result.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }

  return toArray(root)
}

// ─── File Tree component ──────────────────────────────────────────────────────

const MAX_COLLAPSED_SIBLINGS = 2  // show this many non-affected siblings before "..."

function FileTree({ nodes, level }: { nodes: FileTreeNode[]; level: number }) {
  const [expandedDirs, setExpandedDirs] = useState<Record<string, boolean>>({})

  const toggle = (path: string) =>
    setExpandedDirs(s => ({ ...s, [path]: !(s[path] ?? true) }))

  // Separate on-path nodes from off-path siblings
  const onPath = nodes.filter(n => n.onPath)
  const offPath = nodes.filter(n => !n.onPath)
  const visibleOffPath = offPath.slice(0, MAX_COLLAPSED_SIBLINGS)
  const hiddenCount = offPath.length - visibleOffPath.length

  const renderNode = (node: FileTreeNode) => {
    if (node.type === 'file') {
      const isAffected = !!node.affected
      return (
        <div
          key={node.path}
          className="flex items-center gap-2 py-1 px-2 rounded"
          style={isAffected ? { backgroundColor: '#F1FAEE' } : {}}
        >
          <span className="text-zinc-400 text-xs select-none">{'  '.repeat(level)}{'└─'}</span>
          {node.affected && <StatusBadge status={node.affected.status} />}
          <span
            className={`text-sm font-mono ${isAffected ? 'font-semibold' : 'text-zinc-500'}`}
            style={isAffected ? { color: '#1D3557' } : {}}
          >
            {node.name}
          </span>
          {node.affected?.status === 'renamed' && node.affected.oldPath && (
            <span className="text-xs text-zinc-400">← {node.affected.oldPath.split('/').pop()}</span>
          )}
        </div>
      )
    }

    // Directory
    const isExpanded = expandedDirs[node.path] ?? true
    const isOnPath = node.onPath
    return (
      <div key={node.path}>
        <button
          type="button"
          onClick={() => toggle(node.path)}
          className="w-full text-left flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-50 transition-colors"
        >
          <span className="text-zinc-400 text-xs select-none">{'  '.repeat(level)}{'├─'}</span>
          <span className="text-sm font-mono" style={{ color: isOnPath ? '#1D3557' : '#94a3b8' }}>
            {node.name}/
          </span>
          <span className="text-xs text-zinc-400">{isExpanded ? '▾' : '▸'}</span>
        </button>
        {isExpanded && node.children && node.children.length > 0 && (
          <FileTree nodes={node.children} level={level + 1} />
        )}
      </div>
    )
  }

  return (
    <div>
      {onPath.map(renderNode)}
      {visibleOffPath.map(renderNode)}
      {hiddenCount > 0 && (
        <div className="flex items-center gap-2 py-1 px-2">
          <span className="text-zinc-400 text-xs select-none">{'  '.repeat(level)}{'└─'}</span>
          <span className="text-xs text-zinc-400">… {hiddenCount} more {hiddenCount === 1 ? 'item' : 'items'}</span>
        </div>
      )}
    </div>
  )
}

// ─── Diff viewer ──────────────────────────────────────────────────────────────

interface DiffLine {
  type: 'added' | 'removed' | 'context' | 'hunk'
  content: string
  oldNo?: number
  newNo?: number
}

function parseDiff(diff: string): DiffLine[] {
  const lines = diff.split('\n')
  const result: DiffLine[] = []
  let oldNo = 0
  let newNo = 0

  for (const line of lines) {
    if (line.startsWith('@@')) {
      // Parse hunk header: @@ -a,b +c,d @@
      const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (m) { oldNo = parseInt(m[1]) - 1; newNo = parseInt(m[2]) - 1 }
      result.push({ type: 'hunk', content: line })
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      newNo++
      result.push({ type: 'added', content: line.slice(1), newNo })
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      oldNo++
      result.push({ type: 'removed', content: line.slice(1), oldNo })
    } else if (line.startsWith(' ') || (!line.startsWith('\\') && !line.startsWith('diff') && !line.startsWith('index') && !line.startsWith('---') && !line.startsWith('+++') && line.length > 0)) {
      oldNo++; newNo++
      result.push({ type: 'context', content: line.startsWith(' ') ? line.slice(1) : line, oldNo, newNo })
    }
  }
  return result
}

function DiffViewer({ file }: { file: AffectedFile }) {
  const [collapsed, setCollapsed] = useState(false)

  if (!file.diff) return null

  const diffLines = parseDiff(file.diff)

  const lineStyle = (type: DiffLine['type']): React.CSSProperties => {
    if (type === 'added')   return { backgroundColor: '#E6F4F1', borderLeft: '3px solid #2A9D8F' }
    if (type === 'removed') return { backgroundColor: '#FEECEE', borderLeft: '3px solid #E63946' }
    if (type === 'hunk')    return { backgroundColor: '#EBF4FA', borderLeft: '3px solid #A8DADC' }
    return {}
  }

  const lineColor = (type: DiffLine['type']) => {
    if (type === 'added')   return '#1A6B5E'
    if (type === 'removed') return '#9B2335'
    if (type === 'hunk')    return '#457B9D'
    return '#374151'
  }

  const prefix = (type: DiffLine['type']) => {
    if (type === 'added')   return '+'
    if (type === 'removed') return '−'
    return ' '
  }

  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden mb-4">
      {/* File header */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer select-none"
        style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}
        onClick={() => setCollapsed(c => !c)}
      >
        <div className="flex items-center gap-2">
          <StatusBadge status={file.status} />
          <span className="text-sm font-mono font-medium" style={{ color: '#1D3557' }}>{file.path}</span>
          {file.status === 'renamed' && file.oldPath && (
            <span className="text-xs text-zinc-400">(was {file.oldPath})</span>
          )}
        </div>
        <span className="text-xs text-zinc-400">{collapsed ? '▸ show diff' : '▾ hide diff'}</span>
      </div>

      {/* Diff lines */}
      {!collapsed && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono border-collapse">
            <tbody>
              {diffLines.map((line, i) => (
                <tr key={i} style={lineStyle(line.type)}>
                  {/* Old line number */}
                  <td
                    className="text-right px-2 py-0.5 select-none w-10 shrink-0"
                    style={{ color: '#94a3b8', borderRight: '1px solid #E2E8F0', minWidth: '2.5rem' }}
                  >
                    {line.type === 'hunk' ? '' : (line.oldNo ?? '')}
                  </td>
                  {/* New line number */}
                  <td
                    className="text-right px-2 py-0.5 select-none w-10 shrink-0"
                    style={{ color: '#94a3b8', borderRight: '1px solid #E2E8F0', minWidth: '2.5rem' }}
                  >
                    {line.type === 'hunk' ? '' : (line.newNo ?? '')}
                  </td>
                  {/* +/- prefix */}
                  <td
                    className="px-2 py-0.5 select-none w-4 text-center shrink-0"
                    style={{ color: lineColor(line.type), fontWeight: line.type !== 'context' ? 700 : 400 }}
                  >
                    {line.type !== 'context' ? prefix(line.type) : ''}
                  </td>
                  {/* Content */}
                  <td
                    className="px-2 py-0.5 whitespace-pre w-full"
                    style={{ color: lineColor(line.type) }}
                  >
                    {line.type === 'hunk' ? line.content : line.content}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CodeReviewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [payload, setPayload] = useState<CodePayload | null>(null)
  const [note, setNote] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [callbackFailed, setCallbackFailed] = useState(false)

  useEffect(() => {
    fetch(`/api/sessions/${id}`)
      .then(r => r.json())
      .then(data => { setPayload(data.payload as CodePayload); setLoading(false) })
      .catch(() => { setError(true); setLoading(false) })
  }, [id])

  const submit = async (approved: boolean) => {
    setSubmitting(true)
    const result = await fetch(`/api/sessions/${id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved, note })
    }).then(r => r.json())
    if (result.callbackFailed) {
      setCallbackFailed(true)
      setSubmitted(true)
      setTimeout(() => navigate('/'), 1500)
    } else {
      navigate('/')
    }
  }

  if (error) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-red-400 text-sm">Server not reachable — is AgentClick running?</p>
    </div>
  )
  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-zinc-400">Loading...</p>
    </div>
  )
  if (!payload) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-red-400">Session not found.</p>
    </div>
  )
  if (submitted) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <p className="text-zinc-700 font-medium">Done. Your agent is continuing.</p>
        {callbackFailed && <p className="text-amber-500 text-xs mt-2">Note: agent may not have received the callback.</p>}
        <p className="text-zinc-400 text-sm mt-1">You can close this tab.</p>
      </div>
    </div>
  )

  // Normalise: prefer affectedFiles, fall back to legacy files[]
  const affectedFiles: AffectedFile[] = payload.affectedFiles
    ?? (payload.files ?? []).map(f => ({ path: f, status: 'modified' as const }))

  const fileTree = affectedFiles.length > 0 ? buildFileTree(affectedFiles) : []
  const filesWithDiff = affectedFiles.filter(f => f.diff)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto py-10 px-4">

        {/* Header */}
        <div className="mb-6">
          <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1 font-medium">Code Review</p>
          <div className="flex items-center gap-3 flex-wrap">
            <RiskBadge risk={payload.risk} />
            <span className="text-xs text-zinc-400 font-mono">{payload.cwd}</span>
          </div>
        </div>

        {/* Command */}
        <div className="mb-4 rounded-lg overflow-hidden border border-gray-100">
          <div className="px-3 py-2" style={{ backgroundColor: '#1D3557' }}>
            <p className="text-xs font-medium" style={{ color: '#A8DADC' }}>Command</p>
          </div>
          <pre className="bg-zinc-950 text-zinc-100 px-4 py-3 text-sm font-mono overflow-x-auto leading-relaxed">{payload.command}</pre>
        </div>

        {/* Explanation */}
        <div className="mb-5 p-4 bg-white border border-gray-100 rounded-lg">
          <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1 font-medium">What this does</p>
          <p className="text-sm text-zinc-700 leading-relaxed">{payload.explanation}</p>
        </div>

        {/* Affected files — tree + legend */}
        {fileTree.length > 0 && (
          <div className="mb-5 bg-white border border-gray-100 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-50">
              <p className="text-xs text-zinc-400 uppercase tracking-wider font-medium">Affected Files</p>
              <div className="flex items-center gap-3 text-xs text-zinc-400">
                <span><span className="font-bold" style={{ color: '#2A9D8F' }}>A</span> added</span>
                <span><span className="font-bold" style={{ color: '#457B9D' }}>M</span> modified</span>
                <span><span className="font-bold" style={{ color: '#E63946' }}>D</span> deleted</span>
                <span><span className="font-bold" style={{ color: '#E2A12A' }}>R</span> renamed</span>
              </div>
            </div>
            <div className="px-3 py-3">
              <FileTree nodes={fileTree} level={0} />
            </div>
          </div>
        )}

        {/* Diffs */}
        {filesWithDiff.length > 0 && (
          <div className="mb-5">
            <p className="text-xs text-zinc-400 uppercase tracking-wider mb-3 font-medium">Changes</p>
            {filesWithDiff.map(f => <DiffViewer key={f.path} file={f} />)}
          </div>
        )}

        {/* Note */}
        <div className="mb-6">
          <textarea
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 text-zinc-700 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:border-transparent resize-none"
            style={{ '--tw-ring-color': '#457B9D' } as React.CSSProperties}
            rows={3}
            placeholder="Add a note or modified command (optional)"
            value={note}
            onChange={e => setNote(e.target.value)}
          />
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => submit(true)}
            disabled={submitting}
            className={`flex-1 text-sm font-semibold py-2.5 rounded-lg transition-opacity ${submitting ? 'opacity-40 cursor-not-allowed' : 'hover:opacity-90'}`}
            style={{ backgroundColor: '#2A9D8F', color: '#F1FAEE' }}
          >
            Approve
          </button>
          <button
            onClick={() => submit(false)}
            disabled={submitting}
            className={`px-6 text-sm font-semibold py-2.5 rounded-lg transition-opacity ${submitting ? 'opacity-40 cursor-not-allowed' : 'hover:opacity-90'}`}
            style={{ border: '1.5px solid #E63946', color: '#E63946', backgroundColor: 'transparent' }}
          >
            Reject
          </button>
        </div>

      </div>
    </div>
  )
}
