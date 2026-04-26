const fs = require('fs')
const path = require('path')

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
  const env = {}

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex <= 0) continue

    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    env[key] = value
  }

  return env
}

const cwd = '/app/ProductionTracker'
const fileEnv = {
  ...readEnvFile(path.join(cwd, '.env')),
  ...readEnvFile(path.join(cwd, '.env.local')),
}
const mergedEnv = {
  NODE_ENV: 'production',
  PORT: '3001',
  ...fileEnv,
  ...process.env,
}

module.exports = {
  apps: [
    {
      name: 'productiontracker',
      cwd,
      script: 'npm',
      args: 'start',
      env: mergedEnv,
    },
  ],
}
