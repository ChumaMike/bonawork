# Existing systems and where BonaBlock fits

Status: research note. Sources were read on 16 November 2026. Source IDs continue from `PROBLEM_EVIDENCE.md`.

**Framing rule for the pitch.** None of these is a competitor we want to replace. They are government systems of record and oversight bodies. BonaBlock is positioned as a verification layer that sits beside them. Say "complements", not "beats".

## 1. Summary comparison

"Not documented" means the public sources we read are silent. It does not mean the feature is absent. See section 4.

| System                                          | Who runs it                               | What it covers                                            | Who puts data in                          | Who confirms a fix is done                           | Can an outsider check the record was not changed?  |
| ----------------------------------------------- | ----------------------------------------- | --------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------- | -------------------------------------------------- |
| **Safe Schools App**                            | Department of Basic Education             | Pit latrines in public schools                            | Public, parents, teachers                 | Not documented                                       | Not documented                                     |
| **Education Facilities Management System**      | Department and provincial departments     | Property register, active projects, condition assessments | Provincial officials                      | Not documented                                       | Not documented                                     |
| **School administration system, safety module** | Schools, districts, provinces             | Safety incidents (violence, security)                     | Schools                                   | Schools, districts and provinces                     | Not documented                                     |
| **Western Cape Safe Schools Call Centre**       | Western Cape Education Department         | Safety incidents in one province                          | Callers                                   | Not documented                                       | Not documented                                     |
| **Parliamentary oversight**                     | Portfolio Committee on Basic Education    | Whole sector                                              | Department reports and member site visits | Members, on occasional visits                        | Meeting records are public                         |
| **Auditor-General audits**                      | Auditor-General of South Africa           | A sample of projects each year                            | Auditors                                  | Auditors, after the fact                             | Reports are public                                 |
| **Civil society monitoring**                    | Equal Education, SECTION27 and others     | Selected schools and campaigns                            | Members, researchers                      | The organisation itself                              | Reports are public                                 |
| **BonaBlock for Schools (proposed)**                    | Independent of the party doing the repair | Any facility fault at a participating school              | Community reporters                       | A reviewer who is not the person claiming completion | Yes, by design: digests anchored on Avalanche |

## 2. What each system is, from the sources

### 2.1 Safe Schools App

- Launched 9 December 2024 by Minister Siviwe Gwarube. Developed and donated by Vodacom South Africa [S12] [S13].
- Purpose in the department's words: "a tool aimed at promoting accountability and transparency in addressing pit latrines in public schools" [S12].
- It lets communities report remaining pit latrines; the Minister urged "every parent, every teacher and concerned citizen" to report [S13].
- Short term: real-time monitoring with a heat map. Medium term: crowdsourcing sanitation data. Long term: the department says it will extend the app to monitor other programmes, including infrastructure projects [S12]. That extension is a stated plan, not a current feature.
- Criticism on record: the political party GOOD called it "a fresh coat of paint" on a "broken-down car", argued it duplicates existing systems, and noted that the affected communities have limited smartphone and data access [S14]. This is a party political statement; cite it as such.

**Name clash to avoid.** "Safe Schools" also names a Western Cape call centre and a protocol between the department and the police [S2] [S17]. These are unrelated to the app.

### 2.2 Education Facilities Management System

- Initiated by the Eastern Cape Department of Education and rolled out nationally. The department describes it as "a web-based property register and programme management system for infrastructure" [S15].
- Includes a mobile tool for capturing school building condition data [S15].
- The department told Parliament in March 2026 that its infrastructure data is drawn from this system, and that "strengthening" its data is part of the department's plan [S3].
- Provinces are required to carry out condition assessments, five-yearly, and have been asked to load results onto the system [S16].
- The 13% poor or very poor figure that Parliament found hard to accept [S1] comes from this data pipeline [S3]. This is the single strongest link between an existing system and our problem statement.

### 2.3 School administration system, safety module

- A July 2026 parliamentary reply says schools can record safety incidents through the school safety functionality of the South African School Administration and Management System [S17].
- The same reply says responsibility for "capturing, following up and verifying school-level incident information rests primarily with schools, districts and Provincial Education Departments" [S17].
- It covers safety and security incidents. The reply does not mention infrastructure faults.

### 2.4 Oversight bodies

- The Portfolio Committee visits schools and compares what it sees with departmental reports [S1]. It asked for school-by-school project lists in March 2026 [S1] [S3].
- The Auditor-General visits a sample of projects each year: 137 across all sectors in 2022-23 [S5], and 22 school projects in the figures presented in October 2026 [S4].
- Both are authoritative and public. Both are periodic and sample-based.

