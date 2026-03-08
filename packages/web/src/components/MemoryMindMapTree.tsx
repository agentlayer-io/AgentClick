import { useLayoutEffect, useMemo, useRef, useState } from 'react'

export interface MemoryTreeNode {
  name: string
  path: string
  type: 'dir' | 'file'
  fileId?: string
  changed: boolean
  children?: MemoryTreeNode[]
}

export interface MemoryTreeFile {
  id: string
  relativePath: string
}

export function buildMemoryTree(files: MemoryTreeFile[], changedFileIds: Set<string>): MemoryTreeNode[] {
  type MutableNode = {
    name: string
    path: string
    type: 'dir' | 'file'
    fileId?: string
    changed: boolean
    children?: Map<string, MutableNode>
  }
  const root = new Map<string, MutableNode>()

  for (const file of files) {
    const parts = file.relativePath.split('/').filter(Boolean)
    let current = root
    let currentPath = ''
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i]
      const isLeaf = i === parts.length - 1
      currentPath = currentPath ? `${currentPath}/${part}` : part
      let node = current.get(part)
      if (!node) {
        node = {
          name: part,
          path: currentPath,
          type: isLeaf ? 'file' : 'dir',
          fileId: isLeaf ? file.id : undefined,
          changed: isLeaf ? changedFileIds.has(file.id) : false,
          children: isLeaf ? undefined : new Map(),
        }
        current.set(part, node)
      }
      if (isLeaf) {
        node.changed = node.changed || changedFileIds.has(file.id)
      } else {
        if (!node.children) node.children = new Map()
        current = node.children
      }
    }
  }

  function toArray(nodes: Map<string, MutableNode>): MemoryTreeNode[] {
    const out: MemoryTreeNode[] = []
    for (const node of nodes.values()) {
      const children = node.children ? toArray(node.children) : undefined
      const changed = node.changed || !!children?.some(c => c.changed)
      out.push({
        name: node.name,
        path: node.path,
        type: node.type,
        fileId: node.fileId,
        changed,
        children,
      })
    }
    return out.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      if (a.changed !== b.changed) return a.changed ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }

  return toArray(root)
}

export const CURVE_W = 36
export const CHILD_GAP = 5

export function bezierD(x1: number, y1: number, x2: number, y2: number): string {
  const cx = (x1 + x2) * 0.55
  return `M ${x1},${y1} C ${cx},${y1} ${cx},${y2} ${x2},${y2}`
}

export function compressNode(node: MemoryTreeNode): MemoryTreeNode {
  if (node.type !== 'dir' || !node.children) return node
  const children = node.children.map(compressNode)
  const changedDirs = children.filter(c => c.type === 'dir' && c.changed)
  const changedFiles = children.filter(c => c.type === 'file' && c.changed)
  if (changedDirs.length === 1 && changedFiles.length === 0) {
    const only = changedDirs[0]
    return compressNode({ ...node, name: `${node.name}/${only.name}`, path: only.path, children: only.children })
  }
  return { ...node, children }
}

