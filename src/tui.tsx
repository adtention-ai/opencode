/** @jsxImportSource @opentui/solid */
//
// ADtention sponsor unit for OpenCode.
//
// Renders ONE quiet line pinned to the bottom of the OpenCode TUI (the
// `app_bottom` slot, visible on every screen):
//
//   sponsored  <message>  →  /sponsor to learn more            ⊕ $0.42
//
// Left = the sponsor unit; right = the user's running ADtention balance.
//
// Protocol (shared with the Claude Code client):
//   - POST /v1/register {client, ref?} -> {publisher_id, ...}        (one-time, non-billable)
//   - POST /v1/serve {publisher_id, category, nonce, client}          (THE billable impression)
//       -> {text, balance_usd, click_url, impression_id}
//   - GET  /v1/click/<impression_id>                                 (attributable click)
// `client` is a static originating-tool tag ("opencode"); the server stamps it on the
// publisher (at register) and on each impression (at serve) for traffic attribution.
//
// Economics: a serve is billable, so we only serve on a REAL prompt — the
// `session.status` -> "busy" transition — at most once every 15s. An idle
// terminal earns nothing. Category is classified LOCALLY from the project
// folder; only the resulting tag (web3/web/devops/data/systems/general) is sent.
//
// Display is decoupled from billing: the line always renders from the local KV
// cache (instant, offline-safe); a serve only updates that cache.
//
// `/sponsor` (also in the ctrl+p palette) opens the current sponsor's link.
//
// Distributed two ways:
//   - npm:   "plugin": ["@adtention/opencode"]   in tui.json
//   - local: "plugin": ["./plugins/adtention.tsx"] in tui.json
//
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { spawn } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { createSignal, Show, type Accessor } from "solid-js"

const id = "adtention.sponsor"

type Sponsor = { text: string; url?: string; cta?: string }

// Shown only with the `demo` option (e.g. for screenshots without a server).
const FALLBACK: Sponsor = { text: "Alchemy: APIs for every chain", url: "alchemy.com" }

const DEFAULT_API = "https://api.adtention.ai"
const MIN_DWELL_MS = 15_000

// Originating-tool tag, sent on register (owning tool) and serve (per-impression). The server
// sanitizes it to a slug and falls back to the publisher's owning tool when omitted.
const CLIENT_TAG = "opencode"

const KV_SPONSOR = "adtention:sponsor"
const KV_BALANCE = "adtention:balance"
const KV_IDENTITY = "adtention:identity"

// ---- small helpers -------------------------------------------------------

// Server copy is untrusted at the terminal boundary: strip control bytes so it
// can't emit escape sequences when rendered.
function sanitize(s: string) {
  return s.replace(/[\u0000-\u001f\u007f]/g, "").trim()
}
// Drop a trailing " → domain" from ad copy; the visible domain is display-only,
// the real destination is the click URL behind /sponsor.
function stripTail(s: string) {
  return s.replace(/\s→\s\S+$/, "").trim()
}
function sanitizeRef(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 32)
}
function makeNonce() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

// Classify the project folder locally — mirrors the Go client. Only the tag is
// ever sent; nothing about the code leaves the machine.
function hasExt(dir: string, ext: string) {
  try {
    return readdirSync(dir).some((f) => f.endsWith(ext))
  } catch {
    return false
  }
}
function hasPrefix(dir: string, prefix: string) {
  try {
    return readdirSync(dir).some((f) => f.startsWith(prefix))
  } catch {
    return false
  }
}
function classify(dir: string): string {
  const has = (f: string) => existsSync(join(dir, f))
  if (has("foundry.toml") || hasExt(dir, ".sol") || hasPrefix(dir, "hardhat.config.")) return "web3"
  if (has("Dockerfile") || hasExt(dir, ".tf")) return "devops"
  if (has("package.json")) return "web"
  if (has("requirements.txt") || hasExt(dir, ".py")) return "data"
  if (has("Cargo.toml") || has("go.mod")) return "systems"
  return "general"
}

