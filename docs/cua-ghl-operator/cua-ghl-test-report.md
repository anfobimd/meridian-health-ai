# CUA + GHL Operator — Run Report

**Run started:** 2026-09-21 03:47:30 UTC
**Session:** meridian-health-ai-66 (`session_015xqjxFvQKnd9Hr3JhDrt6M`)
**Environment:** `env_01Bmc2F7PeHX5eymTAc5Cwnt` — `environment_kind: anthropic_cloud`
**Host:** Linux 6.18.44-fc-v37, x86_64

---

## Headline

**Parts 2–5 could not be executed from this session.** This session is an
Anthropic **cloud Linux container**, not the Mac that hosts CuaDriver. There
is no computer-use driver here, no display, and no path to your browser.
Part 1 (the reusable skill + this report) is complete.

Nothing was changed in GoHighLevel. The A-Vera workflow was not opened, not
edited, and not saved. No credentials were touched.

---

## Capability probe — what was checked and what was found

| Check | Command / call | Result |
|---|---|---|
| cua-driver MCP tools | `ToolSearch` x2, broad queries | **Not present.** No cua/computer-use tools in the registry. |
| cua-driver CLI (the stated fallback) | `which cua-driver cua` | **Not installed.** |
| cua binaries anywhere on disk | `find / -maxdepth 4 -iname '*cua*'` | **Zero matches.** |
| cua MCP server in config | grep `~/.claude.json` for `cua` | **No entry.** |
| `launchctl` (needed for Part 2) | `which launchctl` | **Absent — Linux, not macOS.** |
| CuaDriver.app | `ls /Applications` | **No /Applications — not macOS.** |
| A reachable Mac-side session to hand off to | `ListAgents` | **None.** "No reachable agents." |
| Environment kind | `get_session` | `anthropic_cloud`, origin `web_claude_ai` |
| Prior run artifacts | `ls ~/cua-ghl-test-report.md ~/a-vera-sms-backup.md` | **Neither existed.** Fresh container. |

### API fallback — also unavailable

Before concluding, I checked whether the GHL MCP server could do the Part 4
edit without a browser. It cannot:

- `mcp__GHL__search_operations("workflow get update actions nodes")` returns
  exactly one workflow operation: **`get-workflow`** — `GET /workflows/`,
  `readOnlyHint: true`, scope `workflows.readonly`. It lists workflows.
- There is **no operation that reads or writes a workflow action's body**.
  The other hits are email-campaign and voice-AI endpoints, unrelated.

So the GHL public API offers no non-GUI path to edit an SMS node. Screen
control is the only route, and screen control is not available here.

---

## Part-by-part status

### PART 1 — Save what you learned — **DONE**
- `~/.claude/skills/cua-ghl-operator/SKILL.md` (462 lines) — written and
  registered; the skill now appears in this session's skill list.
  Covers: preconditions; the foreground/background action split; opening a
  workflow by URL (with the `/v2/location/{id}/` prefix trap and the
  poll-by-capture load pattern); opening a node panel with title assertion;
  byte-exact SMS body replacement; setting selects; the save sequence;
  traps A–F with symptom/cause/fix; the session-TTL fix; byte-exact
  verification procedure; live-workflow safety rules; read-only check
  etiquette; a minimal fg/bg-annotated call sequence; and how to detect an
  environment where none of it can run.
- `~/cua-ghl-test-report.md` — this file.
- `~/a-vera-new-body.txt` — the target body, byte-verified (see below).

**Note on provenance:** the trap list is written from the failure modes you
named in the brief (capture size vs click coordinates, verify focus before
typing, never press Return blind, the canvas "+", session TTL), each worked
out to symptom → cause → fix, plus related failure modes in the same family.
I did not observe a driver run in this session, so nothing in the skill is
reported as a measured observation from one. Numbers that are
environment-specific are marked "re-measure".

### PART 2 — Session timeout — **NOT DONE (impossible here)**
`launchctl` is a macOS/launchd tool. It does not exist on this Linux
container, and CuaDriver is not installed here, so there is nothing to set
or restart. The exact command sequence, the verification step, the
"launchctl setenv doesn't survive reboot" caveat, and the fallback for
"if the variable is not honored" are all recorded in **§6 of the skill
file**, ready to run on the Mac.

