# ADtention for OpenCode

**The OpenCode terminal line that pays you to code.**

You watch your terminal while the agent works anyway. ADtention adds one quiet sponsor
line to the bottom of OpenCode that earns you credit while you code — and shows your
running balance right next to it.

```
sponsored  Alchemy: APIs for every chain  →  /sponsor to learn more            ⊕ $0.42
```

One line. No popups. No signup to earn. And **nothing about your code ever leaves your
machine**. The rest of this README shows you exactly how, in a way you can verify yourself.

> **OpenCode terminal (CLI) only.** The sponsor line lives in the TUI footer, so this is
> for the `opencode` terminal app — not the OpenCode desktop app or editor extensions,
> which don't have that surface.

---

## "Wait. An ad plugin reading my code? Hard pass."

Good instinct. Read this part first, then decide.

When you send a prompt, the plugin looks at **the kinds of files in your project folder**
and sorts it into one of six broad buckets — all of it on your machine, no network call:

`web3` · `web` · `devops` · `data` · `systems` · `general`

The **only** thing that ever goes to the server is that one word, plus a random install id
(a pseudonym, not tied to any personal data), so it can pick a relevant sponsor and credit
your balance.

| Leaves your machine | Never leaves your machine |
|---|---|
| One bucket word (e.g. `web3`) | Your code or file contents |
| A random install id | Your prompts or the agent's replies |
| | File names, paths, or repo names |
| | Anything identifying you or your work |

**No account, email, or login to install or earn.** The install id is a random string
created locally the first time the plugin runs. Cashing out, once it's available, will mean
creating an account with a payout method — but earning never requires one.

**Don't take our word for it.** The entire plugin is one short file
([`src/tui.tsx`](src/tui.tsx)) that you can read in a few minutes. The line itself just
renders a cached value — it makes *no* network call. The only outbound request happens once
per prompt, and you can read exactly what it sends: a one-time `register`, then a `serve`.

---

## What you actually get

- **A balance worth watching**: your running ADtention credit, live at the bottom-right of
  the TUI, on every screen.
- **Passive credit while you work**: the sponsor line earns a small amount each time it's
  served on a real prompt. Money trickles in for doing what you were already doing.
- **Zero friction**: one command to install, works instantly, no signup.
- **Privacy by architecture, not by promise**: the design makes leaking your code
  impossible, not just against the rules.
- **A clean exit**: remove one line from your config and it's gone, no trace.

---

## Install

```
opencode plugin @adtention/opencode
```

Or add it to your `tui.json` directly:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["@adtention/opencode"]
}
```

Relaunch OpenCode and the line appears at the bottom of the terminal.

Want the bleeding edge straight from source? `opencode plugin adtention-ai/opencode`.

---

## How the money works

- You earn a small amount each time the sponsor line is served, **at most once every 15
  seconds**, and **only when you actually send a prompt**.
- An idle terminal earns nothing. Leaving OpenCode open overnight generates zero
  impressions — no farming, no gaming it.
- Your balance accrues to your install and shows live in the line.
- Cashing out is coming: when it's available you'll create an account, attach a payout
  method, and withdraw past a threshold.

It's not a salary. It's beer money that shows up for work you were doing regardless.

---

## How it works under the hood

Two parts, deliberately kept separate so the terminal is never waiting on a server:

- **The line renders from a local cache.** It makes no network call, so it's always
  instant and works offline.
- **A `serve` runs once per prompt.** When the session starts working, the plugin does the
  local sorting, calls the server once (dwell-gated to 15s) to fetch a fresh sponsor and
  your latest balance, and updates the cache. Sponsor selection happens server-side, so
  that logic stays off your machine entirely.

It registers into OpenCode's persistent `app_bottom` TUI slot — a line shown below the
active view on every screen. Your publisher identity is stored in OpenCode's local state
and reused across sessions.

---

## `/sponsor`

Terminal lines aren't clickable, so the sponsor link is a command. Run `/sponsor` (or pick
**Open sponsor link** from the `ctrl+p` palette) to open the current sponsor in your
browser. It only ever opens `http(s)` links.

---

## Configuration

Pass options in `tui.json` if you need to:

```json
{
  "plugin": [
    ["@adtention/opencode", { "api": "https://api.adtention.ai" }]
  ]
}
```

- `api` — base URL of the ADtention server (default `https://api.adtention.ai`). You can
  also set `ADTENTION_API`.
- `ADTENTION_REF` — a referral code applied to your first registration.

---

## Uninstall

Remove the `@adtention/opencode` entry from your `tui.json` (global:
`~/.config/opencode/tui.json`, or your project's `.opencode/tui.json`) and relaunch. To
also clear the cached identity and balance, delete `kv.json` from OpenCode's state dir.
That's it — no account to close, no residue.

---

## FAQ

**Is this for the OpenCode desktop app or editor extension?**
No — the terminal (`opencode` CLI) only. The line lives in the TUI footer, which the
desktop app and editor surfaces don't have.

**Is it going to slow down my terminal?**
No. The line never makes a network call — it reads a cached value and renders. The one
request happens in the background when you send a prompt.

**Will it spam me with flashing ads?**
It's one text line at the bottom of the TUI. No popups, no color flashing, no
interruptions, nothing to click.

**Do I need to sign up or hand over an email?**
Not to install or earn — there's no account or login, just a random install id (a
pseudonym, no personal data) generated locally. Cashing out, once it's available, will
require creating an account with a payout method — but earning never does.

**How do I know my code isn't being harvested?**
Because the categorization runs locally and only emits one of six bucket words. The plugin
is one readable file ([`src/tui.tsx`](src/tui.tsx)) — the line itself makes no network
call at all.

**What if I hate it?**
Remove one line from your `tui.json` and relaunch. No trace left behind.

---

Built by [ADtention](https://adtention.ai). Same network as the
[Claude Code status line](https://github.com/adtention-ai/claude). MIT — see
[LICENSE](LICENSE).