// Open a URL in the default browser, cross-platform. The TUI owns the screen,
// so we shell out rather than rely on terminal hyperlinks.
function openURL(raw: string) {
  const url = /^[a-z]+:\/\//i.test(raw) ? raw : "https://" + raw
  if (!/^https?:\/\//i.test(url)) return // never hand the OS a non-web scheme
  try {
    if (process.platform === "darwin") spawn("open", [url], { detached: true, stdio: "ignore" }).unref()
    else if (process.platform === "win32")
      spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref()
    else spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref()
  } catch {
    // best effort
  }
}

// ---- view ----------------------------------------------------------------

function SponsorLine(props: { api: TuiPluginApi; sponsor: Accessor<Sponsor | undefined>; balance: Accessor<number> }) {
  const theme = () => props.api.theme.current
  return (
    <box width="100%" paddingLeft={2} paddingRight={2} flexDirection="row" flexShrink={0} gap={1}>
      <Show when={props.sponsor()} fallback={<text fg={theme().textMuted}>adtention</text>}>
        {(s) => (
          <box flexDirection="row" flexShrink={1} gap={1}>
            <text fg={theme().textMuted}>sponsored</text>
            <text fg={theme().text}>{s().text}</text>
            <Show when={s().url}>
              <text fg={theme().textMuted}>→</text>
              <text fg={theme().accent}>/sponsor</text>
              <text fg={theme().textMuted}>{s().cta ?? "to learn more"}</text>
            </Show>
          </box>
        )}
      </Show>
      <box flexGrow={1} />
      <text fg={theme().textMuted}>⊕</text>
      <text fg={theme().success}>${props.balance().toFixed(2)}</text>
    </box>
  )
}

// ---- plugin --------------------------------------------------------------

const tui: TuiPlugin = async (api, options) => {
  const opts = (options ?? {}) as { api?: string; demo?: boolean }
  const apiBase = (opts.api || process.env.ADTENTION_API || DEFAULT_API).replace(/\/+$/, "")

  const [sponsor, setSponsor] = createSignal<Sponsor | undefined>(undefined)
  const [balance, setBalance] = createSignal(0)

  let publisherId = ""
  let lastServe = 0
  let registerInFlight: Promise<string> | null = null

  async function postJSON(path: string, body?: unknown) {
    const res = await fetch(apiBase + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? "" : JSON.stringify(body),
      signal: AbortSignal.timeout(5000), // never let a stalled server hang a request
    })
    return (await res.json()) as any
  }

  // One-time identity. Registration is non-billable, so it can run eagerly.
  // Single-flighted so a startup call and a first-prompt call can't both
  // register and create two publisher accounts.
  async function ensureRegistered(): Promise<string> {
    if (publisherId) return publisherId
    if (registerInFlight) return registerInFlight
    registerInFlight = (async () => {
      try {
        const idn = await api.kv.get(KV_IDENTITY)
        if (idn && typeof (idn as any).publisher_id === "string") {
          publisherId = (idn as any).publisher_id
          return publisherId
        }
      } catch {
        // ignore
      }
      try {
        const ref = process.env.ADTENTION_REF ? sanitizeRef(process.env.ADTENTION_REF) : ""
        const data = await postJSON("/v1/register", { client: CLIENT_TAG, ...(ref ? { ref } : {}) })
        if (data && typeof data.publisher_id === "string") {
          publisherId = data.publisher_id
          try {
            await api.kv.set(KV_IDENTITY, data)
          } catch {
            // ignore
          }
        }
      } catch {
        // offline -> retry later
      }
      return publisherId
    })()
    try {
      return await registerInFlight
    } finally {
      if (!publisherId) registerInFlight = null // failed; allow a later retry
    }
  }

  function applyServe(data: any) {
    if (typeof data?.balance_usd === "number") {
      setBalance(data.balance_usd)
      void api.kv.set(KV_BALANCE, data.balance_usd)
    }
    if (typeof data?.text === "string") {
      const text = stripTail(sanitize(data.text))
      let click = data.click_url ? sanitize(data.click_url) : data.impression_id ? "/v1/click/" + data.impression_id : ""
      if (click.startsWith("/")) click = apiBase + click
      if (!/^https?:\/\//i.test(click)) click = ""
      if (text) {
        const sp: Sponsor = { text, url: click || undefined }
        setSponsor(sp)
        void api.kv.set(KV_SPONSOR, sp)
      }
    }
  }

  async function safeServe(pub: string, category: string) {
    try {
      return await postJSON("/v1/serve", { publisher_id: pub, category, nonce: makeNonce(), client: CLIENT_TAG })
    } catch {
      return null
    }
  }

  // Record a billable impression — only on a real prompt, dwell-gated.
  async function serveImpression() {
    const now = Date.now()
    if (now - lastServe < MIN_DWELL_MS) return
    lastServe = now

    const pub = await ensureRegistered()
    if (!pub) {
      lastServe = 0 // registration failed; let the next prompt retry
      return
    }

    const dir = api.state.path?.directory || api.state.path?.worktree || process.cwd()
    const category = classify(dir)

    let data = await safeServe(pub, category)
    if (data?.error && String(data.error).includes("unknown_publisher")) {
      // self-heal: identity was dropped server-side; re-register and retry once.
      publisherId = ""
      try {
        await api.kv.set(KV_IDENTITY, {})
      } catch {
        // ignore
      }
      const pub2 = await ensureRegistered()
      if (pub2) data = await safeServe(pub2, category)
    }
    if (data) applyServe(data)
  }

  // 1. Hydrate the display from cache first — instant, works offline.
  try {
    await api.kv.ready
    const cs = await api.kv.get(KV_SPONSOR)
    if (cs && typeof (cs as any).text === "string") setSponsor(cs as Sponsor)
    const cb = await api.kv.get(KV_BALANCE)
    if (typeof cb === "number") setBalance(cb)
  } catch {
    // ignore cache errors
  }
  if (!sponsor() && opts.demo) setSponsor(FALLBACK)

  // 2. Register ahead of the first prompt (non-billable).
  void ensureRegistered()

  // 3. Serve on a real prompt: the session goes "busy". Ignore subagents and
  //    rapid repeats (the dwell gate inside serveImpression also guards this).
  const active = new Set<string>()
  api.event.on("session.status", (event) => {
    const sessionID = event.properties.sessionID
    const type = event.properties.status.type
    if (type === "busy") {
      const session = api.state.session.get?.(sessionID)
      if (session?.parentID) return // subagent work belongs to the parent's prompt
      if (active.has(sessionID)) return
      active.add(sessionID)
      void serveImpression()
    } else if (type === "idle") {
      active.delete(sessionID)
    }
  })

  // 4. `/sponsor` command + palette entry: open the sponsor's link.
  api.keymap.registerLayer({
    commands: [
      {
        name: "adtention.open",
        title: "Open sponsor link",
        category: "ADtention",
        namespace: "palette",
        slashName: "sponsor",
        run() {
          const s = sponsor()
          if (s?.url) openURL(s.url)
        },
      },
    ],
  })

  // 5. Render the unit pinned to the bottom on every screen.
  api.slots.register({
    order: 1000,
    slots: {
      app_bottom() {
        return <SponsorLine api={api} sponsor={sponsor} balance={balance} />
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = { id, tui }
export default plugin