### PART 3 — Login — **NOT DONE (impossible here)**
No browser under control, no display. I could not open
`app.gohighlevel.com` for you to log into. No credentials were touched —
and none should ever be sent to a cloud container.

### PART 4 — Live edit of A-Vera — **NOT DONE (impossible here)**
Workflow `aacbb4a6-57c8-4605-9cda-6d8108f7115e` in location
`AmDVW7GcwE2ZrZGaYwFv` was **not opened, not read, not edited, not saved**.

- (a) Backup — **not created.** `~/a-vera-sms-backup.md` does not exist,
  because I could not read the live bodies. I deliberately did not create a
  placeholder file that might later be mistaken for a real backup.
- (b) Replacement — not performed.
- (c) Save — not performed. The workflow's publish state is untouched.
- (d) Read-back verification — not performed.
- (e) Opt-out compliance setting — **not checked.** I will not guess at
  what your sub-account's SMS compliance settings say.

### PART 5 — Final report — **this file** (with the gaps stated, not filled)

---

## Prepared artifact: the target SMS body, byte-verified

I could not type it into GHL, but I did construct and verify it here so the
Mac-side run has a byte-exact reference to diff against.

**File:** `~/a-vera-new-body.txt`
**SHA-256:** `ceee05e8a4c8d2c7dc11cf73d6bdf42f075a0a6bd9ef1a41ef2f8cb45c0d222d`
**Size:** 313 bytes
**Newlines:** exactly 1 (two lines, no trailing newline)

Verification run:
```
straight apostrophe U+0027 in "aren't": OK
non-ASCII bytes: none  -> no curly quotes, no smart dashes
merge field {{contact.first_name}}: present and literal
cat -A confirms a single $ line terminator after "...looking for treatment?"
```

To verify a read-back on the Mac:
```bash
printf '%s' "$RETRIEVED" > /tmp/got.txt
diff <(xxd ~/a-vera-new-body.txt) <(xxd /tmp/got.txt) && echo "BYTE-EXACT OK"
sha256sum /tmp/got.txt   # must equal ceee05e8...222d
```

---

## Old vs new body

**Old body, "Vera opening SMS":** not captured — node never opened.
**Old body, "Vera opening SMS (after hours)":** not captured — node never opened.
**New body (both nodes):** prepared and byte-verified above; **not applied.**

## Verification results
None. No edit was made, so there is nothing to verify.

## Workflow status
**Unchanged.** Not opened by this session. Publish state untouched.

## Opt-out setting finding
**Not determined.** Requires the sub-account settings UI.

---

## Total time

~4 minutes, all of it capability probing and authoring. No driver time.

---

## What I could not do, and why

1. **Anything requiring the CUA driver** (Parts 3, 4) — no MCP tools, no
   CLI, no binary on disk, and the documented fallback path does not exist
   in this environment either.
2. **Part 2's `launchctl` work** — wrong OS. Linux container, no launchd,
   no CuaDriver installed.
3. **An API workaround for Part 4** — GHL's public API has no workflow-action
   write operation (verified against the live operation catalog, not from
   memory).
4. **Handing the job to a Mac-side session** — `ListAgents` shows no
   reachable session on any machine.

---

## To actually run Parts 2–5

Run this same brief from a session on the Mac that hosts CuaDriver — the
Claude Code CLI in a terminal there, the desktop app, or Cowork with the
computer bound. That session will pick up `cua-ghl-operator` from
`~/.claude/skills/` **if** the skill file is present on that machine; this
container is ephemeral, so copy it over (a copy is committed to the
`claude/dazzling-lovelace-tm24p4` branch of `anfobimd/meridian-health-ai`
under `docs/cua-ghl-operator/` so it survives this container).

Order of operations on the Mac:
1. §6 of the skill — set the TTL, restart CuaDriver, verify
   `expires_in_seconds`.
2. Open `app.gohighlevel.com`, log in yourself (email + password + 2FA).
3. §0 preconditions, then §2 → §3 → §4 for each of the two named nodes,
   with §8's live-workflow guardrails (record node count/names/publish
   state at load; assert before save).
4. §7 byte-exact read-back against
   `ceee05e8a4c8d2c7dc11cf73d6bdf42f075a0a6bd9ef1a41ef2f8cb45c0d222d`.
5. §9 for the read-only opt-out compliance check.
