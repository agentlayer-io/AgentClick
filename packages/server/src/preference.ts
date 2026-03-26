import fs from 'fs'
import path from 'path'
import os from 'os'

const MEMORY_PATH = path.join(os.homedir(), '.openclaw', 'workspace', 'MEMORY.md')
const PREFERENCES_PATH = path.join(os.homedir(), '.openclaw', 'workspace', 'click_preferences.md')

const SCOPE_SECTIONS: Record<string, string> = {
  email: '## Email Reply Style',
  trajectory: '## Trajectory',
  code: '## Code Review',
  action: '## Action Approval',
  plan: '## Plan',
}

function ensurePrefFile(): void {
  const dir = path.dirname(PREFERENCES_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  if (!fs.existsSync(PREFERENCES_PATH)) {
    fs.writeFileSync(PREFERENCES_PATH, '# AgentClick Preferences\n', 'utf-8')
  }

}

export function getUserPreferences(): string {
  if (!fs.existsSync(PREFERENCES_PATH)) return ''
  return fs.readFileSync(PREFERENCES_PATH, 'utf-8')
}

const STOP_WORDS = new Set(['a','an','the','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','shall','use','using','in','on','at','to','for','of','and','or','but','not','with','from','by','instead','rather','more','less'])

function ruleWords(s: string): Set<string> {
  return new Set(s.toLowerCase().split(/\W+/).filter(w => w.length > 2 && !STOP_WORDS.has(w)))
}

function detectConflict(incoming: string, existing: string): boolean {
  const inWords = ruleWords(incoming)
  const exWords = ruleWords(existing)
  const overlap = [...inWords].filter(w => exWords.has(w))
  return overlap.length >= 1
}

function getSectionRules(content: string, section: string): string[] {
  if (!content.includes(section)) return []
  const lines = content.split('\n')
  const idx = lines.findIndex(l => l === section)
  const rules: string[] = []
  for (let i = idx + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) break
    if (lines[i].startsWith('- ')) rules.push(lines[i].slice(2))
  }
  return rules
}

export interface PreferenceConflict {
  existing: string
  incoming: string
}

export function learnFromUserIntention(intention: string, scope: string): { saved: boolean; conflict?: PreferenceConflict } {
  const trimmed = intention.trim()
  if (!trimmed) return { saved: false }

  ensurePrefFile()
  const content = fs.readFileSync(PREFERENCES_PATH, 'utf-8')
  const section = SCOPE_SECTIONS[scope] ?? `## ${scope}`
  const incoming = summarize(trimmed)

  // Skip exact duplicate
  if (content.includes(`- ${incoming}`)) return { saved: true }

  // Check for conflict with existing rules in this section
  const existing = getSectionRules(content, section)
  for (const rule of existing) {
    if (detectConflict(incoming, rule)) {
      console.log(`[agentclick] Preference conflict detected: "${rule}" vs "${incoming}"`)
      return { saved: false, conflict: { existing: rule, incoming } }
    }
  }

  // No conflict — save
  savePreferenceRule(incoming, scope)
  return { saved: true }
}

export function savePreferenceRule(rule: string, scope: string): void {
  ensurePrefFile()
  const content = fs.readFileSync(PREFERENCES_PATH, 'utf-8')
  const section = SCOPE_SECTIONS[scope] ?? `## ${scope}`
  const line = `- ${rule}`
  if (content.includes(line)) return
  if (content.includes(section)) {
    const lines = content.split('\n')
    const idx = lines.findIndex(l => l === section)
    lines.splice(idx + 1, 0, line)
    fs.writeFileSync(PREFERENCES_PATH, lines.join('\n'), 'utf-8')
  } else {
    fs.appendFileSync(PREFERENCES_PATH, `\n${section}\n${line}\n`, 'utf-8')
  }
  console.log(`[agentclick] Saved preference rule -> ${PREFERENCES_PATH}`)
}

