#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import net from 'node:net'

const __filename = fileURLToPath(import.meta.url)
const rootDir = dirname(dirname(__filename))
const webDistIndex = join(rootDir, 'packages', 'web', 'dist', 'index.html')
const serverDistEntry = join(rootDir, 'packages', 'server', 'dist', 'index.js')
const packageJsonPath = join(rootDir, 'package.json')
const args = process.argv.slice(2)

function readVersion() {
  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
    return typeof pkg.version === 'string' ? pkg.version : 'unknown'
  } catch {
    return 'unknown'
  }
}

function printHelp() {
  console.log(`AgentClick CLI

Usage:
  agentclick
  agentclick --help

Options:
  --version, -v   Show version number
  --help, -h   Show this help message

Examples:
  agentclick              Start the server (auto-detects port)
  PORT=4000 agentclick    Start on a specific port

Environment:
  PORT                    Server port (default: 38173, auto-fallback if busy)
  OPENCLAW_WEBHOOK        Webhook URL for agent callbacks
`)
}

function parseArgs(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    }
    if (arg === '--version' || arg === '-v') {
      console.log(readVersion())
      process.exit(0)
    }
    console.error(`[agentclick] Unknown argument: ${arg}`)
    console.error('[agentclick] Run "agentclick --help" for usage.')
    process.exit(1)
  }
  return {}
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    env: process.env,
  })
  if (result.error) {
    console.error(`[agentclick] Failed to run ${command}:`, result.error.message)
    process.exit(1)
  }
  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status)
  }
}

parseArgs(args)

if (!existsSync(webDistIndex) || !existsSync(serverDistEntry)) {
  console.log('[agentclick] Build artifacts not found, running npm run build...')
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  run(npmCmd, ['run', 'build'])
}

if (!existsSync(serverDistEntry)) {
  console.error('[agentclick] Server build output missing after build. Expected packages/server/dist/index.js')
  process.exit(1)
}

async function canListen(port) {
  return await new Promise(resolve => {
    const server = net.createServer()
    server.once('error', err => {
      if ((err).code === 'EADDRINUSE') {
        resolve(false)
        return
      }
      console.error(`[agentclick] Port check failed for ${port}: ${err.message}`)
      process.exit(1)
    })
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port)
  })
}

async function isAgentClickServer(port) {
  const url = `http://localhost:${port}/api/identity`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 1200)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) return false
    const data = await response.json()
    return data && data.service === 'agentclick' && data.ok === true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

async function resolvePort() {
  const explicitPort = process.env.PORT ? Number(process.env.PORT) : null
  if (explicitPort && Number.isFinite(explicitPort) && explicitPort > 0) {
    const free = await canListen(explicitPort)
    if (free) return String(explicitPort)
    if (await isAgentClickServer(explicitPort)) {
      console.log(`[agentclick] AgentClick already running at http://localhost:${explicitPort}; reusing existing server.`)
      return null
    }
    console.log(`[agentclick] Port ${explicitPort} is occupied by another service; searching for fallback port...`)
    let fallback = explicitPort + 1
    while (true) {
      const available = await canListen(fallback)
      if (available) {
        console.log(`[agentclick] Using fallback port ${fallback}`)
        return String(fallback)
      }
      if (await isAgentClickServer(fallback)) {
        console.log(`[agentclick] AgentClick already running at http://localhost:${fallback}; reusing existing server.`)
        return null
      }
      fallback += 1
    }
  }

  // Backward compatibility: if legacy default is running AgentClick, reuse it.
  const legacyPort = 3001
  if (await isAgentClickServer(legacyPort)) {
    console.log(`[agentclick] AgentClick already running at legacy default http://localhost:${legacyPort}; reusing existing server.`)
    return null
  }

  let port = 38173
  while (true) {
    const available = await canListen(port)
    if (available) return String(port)
    if (await isAgentClickServer(port)) {
      console.log(`[agentclick] AgentClick already running at http://localhost:${port}; reusing existing server.`)
      return null
    }
    console.log(`[agentclick] Port ${port} in use by another service, trying ${port + 1}...`)
    port += 1
  }
}

const childEnv = { ...process.env }
const resolvedPort = await resolvePort()
if (!resolvedPort) {
  process.exit(0)
}
childEnv.PORT = resolvedPort

const result = spawnSync(process.execPath, [serverDistEntry], {
  cwd: rootDir,
  stdio: 'inherit',
  env: childEnv,
})
if (result.error) {
  console.error('[agentclick] Failed to start server:', result.error.message)
  process.exit(1)
}
if (typeof result.status === 'number' && result.status !== 0) {
  process.exit(result.status)
}
