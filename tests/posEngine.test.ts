import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AUSPOST_COUNTER_RATE_TIERS,
  BASE_THEMATIC_STAMP_CENTS,
  optimizePosStamps,
  simulateLegacyPosGreedy,
} from "../src/posEngine.ts";
import {
  AUSPOST_COIN_BAG_SPECS,
  validateCoinBagWeight,
  type AustralianCoinDenomination,
} from "../src/coinWeigher.ts";

describe("Australia Post Store-Inventory-Aware POS Stamp Engine", () => {
  it("resolves all Parcel Post tiers with 100% accuracy matching Postage_Quick_sheet.html", () => {
    for (const rate of AUSPOST_COUNTER_RATE_TIERS.parcelPost) {
      const plan = optimizePosStamps(rate.totalCents);
      assert.equal(plan.verifiedExactMatch, true, `Failed exact match for ${rate.tier}`);
      assert.equal(
        plan.primary185Count,
        rate.expected185Count,
        `Mismatch $1.85 count for Parcel Post ${rate.tier}`
      );
      assert.equal(
        plan.remainderCents,
        rate.expectedRemainderCents,
        `Mismatch remainder cents for Parcel Post ${rate.tier}`
      );

      // Verify no $10.00 or $5.00 stamps are ever recommended
      for (const alloc of plan.allAllocations) {
        assert.ok(
          alloc.denominationCents <= BASE_THEMATIC_STAMP_CENTS,
          `Unexpected high denomination ${alloc.label} recommended`
        );
      }
    }
  });

  it("resolves all Express Post tiers with 100% accuracy matching Postage_Quick_sheet.html", () => {
    for (const rate of AUSPOST_COUNTER_RATE_TIERS.expressPost) {
      const plan = optimizePosStamps(rate.totalCents);
      assert.equal(plan.verifiedExactMatch, true, `Failed exact match for ${rate.tier}`);
      assert.equal(
        plan.primary185Count,
        rate.expected185Count,
        `Mismatch $1.85 count for Express Post ${rate.tier}`
      );
      assert.equal(
        plan.remainderCents,
        rate.expectedRemainderCents,
        `Mismatch remainder cents for Express Post ${rate.tier}`
      );
    }
  });

  it("resolves all Domestic Letter tiers using exact multiples of $1.85 stamps", () => {
    for (const rate of AUSPOST_COUNTER_RATE_TIERS.letters) {
      const plan = optimizePosStamps(rate.totalCents);
      assert.equal(plan.verifiedExactMatch, true);
      assert.equal(plan.primary185Count, rate.expected185Count);
      assert.equal(plan.remainderCents, 0);
      assert.equal(plan.remainderAllocations.length, 0);
    }
  });

  it("demonstrates why Legacy POS 'S' key fails LPO drawer stock on $10.20 Parcel Post", () => {
    const legacyPlan = simulateLegacyPosGreedy(1020);
    // Legacy greedy recommends 1x $10.00 + 1x 20c
    assert.equal(legacyPlan[0].denominationCents, 1000);
    assert.equal(legacyPlan[0].count, 1);

    // Store-Inventory-Aware POS Engine recommends 5x $1.85 ($9.25) + $0.95 (50c + 25c + 20c)
    const lpoPlan = optimizePosStamps(1020);
    assert.equal(lpoPlan.primary185Count, 5);
    assert.equal(lpoPlan.remainderCents, 95);
    assert.deepEqual(
      lpoPlan.remainderAllocations.map((a) => `${a.count}x${a.label}`),
      ["1x50c", "1x25c", "1x20c"]
    );
  });
});

describe("Australia Post End-of-Day Coin Bag Scale Validator (±3g Tolerance)", () => {
  it("validates exact target weights and ±3g tolerance boundaries across all 6 coin denominations", () => {
    const denominations = Object.keys(
      AUSPOST_COIN_BAG_SPECS
    ) as AustralianCoinDenomination[];

    for (const denom of denominations) {
      const spec = AUSPOST_COIN_BAG_SPECS[denom];

      // Exact target weight
      const exact = validateCoinBagWeight(denom, spec.targetWeightGrams);
      assert.equal(exact.isWithinTolerance, true);
      assert.equal(exact.status, "VALID_BAG");

      // Upper boundary (+3g)
      const plusThree = validateCoinBagWeight(denom, spec.targetWeightGrams + 3);
      assert.equal(plusThree.isWithinTolerance, true);
      assert.equal(plusThree.status, "VALID_BAG");

      // Lower boundary (-3g)
      const minusThree = validateCoinBagWeight(denom, spec.targetWeightGrams - 3);
      assert.equal(minusThree.isWithinTolerance, true);
      assert.equal(minusThree.status, "VALID_BAG");
    }
  });

  it("flags underweight and overweight coin bags outside ±3g tolerance and estimates missing/extra coins", () => {
    // $2.00 bag target = 165g (25 coins @ 6.6g each). Missing 1 coin = ~158.4g
    const missingOneTwoDollar = validateCoinBagWeight("$2.00", 158.4);
    assert.equal(missingOneTwoDollar.isWithinTolerance, false);
    assert.equal(missingOneTwoDollar.status, "UNDERWEIGHT_DISCREPANCY");
    assert.equal(missingOneTwoDollar.estimatedCoinDelta, -1);

    // $1.00 bag target = 180g (20 coins @ 9.0g each). Extra 1 coin = 189g
    const extraOneDollar = validateCoinBagWeight("$1.00", 189.0);
    assert.equal(extraOneDollar.isWithinTolerance, false);
    assert.equal(extraOneDollar.status, "OVERWEIGHT_DISCREPANCY");
    assert.equal(extraOneDollar.estimatedCoinDelta, 1);
  });
});