export function deletePreferenceRule(rule: string, scope: string): void {
  if (!fs.existsSync(PREFERENCES_PATH)) return
  const content = fs.readFileSync(PREFERENCES_PATH, 'utf-8')
  const section = SCOPE_SECTIONS[scope] ?? `## ${scope}`
  const lines = content.split('\n')
  const idx = lines.findIndex(l => l === section)
  if (idx === -1) return
  const ruleIdx = lines.findIndex((l, i) => i > idx && l === `- ${rule}`)
  if (ruleIdx === -1) return
  lines.splice(ruleIdx, 1)
  fs.writeFileSync(PREFERENCES_PATH, lines.join('\n'), 'utf-8')
  console.log(`[agentclick] Deleted preference rule -> ${PREFERENCES_PATH}`)
}

export function replacePreferenceRule(oldRule: string, newRule: string, scope: string): void {
  deletePreferenceRule(oldRule, scope)
  savePreferenceRule(newRule, scope)
}
const SECTION_HEADER = '## Email Preferences (ClickUI Auto-Learned)'
const TRAJECTORY_SECTION_HEADER = '## Trajectory Guidance (ClickUI Auto-Learned)'
const CODE_SECTION_HEADER = '## Code Review Preferences (ClickUI Auto-Learned)'
const ACTION_SECTION_HEADER = '## Action Approval Preferences (ClickUI Auto-Learned)'

interface Paragraph {
  id: string
  content: string
}

interface SessionPayload {
  type?: string
  paragraphs?: Paragraph[]
  [key: string]: unknown
}

interface ReviewAction {
  type: string
  paragraphId: string
  reason?: string
  instruction?: string
}

// Map raw reason keys to human-readable descriptions
const REASON_LABELS: Record<string, string> = {
  too_formal: 'too formal',
  too_casual: 'too casual',
  too_long: 'too long',
  off_topic: 'off topic',
  inaccurate: 'inaccurate',
  repetitive: 'repetitive',
  unnecessary: 'unnecessary',
  wrong_tone: 'wrong tone',
  too_polite: 'too polite',
  redundant: 'redundant',
}

function ensureMemoryFile(): void {
  const dir = path.dirname(MEMORY_PATH)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  if (!fs.existsSync(MEMORY_PATH)) {
    fs.writeFileSync(MEMORY_PATH, '# ClickUI Learned Preferences\n', 'utf-8')
  }
}

// Truncate paragraph content into a short description for the rule
function summarize(content: string): string {
  const cleaned = content.trim().replace(/\s+/g, ' ')
  if (cleaned.length <= 80) return cleaned
  return cleaned.slice(0, 77) + '...'
}

function resolveReason(reason: string | undefined): string {
  if (!reason) return 'user deleted'
  return REASON_LABELS[reason] ?? reason
}

export function learnFromDeletions(
  actions: ReviewAction[],
  payload: SessionPayload
): void {
  const deletions = actions.filter(a => a.type === 'delete')
  if (deletions.length === 0) return

  // Support both Format A (payload.paragraphs) and Format B (payload.draft.paragraphs)
  const draft = payload.draft as { paragraphs?: Paragraph[] } | undefined
  const paragraphs = (draft?.paragraphs ?? payload.paragraphs ?? []) as Paragraph[]
  const paragraphMap = new Map<string, string>(
    paragraphs.map(p => [p.id, p.content])
  )

  // Infer scope from session type
  const scope = payload.type === 'email_review' ? 'email' : 'general'

  const rules: string[] = []
  for (const action of deletions) {
    const content = paragraphMap.get(action.paragraphId)
    // Skip if we cannot find the original paragraph text
    if (!content) continue

    const description = summarize(content)
    const reason = resolveReason(action.reason)
    rules.push(`- AVOID: ${description} (reason: ${reason}) - SCOPE: ${scope}`)
  }

  if (rules.length === 0) return

  ensureMemoryFile()

  const existing = fs.readFileSync(MEMORY_PATH, 'utf-8')

  // Append section header once if not present, then append rules
  const needsHeader = !existing.includes(SECTION_HEADER)
  const block = needsHeader
    ? `\n${SECTION_HEADER}\n${rules.join('\n')}\n`
    : `${rules.join('\n')}\n`

  fs.appendFileSync(MEMORY_PATH, block, 'utf-8')
  console.log(`[agentclick] Learned ${rules.length} preference rule(s) -> ${MEMORY_PATH}`)
}