export function MemoryMindPill({
  node,
  isHovered,
  isOnPath,
  isExpanded,
  isSelected,
}: {
  node: MemoryTreeNode
  isHovered: boolean
  isOnPath: boolean
  isExpanded?: boolean
  isSelected?: boolean
}) {
  if (node.type === 'file') {
    return (
      <div
        data-pill
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono whitespace-nowrap select-none"
        style={{
          backgroundColor: node.changed ? 'var(--c-pill-m-bg)' : 'var(--c-dir-neutral-bg)',
          border: node.changed
            ? `1.5px solid ${isSelected ? 'var(--c-pill-m-text)' : 'var(--c-pill-m-border)'}`
            : '1px solid var(--c-dir-neutral-border)',
          color: node.changed ? 'var(--c-pill-m-text)' : 'var(--c-dir-neutral-text)',
          boxShadow: isSelected ? '0 0 0 2px var(--c-pill-m-border)' : 'none',
          cursor: 'pointer',
        }}
      >
        {node.changed && <span className="text-[9px] font-bold opacity-70">M</span>}
        <span>{node.name}</span>
      </div>
    )
  }

  const active = isOnPath || isHovered
  const hasChildren = !!node.children?.length
  const changedAware = node.changed && !isHovered
  return (
    <div
      data-pill
      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-mono whitespace-nowrap select-none"
      style={{
        backgroundColor: changedAware ? 'var(--c-dir-diff-bg)' : active ? 'var(--c-dir-active-bg)' : 'var(--c-dir-neutral-bg)',
        border: `1px solid ${changedAware ? 'var(--c-dir-diff-border)' : active ? 'var(--c-dir-active-border)' : 'var(--c-dir-neutral-border)'}`,
        color: changedAware ? 'var(--c-dir-diff-text)' : active ? 'var(--c-dir-active-text)' : 'var(--c-dir-neutral-text)',
        fontWeight: changedAware ? 600 : 500,
      }}
    >
      {hasChildren && (
        <span className="text-[9px] opacity-50" style={{ transition: 'transform 0.2s ease', display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>▸</span>
      )}
      <span>{node.name}/</span>
    </div>
  )
}

export function MemoryMindBranch({
  node,
  collapsedIds,
  onToggleCollapse,
  hoveredPath,
  onHover,
  onLayoutChange,
  onSelectFileByPath,
  selectedFileId,
}: {
  node: MemoryTreeNode
  collapsedIds: Set<string>
  onToggleCollapse: (id: string) => void
  hoveredPath: string | null
  onHover: (path: string | null) => void
  onLayoutChange: () => void
  onSelectFileByPath: (path: string) => void
  selectedFileId: string | null
}) {
  const pillRef = useRef<HTMLDivElement>(null)
  const childrenRef = useRef<HTMLDivElement>(null)
  const [curves, setCurves] = useState<{ parentMid: number; childMids: number[] }>({ parentMid: 12, childMids: [] })
  const hasChildren = !!node.children?.length
  const collapsed = hasChildren ? collapsedIds.has(`changed:${node.path}`) : false
  const expanded = hasChildren ? !collapsed : false
  const selected = node.type === 'file' && node.fileId === selectedFileId
  const totalSlots = expanded ? (node.children?.length ?? 0) : 0
  const isOnHoverPath = hoveredPath != null && (hoveredPath === node.path || hoveredPath.startsWith(node.path + '/'))
  const isHovered = hoveredPath === node.path

  useLayoutEffect(() => {
    if (!pillRef.current || !childrenRef.current || totalSlots === 0) {
      setCurves(prev => prev.childMids.length === 0 ? prev : { parentMid: pillRef.current ? pillRef.current.offsetHeight / 2 : 12, childMids: [] })
      return
    }
    const parentMid = pillRef.current.offsetHeight / 2
    const childMids: number[] = []
    for (let i = 0; i < childrenRef.current.children.length; i += 1) {
      const el = childrenRef.current.children[i] as HTMLElement
      const pill = el.querySelector('[data-pill]') as HTMLElement | null
      const h = pill?.offsetHeight ?? 24
      childMids.push(el.offsetTop + h / 2)
    }
    setCurves({ parentMid, childMids })
  }, [totalSlots, node.children, expanded])

  const handleClick = () => {
    if (node.type === 'dir' && hasChildren) {
      onToggleCollapse(`changed:${node.path}`)
      onLayoutChange()
    } else if (node.type === 'file') {
      onSelectFileByPath(node.path)
    }
  }

  return (
    <div className="flex items-start">
      <div
        ref={pillRef}
        onMouseEnter={() => onHover(node.path)}
        onClick={handleClick}
        className="rounded-md p-1 -m-1"
        style={{ cursor: node.type === 'file' ? 'pointer' : hasChildren ? 'pointer' : 'default' }}
      >
        <MemoryMindPill
          node={node}
          isHovered={isHovered}
          isOnPath={isOnHoverPath}
          isExpanded={expanded}
          isSelected={!!selected}
        />
      </div>
      {totalSlots > 0 && (
        <div style={{ position: 'relative' }}>
          <svg style={{ position: 'absolute', top: 0, left: 0, width: CURVE_W, height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
            {curves.childMids.map((cy, i) => (
              <path key={i} d={bezierD(0, curves.parentMid, CURVE_W, cy)} fill="none" stroke="var(--c-curve-lo)" strokeWidth={1} />
            ))}
          </svg>
          <div ref={childrenRef} className="flex flex-col" style={{ gap: CHILD_GAP, paddingLeft: CURVE_W }}>
            {expanded && node.children!.map(child => (
              <div key={child.path}>
                <MemoryMindBranch
                  node={child}
                  collapsedIds={collapsedIds}
                  onToggleCollapse={onToggleCollapse}
                  hoveredPath={hoveredPath}
                  onHover={onHover}
                  onLayoutChange={onLayoutChange}
                  onSelectFileByPath={onSelectFileByPath}
                  selectedFileId={selectedFileId}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function MemoryMindMapFileTree({
  nodes,
  collapsedIds,
  onToggleCollapse,
  onSelectFileByPath,
  selectedFileId,
}: {
  nodes: MemoryTreeNode[]
  collapsedIds: Set<string>
  onToggleCollapse: (id: string) => void
  onSelectFileByPath: (path: string) => void
  selectedFileId: string | null
}) {
  const [hoveredPath, setHoveredPath] = useState<string | null>(null)
  const compressed = useMemo(() => nodes.map(compressNode), [nodes])
  const [, setLayoutVersion] = useState(0)
  const bumpLayout = () => setLayoutVersion(v => v + 1)
  return (
    <div className="flex flex-col gap-4 overflow-x-auto py-2 pb-3" onMouseLeave={() => setHoveredPath(null)}>
      {compressed.map(node => (
        <MemoryMindBranch
          key={node.path}
          node={node}
          collapsedIds={collapsedIds}
          onToggleCollapse={onToggleCollapse}
          hoveredPath={hoveredPath}
          onHover={setHoveredPath}
          onLayoutChange={bumpLayout}
          onSelectFileByPath={onSelectFileByPath}
          selectedFileId={selectedFileId}
        />
      ))}
    </div>
  )
}
