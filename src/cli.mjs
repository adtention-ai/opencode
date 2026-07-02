#!/usr/bin/env node
// Standalone CLI for the ADtention OpenCode plugin: `npx @adtention/opencode key` prints this
// install's publisher_id + secret so the user can link it to their account and claim its earnings.
//
// The identity is written by the TUI plugin to OpenCode's own KV (~/.local/state/opencode/kv.json,
// key "adtention:identity"), which is always present for a registered install. This CLI reads the KV
// first, so it works for every existing install. It also falls back to a stable home-dir backup
// (~/.adtention/opencode-identity.json) that would survive a KV wipe, but writing that file is a
// planned follow-up: the TUI does not write it yet, so the fallback is currently dormant and reads
// succeed via the KV. The secret is a credential, so it only prints on this explicit, user-run
// command, never in the TUI line.
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const stateHome = process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state')
const KV_PATH = join(stateHome, 'opencode', 'kv.json')
const IDENTITY_BACKUP = join(homedir(), '.adtention', 'opencode-identity.json')

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null }
}

// KV is a flat object keyed by string; the identity lives under "adtention:identity". The backup is
// the identity object itself.
function loadIdentity() {
  const kv = readJson(KV_PATH)
  const fromKv = kv && kv['adtention:identity']
  if (fromKv && fromKv.publisher_id && fromKv.secret) return fromKv
  const backup = readJson(IDENTITY_BACKUP)
  if (backup && backup.publisher_id && backup.secret) return backup
  return null
}

const cmd = process.argv[2]
if (cmd !== 'key') {
  console.log('Usage: npx @adtention/opencode key')
  process.exit(cmd ? 1 : 0)
}

const id = loadIdentity()
if (!id) {
  console.log('adtention: no install identity yet. Open OpenCode and send one prompt to register your install, then run this again.')
  process.exit(1)
}

// Printing the secret is safe by design: it's the one-time claim proof, and linking is write-once
// server-side (a claimed install can't be re-linked to another account), so a secret later seen in
// the terminal is inert. A credential before linking, inert after.
console.log('Your ADtention publisher key. Link it to claim and cash out your earnings.')
console.log()
console.log('  publisher_id:  ' + id.publisher_id)
console.log('  secret:        ' + id.secret)
console.log()
console.log('Link at:  https://app.adtention.ai/earn/link')
