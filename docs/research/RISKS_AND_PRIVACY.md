# Verifiable records, adoption risks and privacy limits

Status: research and analysis note. Sections 1 to 3 are our own reasoning, not findings from a study; treat them as arguments to be tested. Section 4 summarises the law at a high level and is **not legal advice**. Fact numbers refer to `PROBLEM_EVIDENCE.md`.

## 1. Independently verifiable records versus normal audit logs

The question judges will ask is "why not an audit log in a database?". The answer depends on who is allowed to doubt the record.

| Question                                                     | Ordinary audit log                                                    | Append-only log with internal signing                     | Digests anchored on Avalanche (BonaBlock)                                    |
| ------------------------------------------------------------ | --------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Who can rewrite history?                                     | Whoever administers the database                                      | Whoever holds the signing key                             | Nobody acting alone, including the BonaBlock operator                        |
| Can an outsider detect a rewrite?                            | No. They see only what the operator shows them                        | Only if they kept their own earlier copy                  | Yes. They compare evidence and case history with the public ledger           |
| Does checking require the operator's cooperation?            | Yes                                                                   | Yes                                                       | No. BonaBlock Verify reads the ledger directly                               |
| Can the operator show different histories to different people? | Yes                                                                 | Yes, unless copies are compared                           | Not for anything anchored: there is one public history                       |
| Who enforces "the claimant cannot approve"?                  | Application code, changeable by the operator                          | Application code                                          | The BonaRegistry contract, whose rules are public                            |
| Does it prove the record was true when written?              | No                                                                    | No                                                        | **No**                                                                       |
| Cost and complexity                                          | Lowest                                                                | Low                                                       | Higher: transactions, keys, a relayer                                        |

**When an ordinary log is enough.** When everyone who relies on the record trusts whoever runs it. Most internal business systems are in this position, and for them a blockchain adds cost and nothing else.

**Why this case is different.** Three parties rely on the record and do not fully trust one another: a community, a school and a department. Parliament's committee has said publicly that it finds the department's infrastructure data hard to accept (F2). In that setting a log run by any one of the parties, or by us, does not settle a disagreement, because the other parties cannot check it.

**What the ledger does not do.** It records that a statement was made, by which role, when, and that nothing has changed since. It cannot tell whether a photograph shows the right toilet. The design answers that with a second person in a separate role, not with cryptography. Say "tamper-evident", never "proof of truth".

**A weaker alternative we should acknowledge.** Publishing a signed daily digest of the log in a newspaper or on several independent websites gives some of the same property without a blockchain. It is cheaper. It does not give contract-enforced roles, per-event confirmation within seconds, or a standard public tool for checking. If a judge raises it, agree that it is a legitimate design and say why we chose otherwise.

## 2. Institutional adoption risks

None of these is resolved. Each is a real-world blocker, summarised for the pitch in `docs/demo/PITCH_BRIEF.md`, section 8.

| Risk                                                                                             | Why it matters                                                                                                    | What would reduce it                                                                                         | Status         |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------- |
| A school or department declines because disputes are visible                                     | No participating school means no product                                                                          | Start with a willing principal and governing body; show that a verified repair protects the school           | Untested (H6)  |
| No mandate: a district official may not be permitted to act as reviewer in an outside system     | The reviewer role is the core of the design                                                                       | Let the role be held by a governing body representative or an education organisation                         | Untested (H4)  |
| The research we cite warns against adding platforms outside planning and budgeting (F23, F24)    | A standalone tool can become one more channel nobody acts on                                                      | Position as a verification layer; export records in a form existing systems and auditors can take in         | Design intent  |
| Formal approval is needed to work in public schools                                              | A pilot without provincial approval could be stopped                                                              | Apply for provincial approval and university ethics clearance before any pilot                               | Not started    |
| A dispute has no consequence                                                                     | Visibility without follow-up may discourage reporters (F21)                                                       | Agree an escalation path with the district before a pilot; publish response times                            | Not designed   |
| Digital exclusion                                                                                | Communities with the worst infrastructure may have the least data and fewest smartphones                          | Messaging or assisted intake; reports captured by a trusted adult                                            | Not built      |
| Dependence on a small team                                                                       | The study notes that donor-funded initiatives often end when funding does                                         | Open contract and open verifier, so records stay checkable if the application stops                          | Partly by design |
| Operating cost with no payer                                                                     | Hosting, the AI service and transaction fees continue after the hackathon                                         | See `PITCH_BRIEF.md`, section 6                                                                              | Open           |

## 3. Reviewer risks

The reviewer is the single most important and most fragile part of the design.

