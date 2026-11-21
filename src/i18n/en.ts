/**
 * English messages — the source language.
 *
 * Every user-facing string lives here. To add a language, create a file with
 * the same shape (TypeScript checks it against `Messages`) and register it in
 * `./index.ts`. Keep sentences short and plain: many readers use English as a
 * second or third language.
 */
import type {
  ActorRole,
  EvidencePurpose,
  IssueCategory,
  IssueStatus,
  SessionRole,
  TimelineEventType,
} from "@/data/types";
import { landingPage } from "./en-landing";
import { procurement } from "./en-procurement";

/** The product. Every message that names it uses this constant, so the name lives in one place. */
export const PRODUCT = "Bona Chain";
/** The separate site that checks a record against the ledger without asking this one. */
export const VERIFIER = "Bona Chain Verify";

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

export const en = {
  /** The procurement screens. Edit `./en-procurement.ts`, not this entry. */
  procurement,
  /** The public landing page at `/`. Edit `./en-landing.ts`, not this entry. */
  landingPage,
  brand: {
    name: PRODUCT,
    forSchools: `${PRODUCT} for Schools`,
    assistant: "Bona AI",
    tagline: "See it. Report it. Prove it.",
    principleReport: "A report is not protection.",
    principleClaim: "A repair claim is not verification.",
    description:
      "Report a problem at a school, see what is being done about it, and check that the record was never changed.",
  },

  nav: {
    home: "Home",
    issues: "Issues",
    schools: "Schools",
    report: "Report",
    assistant: "Bona AI",
    track: "Track",
    verify: "Check a file",
    skipToContent: "Skip to main content",
    main: "Main",
    forStaff: "For schools and reviewers",
    admin: "School administrator",
    reviewer: "Independent reviewer",
    signIn: "Sign in",
    account: "Account",
    language: "Language",
    languageNote: "English only for now. More languages are planned.",
    footerNote:
      "Built for the UJ BACISS hackathon. Every photo is an AI-generated illustration: no real learners, staff or schools are shown.",
    askAssistant: "Ask Bona AI",
    myReports: "My reports",
    atSchool: (school: string) => `At ${school}`,
    /** The menu item that opens each staff role's own workspace. */
    workspace: {
      school_admin: "My dashboard",
      independent_reviewer: "My reviews",
      district_official: "All reports",
      buyer: "Work orders",
      supplier: "My orders",
      receiving_officer: "Deliveries",
      payment_approver: "Releases",
    } satisfies Record<Exclude<SessionRole, "reporter">, string>,
  },

  /** Staff see the public pages, but not the community's actions. */
  audience: {
    communityTitle: "This is for the community",
    communityBody: (aRole: string) =>
      `You are signed in as ${aRole}. Reporting a problem, saying you are affected and adding photos to a report are for parents, learners and the community.`,
    goTo: (place: string) => `Go to ${place}`,
    signOutToReport: "To try this as a community member, sign out first.",
    issueNote: (aRole: string) =>
      `You are signed in as ${aRole}. Only community members can say they are affected or add photos here.`,
    workspaceTile: {
      school_admin: {
        title: "My dashboard",
        body: "Reports at your school that need your answer.",
      },
      independent_reviewer: {
        title: "My reviews",
        body: "School repairs waiting for you to check.",
      },
      district_official: {
        title: "All reports",
        body: "Every report in the district, and where it stands.",
      },
      buyer: {
        title: "Work orders",
        body: "Reported problems that need a work order approved.",
      },
      supplier: {
        title: "My orders",
        body: "Orders to acknowledge and invoices to submit.",
      },
      receiving_officer: {
        title: "Deliveries",
        body: "Orders waiting for you to record what arrived.",
      },
      payment_approver: {
        title: "Releases",
        body: "Verified repairs waiting for a release instruction.",
      },
    } satisfies Record<Exclude<SessionRole, "reporter">, { title: string; body: string }>,
  },

  preview: {
    label: "Sample data notice",
    banner: "Preview with sample data. No real reports and no real blockchain records.",
  },

  common: {
    back: "Back",
    continue: "Continue",
    cancel: "Cancel",
    close: "Close",
    save: "Save",
    loading: "Loading…",
    loadError: "We could not load this. Please check your connection and try again.",
    actionError: "That did not work. Please try again.",
    retry: "Try again",
    copy: "Copy",
    copied: "Copied",
    dismiss: "Dismiss",
    notifications: "Notifications",
    processing: "Please wait…",
    stepOf: (step: number, total: number) => `Step ${step} of ${total}`,
    stepDone: "(done)",
    optional: "optional",
    required: "Please fill this in.",
    notFoundTitle: "We could not find that",
    notFoundBody: "It may have been moved, or the link may be wrong.",
    viewIssue: "View issue",
    viewSchool: "View school",
    sample: "Sample",
    today: "today",
    yesterday: "yesterday",
    daysAgo: (days: number) => `${days} days ago`,
    updated: (when: string) => `Updated ${when}`,
    reported: (when: string) => `Reported ${when}`,
    at: (place: string) => `at ${place}`,
  },

  status: {
    label: {
      reported: "Reported",
      under_assessment: "Under assessment",
      being_addressed: "Being addressed",
      repair_claimed: "Repair claimed",
      independently_verified: "Independently verified",
      disputed: "Disputed",
      declined: "Declined by school",
    } satisfies Record<IssueStatus, string>,
    meaning: {
      reported: "Nobody responsible has responded yet.",
      under_assessment: "The school or district is checking the problem.",
      being_addressed: "Work to fix the problem has started.",
      repair_claimed:
        "The school says this is fixed. An independent reviewer has not checked it yet.",
      independently_verified: "An independent reviewer checked and confirmed the repair.",
      disputed: "An independent reviewer checked and found the problem is not fixed.",
      declined:
        "The school decided not to act on this report. Its reason is shown below.",
    } satisfies Record<IssueStatus, string>,
    notVerifiedYet: "Not verified yet",
    stepsLabel: "Progress of this issue",
  },

  category: {
    sanitation: "Toilets and sanitation",
    water: "Water",
    electricity: "Electricity",
    buildings: "Roofs and buildings",
    safety: "Safety and fencing",
    learning_resources: "Classrooms and learning resources",
    other: "Something else",
  } satisfies Record<IssueCategory, string>,

  actor: {
    community: "Community member",
    school_admin: "School",
    district: "District",
    reviewer: "Independent reviewer",
    buyer: "Programme buyer",
    supplier: "Supplier",
    receiving_officer: "Receiving officer",
    payment_approver: "Payment approver",
    system: `${PRODUCT} rules`,
  } satisfies Record<ActorRole, string>,

  event: {
    reported: "Problem reported",
    assessment_started: "Assessment started",
    progress_recorded: "Progress recorded",
    interim_protection: "Temporary protection in place",
    repair_claimed: "Repair claimed — not yet verified",
    verified: "Repair independently verified",
    disputed: "Repair disputed",
    declined: "Declined by school",
    evidence_added: "Evidence added",
    work_order_approved: "Work order approved",
    work_order_acknowledged: "Supplier acknowledged the order",
    invoice_submitted: "Invoice submitted",
    goods_receipt_recorded: "Delivery recorded",
    match_recorded: "Invoice checked against order and delivery",
    payment_dispute_opened: "Payment dispute opened",
    payment_dispute_closed: "Payment dispute closed",
    release_authorised: "Release authorised",
  } satisfies Record<TimelineEventType, string>,

  evidencePurpose: {
    problem: "Shows the problem",
    progress: "Shows progress",
    repair_claim: "Supports the repair claim",
    review: "From the independent review",
  } satisfies Record<EvidencePurpose, string>,

  ledger: {
    heading: "Blockchain record",
    noneTitle: "Not recorded on Avalanche",
    noneBody:
      "This preview is not connected to the blockchain, so nothing has been written to it.",
    simulatedTitle: "Sample of a recorded item",
    simulatedBody:
      "This shows how a recorded item will look. It is not a real Avalanche transaction.",
    pendingTitle: "Being recorded on Avalanche",
    pendingBody: "The record has been sent and is waiting to be confirmed.",
    confirmedTitle: "Recorded on Avalanche",
    confirmedBody: "Anyone can check this record. It cannot be changed or removed.",
    failedTitle: "Recording failed",
    failedBody: "The record was not written. It will be sent again.",
    network: "Network",
    transaction: "Transaction",
    block: "Block",
    recordedAt: "Recorded",
    viewOnExplorer: "View on the block explorer",
    shortNone: "Not on blockchain",
    shortSimulated: "Sample record",
    shortPending: "Recording…",
    shortConfirmed: "Recorded",
    shortFailed: "Recording failed",
    fingerprint: "Fingerprint",
    showProof: "Show proof",
    proofTitle: (what: string) => `Proof for ${what}`,
    proofIntro: "What was written to the public record, and how to check it yourself.",
    checkElsewhere: "Check it on a separate site",
    checkElsewhereHelp: `${VERIFIER} does not ask ${PRODUCT} anything. It reads the Avalanche record itself. Scan the code with a phone camera, or open the link.`,
    technical: "Technical details",
    technicalHelp: `For people who want the raw record to paste into ${VERIFIER}.`,
    copyReceipt: "Copy receipt",
    receiptCopied: "Receipt copied",
    openInVerify: `Open in ${VERIFIER}`,
    receiptMissing: "There is no receipt for this yet.",
    copyDocument: "Copy document",
    documentCopied: "Document copied",
    documentMissing: "There is no document for this.",
    receiptCopyFailed: "We could not copy that. Please try again.",
    fingerprintHelp:
      "A fingerprint is a short code made from a file. If the file changes at all, the code changes.",
  },

  endorse: {
    action: "I'm affected too",
    done: "You're affected too",
    undo: "Tap again to remove",
    count: (count: number) => plural(count, "person affected", "people affected"),
    /** The words after the number, when the number is drawn inside the ring. */
    countWords: (count: number) => (count === 1 ? "person affected" : "people affected"),
    help: "Shows the school and district how many people this affects. It does not share your name.",
    rule: "One per person. You already count on a report you made yourself.",
  },

  landing: {
    photoNote: "AI-generated illustration",
    eyebrow: `${PRODUCT} for Schools`,
    title: "See it. Report it. Prove it.",
    intro:
      "Report a problem at your school, see what is being done, and check that the record was never changed.",
    searchLabel: "Find your school",
    searchHint: "Type the school name or the town, then tap Search.",
    searchPlaceholder: "School name or town",
    searchAction: "Find school",
    /** The one question the home page asks. */
    question: "Which school is it about?",
    actionsTitle: "Or go straight to",
    report: {
      title: "Report a problem",
      body: "About 3 minutes. No account needed.",
    },
    track: { title: "Check on my report", body: "Use the number on your receipt." },
    issues: {
      title: "See all problems",
      body: "What people have reported, at every school.",
    },
    browseSchools: "See all schools",
    howTitle: `What ${PRODUCT} does`,
    steps: [
      {
        title: "Report",
        body: "Anyone can report a broken toilet, a leak or an unsafe wall at a school, and add a photo. No account is needed.",
      },
      {
        title: "Check",
        body: "Fixing it takes several people. Each one does a single step, and no one checks their own work.",
      },
      {
        title: "Prove",
        body: "Every step is recorded on a public test network. Anyone can check that the record was never changed.",
      },
    ],
    /**
     * The trail in plain words: the report, then the seven steps. `event` is
     * the row title (from `event` above) and `actor` the role label.
     */
    trail: {
      title: "From a report to a checked repair",
      intro:
        "One problem, seven steps after the report. Each step belongs to one role, and each leaves a record anyone can check.",
      start: "Start",
      step: (number: number) => `Step ${number}`,
      rows: [
        {
          event: "reported",
          actor: "community",
          body: "Someone at the school or in the community reports the problem and adds a photo.",
        },
        {
          event: "work_order_approved",
          actor: "buyer",
          body: "A programme buyer approves a work order: what must be fixed and what is needed for it.",
        },
        {
          event: "work_order_acknowledged",
          actor: "supplier",
          body: "The supplier confirms that it has seen the order and accepts it.",
        },
        {
          event: "invoice_submitted",
          actor: "supplier",
          body: "The supplier sends its invoice for the work.",
        },
        {
          event: "goods_receipt_recorded",
          actor: "receiving_officer",
          body: "A receiving officer at the school records what really arrived.",
        },
        {
          event: "match_recorded",
          actor: "system",
          body: "Rules written in code compare the invoice with the order and the delivery. If anything differs, the invoice is blocked until the supplier corrects it.",
        },
        {
          event: "verified",
          actor: "reviewer",
          body: "An independent reviewer, never the school itself, checks that the repair was really done.",
        },
        {
          event: "release_authorised",
          actor: "payment_approver",
          body: "Only then can a payment approver authorise the release. This person took none of the earlier steps.",
        },
      ] satisfies Array<{ event: TimelineEventType; actor: ActorRole; body: string }>,
      noMoney:
        "No real money moves. This runs on a test network, and the last step records an instruction, not a payment.",
      privacy:
        "The public sees each step, the role that took it, the time and the proof. Amounts and names are not public.",
    },
    /** One finished case, shown as its public trail. */
    showcase: {
      title: "A finished case: who did what, and the proof",
      intro:
        "This case comes from the demo data. Its trail shows each step, the role that took it, the time and the proof. Amounts and names are not public.",
      caseAt: (reference: string, school: string) => `${reference} at ${school}`,
      blocked:
        "The invoice did not match the order and the delivery. The supplier had to send a corrected invoice.",
      matched: "The invoice matches the order and the delivery.",
      released: "An instruction, not a payment.",
      open: "Open this case",
    },
    principleTitle: "Our rule",
    recentTitle: "Recent public issues",
    seeAll: "See all issues",
  },

  schools: {
    title: "Find a school",
    intro: "Search by school name or town.",
    results: (count: number) => plural(count, "school", "schools"),
    none: "No school matches that search. Check the spelling or try the town name.",
    learners: (count: number) => `${count.toLocaleString("en-ZA")} learners`,
    participating: "Participating school",
    participatingHelp: `This school responds to reports on ${PRODUCT}.`,
    invited: "Not participating yet",
    invitedHelp:
      "This school has been invited. Reports are still public and stay on the record.",
    since: (date: string) => `Since ${date}`,
  },

  school: {
    about: "About this school",
    district: "District",
    phase: "Type",
    learners: "Learners",
    statsOpen: "Open",
    statsAwaiting: "Waiting for a check",
    statsVerified: "Confirmed fixed",
    statsLabel: "This school in three numbers",
    more: "About this school and latest updates",
    /** The three counts as one plain sentence, read before the numbers. */
    story: (open: number, awaiting: number, verified: number) =>
      [
        open === 0
          ? "Nothing is open at this school right now."
          : `${plural(open, "problem is", "problems are")} open here.`,
        awaiting === 0
          ? ""
          : `${plural(awaiting, "repair is", "repairs are")} waiting for an independent reviewer.`,
        verified === 0
          ? "No repair has been independently verified yet."
          : `${plural(verified, "repair has", "repairs have")} been independently verified.`,
      ]
        .filter(Boolean)
        .join(" "),
    issuesTitle: "Public infrastructure problems",
    issuesNone: "No problems have been reported at this school.",
    issuesNoneAction: "Be the first to report one.",
    groups: {
      open: "Open problems",
      awaiting: "Repairs waiting for review",
      disputed: "Repairs found not fixed",
      verified: "Verified repairs",
      declined: "Declined by the school",
    },
    allIssues: "See all issues at this school",
    categoriesTitle: "What you can report",
    updatesTitle: "Latest updates",
    updatesNone: "No updates yet.",
    reportHere: "Report a problem here",
  },

  feed: {
    title: "Public issues",
    intro: "Problems reported at schools, and what is being done about them.",
    searchLabel: "Search issues",
    searchPlaceholder: "Problem, school or reference",
    statusLabel: "Status",
    categoryLabel: "Type of problem",
    sortLabel: "Show first",
    sortRecent: "Latest updates",
    sortAffected: "Most people affected",
    all: "All",
    filters: "Filters",
    results: (count: number) => plural(count, "issue", "issues"),
    none: "No issues match. Try fewer filters.",
    clear: "Clear filters",
    interim: "Temporary protection in place",
    evidence: (count: number) => plural(count, "evidence file", "evidence files"),
  },

  issue: {
    reference: "Reference",
    where: "Where",
    whatsWrong: "What is wrong",
    statusTitle: "Where this stands",
    communityTitle: "Community",
    interimTitle: "Temporary protection",
    interimNone:
      "No temporary protection has been recorded. A report on its own does not make anyone safe.",
    authorityTitle: "Who is responsible",
    authorityLevel: {
      school: "School",
      district: "District office",
      province: "Provincial department",
    },
    timelineTitle: "Timeline",
    tabsLabel: "Parts of this report",
    tabs: { summary: "Summary", timeline: "Timeline", proof: "Proof" },
    backToSchool: (school: string) => `Back to ${school}`,
    blockchainTitle: "The report on the public record",
    evidenceTitle: "Evidence",
    seeEvidence: "See the evidence",
    openFile: "Open the file",
    fileAlt: (name: string) => `${name}: the uploaded photo`,
    evidenceIntro:
      "The photos and files stay private. Anyone who has the original file can check it against the record.",
    evidenceNone: "No evidence has been added yet.",
    evidenceVersion: (version: number) => `Evidence ${version}`,
    addedBy: (who: string, when: string) => `Added by ${who}, ${when}`,
    addEvidence: "Add evidence",
    addPhoto: "Add a photo or document",
    declinedTitle: "Why the school declined this",
    declinedKind:
      "The school decided not to act on this report. Its reason is below. The report stays on the record, and you can still add evidence or say you are affected.",
    pictureNote: "Picture for this type of problem. The real photos stay private.",
    reviewTitle: "Independent review",
    reviewAwaiting:
      "The school says this is fixed. An independent reviewer still has to check. Until then, treat it as not fixed.",
    reviewVerified: "An independent reviewer confirmed the repair.",
    reviewDisputed: "An independent reviewer found that the problem is not fixed.",
    reviewerNote: "Reviewer's note",
    share: "Copy link",
  },

  addEvidence: {
    title: "Add evidence",
    intro: (title: string) => `Add a photo or document to “${title}”.`,
    submit: "Add to this issue",
    doneTitle: "Evidence added",
    doneBody:
      "Thank you. Keep the original files — you may need them to prove they were never changed.",
    backToIssue: "Back to the issue",
    needFile: "Choose at least one file.",
  },

  files: {
    choose: "Choose photos or files",
    takePhoto: "Take a photo",
    fromPhone: "Choose from your phone",
    hint: "Photos or PDFs. Up to 5 files.",
    privacy:
      "Do not include children's faces if you can avoid it. Files stay private; only a fingerprint is public.",
    computing: "Working out the fingerprint…",
    remove: (name: string) => `Remove ${name}`,
    selected: (count: number) => plural(count, "file chosen", "files chosen"),
    tooMany: "You can add up to 5 files.",
    computedHere: "Your photo's fingerprint, made on your phone before upload",
    full: "You have added 5 files. Remove one to add another.",
  },

  report: {
    title: "Report a problem",
    refused:
      "The report was not accepted from this account. Sign out, or sign in as a community reporter, and send it again.",
    stepOf: (step: number, total: number) => `Step ${step} of ${total}`,
    /** The four stops a reporter sees. The duplicate check sits inside "What". */
    stepper: ["Where", "What", "Show us", "Done"],
    stepperLabel: "Your progress",
    noAccount: "No account needed.",
    draftKept: "We kept what you typed last time, in case your connection dropped.",
    startAgain: "Start again",
    school: {
      title: "Which school?",
      help: "Search by school name or town, then choose the school.",
      none: "No school matches. Check the spelling or try the town name.",
      chosen: "Chosen school",
      change: "Change school",
    },
    describe: {
      title: "What is wrong?",
      categoryTitle: "What is the problem about?",
      category: "Type of problem",
      more: "Add where it is and more detail",
      titleLabel: "The problem in one sentence",
      titleHint: "For example: The Grade 3 classroom has broken windows.",
      whereLabel: "Where at the school?",
      whereHint: "For example: Block B, next to the hall.",
      detailsLabel: "More detail",
      detailsHint: "What do you see? How long has it been like this? Who is affected?",
      titleTooShort: "Please describe the problem in a few words.",
      categoryMissing: "Please choose the type of problem.",
    },
    duplicate: {
      title: "Has this already been reported?",
      found:
        "These look similar. If one is your problem, add your voice instead of making a new report.",
      none: "We did not find a similar report at this school. Please continue.",
      same: "This is my problem too",
      different: "Mine is different",
      added: "Added. You're counted on this issue.",
    },
    evidence: {
      title: "Show us the problem",
      help: "A photo makes a report much harder to ignore. You can skip this and add it later.",
      skip: "Continue without a photo",
    },
    review: {
      title: "Check your report",
      school: "School",
      type: "About",
      problem: "Problem",
      where: "Where",
      details: "Details",
      evidence: "Evidence",
      noEvidence: "None added",
      notGiven: "Not given",
      edit: "Change",
      anonymous: "Do not show that this report came from me",
      anonymousHelp: "Your name is never shown publicly either way.",
      guestTitle: "No account needed",
      guestBody:
        "You can send this report without signing in. Keep the reference number on the next screen to follow it.",
      signedInAs: (name: string) => `You are sending this as ${name}.`,
      consent:
        "When you send this, the report and the fingerprints of your photos become public and stay on the record. Your name and the photos themselves stay private.",
      submit: "Submit report",
      submitting: "Submitting…",
      danger: "If anyone is in immediate danger, call 10111, or 112 from a cellphone.",
    },
  },

  receipt: {
    title: "Report received",
    intro: "Keep this slip. The number is how you follow your report.",
    reference: "Your report number",
    school: "School",
    problem: "Problem",
    sent: "Sent",
    proofLabel: "your report",
    submitted: (when: string) => `Submitted ${when}`,
    nextTitle: "What happens next",
    next: [
      "Your report is public now. The school can see it and is asked to respond.",
      "You can follow it any time with your number.",
      "A repair only counts once an independent reviewer confirms it.",
    ],
    evidenceTitle: "Your photos and files",
    evidenceNone:
      "You did not add evidence. You can add it at any time from the issue page.",
    keepFiles:
      "Keep your original files. Their fingerprints are how you can prove later that nothing was changed.",
    track: "Follow this report",
    share: "Share",
    shareText: (reference: string) => `My ${PRODUCT} report ${reference}`,
    shareCopied: "Link copied",
    screenshotHint: "Take a screenshot of this slip. It is your proof that you reported.",
    print: "Print",
    notFound: "We could not find a receipt with that reference.",
  },

  track: {
    title: "Track a report",
    intro: "Enter the reference number from your receipt.",
    label: "Reference number",
    placeholder: "BB-2026-000123",
    action: "Find my report",
    invalid: "A reference looks like BB-2026-000123. Please check and try again.",
    notFound: "We could not find a report with that reference.",
    recentTitle: "Reports followed on this phone",
    recentHelp: "Only on this phone. Nobody else can see this list.",
    recentEmptyTitle: "Nothing followed yet",
    recentNone:
      "Reports you follow or send will be listed here, so you do not have to type the reference again.",
    forget: (reference: string) => `Forget ${reference}`,
    seen: (when: string) => `Last opened ${when}`,
  },

  assistant: {
    title: "Bona AI",
    intro:
      "Ask in your own words. I can help you find, report and follow school problems.",
    notice:
      "Preview: these are scripted sample answers. Bona AI is not connected to an AI service yet.",
    inputLabel: "Your message",
    placeholder: "Type your question",
    send: "Send",
    thinking: "Bona AI is typing…",
    greeting:
      "Hello. I'm Bona AI. Tell me what is wrong at your school, or choose one of the questions below.",
    suggestions: [
      "The toilets at Thuto-Lesedi are blocked",
      "Tell me about Masakhane Secondary",
      "How do I know a record was not changed?",
      "Where is my report?",
    ],
    suggestionsLabel: "Suggested questions",
    you: "You",
    conversation: "Conversation",
    sources:
      "Bona AI only uses recorded cases. It does not guess, and it never speaks for the school.",
    fromCases: "From these recorded cases",
    aboutSchool: "About this school",
    nextSteps: "What you can do next",
    careful: "A careful helper, not an official.",
  },

  auth: {
    title: "Sign in",
    intro:
      "For the people who handle a case: schools, buyers, suppliers, receiving officers, reviewers and approvers. Registered reporters too.",
    email: "Email address",
    password: "Password",
    submit: "Sign in",
    signOut: "Sign out",
    missing: "Enter your email address and password.",
    wrongDetails: "That email address or password is not right. Please try again.",
    noAccountNeeded:
      "You do not need an account to look at schools, issues or to check a file.",
    accountTitle: "Your account",
    role: {
      reporter: "Community reporter",
      school_admin: "School administrator",
      district_official: "District official",
      independent_reviewer: "Independent reviewer",
      buyer: "Programme buyer",
      supplier: "Supplier",
      receiving_officer: "Receiving officer",
      payment_approver: "Payment approver",
    } satisfies Record<SessionRole, string>,
    /** The same roles as they read inside a sentence. */
    aRole: {
      reporter: "a community reporter",
      school_admin: "a school administrator",
      district_official: "a district official",
      independent_reviewer: "an independent reviewer",
      buyer: "a programme buyer",
      supplier: "a supplier",
      receiving_officer: "a receiving officer",
      payment_approver: "a payment approver",
    } satisfies Record<SessionRole, string>,
    gateTitle: "Sign-in needed",
    gateBody: (aRole: string) => `This page is only for ${aRole}.`,
    signInAs: (aRole: string) => `Sign in as ${aRole}`,
    wrongRole: (current: string, needed: string) =>
      `You are signed in as ${current}. This page is only for ${needed}.`,
    sampleTitle: "Demo accounts",
    sampleBody:
      "This is the demo. Tap a role to sign in as that person; no password needed. Nothing here is real, and the form below still works for typed sign-ins.",
    sampleSigningIn: (role: string) => `Signing in as the ${role}…`,
    /** What each role can do, shown on the demo role cards. */
    roleCan: {
      reporter: "Report problems, add evidence and say “I'm affected too”.",
      school_admin:
        "Acknowledge reports, record progress and claim repairs for one school.",
      district_official: "See every report in the district.",
      independent_reviewer:
        "Check repair claims and verify or dispute them. Never on the school's staff.",
      buyer: "Approve the work order for a reported problem.",
      supplier: "Acknowledge the order and submit the invoice for it.",
      receiving_officer: "Record what was actually delivered.",
      payment_approver:
        "Authorise the release instruction once the repair is verified. No money moves here.",
    } satisfies Record<SessionRole, string>,
    emailHint: `The address your ${PRODUCT} account was set up with.`,
    passwordNext: "Now your password.",
    showPassword: "Show password",
    hidePassword: "Hide password",
    sessionNote:
      "Signing in keeps you signed in on this device for 7 days. Nothing else is stored on it.",
    signedInAs: (role: string) => `Signed in as ${role}`,
  },

  admin: {
    title: "School dashboard",
    onlyThisSchool: "You see reports for your own school only.",
    headline: (count: number) =>
      count === 0
        ? "No report needs your reply right now."
        : `${plural(count, "report needs", "reports need")} your reply.`,
    empty: "No reports for your school yet.",
    /* The short list: three groups by urgency, one line per report. */
    groups: {
      reply: "Reply needed",
      fixing: "Being fixed",
      review: "Waiting for a reviewer",
      closed: "Closed",
    },
    groupEmpty: {
      reply: "Nothing is waiting for your reply.",
      fixing: "Nothing is being fixed right now.",
      review: "No repair is waiting for a reviewer.",
      closed: "No closed reports.",
    },
    showClosed: (count: number) => `Show closed reports (${count})`,
    hideClosed: "Hide closed reports",
    waiting: (days: number) =>
      days === 0 ? "Came in today" : `Waiting ${plural(days, "day", "days")}`,
    openFor: (days: number) =>
      days === 0 ? "Opened today" : `Open ${plural(days, "day", "days")}`,
    saidFixed: (when: string) => `You said fixed ${when}`,
    noUpdateYet: "No update written yet",
    reasonDisputed: "A reviewer said it is not fixed",
    reasonNoProtection: "Many people affected and nothing recorded to keep them safe",
    lineVerified: "A reviewer confirmed the repair",
    lineDeclined: "Declined by the school",
    /* One report at a time */
    backToList: "All reports",
    photos: (count: number) =>
      count === 0 ? "No photo" : plural(count, "photo", "photos"),
    lastUpdate: (when: string) => `Last update, ${when}`,
    question: "What is your answer?",
    otherAnswers: "Other answers",
    actions: {
      assess: {
        label: "We are looking into it",
        help: "You have seen the report and will check the problem.",
        field: "What will you check, and when?",
        submit: "Record assessment",
        note: "Your words are shown publicly on the report.",
        after: "The report now shows “Under assessment”.",
      },
      progress: {
        label: "Work is under way",
        help: "Say what has been done so far.",
        field: "What has been done?",
        submit: "Record progress",
        note: "Your words are shown publicly on the report. Not on blockchain.",
        after: "The report now shows “Being addressed”.",
      },
      protect: {
        label: "People are kept safe for now",
        help: "Say what keeps people safe until the repair is done.",
        field: "What is in place to keep people safe?",
        submit: "Record protection",
        note: "Your words are shown publicly on the report. This is not a repair.",
        after: "The report now shows what keeps people safe for now.",
      },
      claim: {
        label: "The repair is done",
        help: "You say it is fixed. An independent reviewer checks before it counts.",
        field: "What was repaired?",
        submit: "Submit repair claim",
        note: "Your words are shown publicly on the report.",
        after:
          "The report now shows “Repair claimed”. An independent reviewer checks it before it counts.",
      },
      decline: {
        label: "This is not ours to fix",
        help: "The school will not act on this report. You must give a reason.",
        field: "Why is the school declining this report?",
        submit: "Decline report",
        note: "Not on blockchain.",
        after: "The report now shows “Declined by school”, with your reason.",
      },
    },
    declineWarning:
      "Your reason is shown publicly on the issue. The report stays on the record.",
    claimWarning:
      "A repair claim is not verification. The issue will show “Repair claimed” until an independent reviewer confirms it.",
    claimConfirm:
      "When you submit, an independent reviewer who is not on your school's staff is asked to check the repair. Only their decision can mark it fixed.",
    claimEvidence: "Photos of the completed repair",
    notPossible:
      "That answer is not possible for this report right now. Go back and choose another.",
    backToAnswers: "Back to the answers",
    saved: "Recorded.",
    skip: (more: number) => `Skip to the next one · ${more} more`,
    nextReport: (left: number) => `Next report · ${left} left`,
    another: "Record something else for this report",
    seeReport: "Look at this report again",
    backToListDone: "Back to the list",
    youWrote: "You wrote",
    publicPage: "Open the public page",
    disputedTitle: "A reviewer said this is not fixed",
    reviewerWrote: "The reviewer wrote",
    claimedTitle: "You said this is fixed",
    claimedBody:
      "An independent reviewer now checks the repair. Until then the report shows “Repair claimed”. It is not verified.",
    verifiedTitle: "A reviewer confirmed this repair",
    verifiedBody: "An independent reviewer checked it. Nothing more is needed here.",
    declinedTitle: "The school declined this report",
    declinedReason: "The public reason",
    /* A school can never verify its own repair */
    verifyDisabledReason:
      "Only an independent reviewer can verify. A school cannot verify its own repair.",
    probe: {
      action: "Try to verify this repair",
      refusedTitle: "Refused. A school cannot verify its own repair.",
      refusedBody:
        "The blockchain contract only accepts a verification from an independent reviewer. Nothing was changed.",
      reason: "Contract answer",
      yourRole: "Your role on the ledger",
      sample: "Preview: this answer comes from sample data. No contract was called.",
      allowed: "Your role is allowed to verify this repair.",
    },
    probeHelp:
      "This only asks whether a school may verify. It costs nothing and changes nothing.",
    photoAlt: (title: string) => `Photo added for: ${title}`,
    noPhoto: "No photo",
    photoNotShown: "Photo on record, not shown in this preview",
    printedFor: (school: string, date: string) => `${school} · printed ${date}`,
  },

  reviewer: {
    title: "Independent reviews",
    intro: "Go to the school, look at the repair, then say if it is fixed.",
    headline: (count: number) =>
      count === 0
        ? "Nothing to check right now."
        : `${plural(count, "repair", "repairs")} to check.`,
    toCheck: "To check",
    completed: "Already checked",
    empty: "No repairs are waiting for you.",
    emptyCompleted: "You have not checked any repairs yet.",
    saidFixed: (when: string) => `School said fixed ${when}`,
    position: (index: number, total: number) => `To check · ${index} of ${total}`,
    affected: (count: number) => plural(count, "person is", "people are") + " affected",
    /* Step 1: three checks at the school */
    checksIntro: "Answer these at the school.",
    claimSays: "The school says",
    noClaimNote: "The school did not write a note.",
    reportSaid: "The report said",
    checks: [
      { question: "I am at the school now", short: "At the school" },
      {
        question: "The repair matches what the school says",
        short: "Repair matches the claim",
      },
      { question: "It is safe for learners to use", short: "Safe to use" },
    ],
    yes: "Yes",
    no: "No",
    /** The words recorded in the note for one answer, e.g. "At the school: yes." */
    checkAnswer: (short: string, answer: boolean) =>
      `${short}: ${answer ? "yes" : "no"}.`,
    checksNeeded: "Please answer all three first.",
    photosTitle: "Take a photo of what you see",
    photosLabel: "Your photos of the repair",
    photosHelp: "Optional. Your photos are attached to your decision and stay private.",
    toDecide: "Next: compare and decide",
    /* Step 2: before and after, a note, two answers */
    backToChecks: "Back to the three checks",
    originalProblem: "The problem",
    schoolRepair: "The school's repair",
    originalPhoto: "Photo of the problem",
    claimPhoto: "Photo of the repair",
    reportedWhen: (when: string) => `Reported ${when}`,
    claimedWhen: (when: string) => `Claimed ${when}`,
    yourAnswers: "Your three answers",
    change: "Change",
    noteLabel: "What did you see?",
    noteHint: "Write one or two sentences. Your note is public.",
    noteRequired: "Please describe what you found before you decide.",
    decisionTitle: "Is it fixed?",
    yesFixed: "Yes, it is fixed",
    notFixed: "No, not fixed",
    allFiles: (count: number) => `See all photos and files (${count})`,
    hideFiles: "Hide photos and files",
    noPreview:
      "Photos will open here once the evidence store is connected. For now you see each file's details.",
    privateFiles:
      "These files are private. Only the people handling this case can open them.",
    publicPage: "Open the public page",
    /* Confirm: exactly what will be recorded */
    confirm: {
      title: "Check before you record",
      intro: "This is exactly what will be recorded.",
      decision: "Your decision",
      verified: "Verified. The repair is fixed.",
      disputed: "Disputed. The repair is not fixed.",
      note: "Your public note",
      photos: "Your photos",
      photoCount: (count: number) =>
        count === 0
          ? "None"
          : `${plural(count, "photo", "photos")}, kept private. Only the people handling this case can open them.`,
      checksAdded:
        "Your three answers are the last line of your note. They are not saved anywhere else.",
      warnNo:
        "You answered “No” to at least one check. Only verify if you are sure the repair is fixed.",
      verifyHelp: "Verifying is the only way a report becomes “Independently verified”.",
      disputeHelp:
        "Disputing does not erase the school's claim. It stays in the timeline under your finding.",
      technical: "Technical details",
      back: "Go back",
    },
    verify: "Verify completion",
    dispute: "Dispute completion",
    ledgerTitle: "What goes on the public record",
    ledgerItems: [
      "The case id, and that an independent reviewer decided.",
      "A single fingerprint of your decision, made from your note and your photos' fingerprints with a random salt, so the note cannot be guessed back.",
      "The time it was recorded.",
    ],
    ledgerNot:
      "Not written: your name, the words of your note, or the photos themselves.",
    ledgerSample:
      "Until BonaRegistry is live on Avalanche Fuji, this is kept as a sample record. It is never shown as a transaction.",
    decided: {
      verified: "Recorded. You verified this repair.",
      disputed: "Recorded. You disputed this repair.",
    },
  },

  verify: {
    title: "Is this the real file?",
    intro: "Check whether a photo or document is exactly the one that was recorded.",
    choose: "Choose the photo or document",
    stays: "It never leaves your phone.",
    stepChose: "You chose a file",
    computing: "Working out the fingerprint…",
    yourFingerprint: "Fingerprint of your file",
    matchTitle: "This file matches the record",
    matchBody: "It is exactly the file that was added to this issue.",
    noMatchTitle: "No matching record",
    noMatchBody: `This exact file is not in ${PRODUCT}. If the file was edited, resaved or sent through a chat app, its fingerprint changes.`,
    ledgerTitle: "Blockchain check",
    again: "Check another file",
    howTitle: "How this works",
    how: [
      "Your device works out the file's fingerprint. The file is not uploaded.",
      "The fingerprint is compared with the fingerprints recorded for each issue.",
      `When a fingerprint is recorded on Avalanche, anyone can check it without trusting ${PRODUCT}.`,
    ],
    independentNote: `${VERIFIER}, a separate tool, does the blockchain part of this check without using this website.`,
    stepsTitle: "What happened",
    stepFingerprint: "Your phone made its fingerprint",
    stepFingerprintDone: "The file was read here. Nothing was uploaded.",
    stepLookup: "Compared with the recorded fingerprints",
    stepLookupMatch: (count: number) =>
      count === 1
        ? "One record has this fingerprint."
        : `${count} records have this fingerprint.`,
    stepLookupNone: "No record has this fingerprint.",
    stepChain: "Checked the blockchain record",
    stepChainSkipped: "Skipped: there was no record to check.",
    matchPlain:
      "Your file is exactly the one on record. Nobody has changed it since it was added.",
    noMatchPlain: `Either this file was never added to ${PRODUCT}, or it was changed after it was added. Try the original file from the phone that took it.`,
    receiptTitle: "Have a receipt?",
    receiptBody: `${VERIFIER} is a separate tool that reads Avalanche directly. Paste a receipt there to check it without trusting this website.`,
    openVerify: `Open ${VERIFIER}`,
    sampleNote:
      "This record is a sample from the preview. It is not a real Avalanche transaction.",
    print: "Print this result",
  },

  /** Bona buddy: the floating helper. Tips are keyed by <BuddyHint id="…" />. */
  buddy: {
    name: "Bona buddy",
    open: "Bona buddy: help",
    sheetTitle: "How can I help?",
    sheetIntro: "Tips for this screen, a place to ask, and extra support.",
    resize: "Resize this panel. Drag the corner, or use the arrow keys.",
    moreOptions: "More options",
    suggestions: [
      "How do I report a problem?",
      "Is my school's problem fixed?",
      "Who checks a repair?",
    ],
    pet: {
      title: "Bolt's options",
      howTo: "Tap to chat. Drag to move. Hold for options.",
      still: "Stay still.",
      stillHelp: "It stops strolling beside the page.",
    },
    tipsLabel: "Help for this screen",
    hints: {
      "report.school": {
        title: "Which school is it about?",
        tips: [
          "Type the school's name or the town. Then tap the school in the list.",
          "Can't see it? Check the spelling, or try the town name.",
        ],
      },
      "report.category": {
        title: "What is the problem about?",
        tips: [
          "Tap the one that fits best. A blocked toilet goes under toilets.",
          "Not sure? Pick the closest one. You say what is wrong in your own words next.",
        ],
      },
      "report.describe": {
        title: "Saying what is wrong",
        tips: [
          "Say what you see and where, in one sentence. For example: The Grade 3 classroom has broken windows.",
          "Leave out children's names. The report is public.",
        ],
      },
      "report.photo": {
        title: "Adding a photo",
        tips: [
          "A photo makes a report much harder to ignore. Try not to show faces.",
          "No photo? You can skip this and add one later.",
        ],
      },
      "report.review": {
        title: "Before you send",
        tips: [
          "Read it once. You can still change anything that is wrong.",
          "When you send it, the report becomes public. Your name and your photos stay private.",
        ],
      },
      report: {
        title: "Reporting a problem",
        tips: [
          "Each screen asks one thing. Answer it, then go on to the next.",
          "You do not need an account.",
        ],
      },
      receipt: {
        title: "Your report is in",
        tips: [
          "Keep your reference number. Take a screenshot, or write it down.",
          "The school is asked to look at the problem. A repair only counts after an independent reviewer has checked it.",
        ],
      },
      issue: {
        title: "Reading this problem",
        tips: [
          "The label under the title shows where the problem is now.",
          "Repair claimed means the school says it is fixed. It only counts once an independent reviewer has checked.",
        ],
      },
      school: {
        title: "This school's page",
        tips: [
          "See the problems people have already reported here.",
          "Is yours on the list? Open it and say you are affected too. If not, report it.",
        ],
      },
      home: {
        title: "Getting started",
        tips: [
          "Start with your school. Type its name or town in the search box.",
          "To tell us about a problem, tap Report.",
        ],
      },
      track: {
        title: "Following a report",
        tips: [
          "Type the reference number from your receipt. It looks like BB-2026-000123.",
          "Reports you sent from this phone are listed here too.",
        ],
      },
      verify: {
        title: "Checking a file",
        tips: [
          "Choose the photo or document. It stays on your device and is not uploaded.",
          "Use the original file. A copy sent through a chat app will not match.",
        ],
      },
      admin: {
        title: "Answering reports",
        tips: [
          "Start at the top. The most urgent reports come first.",
          "You can say a repair is done. It only counts after an independent reviewer has checked it.",
        ],
      },
      reviewer: {
        title: "Reviewing a repair",
        tips: [
          "Compare the photo of the problem with the photo of the repair.",
          "Verify only what you checked yourself. If the problem is still there, dispute it and say what you found.",
        ],
      },
      fallback: {
        title: `How ${PRODUCT} works`,
        tips: [
          "Find your school, report a problem, then follow what is done about it.",
          "Stuck? Ask Bona AI a question below.",
        ],
      },
    },
    /**
     * The side note in the bubble. It only remembers which language a person
     * prefers. `lang` is the BCP-47 tag a screen reader uses to say the name.
     */
    language: {
      question: "Which language do you prefer?",
      chosen: "Preferred language:",
      change: "Change",
      choose: "Choose a language",
      /** South Africa's twelve official languages, each in its own name. */
      options: [
        { code: "en", name: "English", lang: "en" },
        { code: "af", name: "Afrikaans", lang: "af" },
        { code: "nr", name: "isiNdebele", lang: "nr" },
        { code: "xh", name: "isiXhosa", lang: "xh" },
        { code: "zu", name: "isiZulu", lang: "zu" },
        { code: "nso", name: "Sepedi", lang: "nso" },
        { code: "st", name: "Sesotho", lang: "st" },
        { code: "tn", name: "Setswana", lang: "tn" },
        { code: "ss", name: "siSwati", lang: "ss" },
        { code: "ve", name: "Tshivenda", lang: "ve" },
        { code: "ts", name: "Xitsonga", lang: "ts" },
        { code: "sasl", name: "South African Sign Language", lang: "en" },
      ],
    },
    ask: {
      title: "Ask Bona AI",
      label: "Your question for Bona AI",
      answerLabel: "Bona AI says",
      placeholder: "Ask Bona…",
      suggestionsLabel: "Questions you can tap",
      error: "Bona AI could not answer just now. Check your connection and try again.",
      fullPage: "Open the full Bona AI page",
    },
    extras: {
      title: "Extra support",
      signLabel: "Sign language preview",
      signHelp:
        "A concept only. The hand shapes are made up. This is not real South African Sign Language.",
      on: "On",
      off: "Off",
      loading: "Getting the signing figure ready…",
      loadError:
        "The signing figure could not be loaded. Check your connection and try again.",
    },
    sign: {
      title: "Sign language preview",
      badge: "Concept only",
      prompt:
        "Point at, tap or tab to any words on the page. The figure moves for each word.",
      disclaimer:
        "This is not real South African Sign Language. The hand shapes are made up to show the idea. A real signing avatar must be built and checked with a Deaf-community partner.",
      close: "Close the sign language preview",
      smaller: "Make the figure smaller",
      bigger: "Make the figure bigger",
      resize: "Resize the figure. Drag the corner, or use the arrow keys.",
      sizes: { s: "Small", m: "Medium", l: "Large", xl: "Extra large" },
      sizeNow: (size: string) => `Figure size: ${size}`,
      replay: "Replay",
      again: "Again",
      slower: "Slower",
      readAloud: "Read aloud",
      voiceNote:
        "Read aloud uses your device's own English voice. Nothing is sent anywhere.",
      noVoice: "This device has no English voice, so the words are shown instead.",
      no3d: "This device cannot draw the 3D figure. The words still light up on the page.",
    },
  },
};

export type Messages = typeof en;
