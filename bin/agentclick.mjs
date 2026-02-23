#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const rootDir = dirname(dirname(__filename))
const webDistIndex = join(rootDir, 'packages', 'web', 'dist', 'index.html')
const serverDistEntry = join(rootDir, 'packages', 'server', 'dist', 'index.js')

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

if (!existsSync(webDistIndex) || !existsSync(serverDistEntry)) {
  console.log('[agentclick] Build artifacts not found, running npm run build...')
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  run(npmCmd, ['run', 'build'])
}

if (!existsSync(serverDistEntry)) {
  console.error('[agentclick] Server build output missing after build. Expected packages/server/dist/index.js')
  process.exit(1)
}

run(process.execPath, [serverDistEntry])