interface StepRevision {
  stepId: string
  action: 'mark_wrong' | 'provide_guidance' | 'skip'
  correction?: string
  guidance?: string
  shouldLearn?: boolean
}

interface TrajectoryPayload {
  title: string
  steps: Array<{ id: string; label: string; [key: string]: unknown }>
  [key: string]: unknown
}

interface RewriteAction {
  type: string
  paragraphId: string
  instruction?: string
  shouldLearn?: boolean
}

export function learnFromRewrite(
  actions: RewriteAction[],
  payload: SessionPayload
): void {
  const learnable = actions.filter(a => a.type === 'rewrite' && a.shouldLearn && a.instruction)
  if (learnable.length === 0) return

  const draft = payload.draft as { paragraphs?: Paragraph[] } | undefined
  const paragraphs = (draft?.paragraphs ?? payload.paragraphs ?? []) as Paragraph[]
  const paragraphMap = new Map<string, string>(
    paragraphs.map(p => [p.id, p.content])
  )

  const scope = payload.type === 'email_review' ? 'email' : 'general'

  const rules: string[] = []
  for (const action of learnable) {
    const content = paragraphMap.get(action.paragraphId)
    const context = content ? ` (context: ${summarize(content)})` : ''
    rules.push(`- PREFER: ${summarize(action.instruction!)}${context} - SCOPE: ${scope}`)
  }

  if (rules.length === 0) return

  ensureMemoryFile()
  const existing = fs.readFileSync(MEMORY_PATH, 'utf-8')
  const needsHeader = !existing.includes(SECTION_HEADER)
  const block = needsHeader
    ? `\n${SECTION_HEADER}\n${rules.join('\n')}\n`
    : `${rules.join('\n')}\n`

  fs.appendFileSync(MEMORY_PATH, block, 'utf-8')
  console.log(`[agentclick] Learned ${rules.length} rewrite style rule(s) -> ${MEMORY_PATH}`)
}

export function learnFromTrajectoryRevisions(
  revisions: StepRevision[],
  payload: TrajectoryPayload
): void {
  const learnable = revisions.filter(r => r.shouldLearn && r.action !== 'skip')
  if (learnable.length === 0) return

  const stepMap = new Map<string, string>()
  function walkSteps(steps: Array<{ id: string; label: string; children?: unknown[] }>) {
    for (const s of steps) {
      stepMap.set(s.id, s.label)
      if (Array.isArray(s.children)) walkSteps(s.children as typeof steps)
    }
  }
  walkSteps(payload.steps)

  const rules: string[] = []
  for (const rev of learnable) {
    const stepLabel = stepMap.get(rev.stepId) ?? rev.stepId
    if (rev.action === 'mark_wrong' && rev.correction) {
      rules.push(`- AVOID: ${summarize(rev.correction)} (step: ${rev.stepId}, context: ${summarize(stepLabel)}) - SCOPE: trajectory`)
    }
    if (rev.guidance) {
      rules.push(`- PREFER: ${summarize(rev.guidance)} (step: ${rev.stepId}, context: ${summarize(stepLabel)}) - SCOPE: trajectory`)
    }
  }

  if (rules.length === 0) return

  ensureMemoryFile()
  const existing = fs.readFileSync(MEMORY_PATH, 'utf-8')
  const needsHeader = !existing.includes(TRAJECTORY_SECTION_HEADER)
  const block = needsHeader
    ? `\n${TRAJECTORY_SECTION_HEADER}\n${rules.join('\n')}\n`
    : `${rules.join('\n')}\n`

  fs.appendFileSync(MEMORY_PATH, block, 'utf-8')
  console.log(`[agentclick] Learned ${rules.length} trajectory rule(s) -> ${MEMORY_PATH}`)
}

