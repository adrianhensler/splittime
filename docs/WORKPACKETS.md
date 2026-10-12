# How work is done here: Workpackets

SplitTime uses a light, git-native form of the owner's Workpacket method
(`adrianhensler/workpacket`). It works with any coding agent, or a person,
because everything needed is in plain files in this repo.

A **Workpacket** is the durable record of one bounded piece of work: what was
wanted, what the worker was allowed to do, what they claim, the evidence, what
is still unknown, and whether it was verified and accepted. The packet is the
handoff. A new worker should be able to continue from the packet alone, without
the previous worker's conversation.

## When a packet is needed

| Work | Packet? |
|---|---|
| A milestone, or any task spanning sessions or workers | Yes |
| Anything whose result someone else must trust without redoing it | Yes |
| A typo, a one-line fix, answering a question | No. Just do it and commit. |

## Where and what

Packets are markdown files in [`work/`](../work/), one per file, named
`WP-NNN-short-name.md`. Start from [`work/TEMPLATE.md`](../work/TEMPLATE.md).
Git supplies history, authorship and content addressing, so packets carry no
signatures or digests of their own.

## Three roles, kept apart

| Role | Does | May be |
|---|---|---|
| **Worker** | The work. Records claims, evidence, unknowns and a checkpoint. | Any agent or person |
| **Verifier** | Checks the claims against the acceptance criteria. | A different session, agent or person from the worker |
| **Acceptor** | Decides the result is accepted. | The owner only |

A worker never verifies or accepts their own packet. If no independent verifier
was available, the packet says so; it does not say "verified".

## States

`draft` → `in-progress` → `complete` → `admitted`

- **draft**: outcome, authority and acceptance criteria are being defined.
- **in-progress**: a worker has it.
- **complete**: the worker declares it finished. Claims and evidence are
  filled in. Not yet accepted.
- **admitted**: the owner accepted it. Later work may rely on it.
- **parked**: waiting on something outside the worker's authority. Says what.
- **failed**: could not be done as specified. Says why and what was learned.

## Rules

1. **Claims need a basis.** Every claim points to evidence, or is marked
   `asserted`. Prefer evidence that can be re-run (a command, a test, a commit)
   over pasted output.
2. **Say what is missing.** Known, unknown and unproven are listed separately.
   Never turn unresolved work into success by leaving it out.
3. **Always leave a checkpoint.** Before stopping for any reason, write the
   next action and anything a replacement worker needs.
4. **Stay inside the authority.** If the packet does not grant it, do not do
   it. Record the need and park or ask.
5. **Proceeding on an assumption is allowed and recorded.** Write the
   assumption as an unproven claim so it can be found if it turns out wrong.
6. **Children do not prove the parent.** A packet split into child packets is
   still verified as a whole.
7. **Decisions go to the ADR, not the packet.** Mark who decided: the owner
   (Accepted) or a worker's default (Proposed).
8. **Keep it small.** A packet that takes longer to write than the work it
   records should not exist.

## Working a packet

1. Read `AGENTS.md`, then the packet, then only the context it references.
2. Set status `in-progress` and name yourself as worker.
3. Do the work within authority and limits. Commit as you go.
4. Fill in claims, evidence, known/unknown/unproven, unresolved, checkpoint.
5. Set status `complete`. Stop. Verification and acceptance are for others.
