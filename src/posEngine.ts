/**
 * Australia Post Retail POS — Store-Inventory-Aware Stamp Optimization Engine
 *
 * Domain Context (Hurlstone Park LPO — 150–200 daily customer transactions):
 * When franking a parcel with physical stamps ('S' key) instead of a thermal
 * postage label ('L' key), the legacy POS system executes a naive greedy algorithm
 * over all theoretical Australia Post denominations ($10.00, $5.00, $2.00, etc.).
 *
 * Frontline Operational Bottlenecks:
 * 1. LPO counter drawers do NOT stock high-denomination $10.00 or $5.00 stamps.
 * 2. LPOs earn a significantly higher retail profit margin selling through
 *    $1.85 (185c) base/thematic stamp booklets (Disney, Marvel, NFL, Aussie Icons).
 * 3. Staff must manually calculate how many $1.85 stamps fit into the parcel rate
 *    and make up the exact remainder using in-stock low-denomination make-up stamps
 *    ($1.00, 50c, 25c, 20c, 10c, 5c).
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
  remainderCents: number;
  remainderFormatted: string;
  remainderAllocations: StampAllocation[];
  allAllocations: StampAllocation[];
  totalStampsPhysicalCount: number;
  verifiedExactMatch: boolean;
}

/**
 * Standard LPO counter drawer make-up stamp denominations (in cents),
 * sorted descending for exact remainder resolution after $1.85 allocation.
 */
export const DEFAULT_LPO_MAKEUP_DENOMINATIONS_CENTS = [
  100, // $1.00
  50,  // $0.50
  25,  // $0.25
  20,  // $0.20
  10,  // $0.10
  5,   // $0.05
] as const;

/**
 * Legacy POS theoretical denominations (in cents) that trigger counter drawer
 * mismatches when staff press 'S' (Stamp) instead of 'L' (Label).
 */
export const LEGACY_POS_DENOMINATIONS_CENTS = [
  1000, // $10.00 (Rarely stocked in LPO counter drawers)
  500,  // $5.00  (Rarely stocked in LPO counter drawers)
  200,  // $2.00
  185,  // $1.85
  100,  // $1.00
  50,   // $0.50
  20,   // $0.20
  10,   // $0.10
  5,    // $0.05
] as const;

export const BASE_THEMATIC_STAMP_CENTS = 185; // $1.85 Domestic Base / Thematic Stamp

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
 * Computes the Store-Inventory-Aware POS Stamp Plan.
 *
 * Step 1: Maximizes $1.85 (185c) thematic/base stamps to maximize LPO retail margin
 *         and align with physical counter booklet inventory.
 * Step 2: Resolves the exact remaining cents using in-stock small make-up denominations
 *          via minimum-stamp dynamic programming (with greedy fallback).
 */
export function optimizePosStamps(
  targetInCents: number,
  makeupDenominationsCents: readonly number[] = DEFAULT_LPO_MAKEUP_DENOMINATIONS_CENTS
): PosStampPlan {
  if (!Number.isInteger(targetInCents) || targetInCents <= 0) {
    throw new Error(`Invalid targetInCents: ${targetInCents}. Must be a positive integer.`);
  }
  if (targetInCents % 5 !== 0) {
    throw new Error(`Target postage ${targetInCents}c must be a multiple of 5c.`);
  }

  const primary185Count = Math.floor(targetInCents / BASE_THEMATIC_STAMP_CENTS);
  const primary185SubtotalCents = primary185Count * BASE_THEMATIC_STAMP_CENTS;
  const remainderCents = targetInCents - primary185SubtotalCents;

  const remainderAllocations = solveExactRemainder(
    remainderCents,
    makeupDenominationsCents
  );

  const allAllocations: StampAllocation[] = [];
  if (primary185Count > 0) {
    allAllocations.push({
      denominationCents: BASE_THEMATIC_STAMP_CENTS,
      label: formatDenominationLabel(BASE_THEMATIC_STAMP_CENTS),
      count: primary185Count,
      subtotalCents: primary185SubtotalCents,
    });
  }
  allAllocations.push(...remainderAllocations);

  const totalComputedCents = allAllocations.reduce(
    (sum, item) => sum + item.subtotalCents,
    0
  );
  const totalStampsPhysicalCount = allAllocations.reduce(
    (sum, item) => sum + item.count,
    0
  );

  return {
    targetCents: targetInCents,
    targetFormatted: formatCentsToAud(targetInCents),
    primary185Count,
    primary185SubtotalCents,
    remainderCents,
    remainderFormatted: formatCentsToAud(remainderCents),
    remainderAllocations,
    allAllocations,
    totalStampsPhysicalCount,
    verifiedExactMatch: totalComputedCents === targetInCents,
  };
}

/**
 * Uses bounded dynamic programming to find the minimum physical stamp count
 * for the remainder using only available counter make-up denominations.
 */
function solveExactRemainder(
  remainderCents: number,
  denominations: readonly number[]
): StampAllocation[] {
  if (remainderCents === 0) {
    return [];
  }

  const sortedDenoms = [...denominations].sort((a, b) => b - a);
  const dp = new Array<number>(remainderCents + 1).fill( Number.POSITIVE_INFINITY );
  const chosenDenom = new Array<number>(remainderCents + 1).fill(-1);
  dp[0] = 0;

  for (let amount = 5; amount <= remainderCents; amount += 5) {
    for (const denom of sortedDenoms) {
      if (amount >= denom && dp[amount - denom] + 1 < dp[amount]) {
        dp[amount] = dp[amount - denom] + 1;
        chosenDenom[amount] = denom;
      }
    }
  }

  if (!Number.isFinite(dp[remainderCents])) {
    throw new Error(
      `Cannot resolve remainder ${remainderCents}c with provided denominations: [${sortedDenoms.join(", ")}]`
    );
  }

  const counts = new Map<number, number>();
  let cursor = remainderCents;
  while (cursor > 0) {
    const denom = chosenDenom[cursor];
    counts.set(denom, (counts.get(denom) ?? 0) + 1);
    cursor -= denom;
  }

  return sortedDenoms
    .filter((d) => (counts.get(d) ?? 0) > 0)
    .map((d) => {
      const count = counts.get(d)!;
      return {
        denominationCents: d,
        label: formatDenominationLabel(d),
        count,
        subtotalCents: d * count,
      };
    });
}

/**
 * Simulates the legacy POS 'S' key naive greedy behavior for side-by-side comparison.
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
