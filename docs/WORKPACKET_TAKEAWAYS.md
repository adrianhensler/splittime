# Take-aways for the Workpacket project

Written 2026-10-12 after applying the Workpacket idea to SplitTime's planning.
These are observations from one planning session by one worker. Nothing here
was measured, and no packet has yet been resumed by a second worker. Treat them
as candidates, not findings.

## What happened here, in Workpacket terms

1. A concept PDF was reviewed with no access to its sources. Several review
   points were explicitly guesses.
2. Research found the two upstream projects and replaced most guesses with
   evidence.
3. Decisions were recorded, split into owner-made and worker-defaulted.
4. The owner's next message overturned two of the worker's defaults (no Docker;
   the pi agent).
5. The method was adopted afterwards: one retrospective packet, six forward
   packets.

## Observations

### 1. A reference without a locator is not context

The PDF named its research basis as "LapScope" and "Forza-6-telemetry" with no
URL or version. Nothing could be checked until a search found them. Once
pinned to a commit, they became usable evidence. *Candidate rule:* a context
reference is incomplete without a locator and a version.

### 2. Marking guesses as guesses paid off quickly

The first review said "I believe" about free-roam behaviour and packet size and
listed what was unverified. The research then confirmed some and corrected
others, and nothing had to be retracted. This is the cheapest part of the
method and the one that worked best. It needs no tooling.

### 3. "Proceed on a recorded assumption" is missing from the flowchart

The flowchart offers: resolve the missing piece, or record it and park. In
practice the useful move was a third: pick a default, mark it as the worker's,
carry on. Seven open questions were handled this way and none blocked work.
*Candidate change:* add the branch, with the assumption stored as an unproven
claim.

### 4. Overturned assumptions need a dependency trail

When "no Docker" and "pi agent" were reversed, finding every document that
relied on them was a manual search across six files. The flowchart's "mark
affected claims stale" step assumes the dependents are known. Here they were
not. *Candidate rule:* a claim or decision lists what it rests on, so reversal
gives a list to revisit. This looks like the highest-value addition.

### 5. Who decided is worth one word

Tagging each decision Accepted (owner) or Proposed (worker default) is a tiny
form of keeping generation and acceptance apart. It stopped worker defaults
from reading as settled, and made the owner's review a short list.

### 6. Git already does the container's job at this scale

The v0.1 spec's digests, signatures and attestations added nothing for one
owner and one repo: git gives content addressing, history and authorship. A
markdown file per packet was enough. *Candidate:* define a "git-native
profile" as the default tier and keep the signed container for packets that
leave a repository.

### 7. Retrospective packets lose evidence

WP-000 was written after the work. Command output was gone, so its evidence is
"this file at this commit" and "re-run this command". That turned out to be
adequate, which suggests re-runnable evidence should be preferred over
captured output. It also shows packets must be opened before work, or evidence
capture has to cost nothing.

### 8. Independent verification was the part that did not happen

The same worker wrote and checked everything. The only independent check was a
mechanical link test. WP-000 says "Verifier: none" instead of claiming
verification. Being able to say that plainly is useful, but the method's
central promise is untested here.

### 9. The handoff must be readable by the next worker

The original spec was a PDF. This machine had no PDF tools and a library had to
be installed to read it. "The packet is the handoff" fails if the packet or its
context is in a format the next worker cannot open. *Candidate rule:* packets
and required context are plain text.

### 10. Agent neutrality was cheap

One `AGENTS.md` as the canonical rules, a one-line pointer file for tools that
look elsewhere, and no reliance on any tool's permission system. An existing
tool's planning step (state the outcome, ask the owner about missing authority,
get approval) maps directly onto commissioning a packet; the packet only has to
record the result.

### 11. Ceremony risk is real

