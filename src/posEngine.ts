/**
 * Australia Post Retail (Post+ POS) — $1.85 Thematic Stamp Calculator & Counter Reference
 *
 * Domain Context (Hurlstone Park LPO — 150–200 daily customer transactions):
 * When putting physical stamps on a parcel in the Australia Post Post+ system ('S' key)
 * instead of printing a thermal label ('L' key), Post+ does not track local stock at hand.
 * Because it has no visibility into counter stock, Post+ defaults to the highest-value
 * stamps ($10.00, $5.00, $2.00) and disregards the $1.85 thematic stamps (Disney, Marvel,
 * NFL, Aussie Icons).
 *
 * Everyday Counter Workflow (matching `Postage_Quick_sheet.html`):
 * 1. Calculate how many $1.85 thematic stamps fit into the total parcel postage rate:
 *    `primary185Count = Math.floor(targetInCents / 185)`
 * 2. Compute the remaining cost:
 *    `remainderCents = targetInCents - (primary185Count * 185)`
 * 3. Staff can immediately grab the required number of $1.85 stamps and quickly pick up
 *    whatever small make-up stamps are available at the counter (50c, 30c, 20c, 10c, 5c)
 *    to cover the remaining cost.
 */

export interface StampAllocation {
  denominationCents: number;
  label: string;
  count: number;
  subtotalCents: number;
}

export interface PosStampPlan {
  targetCents: number;
  targetFormatted: string;
  primary185Count: number;
  primary185SubtotalCents: number;
  primary185SubtotalFormatted: string;
  remainderCents: number;
  remainderFormatted: string;
  verifiedExactMatch: boolean;
}

export const BASE_THEMATIC_STAMP_CENTS = 185; // $1.85 Domestic Base / Thematic Stamp

/**
 * Standard low-denomination make-up stamps carried at most post offices (50c, 30c, 20c, 10c, 5c)
 * that staff pick up to cover the remaining cost after placing the $1.85 thematic stamps.
 */
export const CARRIED_MAKEUP_DENOMINATIONS_CENTS = [50, 30, 20, 10, 5] as const;

/**
 * Post+ POS theoretical denominations (in cents) used when staff press 'S' (Stamp).
 * Because Post+ does not track local stock at hand, it defaults to highest-value
 * stamps first and disregards thematic $1.85 stamps.
 */
export const LEGACY_POS_DENOMINATIONS_CENTS = [
  1000, // $10.00
  500,  // $5.00
  200,  // $2.00
  185,  // $1.85
  100,  // $1.00
  50,   // 50c
  30,   // 30c
  20,   // 20c
  10,   // 10c
  5,    // 5c
] as const;

export function formatCentsToAud(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatDenominationLabel(cents: number): string {
  if (cents >= 100) {
    return `$${(cents / 100).toFixed(2)}`;
  }
  return `${cents}c`;
}

/**
 * Quickly calculates how many $1.85 thematic stamps are needed for a parcel
 * and the exact remaining cost, directly matching `Postage_Quick_sheet.html`.
 */
export function optimizePosStamps(
  targetInCents: number,
  thematicStampCents: number = BASE_THEMATIC_STAMP_CENTS
): PosStampPlan {
  if (!Number.isInteger(targetInCents) || targetInCents <= 0) {
    throw new Error(`Invalid targetInCents: ${targetInCents}. Must be a positive integer.`);
  }
  if (targetInCents % 5 !== 0) {
    throw new Error(`Target postage ${targetInCents}c must be a multiple of 5c.`);
  }

  const primary185Count = Math.floor(targetInCents / thematicStampCents);
  const primary185SubtotalCents = primary185Count * thematicStampCents;
  const remainderCents = targetInCents - primary185SubtotalCents;

  return {
    targetCents: targetInCents,
    targetFormatted: formatCentsToAud(targetInCents),
    primary185Count,
    primary185SubtotalCents,
    primary185SubtotalFormatted: formatCentsToAud(primary185SubtotalCents),
    remainderCents,
    remainderFormatted: formatCentsToAud(remainderCents),
    verifiedExactMatch: primary185SubtotalCents + remainderCents === targetInCents,
  };
}

/**
 * Simulates the Post+ POS 'S' key behavior (which lacks stock-at-hand tracking
 * and defaults to highest denominations first).
 */
export function simulateLegacyPosGreedy(targetInCents: number): StampAllocation[] {
  let remaining = targetInCents;
  const allocations: StampAllocation[] = [];

  for (const denom of LEGACY_POS_DENOMINATIONS_CENTS) {
    if (remaining >= denom) {
      const count = Math.floor(remaining / denom);
      remaining -= count * denom;
      allocations.push({
        denominationCents: denom,
        label: formatDenominationLabel(denom),
        count,
        subtotalCents: count * denom,
      });
    }
  }

  return allocations;
}

/**
 * Official Australia Post Parcel Post, Express Post, and Letter Rate Tiers
 * matching the frontline A4 `Postage_Quick_sheet.html` reference matrix.
 */
export const AUSPOST_COUNTER_RATE_TIERS = {
  parcelPost: [
    { tier: "Up to 250g", totalCents: 1020, expected185Count: 5, expectedRemainderCents: 95 },
    { tier: "250g to 500g", totalCents: 1170, expected185Count: 6, expectedRemainderCents: 60 },
    { tier: "500g to 1kg", totalCents: 1600, expected185Count: 8, expectedRemainderCents: 120 },
    { tier: "1kg to 3kg", totalCents: 2025, expected185Count: 10, expectedRemainderCents: 175 },
    { tier: "3kg to 5kg", totalCents: 2445, expected185Count: 13, expectedRemainderCents: 40 },
  ],
  expressPost: [
    { tier: "Up to 250g", totalCents: 1320, expected185Count: 7, expectedRemainderCents: 25 },
    { tier: "250g to 500g", totalCents: 1520, expected185Count: 8, expectedRemainderCents: 40 },
    { tier: "500g to 1kg", totalCents: 2000, expected185Count: 10, expectedRemainderCents: 150 },
    { tier: "1kg to 3kg", totalCents: 2475, expected185Count: 13, expectedRemainderCents: 70 },
    { tier: "3kg to 5kg", totalCents: 3295, expected185Count: 17, expectedRemainderCents: 150 },
  ],
  letters: [
    { tier: "Small (to 250g)", totalCents: 185, expected185Count: 1, expectedRemainderCents: 0 },
    { tier: "Large (to 125g)", totalCents: 370, expected185Count: 2, expectedRemainderCents: 0 },
    { tier: "Large (to 250g)", totalCents: 555, expected185Count: 3, expectedRemainderCents: 0 },
    { tier: "Large (to 500g)", totalCents: 925, expected185Count: 5, expectedRemainderCents: 0 },
  ],
} as const;
