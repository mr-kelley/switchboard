---
title: Switchboard Daemon Input Contract — Handoff (request for specification)
maintained_by: lab-git-manager
from: lab-git-manager (Bosun's Mate builder)
for: switchboard-developer (Switchboard daemon owner)
status: draft — request for specification, with a straw-man to react to
domain_tags: [lab-git-manager, coordination, bosun-mate, switchboard, daemon, inject, pki-tls, m7]
disclosure: internal
updated: 2026-08-03
---

# Switchboard Daemon Input Contract — Handoff

**For:** switchboard-developer (owns the Switchboard daemon)
**From:** lab-git-manager (builds/operates the Bosun's Mate orchestrator)
**Purpose:** pin the **machine input contract** of the Switchboard daemon — the exact call the Bosun's
Mate makes to **inject a ticket's work into a role's live session**, and the synchronous answer it gets
back — so I can replace my `SwitchboardRunner` stub with a real client. The desktop app already injects
successfully; what I need is that same capability **specified as a machine contract**, plus the handful
of semantics a deterministic orchestrator must pin that a human at the desktop app absorbs by eye.

> **The one framing that drives every ask below:** a human using the desktop app tolerates ambiguity —
> they *see* the session, judge whether it's busy, and retry by hand. The Mate is a **deterministic,
> fail-closed** orchestrator (invariant 1): it cannot guess. So the specifics I need pinned are exactly
> the ones a human absorbs implicitly — *accepted vs rejected*, *busy vs idle*, *delivered vs not*.

## 1. The exact seam I'm building against
The Mate dispatches a role through a single narrow interface (already in the tree,
`tools/bosun-mate/switchboard_runner.py`). Switchboard is **inject-only + async-via-ticket**, so this is
**not** the synchronous `claude -p` model — `dispatch` does **not** return the role's terminal outcome:

```python
# The inject transport I need you to define. Today it's a stub that fail-closes.
Inject = Callable[[role: str, context: str], Accepted]   # returns: was the inject accepted?

class SwitchboardRunner(Runner):
    def dispatch(self, role, context):
        # inject accepted -> run is PENDING; terminal outcome arrives later, via the TICKET
        # inject rejected/failed -> fail-closed (the Mate could not hand the work off)
```

The **terminal result** (done / needs_input / blocked / route) comes back when the role **writes a
`===BOSUN-TICKET-UPDATE===` block into the ticket**, which the Mate reads on its next forge poll. That
path is already built and tested — it is **not yours**. Your surface ends at *"the context was delivered
into the right role's live session (or cleanly refused)."*

## 2. What I need specified (the ask)
Six things. Each is grounded in a concrete decision the built code has to make.

### A. Addressing — which daemon is "the role's daemon"?
The daemon is **per-role, per-host**. Before I can inject, I must resolve **role → daemon endpoint**
(host, port) **and the identity I should expect that endpoint to present** (so I can verify I'm about to
inject into the *right* role's session — see §D). Specify:
- The addressing model: **static config the operator provisions** (like the forge coordinates), a
  discovery mechanism, or something else.
- What uniquely names a daemon/role at the transport layer (the cert subject/SAN I match against).

### B. The inject call — request and synchronous response
The request shape (target + payload) and, critically, the **synchronous response taxonomy**. I need to
distinguish, deterministically:
- **accepted** — the context is now delivered into the role's live session; I will learn the outcome via
  the ticket. → the Mate advances the ticket to `dispatched`.
- **rejected** — *not* delivered, with a **reason** I can branch on. At minimum I need to tell apart:
  **busy** (session mid-run — a normal, retryable state; see §C), **not-ready** (session starting /
  unhealthy), **auth** (I'm not authorized), **unknown-role/target-mismatch** (fail-closed, never retry
  blindly). → the Mate does *not* mark dispatched; it fail-closes or retries per reason.

### C. Session readiness & R8 serialization — busy vs idle
The Mate enforces **one active run per role** (R8). The persistent one-session-per-role model is *why*
that falls out naturally — but I need the daemon's defined behavior when an inject arrives **while the
session is mid-run**. Pick one and specify it (my preference noted):
- **(preferred) reject-if-busy** — the daemon refuses with `busy`; the Mate holds the ticket and retries
  next poll. Cleanest: the daemon is the single source of truth for "is this role free," and I never have
  to guess.
- **queue** — the daemon accepts and runs it after the current one. Then I need to know queue depth /
  whether a second accept can silently stack work.
- **interleave** — unacceptable (two concurrent runs in one session). Please confirm this cannot happen.

### D. Delivery guarantee & idempotency — the double-run hazard
If my inject call times out mid-flight, I must know whether it was delivered. A redelivered inject = a
**double-run of the role** = duplicated work and a corrupted ticket. Specify:
- The delivery semantics (at-least-once / at-most-once / exactly-once).
- Ideally, accept an Mate-supplied **`inject_id`** the daemon **dedupes** on, so a retried call after a
  network blip is idempotent. (I can derive a stable id per dispatch; I just need you to honor it.)

This one is load-bearing for how I **order the forge transition against the inject**: with a reliable
synchronous accept/reject (§B) + dedupe (§D), I inject first and mark `dispatched` **only on accepted** —
no ticket ever stuck in `dispatched` with no run behind it.

### E. Failure modes — every failure must be a clean synchronous signal
Daemon down, role host offline, TLS handshake failure, timeout — each must surface as a **distinguishable,
non-hanging** signal so `dispatch` fail-closes to `blocked` (never blocks the poll loop). Specify the
timeout behavior and the error surface (status codes / typed errors).

### F. The untrusted-content boundary
**Ticket content is untrusted input flowing into a live, privileged role session.** State the contract:
- Does the daemon deliver `context` **verbatim** into the session, or does it frame/escape it? Where is
  the escaping boundary — **mine** (I sanitize before sending) or **yours** (the daemon frames safely)?
- Any constraints on the payload (size cap, encoding, forbidden control sequences).

I will treat the payload as hostile on my side regardless; I need to know what the daemon guarantees so
we don't both assume the other did it.

## 3. Straw-man to react to (replace freely — the wire is yours)
A concrete shape so we have something to ratify or edit, mirroring how the desktop app already injects:

**Request** — Mate → the role's daemon, over **mutual TLS**:
```json
{ "inject_id": "<stable per-dispatch id, for dedupe>",
  "role": "house-app-developer",
  "source": "bosun-mate",
  "context": "<the ticket thread + a 'report your outcome as a BOSUN-TICKET-UPDATE block on ticket #N' instruction>" }
```
**Response** — synchronous:
```json
{ "inject_id": "<echo>",
  "status": "accepted",
  "reason": null }              // on reject: "busy" | "not_ready" | "auth" | "unknown_role"
```
- `accepted` ⇒ delivered into the live session; outcome will arrive via the ticket. No result here.
- `status`/`reason` is the §B taxonomy; `busy` is the §C serialization signal; `inject_id` is the §D
  dedupe key.

## 4. Explicitly out of scope — please just **confirm** these
So we don't over-build the daemon:
1. **The daemon does NOT return the role's result.** It is inject-only; the outcome is a **ticket
   update** the role writes, which the Mate reads on poll. (Confirm.)
2. **The role — not the daemon — writes the `BOSUN-TICKET-UPDATE` block.** The *instruction to report
   back that way* rides inside the `context` I compose; the daemon is a dumb, authenticated pipe for
   text. (Confirm — this keeps the daemon ignorant of tickets/forge/roles, which is correct.)
3. **The daemon makes no routing / disclosure / role-registry decisions.** Those are the Mate's + the
   result-contract's (`coordination-result-contract.md`). (Confirm.)

## 5. Security constraints the contract MUST satisfy (normative)
- **Per-role authentication — the Mate MUST NEVER inject into the wrong role's session.** Mutual TLS: the
  daemon presents an identity I verify against the intended target (§A/§D) *before* sending context; the
  daemon authorizes only the `bosun-mate` client identity. This is the load-bearing safety property.
- **PKI/TLS, now — skip the ssh-key path.** Per the operator, Switchboard's legacy ssh-key transport is
  retired for this integration; the transport is **PKI/TLS mirroring the forge Root CA R1 model**. Please
  design the daemon's auth against that CA (coordinate the trust chain with the operator).
- **Internal-only.** The inject channel never crosses the lab boundary; a daemon is reachable only on the
  internal network.
- **The Mate's client private key is held on the Mate's host, provisioned operator-side — it never enters
  the repo, logs, or any chat.** Design the enrollment so the key is generated/held on the Mate's host,
  not transported through anything else. (Same discipline as forge credentials.)

## 6. What I build the moment this lands
`SwitchboardRunner` replacing the stub, to this contract, with **stub tests** for every response branch
(accepted / each reject reason / timeout / auth failure) — the live Switchboard smoke is **deferred to
close-out** (needs a running daemon + the Mate's provisioned cert), exactly as `ForgejoForge`'s live
smoke was deferred. No orchestrator rebuild: it drops in behind the seam in §1 (invariant 2).

## 7. Dependencies & relationships (context, not asks)
- **Gates the driving half of Sprint 03** (poll → claim → **inject** → observe → act). The outcome half
  (parser + decide + fence + execute) is **already built + merged**, 86 unit tests green.
- **Parallel, lab-cto's:** the result-contract is **firm** (`coordination-result-contract.md`); the
  routable-role **allowlist artifact** is their remaining build task. Neither is yours; noted so the
  whole path is visible.
- **The PKI/TLS upgrade you're driving with the operator is the transport for §5** — this handoff assumes
  it, and is the concrete consumer that makes it top priority.

## 8. Next
Operator delivers this to switchboard-developer → you specify the daemon input contract (or ratify/edit
the §3 straw-man) + confirm the §4 out-of-scope items → lab-git-manager builds `SwitchboardRunner` against
it and reports the acceptance behaviors back (unblocks the Sprint 03 driving loop).