| Risk                                                   | Description                                                                                                         | Mitigation available now                                                             | Mitigation not built                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Limited independence                                   | A district official is employed by the same department that is responsible for the repair                           | We describe the role accurately: "not the person who claimed completion"             | Reviewers from outside the department; two-reviewer rule          |
| Collusion                                              | An administrator and a reviewer agree to verify incomplete work                                                     | Both act under a public, permanent, attributable record; the community can reopen    | Random second review; community counter-evidence after verification |
| Rubber-stamping                                        | A reviewer verifies without visiting                                                                                | Verification requires reviewer evidence                                              | Location and time checks on reviewer photographs                  |
| Reviewer unavailable                                   | Claims wait indefinitely for a decision                                                                             | Time in "Repair claimed" is visible to everyone                                  | Deadline with automatic escalation                                |
| Retaliation against a reviewer or reporter             | Someone is pressured for a dispute or a report                                                                      | Reporters are pseudonymous in public views                                           | Organisational backing for reviewers; a reporting route for pressure |
| Compromised reviewer account or key                    | Someone else verifies in the reviewer's name                                                                        | Role can be revoked by the registry owner                                            | Hardware-backed keys; multi-party control of role changes         |
| Who appoints reviewers                                 | Whoever grants the reviewer role can undermine independence                                                         | Role grants are on-chain events, so appointments are visible                         | A governance process for appointments                             |
| Unfair dispute                                         | A reviewer disputes work that was in fact completed                                                                 | The administrator can submit a new claim with further evidence                       | An appeal to a second reviewer                                    |

Honest summary for the pitch: BonaBlock guarantees separation between claimant and confirmer and makes both accountable in public. It does not guarantee that the confirmer is independent of the institution, and it does not prevent collusion.

## 4. POPIA and privacy limitations

The Protection of Personal Information Act 4 of 2013 applies to BonaBlock for Schools as soon as it handles information about identifiable people. This section lists what the design does about it and where it falls short. A lawyer has not reviewed any of this.

### 4.1 What the design does

| Concern                                  | Design response                                                                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A public ledger cannot be erased         | No personal information goes on chain. The ledger holds case identifiers, state codes, role markers, timestamps and digests of evidence files.          |
| Correction and deletion requests         | Names, contact details, report text and photographs are held in ordinary storage, where they can be corrected or deleted.                               |
| Digests that could be reversed           | No unsalted digest of a short or guessable value, such as a phone number, name or email address, is written to the ledger.                              |
| Reporter exposure                        | Public views show a pseudonym. Real identity is visible only to the school administrator and reviewer.                                                  |
| Children                                 | Reporter accounts are for adults. Evidence guidance says not to photograph learners. The Act restricts processing children's information [S18] [S19].   |
| Minimal collection                       | A report needs a facility, a description and a photograph. It does not need the reporter's identity number, address or location history.                |

### 4.2 Limitations we must state

1. **Photographs can contain people.** A learner may appear in a photograph despite the guidance. The build has no automatic detection or blurring. A human must review evidence before it is shown publicly, and the build does not yet enforce that.
2. **A deleted photograph leaves its digest.** The digest reveals nothing by itself, but anyone holding a copy of the photograph can prove it was once submitted. Whether a regulator would treat that as acceptable has not been tested.
3. **Wallet addresses and transaction patterns.** A reviewer who signs with a personal key has a public address that could be linked to them. Role-level keys or a relayer reduce this; they also reduce attribution. This is a trade-off, not a solved problem.
4. **Pseudonyms are not anonymity.** In a small school community, the timing and content of a report may identify the reporter. The administrator can always see who reported.
5. **Report text can name people.** A reporter may write a staff member's name in a description. That is personal information about a third party and could be defamatory. The build has no moderation step.
6. **Third-party processors.** Report text and images sent to an AI provider, and data held by a cloud host, are processed by other organisations and may leave South Africa. The Act places conditions on cross-border transfers. We have not assessed the provider terms against those conditions.
7. **No formal compliance work has been done.** There is no privacy notice, no retention schedule, no named information officer, no breach procedure and no impact assessment. These are required before any real deployment, not before a hackathon demonstration with fictional data.
8. **Special care for schools.** Information about children gets heightened protection, and consent from a competent person or another lawful ground is needed to process it [S18] [S19]. The safest position, which we take, is to design so that children's personal information is not collected at all.

### 4.3 What to say if asked

"Nothing personal is written to Avalanche: only fingerprints and roles. Everything personal stays in ordinary storage where it can be corrected or deleted. Our demo uses fictional data. We have not done the formal compliance work a real deployment needs, and we would not run a pilot without it."

### 4.4 Rules for engineering

- Never write report text, names, email addresses, phone numbers or images to the ledger or to transaction input data.
- Never write an unsalted digest of personal information to the ledger.
- Keep evidence files in private storage; serve them through access checks.
- Send the AI provider the minimum: description text and, only if needed, the image. Do not send reporter identity.
- Keep the "Demo data" label on all fictional records.

## 5. Sources added in this file

| ID    | Source                                                                                                                                                                                                                                                                                              | Date        |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| [S18] | Information Regulator (South Africa). [POPIA, Chapter 3, Part C: Processing of personal information of children](https://inforegulator.org.za/knowledge-base/category/popia/chapter-3-conditions-for-lawful-processing/part-c-processing-of-personal-information-of-children/) (sections 34 and 35)   | Undated     |
| [S19] | Information Regulator (South Africa). [Guidance Note on Processing of Personal Information of Children](https://lawlibrary.org.za/akn/za/doc/guidance-note/inforegsa/2021-06-01/guidance-note-on-processing-of-personal-information-of-children/eng@2021-06-01/source)                                | 1 Jun 2021  |

**Verification level.** For [S18] and [S19] we confirmed only the general rule from search summaries: processing a child's personal information is prohibited unless an exception applies, such as prior consent from a competent person. The pages themselves were not read in full. The statements in 4.2 about correction, deletion, cross-border transfer and required compliance measures describe the Act in general terms from the team's background knowledge and carry no section references for that reason. Confirm against the Act before relying on them.
