/**
 * English messages for the public landing page.
 *
 * Everything here is read by people who have never seen BonaWork. Keep it
 * plain and true: test network only, sample data, no real money. Never
 * the words "paid" or "resolved", no amounts, no names of people or suppliers.
 */

/** The public repository and the BonaWork program on devnet, shown in the footer. */
const REPOSITORY = "https://github.com/obxalethia-star/BonaChain";
const REGISTRY =
  "https://explorer.solana.com/address/5LkegW1dBfTL1Xiw2n15Rt99ZVcG4uipCjDH9bMiyEGY?cluster=devnet";

export const landingPage = {
  nav: {
    menu: "Menu",
    close: "Close menu",
    report: "Report a problem",
  },

  hero: {
    badge: "Live on the Solana devnet test network",
    /** The page's one h1, on two lines. */
    title: ["From the report to the release,", "every step checked."],
    sub: "Reports, repairs, invoices and independent checks for a school, in one trail anyone can verify.",
    primary: "Report a problem",
    secondary: "See a finished case",
    searchLabel: "Which school is it about?",
    searchPlaceholder: "School name or town",
    searchAction: "Find school",
    /** The dashboard drawn under the headline. Sample content, not a live case. */
    mock: {
      label: "A sample case, drawn to show what the trail holds",
      title: "Case trail",
      sample: "Sample case",
      school: "Primary school, classroom lights",
      viewAll: "All cases",
      tiles: [
        {
          label: "Steps recorded",
          value: "6 of 8",
          note: "On the test network",
          filled: 18,
        },
        { label: "Invoice checks", value: "2", note: "1 blocked, 1 matched", filled: 12 },
        {
          label: "Independent review",
          value: "Waiting",
          note: "Reviewer visits",
          filled: 6,
        },
        { label: "Release", value: "Locked", note: "Until verified", filled: 3 },
      ],
      trailTitle: "Latest steps",
      trail: [
        { step: "Invoice checked against order and delivery", who: "BonaWork rules" },
        { step: "Delivery recorded", who: "Receiving officer" },
        { step: "Work order approved", who: "Funder" },
      ],
      rolesTitle: "Who has acted",
      roles: ["Community member", "Funder", "Supplier", "Receiving officer"],
      recorded: "Recorded",
    },
  },

  /** What it is built on. Not customers: there are none yet. */
  builtOn: {
    label: "Built on",
    items: ["Solana devnet", "Anchor", "Next.js", "Postgres", "Vercel AI Gateway"],
  },

  start: {
    label: "Start here",
    title: "What do you need to do?",
  },

  about: {
    label: "About BonaWork",
    title: ["Fewer promises.", "More proof."],
    photoNote: "An independent check",
    cards: [
      {
        value: "1",
        title: "Anchor program on Solana devnet",
        body: "Each repair gets an escrow of sandbox rand, released in two stages after independent review.",
      },
      {
        value: "7",
        title: "roles",
        body: "Each role does its own steps. Nobody verifies their own work.",
      },
    ],
    /** The drawing on the "1 Anchor program" card: one escrow, two stages, a check between. */
    contracts: {
      factory: "Escrow",
      factoryNote: "Holds the sandbox rand",
      operations: "Materials",
      operationsNote: "Stage 1",
      finance: "Completion",
      financeNote: "Stage 2",
      gate: "Verified?",
    },
    /** The drawing on the "7 roles" card, in the order a case meets them. */
    roles: {
      label: "The seven roles, in the order a case meets them",
      names: [
        "Community member",
        "School admin",
        "Funder",
        "Supplier",
        "Receiving officer",
        "Independent reviewer",
        "Payment approver",
      ],
      /** The index of the role that is highlighted. */
      highlight: 5,
    },
  },

  capabilities: {
    label: "Core capabilities",
    title: ["Everything behind", "every repair"],
    intro:
      "From the moment a problem is reported to the moment a release is authorised, BonaWork shows who did what, and the proof.",
    cards: [
      {
        title: "Community reporting",
        body: "Anyone can report a problem at a school and add a photo. No account is needed.",
      },
      {
        title: "Order, invoice and delivery matching",
        body: "Rules compare the supplier's invoice with the approved order and what was delivered. A mismatch is blocked.",
      },
      {
        title: "Independent verification",
        body: "An independent reviewer, never the school itself, checks that the repair was really done.",
      },
      {
        title: "Public proof",
        body: "Each step is recorded on a public test network. Anyone can check the record without asking us.",
      },
    ],
    action: "See the cases",
  },

  people: {
    label: "One case, four people",
    title: ["Every step. Every person.", "One trail."],
    tabsLabel: "Who does what",
    tabs: [
      {
        id: "community",
        tab: "Community",
        title: ["Report a problem", "and follow it."],
        body: "Learners, parents and neighbours report what is broken, say that it affects them, and follow each step.",
        points: [
          "Report in about 3 minutes, without an account",
          "Add a photo. Your name and photos stay private",
          "See every step and its proof",
        ],
        action: "Report a problem",
        href: "/report",
      },
      {
        id: "supplier",
        tab: "Supplier",
        title: ["Send an invoice", "the rules can check."],
        body: "The supplier acknowledges the order and sends the invoice. Rules compare it with the order and the delivery straight away.",
        points: [
          "Bona AI reads a pasted invoice into fields for the supplier to check",
          "A mismatch is blocked, with the exact reasons",
          "Bona AI explains the reasons and decides nothing",
        ],
        action: "Sign in",
        href: "/sign-in",
      },
      {
        id: "reviewer",
        tab: "Independent reviewer",
        title: ["Check the repair", "at the school."],
        body: "A reviewer who does not work for the school visits, answers three questions and writes a public note.",
        points: [
          "Only a reviewer can mark a repair as verified",
          "The escrow will not take the school as its own reviewer",
          "A repair stays “Repair claimed” until it is checked",
        ],
        action: "Sign in",
        href: "/sign-in",
      },
      {
        id: "approver",
        tab: "Payment approver",
        title: ["Authorise the release", "only when it is checked."],
        body: "The release stays locked until the invoice matches and the repair has been independently verified.",
        points: [
          "The lock shows what is still missing, in plain words",
          "The program on Solana refuses an early release",
          "A release is an instruction. No money moves",
        ],
        action: "Sign in",
        href: "/sign-in",
      },
    ],
    /** The small cards drawn beside each tab. Illustrations, not live data. */
    visuals: {
      sample: "Illustration",
      community: {
        title: "No lights in the Grade 7 classrooms",
        place: "Grade 7 block, all four classrooms",
        status: "Repair claimed",
        note: "Not verified yet",
        affected: "4 people affected",
      },
      supplier: {
        title: "Invoice blocked",
        count: "The rules found 2 problems.",
        reasons: ["13 invoiced, but only 12 arrived.", "13 invoiced, 12 ordered."],
        ai: "Bona AI explains what the rules found. It decides nothing.",
      },
      reviewer: {
        title: "Answer these at the school",
        checks: [
          "I am at the school now",
          "The repair matches what the school says",
          "It is safe for learners to use",
        ],
        yes: "Yes",
        action: "Verify completion",
      },
      approver: {
        title: "Release locked",
        count: "1 thing must happen first.",
        checks: [
          { done: true, text: "The supplier acknowledged the order." },
          { done: true, text: "The invoice matches the order and the delivery." },
          { done: false, text: "Waiting for the independent reviewer." },
        ],
      },
    },
  },

  metrics: {
    label: "Built to be checked",
    title: ["Tested before", "anyone has to trust it"],
    items: [
      {
        value: "600+",
        title: "automated app tests",
        body: "Run before every change is accepted.",
      },
      {
        value: "34",
        title: "program tests",
        body: "On the Anchor program, including every refusal: the wrong signer, the early release, the mismatch.",
      },
      {
        value: "6",
        title: "steps on the test network",
        body: "The sample case writes each of its steps to Solana devnet.",
      },
    ],
  },

  bento: {
    label: "Smarter accountability",
    title: ["Stay ahead of every claim", "and every invoice"],
    cards: [
      {
        title: "Keep the trail in one place",
        body: "From the report to the release instruction, each step shows who took it and its proof.",
      },
      {
        title: "Catch a wrong invoice",
        body: "Rules block an invoice that does not match the order and the delivery. Bona AI explains why, and decides nothing.",
      },
      {
        title: "Lock the release",
        body: "The release stays locked until an independent reviewer has verified the repair.",
      },
    ],
    widgets: {
      trail: ["Problem reported", "Work order approved", "Delivery recorded"],
      recorded: "Recorded",
      chips: ["13 invoiced, 12 arrived", "Invoice blocked", "Explained by Bona AI"],
      lock: "Locked until verified",
    },
  },

  showcase: {
    label: "A finished case",
  },

  funding: {
    label: "Who funds it",
    title: ["Free for schools.", "Funded by who needs proof."],
    intro:
      "A school never has to fund its own checking. The people who need proof that funded work was done fund it.",
    included: "What is included:",
    plans: [
      {
        name: "Schools and communities",
        body: "For learners, parents, staff and school governing bodies.",
        price: "Free",
        unit: "always",
        points: [
          "Report a problem",
          "Follow every step",
          "Say that it affects you",
          "The public record and its proofs",
          "Help from Bona AI",
        ],
        action: "Report a problem",
        href: "/report",
      },
      {
        name: "Funders and districts",
        body: "For programmes that fund school repairs and need proof the work was done.",
        price: "By arrangement",
        unit: "no prices are set yet",
        points: [
          "Everything for schools and communities",
          "Work orders, invoices and delivery records",
          "Invoice matching by rules",
          "Independent verification before any release",
          "A named role and a key for each step",
        ],
        action: "See the cases",
        href: "/issues",
      },
    ],
  },

  promise: {
    label: "Our promise",
    title: ["Less trust-me.", "More show-me."],
    by: "The BonaWork team",
    where: "Built for South African public schools",
    quote:
      "BonaWork doesn't call work done because someone says so. It keeps the claim, makes someone else check it, and only then lets the money decision through.",
    firstLabel: "A first school",
    first: "The principal of Thaba Jabula Secondary School told us they would use it.",
  },

  faq: {
    label: "Questions",
    title: "Frequently asked questions",
    items: [
      {
        q: "Is BonaWork live with real schools?",
        a: "Not yet. It runs on the Solana devnet test network with sample schools and people, and no real school uses it today. The principal of Thaba Jabula Secondary School told us they would use it.",
      },
      {
        q: "Does any money move?",
        a: "No. The last step records a release instruction on a test network. It is an instruction, not a payment.",
      },
      {
        q: "Who is the independent reviewer?",
        a: "Someone who does not work for the school or the supplier, with their own role and their own key. The escrow program refuses a reviewer who is also the school, the funder or the contractor.",
      },
      {
        q: "What can the public see?",
        a: "Each step, the role that took it, the time and its proof. Amounts, supplier names, documents and people's names stay private.",
      },
      {
        q: "What does Bona AI do?",
        a: "It reads a pasted invoice into fields, explains why an invoice was blocked, and answers questions from the recorded cases. It never approves, verifies or authorises anything.",
      },
      {
        q: "Why use a blockchain?",
        a: "Several parties share one history, and the party being checked should not control it. The program on Solana enforces the rules, and anyone can read the record.",
      },
    ],
  },

  cta: {
    title: ["Report it. Check it.", "Prove it."],
    sub: "Start with a problem at your school, or look at a case that has been through every step.",
  },

  footer: {
    description:
      "BonaWork follows a school repair from the report to the release instruction, with a proof at every step.",
    columns: [
      {
        title: "Community",
        links: [
          { label: "Report a problem", href: "/report" },
          { label: "Track a report", href: "/track" },
          { label: "Issues", href: "/issues" },
          { label: "Schools", href: "/schools" },
        ],
      },
      {
        title: "Check",
        links: [
          { label: "Check a file", href: "/verify" },
          { label: "Bona AI", href: "/assistant" },
          { label: "Sign in", href: "/sign-in" },
        ],
      },
      {
        title: "Open",
        links: [
          { label: "Source code", href: REPOSITORY },
          { label: "Program on Solana devnet", href: REGISTRY },
        ],
      },
    ],
    newTab: "opens in a new tab",
    testnet: "Test network only. No real money moves.",
  },
};
