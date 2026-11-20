import {
  EVENT_RULE,
  type Overall,
  type RegistryEvent,
  type VerifyResult,
} from "./verify";

/**
 * The verifier's answers in plain words. `verify.ts` decides the result and
 * explains each step precisely; this file only chooses what an ordinary phone
 * user reads first. The precise result code and the steps stay available under
 * "Technical details".
 */

export type Tone = "good" | "bad" | "warn" | "neutral" | "sample";

export interface PlainAnswer {
  title: string;
  body: string;
  tone: Tone;
  /** One more sentence: what to try next, or what the answer does not mean. */
  note?: string;
}

/** The five results in a few words each, for the guide at the foot of the page. */
export const OUTCOME_GUIDE: { outcome: Overall; plain: string; means: string }[] = [
  {
    outcome: "VERIFIED",
    plain: "Verified",
    means: "what you hold is exactly what the blockchain has on record.",
  },
  {
    outcome: "MISMATCH",
    plain: "Not the same",
    means: "the blockchain holds a record, but not of this exact file or text.",
  },
  {
    outcome: "NOT_FOUND",
    plain: "No record found",
    means:
      "the receipt's transaction is not on this network, or it holds no such record.",
  },
  {
    outcome: "REJECTED",
    plain: "Cannot be checked here",
    means:
      "the receipt is damaged, is for another network, or does not point to the Bona Chain contract.",
  },
  {
    outcome: "CANNOT_VERIFY",
    plain: "Could not check right now",
    means: "the network could not be reached. Nothing is decided either way.",
  },
];

/** How this site names the network it reads. Only Fuji has a name here: it is a test network. */
export function networkName(chainId: number): string {
  return chainId === 43113 ? "Avalanche Fuji test network" : `network eip155:${chainId}`;
}

/** What a record is, for the "Checking" line when the link carried no caption. */
export const RECORD_NAME: Record<RegistryEvent, string> = {
  EvidenceRegistered: "A photo or file",
  ReportRegistered: "A report",
  ReportAcknowledged: "A school's acknowledgement of a report",
  InterimProtectionRecorded: "A temporary protection",
  RepairClaimed: "A repair claim",
  RepairVerified: "A review that confirmed a repair",
  RepairDisputed: "A review that disputed a repair",
  WorkOrderApproved: "A work order approval",
  WorkOrderAcknowledged: "A supplier's acknowledgement of a work order",
  InvoiceSubmitted: "A supplier invoice",
  GoodsReceiptRecorded: "A goods receipt",
  MatchRecorded: "A three-way match result",
  PaymentDisputeOpened: "A payment dispute being opened",
  PaymentDisputeClosed: "A payment dispute being closed",
  ReleaseAuthorised: "A release authorisation",
};

const RECORD_NOUN: Record<RegistryEvent, string> = {
  EvidenceRegistered: "file",
  ReportRegistered: "report",
  ReportAcknowledged: "acknowledgement",
  InterimProtectionRecorded: "temporary protection",
  RepairClaimed: "repair claim",
  RepairVerified: "review",
  RepairDisputed: "review",
  WorkOrderApproved: "work order",
  WorkOrderAcknowledged: "acknowledgement",
  InvoiceSubmitted: "invoice",
  GoodsReceiptRecorded: "goods receipt",
  MatchRecorded: "match result",
  PaymentDisputeOpened: "payment dispute",
  PaymentDisputeClosed: "payment dispute",
  ReleaseAuthorised: "release authorisation",
};

/**
 * What a record that carries nothing to compare says happened, for the three
 * finance records checked by their presence alone. The words continue
 * "Avalanche has a record that ...".
 */
const PRESENCE: Partial<Record<RegistryEvent, { what: string; note?: string }>> = {
  WorkOrderAcknowledged: { what: "the supplier acknowledged the work order" },
  PaymentDisputeOpened: {
    what: "a payment dispute was opened on the work order",
    note: "While a dispute is open, no release can be authorised.",
  },
  PaymentDisputeClosed: { what: "a payment dispute on the work order was closed" },
};

/**
 * What a Verified finance record does and does not show. A step of the
 * procurement trail is a record that the step was taken, never proof that the
 * work was done or that anyone was paid.
 */
function financeNote(event: RegistryEvent, result: VerifyResult): string | undefined {
  switch (event) {
    case "WorkOrderApproved":
      return "This shows the order was approved. It does not show that the work was done.";
    case "InvoiceSubmitted":
      return "This shows the invoice was submitted. It does not show that it was correct.";
    case "GoodsReceiptRecorded":
      return "This shows what the receiving officer recorded as delivered.";
    case "MatchRecorded":
      if (result.facts.matchPassed === true) {
        return "The record says the order, the invoice and the goods receipt agreed.";
      }
      if (result.facts.matchPassed === false) {
        return "The record says the order, the invoice and the goods receipt did not agree, so no release can be authorised on it.";
      }
      return undefined;
    case "ReleaseAuthorised":
      return "This is a release instruction. No money moves on the blockchain, and it does not show that anyone received money.";
    default:
      return undefined;
  }
}

