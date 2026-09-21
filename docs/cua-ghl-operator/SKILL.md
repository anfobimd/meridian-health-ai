---
name: cua-ghl-operator
description: Drive the GoHighLevel (GHL) workflow builder through a CUA computer-use driver — open a workflow by URL, open an action node's panel, replace an SMS body byte-exact, set selects, and save without unpublishing. Use whenever editing GHL workflow nodes, SMS/email action bodies, or any GHL builder surface via screen control rather than API. Also covers the CuaDriver session-TTL fix and the foreground/background action split.
---

# CUA + GoHighLevel Workflow Operator

Operating manual for editing GoHighLevel workflow nodes through a CUA
(computer-use) driver. GHL's public API is **read-only for workflows**
(`GET /workflows/` lists them; there is no endpoint that reads or writes an
action's body), so screen control is the only path to edit a node.

> **Provenance.** The trap list below is written from the failure modes
> observed and named during the operator test run. Each entry states the
> symptom, the cause, and the fix. Where a value is environment-specific
> (capture dimensions, TTL, app paths) it is marked so you re-measure rather
> than trust the number.

---

## 0. Preconditions — check these before touching anything

Run this checklist at the start of every session. Failing it early costs
seconds; failing it late costs a corrupted live workflow.

1. **Is the driver actually reachable?** Call the driver's session/health
   call first. If the MCP tools are absent, fall back to the `cua-driver`
   CLI with the same verbs. If neither exists, **stop** — do not improvise
   with a different automation stack against a live account.
2. **Are you on a machine that can host the browser?** CuaDriver is a macOS
   app. A Linux cloud container has no `launchctl`, no CuaDriver, and no
   isolated browser. If `uname` says Linux and `which launchctl` is empty,
   this work cannot run here — say so instead of simulating it.
3. **Check the session TTL before a long job.** See §6. A default TTL will
   expire mid-edit and drop you out with the panel half-filled.
4. **Confirm the target.** Workflow id, location id, and node names must
   match the brief exactly. If the canvas shows different node names, a
   different node count, or a different publish state than the brief
   describes — **stop without saving and report**. A live published
   workflow is not a place to guess.

---

## 1. Foreground vs background — the action split

The driver runs most calls against a background/offscreen surface. Some
interactions only resolve correctly when the target window is frontmost.
Getting this wrong is the single biggest source of "the click landed
nowhere" failures.

**Must be foreground:**
- Any click on the **workflow canvas** itself — node bodies, the canvas
  `+` buttons, drag/pan. Canvas is a virtualized/transformed surface; hit
  testing is unreliable when the window is not frontmost.
- Any interaction that opens a **native or portal-rendered menu** — select
  dropdowns that render outside the panel's DOM subtree, date pickers,
  the merge-field `{{ }}` picker.
- The final **Save / Publish** confirmation click.

**Safe in background:**
- `screenshot` / capture calls (reading state).
- Typing into a field that already has confirmed focus.
- Scrolling within an already-open side panel.
- Reading back a field's value for verification.

**Rule of thumb:** if the action changes what is on screen structurally
(opens a panel, opens a menu, commits a save), foreground it. If it only
reads, or types into something already focused, background is fine.

---

## 2. Opening a workflow builder by URL

```
1. driver: ensure browser window exists and is focused          [foreground]
2. driver: navigate to
     https://app.gohighlevel.com/v2/location/{LOCATION_ID}/automation/workflow/{WORKFLOW_ID}
3. WAIT — the builder is slow. Budget 60 seconds.               [background]
   Do NOT poll with a fixed sleep and then assume. Poll by capture:
   screenshot every ~5s until BOTH are true:
     - the workflow name is rendered in the header
     - at least one node card is rendered on the canvas
   A canvas that shows a spinner or an empty grid is NOT loaded.
4. screenshot: record the publish toggle state (Published / Draft)
   BEFORE any edit. You will assert it is unchanged at the end.
```

**Trap:** navigating straight to `/automation/workflow/{id}` without the
`/v2/location/{locationId}` prefix can land on an account-level redirect
that silently resolves to a *different* sub-account's workflow list. Always
include the location segment, and verify the workflow name in the header
matches the brief before you touch a node.

---

## 3. Opening a node's panel

```
1. screenshot at known scale                                    [background]
2. locate the node card by its NAME TEXT, not by remembered
   coordinates from a previous run — the canvas auto-lays-out and
   pans between loads.
3. convert capture coords -> screen coords (see §5, trap A)
4. click the node card's body (its centre), foreground          [foreground]
5. screenshot: confirm the right-hand panel opened AND its title
   equals the node name you targeted.                           [background]
```

**Never** assume the panel that opened belongs to the node you clicked.
GHL will keep a previously-open panel on screen if the new click missed,
so a panel being visible is not evidence of success — the **title match**
is the evidence.

---

## 4. Replacing a plaintext SMS body

This is the core operation. The GHL SMS body field is a rich-ish contenteditable
/ textarea hybrid that renders merge fields as inline chips in some builder
versions and as literal `{{ }}` text in others. Treat it as plain text and
verify.

```
1. Panel open and title verified (§3).
2. Click directly INTO the message body field.                  [foreground]
3. VERIFY FOCUS before typing (trap B). screenshot and confirm
   the field shows a caret / focus ring. If you cannot see focus,
   click again — do not type hopefully.
4. Select all existing content within the field:
     - click into field, then send Cmd+A
     - Cmd+A is scoped to the focused field. If focus was NOT in
       the field, Cmd+A selects the whole PAGE and the next
       keystroke destroys the panel. This is why step 3 is not
       optional.
5. Delete the selection (Delete / Backspace).
6. screenshot: confirm the field is now EMPTY. If old text remains,
   the select-all did not scope correctly — stop and re-focus.
7. Type the new body.
     - For a multi-line body, type line 1, then send a literal
       newline keystroke, then line 2. See trap C about Return.
     - Type the merge field as literal characters: {{contact.first_name}}
       Do not use the {} picker unless the field refuses literal text —
       the picker inserts a chip whose serialized form you cannot verify
       by reading the screen.
8. Click OUT of the field onto neutral panel chrome to commit the
   edit (blur). Some GHL fields do not register the change until blur.
9. Verify byte-exact (§7) BEFORE saving.
```

### Setting selects in the panel

```
1. Click the select.                                            [foreground]
2. screenshot: confirm the option list is open and read the
   visible options.                                             [background]
3. Click the option BY ITS TEXT.                                [foreground]
4. screenshot: confirm the select's closed state now displays
   the chosen option.                                           [background]
```
Never keyboard-navigate a select blind (arrow keys + Return). GHL selects
reorder and filter as you type; a blind Return commits whatever happened to
be highlighted.

### Saving

```
1. screenshot: confirm the panel shows your intended state.
2. Click the panel's Save / Update Action button.               [foreground]
3. screenshot: confirm the panel closed OR shows a saved state.
4. Click the workflow-level Save (top right) if the builder
   presents one.                                                [foreground]
5. screenshot: confirm the success toast AND that the publish
   toggle still reads Published.                                [background]
```

**Never click anything near the publish toggle to "confirm" the save.**
On a live workflow, an accidental toggle click takes the automation
offline silently — the toast for unpublish looks much like the toast for
save.

---

## 5. The traps, with fixes

### Trap A — capture size vs click coordinates
**Symptom:** clicks land consistently offset — often roughly half or double
the intended position, or correct near the top-left and increasingly wrong
toward the bottom-right.

**Cause:** the screenshot is returned at a different pixel size than the
coordinate space the click verb expects. Retina/HiDPI capture returns a
2x buffer; the driver may also downscale large captures to fit a transport
limit. Coordinates read off the image are therefore in *image* space, not
*screen* space.

**Fix:** never feed image coordinates straight into a click.
```
scale_x = screen_width  / image_width
scale_y = screen_height / image_height
click_x = image_x * scale_x
click_y = image_y * scale_y
```
Measure `image_width/height` from the actual returned capture every session
(it changes with window size and display), and `screen_width/height` from
the driver's display/bounds call. Calibrate once per session by clicking a
known, harmless target (e.g. the workflow header) and confirming the
expected hover/selection, then reuse the factor.

### Trap B — typing without verified focus
**Symptom:** the body field is unchanged and text has appeared somewhere
else — a search box, the node-name field, or nowhere at all. Worst case:
an unfocused `Cmd+A` selected the page and the following keystroke wiped
the panel.

**Cause:** the click that was supposed to focus the field missed (see trap
A), or landed on a wrapper element that does not forward focus.

**Fix:** a mandatory capture-and-confirm between "click field" and "type".
Look for a caret or focus ring. Treat "I clicked, so it must be focused"
as a defect. After typing the first few characters, capture again and
confirm they appeared *in the target field* before typing the rest of a
long body.

### Trap C — pressing Return blind
**Symptom:** the panel closes, a form submits, a dropdown commits the wrong
option, or a node gets duplicated.

**Cause:** Return is overloaded. In a GHL panel it may mean "newline", or
"submit this form", or "accept the highlighted autocomplete item",
depending on which element has focus.

**Fix:** never send Return as a generic "commit". Specifically:
- To get a line break inside an SMS body, confirm focus is in the body
  field first, then send the newline — and capture immediately after to
  confirm the break appeared and the panel is still open.
- To commit a field, **blur it by clicking neutral chrome**, not Return.
- To choose a dropdown option, **click the option**, not Return.
- If a Return must be sent, capture before and after. No exceptions.

### Trap D — the canvas "+" button
**Symptom:** a new empty action node appears in the workflow, or the "add
step" tray opens over the canvas and subsequent clicks land on tray items.

**Cause:** the `+` affordances sit on the connector lines *between* nodes
and are large hit targets. A click intended for a node card — especially
one computed with a bad scale factor (trap A) — lands on a `+`.

**Fix:**
- Click node **card centres**, never the gap between cards.
- After every canvas click, capture and confirm what opened. If an
  "add step" tray appeared, dismiss it with Escape (or the tray's X) and
  **verify the node count is unchanged** before continuing.
- If a stray node was created: delete it immediately and re-verify the
  count. Do not save a workflow whose node count differs from the count
  you recorded at load.
- On a brief that says *do not add, delete, move, or rename any node*,
  record the node count and names at load and assert them again before
  save. That assertion is the guardrail against trap D.

### Trap E — stale coordinates across loads
**Symptom:** a sequence that worked last run clicks the wrong node.
**Fix:** re-locate every target by its visible text on each run. Never
hardcode canvas coordinates between sessions.

### Trap F — the panel that was already open
**Symptom:** you read back a body and it matches the *other* node.
**Fix:** panel title must equal the node name, every time you open it and
again every time you read it back.

---

## 6. CuaDriver session TTL

**Problem:** the driver's default session idle TTL is short. A GHL builder
that takes ~60s to load, plus careful capture-verify-type cycles, can idle
past the TTL between calls. The session dies mid-edit and you lose the
panel state — on a live workflow that can mean a half-replaced body.

**Fix (macOS, run on the machine hosting CuaDriver):**
```bash
# 1. Set the idle TTL to 1800s (30 min) for the user's launchd session.
launchctl setenv CUA_DRIVER_RS_SESSION_IDLE_TTL_SECS 1800

# 2. Confirm launchd took it.
launchctl getenv CUA_DRIVER_RS_SESSION_IDLE_TTL_SECS
# expect: 1800

# 3. Restart CuaDriver so it re-reads the environment.
#    (launchctl setenv only affects processes started AFTER the set.)
osascript -e 'quit app "CuaDriver"'
sleep 3
open -a CuaDriver
sleep 5

# 4. Verify from the driver side: create/inspect a session and read
#    expires_in_seconds. Expect a value near 1800, not the old default.
cua-driver session info      # or the MCP session/health call
```

**Caveats to check, not assume:**
- `launchctl setenv` does **not** persist across reboot. For a durable
  setting, add it to a LaunchAgent plist (`EnvironmentVariables`) or set it
  in the app's own config if CuaDriver exposes one.
- A GUI app launched by Finder/Dock inherits the launchd user environment,
  so the restart in step 3 is what makes it take effect. If you restart the
  app *before* the `setenv`, the old TTL sticks.
- **If `expires_in_seconds` still shows the old default after the restart,
  the variable is not honored by this build.** Record that fact and work
  around it instead: keep the session warm by issuing a cheap call (a
  capture, or a session ping) every few minutes during long waits, and
  never leave a panel open across a long idle gap.

---

## 7. Verifying a body byte-exact

Reading a screenshot is **not** verification. Pixels cannot distinguish a
straight apostrophe `'` (U+0027) from a curly one `'` (U+2019), and cannot
prove whether a line break is a real `\n` or soft wrapping.

Procedure:

1. **Read the value back as text**, not as an image. In order of
   preference:
   - the driver's text/accessibility read of the focused element, if
     available;
   - select-all within the field, copy, then read the clipboard through
     the driver's clipboard verb;
   - as a last resort, zoom the capture enough to inspect glyph shapes —
     and flag the result as *visual only, not byte-verified*.
2. **Write the retrieved text to a file** and diff it against the intended
   text written to another file. Compare bytes, not eyeballs:
   ```bash
   printf '%s' "$RETRIEVED" > /tmp/got.txt
   diff <(xxd /tmp/want.txt) <(xxd /tmp/got.txt) && echo "BYTE-EXACT OK"
   ```
3. **Assert the specific hazards explicitly:**
   ```bash
   # straight apostrophe present, curly absent
   grep -q "aren't" /tmp/got.txt && echo "straight apostrophe OK"
   grep -q $'’' /tmp/got.txt && echo "FAIL: curly apostrophe present"

   # exactly one newline -> two lines
   [ "$(wc -l < /tmp/got.txt)" -le 1 ] && echo "check trailing-newline convention"
   awk 'END{print NR" lines"}' /tmp/got.txt

   # merge field intact and not chip-mangled
   grep -q '{{contact.first_name}}' /tmp/got.txt && echo "merge field OK"

   # no smart quotes / non-ASCII sneaked in
   LC_ALL=C grep -qP '[^\x00-\x7F]' /tmp/got.txt && echo "FAIL: non-ASCII present"
   ```
4. **Merge-field validity** is separate from string match: confirm the
   builder renders it as a recognized field (chip or highlighted token),
   not as inert text with a warning. A typo'd field name still matches a
   string diff but sends literally to the contact.

**Common byte-level corruptions to watch for:**
| Hazard | Cause | Detection |
|---|---|---|
| Curly apostrophe | OS "smart quotes" substitution while typing | `grep` for U+2019 |
| Missing line break | Return was swallowed by form submit | line count |
| Doubled line break | newline sent twice during retry | line count |
| Trailing space | select-all missed the last char | `cat -A` |
| Merge field as chip | inserted via picker | read-back shows different text than screen |
| Leading/trailing newline | field pre-seeded with whitespace | `xxd` head/tail |

Disable OS smart substitution before typing if the driver types through the
OS keyboard layer: System Settings → Keyboard → Text Input → Edit →
turn off "Use smart quotes and dashes".

---

## 8. Live-workflow safety rules

When the brief says the workflow is **published and live**:

- Copy the current value of every field you will change into a
  timestamped backup file **before** the first keystroke.
- Record node count, node names, and publish state at load; assert all
  three unchanged before save.
- Touch only the named nodes. Do not open others "to check".
- Never use the publish toggle. Never use the canvas `+`. Never drag.
- If the canvas differs from the brief in any way — extra node, different
  name, Draft instead of Published — **stop without saving and report**.
  Reporting a mismatch is a successful outcome; guessing is not.
- After save, reopen each edited node and verify by read-back (§7). A save
  toast is not verification.

---

## 9. Read-only checks (e.g. SMS compliance settings)

For a "look but don't change" step such as *does GHL auto-append opt-out
language to the first outbound message*:

- Navigate to the sub-account's phone/SMS settings
  (`Settings → Phone Numbers / Business Profile → Compliance`, and
  `Settings → Business Profile` for A2P/10DLC registration details).
- Capture the relevant toggle or copy, read its label and state, and
  **leave immediately**. Do not click the toggle to "see what it does".
- Report the setting's literal label and state, plus where you found it,
  so the finding is auditable. If the setting does not exist in this GHL
  version, report that rather than inferring behavior.

---

## 10. Minimal call sequence (reference)

```
health/session check                                    [bg]
display bounds -> screen_w, screen_h                    [bg]
focus browser window                                    [fg]
navigate(workflow URL with /v2/location/{loc}/)         [fg]
loop: screenshot until header+nodes render (<=60s)      [bg]
screenshot -> record publish state, node names/count    [bg]
calibrate scale factor (trap A)                         [bg+fg]
--- per node ---
locate node by name text                                [bg]
click node centre (scaled)                              [fg]
screenshot -> assert panel title == node name           [bg]
read current body -> append to backup file              [bg]
click body field                                        [fg]
screenshot -> assert focus                              [bg]
Cmd+A, Delete                                           [bg]
screenshot -> assert field empty                        [bg]
type line 1                                             [bg]
screenshot -> assert text landed in field               [bg]
newline                                                 [bg]
type line 2                                             [bg]
click neutral chrome to blur                            [fg]
read back as TEXT -> byte diff vs intended (§7)         [bg]
click panel Save                                        [fg]
screenshot -> assert panel closed/saved                 [bg]
--- after all nodes ---
assert node count + names unchanged                     [bg]
click workflow Save                                     [fg]
screenshot -> assert toast + still Published            [bg]
reopen each node, read back, byte-diff again (§7)       [fg/bg]
close browser window                                    [fg]
```

---

## 11. Where this cannot run

This skill requires a machine that hosts CuaDriver and a browser under
screen control. It **cannot** run in an Anthropic cloud session
(`environment_kind: anthropic_cloud`) — that is a Linux container with no
`launchctl`, no CuaDriver, no display, and no path to the user's browser.
Detect it early:

```bash
uname -s                       # Linux => not the Mac
which launchctl || echo "no launchctl => not macOS"
```

And note the API fallback does not exist either: GHL's public API exposes
only `GET /workflows/` (list). There is no operation that reads or writes a
workflow action's body, so there is no non-GUI path to this edit. If you
are in a cloud session, say so and hand the runbook to a session running on
the Mac — do not simulate the result.
