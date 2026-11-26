/**
 * Limits on new guided-demo cases. Each case costs devnet SOL once it is
 * funded (escrow rent and network fees), and the platform keys hold little,
 * so a browser reuses its case until it finishes or restarts, and new cases
 * are capped per browser, per IP address and for the whole deployment.
 *
 *   BONAWORK_DEMO_MODE              "off" hides the guided demo (default on)
 *   BONAWORK_DEMO_CASES_PER_SESSION new cases one browser may make (default 2: the first and one restart)
 *   BONAWORK_DEMO_CASES_PER_IP_HOUR new cases per IP address per hour (default 3)
 *   BONAWORK_DEMO_CASES_PER_HOUR    new cases per hour for the whole deployment (default 10)
 *   BONAWORK_DEMO_MIN_SOL           below this feepayer or admin balance, no new case (default 0.05)
 */

type Source = Record<string, string | undefined>;

export type DemoLimits = {
  perSession: number;
  perIpHour: number;
  globalHour: number;
  /** Lamports. */
  minLamports: bigint;
};

export function demoModeOn(source: Source = process.env): boolean {
  const value = source.BONAWORK_DEMO_MODE?.trim().toLowerCase();
  return !(value === "off" || value === "false" || value === "0");
}

function positiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

export function readDemoLimits(source: Source = process.env): DemoLimits {
  const sol = Number(source.BONAWORK_DEMO_MIN_SOL ?? "");
  const minSol =
    Number.isFinite(sol) && sol >= 0 && source.BONAWORK_DEMO_MIN_SOL ? sol : 0.05;
  return {
    perSession: positiveInt(source.BONAWORK_DEMO_CASES_PER_SESSION, 2),
    perIpHour: positiveInt(source.BONAWORK_DEMO_CASES_PER_IP_HOUR, 3),
    globalHour: positiveInt(source.BONAWORK_DEMO_CASES_PER_HOUR, 10),
    minLamports: BigInt(Math.round(minSol * 1_000_000_000)),
  };
}

export type CaseCounts = {
  /** Cases this browser has made (from its signed demo cookie). */
  session: number;
  ipLastHour: number;
  globalLastHour: number;
};

export type CaseDecision =
  { ok: true } | { ok: false; reason: "session" | "ip" | "global"; message: string };

export function mayCreateCase(counts: CaseCounts, limits: DemoLimits): CaseDecision {
  if (counts.session >= limits.perSession) {
    return {
      ok: false,
      reason: "session",
      message:
        "This browser has used its demo cases. Carry on with the current one, or come back in an hour.",
    };
  }
  if (counts.ipLastHour >= limits.perIpHour) {
    return {
      ok: false,
      reason: "ip",
      message: "Many demos started from this network in the last hour. Try again later.",
    };
  }
  if (counts.globalLastHour >= limits.globalHour) {
    return {
      ok: false,
      reason: "global",
      message: "Many people are trying the demo right now. Try again later.",
    };
  }
  return { ok: true };
}

/**
 * New cases per IP address in a sliding window. In memory, per server
 * instance: a best-effort extra check; the hourly cap for the deployment is
 * counted in the database.
 */
export class IpWindow {
  private readonly hits = new Map<string, number[]>();
  constructor(private readonly windowMs = 3_600_000) {}

  count(ip: string, now = Date.now()): number {
    const fresh = (this.hits.get(ip) ?? []).filter((t) => now - t < this.windowMs);
    if (fresh.length === 0) this.hits.delete(ip);
    else this.hits.set(ip, fresh);
    return fresh.length;
  }

  record(ip: string, now = Date.now()): void {
    this.count(ip, now);
    this.hits.set(ip, [...(this.hits.get(ip) ?? []), now]);
  }
}

/** The caller's address as the platform's proxy reports it; "unknown" when absent. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}