## 3. BonaBlock's proposed independent-verification layer

What we propose to add. Nothing below exists in production; it describes the hackathon build.

| Property                 | Design                                                                                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Separation of roles      | The administrator who claims completion can never mark the case verified. Only a reviewer who is not attached to that school can verify or dispute. |
| Evidence integrity       | Every photo is hashed (SHA-256) on receipt. The digest is anchored on Avalanche by the BonaRegistry contract. The photo itself stays off chain.                             |
| Tamper-evident lifecycle | Each status change is an on-chain event signed by the role that made it. History is append-only; a dispute is a new event, not an edit.             |
| Independent checking     | BonaBlock Verify, a standalone verifier, reads the chain directly, not through the BonaBlock app, recomputes digests and compares.                                         |
| Community signal         | Endorsements show how many separate people confirm a fault. Duplicate reports are merged into one case rather than splitting attention.             |
| Bona AI             | Suggests category, severity and likely duplicates. It never changes case status.                                                                    |
| Privacy                  | No personal data and no evidence on chain. Reporters are pseudonymous in public views.                                                              |

**Position in one sentence:** existing systems record what the department says about a school; BonaBlock records whether a second, separate party agrees, in a form nobody can quietly rewrite.

**What BonaBlock does not do.** It does not fix anything, allocate budget, replace the department's systems or enforce consequences. It is not an asset register. It does not replace an audit; it produces a record an auditor could sample.

## 4. Unverified competitor gaps

These are the gaps we would like to claim. We cannot, because the sources are silent and we have not used the systems ourselves. Do not put any of them on a slide as fact.

| Gap we suspect                                                                                         | What we actually know                                                                               | How to verify                                                   |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| The Safe Schools App has no independent check that a reported latrine was removed.                     | No source describes who marks an item resolved.                                                     | Use the app at safeschools.gov.za; ask the department.          |
| A person who reports through the Safe Schools App cannot track their report.                           | Not stated by the department or the press. One party statement mentions "status" ambiguously [S14]. | Submit a test report and observe.                               |
| The Safe Schools App still covers only pit latrines in late 2026.                                      | That was the scope at launch in December 2024. We found no later scope statement.                   | Check the live app.                                             |
| The facilities management system is closed to the public and parents.                                  | The sources describe official users only and do not say the public is excluded.                     | Ask a provincial infrastructure official (see `VALIDATION.md`). |
| The facilities management system does not record who verified that a project was completed.            | Not stated anywhere we read.                                                                        | Ask a provincial infrastructure official.                       |
| Provinces under-use the facilities management system.                                                  | Claimed only in a party political statement [S14].                                                  | Look for an Auditor-General or departmental statement.          |
| No existing South African school system uses a public ledger.                                          | We found none. We did not search exhaustively.                                                      | A broader search; ask judges and mentors.                       |
| Other reporting channels (Presidential Hotline, municipal apps, GovChat) do not handle school repairs. | Not researched in this pass.                                                                        | Separate research task if a judge raises them.                  |

**Safe wording for the pitch:** "We found no public documentation of independent verification in these systems." That sentence is true. "These systems have no verification" is not something we can support.

## 5. Sources added in this file

| ID    | Source                                                                                                                                                                                                                             | Date        |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| [S12] | Department of Basic Education. [Launch of Safe Schools App](https://www.education.gov.za/ArchivedDocuments/ArchivedArticles/LaunchofSafeSchoolsApp.aspx)                                                                           | Dec 2024    |
| [S13] | Daily Maverick. [Eradicating pit toilets one click at a time: Gwarube launches Safe Schools App](https://www.dailymaverick.co.za/article/2024-12-09-eradicating-pit-toilets-one-click-at-a-time-gwarube-launches-safe-schools-app) | 9 Dec 2024  |
| [S14] | GOOD (political party). [Safe Schools App: a fresh coat of paint on a broken-down car](https://forgood.org.za/safe-schools-app-a-fresh-coat-of-paint-on-a-broken-down-car/)                                                        | 13 Dec 2024 |
| [S15] | Department of Basic Education. [Education Facilities Management System to be rolled out nationally](https://www.education.gov.za/ArchivedDocuments/ArchivedArticles/EducationFacilitiesManagementSystem.aspx)                      | Undated     |
| [S17] | Parliamentary Monitoring Group. [Question CW796 to the Minister of Basic Education](https://pmg.org.za/committee-question/40728/)                                                                                                  | 15 Jul 2026 |

[S1] to [S5] and [S16] are listed in `PROBLEM_EVIDENCE.md`.
