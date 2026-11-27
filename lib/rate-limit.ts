import "server-only";

import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

export type RateLimitRule = {
  namespace: string;
  identifier: string;
  limit: number;
  windowSeconds: number;
};

type HeaderReader = Pick<Headers, "get">;

/** Vercel overwrites x-forwarded-for with the connecting client IP. */
export function getTrustedClientIp(source: HeaderReader): string | null {
  const forwarded = source.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = source.get("x-real-ip")?.trim();

  for (const candidate of [forwarded, realIp]) {
    if (candidate && isIP(candidate) !== 0) return candidate;
  }

  return null;
}

function bucketKey(namespace: string, identifier: string): string {
  const digest = createHash("sha256")
    .update(namespace + ":" + identifier)
    .digest("hex");
  return namespace + ":" + digest;
}

/**
 * Checks limits in the database so counters are shared across Vercel instances.
 * Database errors fail closed; the caller should return an unavailable response.
 */
export async function enforceRateLimits(rules: RateLimitRule[]): Promise<boolean> {
  if (rules.length === 0) return true;

  const admin = createAdminClient();

  for (const rule of rules) {
    const { data, error } = await admin.rpc("consume_api_rate_limit", {
      p_bucket_key: bucketKey(rule.namespace, rule.identifier),
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds
    });

    if (error) {
      console.error("Rate-limit service failed:", { code: error.code });
      throw new Error("Rate limiting is unavailable.");
    }

    if (data !== true) return false;
  }

  return true;
}

export async function getCurrentRequestIp(): Promise<string | null> {
  return getTrustedClientIp(await headers());
}
