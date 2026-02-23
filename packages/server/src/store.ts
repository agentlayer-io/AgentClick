import Database from 'better-sqlite3'
import { mkdirSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const DB_DIR = join(homedir(), '.openclaw')
const DB_PATH = join(DB_DIR, 'clawui-sessions.db')

if (!existsSync(DB_DIR)) mkdirSync(DB_DIR, { recursive: true })

const db = new Database(DB_PATH)

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    result TEXT,
    sessionKey TEXT,
    createdAt INTEGER NOT NULL
  )
`)

export interface Session {
  id: string
  type: string
  payload: unknown
  status: 'pending' | 'completed'
  result?: unknown
  sessionKey?: string
  createdAt: number
}

export function createSession(session: Session): void {
  db.prepare(`
    INSERT INTO sessions (id, type, payload, status, sessionKey, createdAt)
    VALUES (@id, @type, @payload, @status, @sessionKey, @createdAt)
  `).run({
    ...session,
    payload: JSON.stringify(session.payload),
  })
}

export function getSession(id: string): Session | null {
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!row) return null
  return deserialize(row)
}

export function listSessions(limit = 20): Session[] {
  const rows = db.prepare('SELECT * FROM sessions ORDER BY createdAt DESC LIMIT ?').all(limit) as Record<string, unknown>[]
  return rows.map(deserialize)
}

export function completeSession(id: string, result: unknown): void {
  db.prepare(`
    UPDATE sessions SET status = 'completed', result = ? WHERE id = ?
  `).run(JSON.stringify(result), id)
}

function deserialize(row: Record<string, unknown>): Session {
  return {
    id: row.id as string,
    type: row.type as string,
    payload: JSON.parse(row.payload as string),
    status: row.status as 'pending' | 'completed',
    result: row.result ? JSON.parse(row.result as string) : undefined,
    sessionKey: row.sessionKey as string | undefined,
    createdAt: row.createdAt as number,
  }
}