/** For the checking screen: what a record with nothing to compare is, in one sentence. */
export function nothingToCompare(event: RegistryEvent): string {
  const subject = PRESENCE[event]
    ? lowerFirst(RECORD_NAME[event])
    : "a school’s acknowledgement of a report";
  return `This receipt is for ${subject}. There is no file to compare, so nothing more is needed.`;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** The word for what the person holds: "photo" for a picture, otherwise by record type. */
export function nounFor(event: RegistryEvent, fileType?: string): string {
  if (event === "EvidenceRegistered" && fileType?.startsWith("image/")) return "photo";
  return RECORD_NOUN[event];
}

export const SAMPLE_ANSWER: PlainAnswer = {
  tone: "sample",
  title: "Sample record: nothing to check",
  body: "This receipt comes from Bona Chain's practice data, not from Avalanche. It has no transaction, so this site did not call the network.",
  note: "This is not a Verified result and not a real record.",
};

/** The one answer a person reads, for a result from `verify`. */
export function plainAnswer(
  result: VerifyResult,
  context: { event: RegistryEvent; noun: string; network: string },
): PlainAnswer {
  const { event, noun, network } = context;
  const failed = result.steps.find((step) => step.status === "fail")?.id;
  const rule = EVENT_RULE[event];
  /**
   * False for an acknowledgement: there is no content to compare, only the
   * event. A payment dispute is compared only when a fingerprint was supplied.
   */
  const hashed =
    rule.field !== null &&
    (rule.field === "digest" ||
      rule.document !== null ||
      result.facts.recomputedDigest !== undefined);
  const presence = PRESENCE[event] ?? null;

  switch (result.overall) {
    case "VERIFIED": {
      if (!hashed && presence) {
        return {
          tone: "good",
          title: "Verified",
          body: result.facts.reportIdExpected
            ? `Avalanche has a record that ${presence.what} for this report.`
            : `Avalanche has a record that ${presence.what} in this transaction.`,
          note: presence.note,
        };
      }
      if (!hashed) {
        return {
          tone: "good",
          title: "Verified",
          body: result.facts.reportIdExpected
            ? "Avalanche has a record that the school acknowledged this report."
            : "Avalanche has a record of a school acknowledging a report in this transaction.",
        };
      }
      return {
        tone: "good",
        title: "Verified",
        body: `Avalanche has this exact ${noun} on record. It has not been changed.`,
        note:
          event === "RepairClaimed"
            ? "This shows the claim was recorded. It does not show that the repair was done: only an independent review can confirm that."
            : financeNote(event, result),
      };
    }

    case "MISMATCH": {
      if (failed === "reportId") {
        return {
          tone: "bad",
          title: "Recorded, but for a different report",
          body: `Avalanche has this exact ${noun} on record, but under a different report from the one named here.`,
        };
      }
      if (!hashed && presence) {
        return {
          tone: "bad",
          title: "For a different report",
          body: "This transaction holds a record of this kind, but for a different report from the one named here.",
        };
      }
      if (!hashed) {
        return {
          tone: "bad",
          title: "For a different report",
          body: "This transaction records an acknowledgement, but of a different report from the one named here.",
        };
      }
      if (event === "MatchRecorded" && result.facts.matchPassed !== undefined) {
        // The fingerprint was found; what differs is the outcome recorded next to it.
        return {
          tone: "bad",
          title: "The outcome does not agree",
          body: `Avalanche has this exact match result on record, but it says the match ${result.facts.matchPassed ? "passed" : "did not pass"}. These details say the opposite.`,
        };
      }
      return {
        tone: "bad",
        title: "Not the same",
        body: `This is not the exact ${noun} that was recorded. Even a small change makes it different.`,
        note:
          event === "EvidenceRegistered"
            ? "A screenshot, an edited copy, or a copy sent through a chat app is not the same file. Try the original."
            : "Copy the details again from the same record in Bona Chain and try once more.",
      };
    }

    case "NOT_FOUND": {
      if (failed === "event") {
        return {
          tone: "warn",
          title: "No record found",
          body: "The transaction in this receipt exists, but it does not hold the record the receipt describes.",
        };
      }
      if (result.facts.blockNumber !== undefined) {
        return {
          tone: "warn",
          title: "No record found",
          body: "The transaction in this receipt failed, so nothing was recorded.",
        };
      }
      return {
        tone: "warn",
        title: "No record found",
        body: `The ${network} has no transaction for this receipt. It may not be confirmed yet, or the receipt is not a real one.`,
      };
    }

    case "REJECTED": {
      if (failed === "chain") {
        return {
          tone: "warn",
          title: "This receipt is for another network",
          body: `This site reads the ${network}. The receipt names a different one, so it cannot be checked here.`,
        };
      }
      if (failed === "contract" && result.verifier.expectedFactoryAddress) {
        // The factory was asked. It either does not know the contract, or made it for another purpose.
        return result.facts.contractKind
          ? {
              tone: "warn",
              title: "Not a record of this kind",
              body: "This receipt points to a Bona Chain contract that does not keep this kind of record, so this site does not accept it.",
            }
          : {
              tone: "warn",
              title: "Not a Bona Chain record",
              body: "This contract was not created by the Bona Chain factory. Anyone can make a look-alike, so this site does not accept it.",
            };
      }
      if (failed === "contract" || failed === "transaction") {
        return {
          tone: "warn",
          title: "Not a Bona Chain record",
          body: "This receipt does not point to the Bona Chain contract. Anyone can make a look-alike, so this site does not accept it.",
        };
      }
      return {
        tone: "warn",
        title: "This receipt cannot be checked",
        body: `The receipt is damaged, or it does not go with this ${noun}.`,
        note: "Copy the receipt again from the record in Bona Chain and try once more.",
      };
    }

    case "CANNOT_VERIFY":
      return {
        tone: "neutral",
        title: "Could not check right now",
        body: "This site could not read the Avalanche network just now, so nothing was checked.",
        note: `This says nothing about your ${noun}. Please try again in a moment.`,
      };
  }
}

/** "18 Nov 2026, 10:17" in the reader's own time zone. */
export function formatRecordedAt(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(date);
}
