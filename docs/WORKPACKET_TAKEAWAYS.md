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