Seven packets for a two-person hobby project may be too many. Rule 8 in
`docs/WORKPACKETS.md` ("a packet that takes longer to write than the work
should not exist") is a guess at a threshold.

## A ready-made experiment

The workpacket repo's next step is: one worker starts a real task, another
resumes from the packet alone, a reviewer checks the result including a
deliberately unsupported claim. SplitTime's WP-001 and WP-002 fit:

- Worker A does WP-001 and stops part-way with a checkpoint.
- Worker B, a different agent with no shared conversation, finishes it from
  the packet and repo alone.
- A reviewer checks the claims. WP-000 already contains two claims marked
  `asserted` (C9, C10) and one resting on second-hand evidence (C7), which a
  good reviewer should flag.
- Compare against doing WP-002 with ordinary notes and git history.

Measure: time for worker B to become productive, questions B had to ask, and
whether the reviewer caught the weak claims.

---

# Addendum: after the first day of building

Written 2026-10-12 by the same worker (Opus 5.5), after the baseline import
(PR #4, merged), the corner module (PR #5) and two cross-reviews with GPT-6.
Same caution as above, and one more: this is a worker assessing a process it
took part in. Nothing was measured and there was no control.

## Verdict

**The principles earned their keep. The packet files mostly did not.**

## What visibly paid off

| Practice | What happened |
|---|---|
| Label self-checks as self-checks | GPT-6's review of PR #4 separated what it re-ran itself (blob comparison, CI) from what stayed "author self-evidence" (the simulator run). Without the label that line would not have been drawn. |
| List what was not tested | GPT-6's prototype PR said no browser test had been run. That sentence sent the reviewer straight to a browser, where the page turned out not to render at all (one missing parenthesis). The disclosed gap was the most valuable line in the PR. |
| Mark claims `asserted` | The corner direction rule was marked unverified. The reviewer required that to show in the output, which became `direction_verified: false` in the data. An honest unknown in the record turned into an honest unknown in the product. |
| Re-runnable evidence | The import check is a script. The reviewer ran it from its own clone and got the same 111 of 111. A pasted result could not have been checked. |
| Worker is not verifier | Every review found something real: an exposed port and two missing licences in the baseline; a non-rendering page and a ranking bug in the prototype; three contract refinements before the corner code was reviewed at all. |
| Contract before code | Not from Workpacket, from GPT-6's plan. One page reviewed before integration bought three design corrections for the price of a rename. |

## What did not work

1. **Two records for one piece of work.** WP-001 and PR #4's description carry
   the same claims table. The reviewer read the PR. The packet file was the
   copy nobody consulted. Same for WP-005 and PR #5.
2. **The other worker did not use packets.** GPT-6 coordinated through issues,
   a coordination document and PR descriptions. WP-002 is still an untouched
   draft while PR #6 implements it. A method one of two workers skips is not
   the handoff medium; GitHub was.
3. **Nothing was ever admitted.** The owner has not accepted any packet. The
   baseline was merged by the integrator and is being built on. Merge became
   acceptance in practice. The acceptor role, the method's last safeguard,
   has not been exercised once.
4. **Status in documents rotted immediately.** The owner asked twice which
   agent was ahead. The status table said "in review" after the merge. The
   pull request list was right; the document was wrong.
5. **No rule said "look before you write".** The worker wrote and committed
   coordination documents without fetching, and had to discard them because
   the other agent had already pushed its own. The collective's "synchronise
   before reading state" rule was missing here.
6. **It did not catch careless errors.** A fabricated commit hash went into a
   PR comment and a stray file was created during planning. Both were caught
   by rereading, not by the method.

## What this suggests for Workpacket

- **Keep as the core:** claims with a basis; self-check versus independent
  check; explicit unknowns; re-runnable evidence; worker is not verifier is not
  acceptor. These are cheap and each produced a visible result within a day.
- **The packet should be a view of where the work already lives**, not a second
  document. On GitHub that is the pull request: intent and acceptance criteria
  before, claims and unknowns in the description, review as verification. A
  Workpacket profile that says how to write a PR would have been followed by
  both agents. A separate file was followed by one.
- **Acceptance needs a trigger or it does not happen.** Tie it to something
  that already occurs (a merge by the owner, a release, a deploy), or have
  merged-but-unaccepted work show up somewhere the owner looks.
- **Unknowns should flow into outputs.** The most useful effect seen was an
  unverified claim becoming an explicit field in the result. That is a design
  rule for the software being built, not only for the record of building it.
- **Add "fetch first" to the participation rules.**

## Open question

All of the useful effects above could also be credited to two careful
reviewers using ordinary pull requests. What Workpacket added on top was
vocabulary (self-check, asserted, unknown, admitted) that both agents then
used in reviews. Whether that vocabulary changed behaviour, or only described
behaviour that would have happened anyway, this session cannot tell. The
experiment proposed above would. It has still not been run: no worker has yet
resumed another's unfinished packet from the file alone.
