# Stakeholder validation guide

Status: plan only. **No interviews have been conducted.** This file contains no stakeholder responses, and none may be added unless a real person said it in a real conversation that is logged in section 7.

If a judge asks "who did you speak to?", the honest answer today is: "Nobody yet. Our evidence is documentary. Here is the interview plan we would run first."

## 1. What we need to learn

Each interview should move at least one hypothesis from `PROBLEM_EVIDENCE.md` section 3.

| Hypothesis                                         | Question we need answered                                                  |
| -------------------------------------------------- | -------------------------------------------------------------------------- |
| H1: closure is the weak point                      | Who decides a repair is finished today, and does anyone check?             |
| H2: a second confirmer changes behaviour           | What happens now when someone disagrees that a repair is finished?         |
| H3: people report if they can see the outcome      | Why do people stop reporting?                                              |
| H4: reviewers will accept the role                 | Does a district official have the time, mandate and willingness to verify? |
| H5: oversight bodies value a tamper-evident record | Would it change what an oversight researcher trusts?                       |
| H6: administrators will take part                  | Does public visibility of disputes feel like protection or exposure?       |
| H7: triage saves time                              | How many facility issues does one school handle per term?                  |

## 2. Who to interview

Aim for 8 to 10 conversations of 20 to 30 minutes. Three is enough to have something honest to say in a pitch.

| Group                                 | Target | Why                                                       | How to reach them                                         |
| ------------------------------------- | ------ | --------------------------------------------------------- | --------------------------------------------------------- |
| Principal or deputy principal         | 2      | They would be the administrator role                      | Personal networks; schools near team members              |
| School governing body parent member   | 2      | They would be reporters and endorsers                     | Through a principal, or a governing body association      |
| Teacher or caretaker                  | 1 to 2 | They see faults first and know what really gets fixed     | Through a principal                                       |
| District or circuit official          | 1 to 2 | They would be the reviewer role                           | District office; expect to need a formal request          |
| Education NGO researcher or organiser | 1      | They already do independent monitoring                    | Public contact channels of education rights organisations |
| Provincial infrastructure official    | 1      | They can answer the open questions about existing systems | Hardest to reach; optional before the hackathon           |

Do not interview learners. Interviewing minors needs guardian consent and ethical clearance we do not have.

## 3. Ethics and consent

Read this aloud before every interview:

> We are students building a prototype for a hackathon. We are not from the department and this is not an official process. Taking part is voluntary and you can stop at any time. We will not record your name, your school's name or anything that identifies you unless you tell us in writing that we may. May we take notes?

Rules:

- Written notes only, unless the person agrees to audio recording.
- Record the role and province. Do not record names or school names without written permission.
- Do not ask anyone to disclose confidential departmental information.
- A serving official may need permission to speak. If they hesitate, offer to send questions through their office.
- Formal research in schools normally needs provincial department approval. Informal product conversations with adults in their personal capacity are a lighter matter, but if the project continues after the hackathon, apply for approval and university ethics clearance before any pilot.
- Never quote someone in the pitch without their agreement to that exact quote.

## 4. Interview guide

Ask about what has happened, not what they think of our idea. Do not show the product until section 4.5.

### 4.1 Opening, for everyone

1. What is your role, and how long have you been in it?
2. Tell me about the last time something at the school broke or became unsafe. What was it?
3. What happened next, step by step? Who did you tell, and how?
4. How did it end? How long did it take?

### 4.2 Principals and deputies

5. How do you report a facility fault today? Which form, system or person?
6. After you report, how do you find out what is happening?
7. Who decides the repair is complete? Does anyone come to check?
8. Has a repair ever been recorded as done when you felt it was not? What did you do?
9. How many facility issues do you deal with in a typical term?
10. When parents complain about facilities, how does that reach you?
11. What would worry you about parents seeing the status of every reported fault?

### 4.3 Parents, governing body members, teachers, caretakers

5. If you noticed a broken toilet or a damaged roof tomorrow, what would you do?
6. Have you ever reported something? What happened afterwards?
7. Have you ever decided not to report something? Why?
8. How would you know whether something had been fixed properly?
9. Which phone do you use, and how do you usually pay for data?
10. Which language would you want to report in?
11. Would you be comfortable with your name attached to a report? Who should be able to see it?

### 4.4 District officials and NGO researchers

5. How do facility problems reach you from schools?
6. When a school or contractor says work is complete, how is that confirmed?
7. How often do you visit a school site? What triggers a visit?
8. If you visited and found the work incomplete, what could you do about it?
9. Whose records do you trust when two sources disagree?
10. Which systems do you use for this today? What do they not tell you?
11. Could a member of the public see those records? Could you tell if a record had been changed?

Question 10 and 11 are also how we close the gaps in `COMPETITORS.md` section 4.

### 4.5 Reaction to the concept, last five minutes only

Show the demo case on a phone. Say only: "This is a rough prototype. Please tell us what is wrong with it."

12. What do you think this is for?
13. What would stop you using it?
14. Who would object to this existing?
15. In the prototype, the person who claims the repair is done cannot close the case. A separate reviewer must agree. Who should that reviewer be at your school?
16. Is there anything here that could get someone into trouble unfairly?

## 5. Recording answers

One row per interview, filled in within an hour of the conversation.

| Field                   | Content                                            |
| ----------------------- | -------------------------------------------------- |
| Interview ID            | V-01, V-02 and so on                               |
| Date                    |                                                    |
| Role and province       | For example "deputy principal, Gauteng". No names. |
| Consent                 | Notes only, or recording agreed                    |
| What they did last time | The concrete story from questions 2 to 4           |
| Direct quotes           | Exact words only, in quotation marks               |
| Surprises               | Anything that contradicts our assumptions          |
| Hypotheses touched      | For example "H1 supported, H4 weakened"            |
| Quote permission        | Yes or no, and for which quote                     |

Keep paraphrase and quotation separate. If you did not write down the exact words, it is not a quote.

## 6. Reading the results

- A hypothesis is **supported** when at least two people from different groups describe past behaviour consistent with it, unprompted.
- A hypothesis is **weakened** when anyone describes a concrete case that contradicts it.
- Opinions about the future ("I would use this") count for little. Stories about the past count for a lot.
- Record what contradicts us as carefully as what agrees.

Signals that should change the product:

| If we hear                                               | Then                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------- |
| District officials cannot or will not verify             | Move the reviewer role to governing body members or an NGO partner        |
| Reporters fear retaliation                               | Strengthen pseudonymity; consider reports relayed through a trusted adult |
| Most reporters have no data or smartphone                | Prioritise a USSD or WhatsApp intake over the web app                     |
| Principals already have a second sign-off for completion | H1 is wrong in that setting; find where the real gap is                   |
| A school has fewer than five issues a term               | Drop automated triage as a headline feature                               |

## 7. Interview log

Empty. Add rows only for interviews that actually took place.

| ID  | Date | Role and province | Hypotheses touched | Notes file |
| --- | ---- | ----------------- | ------------------ | ---------- |
|     |      |                   |                    |            |
