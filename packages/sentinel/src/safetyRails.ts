import { SentinelDb } from "./types";

const MAX_HEALS_PER_WINDOW_HOURS = 4;
const MAX_CONSECUTIVE_REJECTIONS = 3;

export async function canAttemptHeal(
  db: SentinelDb,
  collectorId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const consecutiveRejections = await db.countConsecutiveRejections(collectorId);
  if (consecutiveRejections >= MAX_CONSECUTIVE_REJECTIONS) {
    return { allowed: false, reason: `escalated: ${consecutiveRejections} consecutive rejected heals, manual review required` };
  }

  const recentAttempts = await db.countRecentHealAttempts(collectorId, MAX_HEALS_PER_WINDOW_HOURS);
  if (recentAttempts > 0) {
    return { allowed: false, reason: `rate-limited: a heal was already attempted within the last ${MAX_HEALS_PER_WINDOW_HOURS} hour window` };
  }

  return { allowed: true };
}