export function learnFromCodeRejection(
  result: { approved: boolean; note?: string },
  payload: Record<string, unknown>
): void {
  if (result.approved) return
  const command = typeof payload.command === 'string' ? payload.command : ''
  if (!command) return

  const risk = typeof payload.risk === 'string' ? payload.risk : 'unknown'
  const notePart = result.note ? ` | note:${result.note}` : ''
  const rule = `- AVOID: ${summarize(command)} | reason:user_rejected | scope:code | risk:${risk}${notePart}`

  ensureMemoryFile()
  const existing = fs.readFileSync(MEMORY_PATH, 'utf-8')
  const needsHeader = !existing.includes(CODE_SECTION_HEADER)
  const block = needsHeader ? `\n${CODE_SECTION_HEADER}\n${rule}\n` : `${rule}\n`
  fs.appendFileSync(MEMORY_PATH, block, 'utf-8')
  console.log(`[agentclick] Learned code rejection rule -> ${MEMORY_PATH}`)
}

export function learnFromActionRejection(
  result: { approved: boolean; note?: string },
  payload: Record<string, unknown>
): void {
  if (result.approved) return
  const title = typeof payload.title === 'string' ? payload.title : ''
  const description = typeof payload.description === 'string' ? payload.description : ''
  const subject = title || description
  if (!subject) return

  const risk = typeof payload.risk === 'string' ? payload.risk : 'unknown'
  const notePart = result.note ? ` | note:${result.note}` : ''
  const rule = `- AVOID: ${summarize(subject)} | reason:user_rejected | scope:action | risk:${risk}${notePart}`

  ensureMemoryFile()
  const existing = fs.readFileSync(MEMORY_PATH, 'utf-8')
  const needsHeader = !existing.includes(ACTION_SECTION_HEADER)
  const block = needsHeader ? `\n${ACTION_SECTION_HEADER}\n${rule}\n` : `${rule}\n`
  fs.appendFileSync(MEMORY_PATH, block, 'utf-8')
  console.log(`[agentclick] Learned action rejection rule -> ${MEMORY_PATH}`)
}

export interface LearnedPreference {
  description: string
  reason: string
  scope: string
  type?: 'email' | 'trajectory' | 'code' | 'action'
}

export function getLearnedPreferences(): LearnedPreference[] {
  if (!fs.existsSync(MEMORY_PATH)) return []

  const content = fs.readFileSync(MEMORY_PATH, 'utf-8')
  const preferences: LearnedPreference[] = []

  // Parse email preferences section
  const emailStart = content.indexOf(SECTION_HEADER)
  if (emailStart !== -1) {
    const emailContent = content.slice(emailStart + SECTION_HEADER.length)
    // Stop at next section header
    const nextHeader = emailContent.indexOf('\n## ')
    const section = nextHeader !== -1 ? emailContent.slice(0, nextHeader) : emailContent
    for (const line of section.split('\n')) {
      const match = line.match(/^- AVOID: (.+?) \(reason: (.+?)\) - SCOPE: (.+)$/)
      if (match) {
        preferences.push({
          description: match[1].trim(),
          reason: match[2].trim(),
          scope: match[3].trim(),
          type: 'email',
        })
      }
      const preferMatch = line.match(/^- PREFER: (.+?)(?:\s+\(context: .+?\))? - SCOPE: (.+)$/)
      if (preferMatch) {
        preferences.push({
          description: preferMatch[1].trim(),
          reason: 'style preference',
          scope: preferMatch[2].trim(),
          type: 'email',
        })
      }
    }
  }

  // Parse trajectory guidance section
  const trajStart = content.indexOf(TRAJECTORY_SECTION_HEADER)
  if (trajStart !== -1) {
    const trajContent = content.slice(trajStart + TRAJECTORY_SECTION_HEADER.length)
    const nextHeader = trajContent.indexOf('\n## ')
    const section = nextHeader !== -1 ? trajContent.slice(0, nextHeader) : trajContent
    for (const line of section.split('\n')) {
      const avoidMatch = line.match(/^- AVOID: (.+?) \(step: (.+?), context: (.+?)\) - SCOPE: trajectory$/)
      if (avoidMatch) {
        preferences.push({
          description: avoidMatch[1].trim(),
          reason: `step ${avoidMatch[2].trim()}`,
          scope: 'trajectory',
          type: 'trajectory',
        })
      }
      const preferMatch = line.match(/^- PREFER: (.+?) \(step: (.+?), context: (.+?)\) - SCOPE: trajectory$/)
      if (preferMatch) {
        preferences.push({
          description: preferMatch[1].trim(),
          reason: `step ${preferMatch[2].trim()}`,
          scope: 'trajectory',
          type: 'trajectory',
        })
      }
    }
  }

  // Parse code review rejection section
  const codeStart = content.indexOf(CODE_SECTION_HEADER)
  if (codeStart !== -1) {
    const codeContent = content.slice(codeStart + CODE_SECTION_HEADER.length)
    const nextHeader = codeContent.indexOf('\n## ')
    const section = nextHeader !== -1 ? codeContent.slice(0, nextHeader) : codeContent
    for (const line of section.split('\n')) {
      const match = line.match(/^- AVOID: (.+?) \| reason:(.+?) \| scope:code \| risk:(.+?)( \| note:(.+))?$/)
      if (match) {
        preferences.push({
          description: match[1].trim(),
          reason: match[5] ? match[5].trim() : 'user rejected',
          scope: `code (risk: ${match[3].trim()})`,
          type: 'code',
        })
      }
    }
  }

  // Parse action approval rejection section
  const actionStart = content.indexOf(ACTION_SECTION_HEADER)
  if (actionStart !== -1) {
    const actionContent = content.slice(actionStart + ACTION_SECTION_HEADER.length)
    const nextHeader = actionContent.indexOf('\n## ')
    const section = nextHeader !== -1 ? actionContent.slice(0, nextHeader) : actionContent
    for (const line of section.split('\n')) {
      const match = line.match(/^- AVOID: (.+?) \| reason:(.+?) \| scope:action \| risk:(.+?)( \| note:(.+))?$/)
      if (match) {
        preferences.push({
          description: match[1].trim(),
          reason: match[5] ? match[5].trim() : 'user rejected',
          scope: `action (risk: ${match[3].trim()})`,
          type: 'action',
        })
      }
    }
  }

  return preferences
}

