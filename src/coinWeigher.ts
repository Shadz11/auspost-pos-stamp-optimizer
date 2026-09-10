/**
 * Australia Post End-of-Day Cash Balancing — Hardware Scale Coin Bag Validator
 *
 * Domain Context:
 * Prior to enterprise POS scale software integration, frontline retail staff
 * manually weighed standard Australian coin bags on parcel/cash scales during
 * end-of-day till reconciliation.
 *
 * This module models the hardware scale validation logic with a default ±3g
 * tolerance to account for plastic coin bag tare variation and circulation wear.
 */

export type AustralianCoinDenomination =
  | "$2.00"
  | "$1.00"
  | "50c"
  | "20c"
  | "10c"
  | "5c";

export interface CoinBagSpec {
  denomination: AustralianCoinDenomination;
  coinValueCents: number;
  bagFaceValueAud: number;
  requiredCoinCount: number;
  targetWeightGrams: number;
  singleCoinWeightGrams: number;
}

export interface CoinBagValidationResult {
  denomination: AustralianCoinDenomination;
  measuredWeightGrams: number;
  targetWeightGrams: number;
  deltaGrams: number;
  toleranceGrams: number;
  isWithinTolerance: boolean;
  estimatedCoinDelta: number;
  bagFaceValueAud: number;
  status: "VALID_BAG" | "UNDERWEIGHT_DISCREPANCY" | "OVERWEIGHT_DISCREPANCY";
}

/**
 * Standard Australian Royal Mint / Australia Post Coin Bag Specifications
 * matching the frontline A4 `Postage_Quick_sheet.html` reference table.
 */
export const AUSPOST_COIN_BAG_SPECS: Record<
  AustralianCoinDenomination,
  CoinBagSpec
> = {
  "$2.00": {
    denomination: "$2.00",
    coinValueCents: 200,
    bagFaceValueAud: 50,
    requiredCoinCount: 25,
    targetWeightGrams: 165, // 25 * 6.60g = 165.0g
    singleCoinWeightGrams: 6.6,
  },
  "$1.00": {
    denomination: "$1.00",
    coinValueCents: 100,
    bagFaceValueAud: 20,
    requiredCoinCount: 20,
    targetWeightGrams: 180, // 20 * 9.00g = 180.0g
    singleCoinWeightGrams: 9.0,
  },
  "50c": {
    denomination: "50c",
    coinValueCents: 50,
    bagFaceValueAud: 10,
    requiredCoinCount: 20,
    targetWeightGrams: 311, // 20 * 15.55g = 311.0g
    singleCoinWeightGrams: 15.55,
  },
  "20c": {
    denomination: "20c",
    coinValueCents: 20,
    bagFaceValueAud: 10,
    requiredCoinCount: 50,
    targetWeightGrams: 565, // 50 * 11.30g = 565.0g
    singleCoinWeightGrams: 11.3,
  },
  "10c": {
    denomination: "10c",
    coinValueCents: 10,
    bagFaceValueAud: 10,
    requiredCoinCount: 100,
    targetWeightGrams: 565, // 100 * 5.65g = 565.0g
    singleCoinWeightGrams: 5.65,
  },
  "5c": {
    denomination: "5c",
    coinValueCents: 5,
    bagFaceValueAud: 5,
    requiredCoinCount: 100,
    targetWeightGrams: 283, // 100 * 2.83g = 283.0g
    singleCoinWeightGrams: 2.83,
  },
};

export const DEFAULT_SCALE_TOLERANCE_GRAMS = 3;

/**
 * Validates a physical coin bag's gram weight from a counter scale against
 * Australia Post cash-handling standards within ±3g tolerance.
 */
export function validateCoinBagWeight(
  denomination: AustralianCoinDenomination,
  measuredWeightGrams: number,
  toleranceGrams: number = DEFAULT_SCALE_TOLERANCE_GRAMS
): CoinBagValidationResult {
  if (!Number.isFinite(measuredWeightGrams) || measuredWeightGrams < 0) {
    throw new Error(`Invalid measuredWeightGrams: ${measuredWeightGrams}`);
  }
  if (!Number.isFinite(toleranceGrams) || toleranceGrams < 0) {
    throw new Error(`Invalid toleranceGrams: ${toleranceGrams}`);
  }

  const spec = AUSPOST_COIN_BAG_SPECS[denomination];
  const deltaGrams = Number((measuredWeightGrams - spec.targetWeightGrams).toFixed(2));
  const isWithinTolerance = Math.abs(deltaGrams) <= toleranceGrams;

  const estimatedCoinDelta = isWithinTolerance
    ? 0
    : Math.round(deltaGrams / spec.singleCoinWeightGrams);

  let status: CoinBagValidationResult["status"] = "VALID_BAG";
  if (!isWithinTolerance) {
    status =
      deltaGrams < 0 ? "UNDERWEIGHT_DISCREPANCY" : "OVERWEIGHT_DISCREPANCY";
  }

  return {
    denomination,
    measuredWeightGrams,
    targetWeightGrams: spec.targetWeightGrams,
    deltaGrams,
    toleranceGrams,
    isWithinTolerance,
    estimatedCoinDelta,
    bagFaceValueAud: spec.bagFaceValueAud,
    status,
  };
}