export function deletePreference(index: number): void {
  if (!fs.existsSync(MEMORY_PATH)) return

  const content = fs.readFileSync(MEMORY_PATH, 'utf-8')
  const lines = content.split('\n')

  // Collect all preference line indices across all sections (same order as getLearnedPreferences)
  const prefLineIndices: number[] = []
  for (const header of [SECTION_HEADER, TRAJECTORY_SECTION_HEADER, CODE_SECTION_HEADER, ACTION_SECTION_HEADER]) {
    const headerIdx = lines.findIndex(l => l === header)
    if (headerIdx === -1) continue
    let endIdx = lines.length
    for (let i = headerIdx + 1; i < lines.length; i++) {
      if (lines[i].startsWith('## ')) { endIdx = i; break }
    }
    for (let i = headerIdx + 1; i < endIdx; i++) {
      if (lines[i].match(/^- (AVOID|PREFER):/)) prefLineIndices.push(i)
    }
  }

  if (index < 0 || index >= prefLineIndices.length) return

  lines.splice(prefLineIndices[index], 1)
  fs.writeFileSync(MEMORY_PATH, lines.join('\n'), 'utf-8')
}

export function clearPreferences(): void {
  if (!fs.existsSync(MEMORY_PATH)) return

  let content = fs.readFileSync(MEMORY_PATH, 'utf-8')

  // Remove each section by header
  for (const header of [SECTION_HEADER, TRAJECTORY_SECTION_HEADER, CODE_SECTION_HEADER, ACTION_SECTION_HEADER]) {
    const lines = content.split('\n')
    const headerIdx = lines.findIndex(l => l === header)
    if (headerIdx === -1) continue

    let endIdx = lines.length
    for (let i = headerIdx + 1; i < lines.length; i++) {
      if (lines[i].startsWith('## ')) { endIdx = i; break }
    }

    const start = headerIdx > 0 && lines[headerIdx - 1] === '' ? headerIdx - 1 : headerIdx
    lines.splice(start, endIdx - start)
    content = lines.join('\n')
  }

  fs.writeFileSync(MEMORY_PATH, content, 'utf-8')
}
