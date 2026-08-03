import { describe, expect, it } from "vitest";
import {
  UserOpService,
  asDecimalSafeAmount,
  validateUnifiedAssetBoundaryContexts,
  validateUnifiedAssetContext,
} from "../src/index.js";

describe("unified asset compatibility helpers", () => {
  const assetContext = {
    assets: [
      {
        canonical_asset_id: "usdc",
        chain_id: 1,
        asset_namespace: "erc20" as const,
        asset_address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        decimals: 6,
      },
    ],
    requested_amounts: [{ chain_id: 1, asset_ref: "usdc", amount: "12.345678" }],
    constraints: [
      {
        chain_id: 1,
        asset_ref: "usdc",
        max_amount: "1000",
        enforce_decimals: 6,
      },
    ],
  };

  it("accepts valid context", () => {
    const result = validateUnifiedAssetContext(assetContext);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("rejects amount precision overflow", () => {
    const result = validateUnifiedAssetContext({
      ...assetContext,
      requested_amounts: [{ chain_id: 1, asset_ref: "usdc", amount: "1.0000001" }],
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "AMOUNT_DECIMAL_OVERFLOW")).toBe(true);
  });

  it("rejects boundary decimal mismatches", () => {
    const result = validateUnifiedAssetBoundaryContexts({
      userop_context: assetContext,
      paymaster_context: {
        ...assetContext,
        assets: [{ ...assetContext.assets[0], decimals: 18 }],
      },
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "ASSET_DECIMAL_MISMATCH")).toBe(true);
  });

  it("parses decimal-safe amounts", () => {
    expect(asDecimalSafeAmount("10.25")).toBe("10.25");
    expect(asDecimalSafeAmount("01.25")).toBeUndefined();
    expect(asDecimalSafeAmount("-1")).toBeUndefined();
  });
});

describe("UserOpService unified asset boundary checks", () => {
  it("returns INVALID_REQUEST for inconsistent contexts", async () => {
    const service = new UserOpService();
    const response = await service.validateUserOp({
      account_id: "acc_1",
      reference_id: "ref_1",
      idempotency_key: "idem_1",
      correlation_id: "corr_1",
      policy_version: "policy.v1",
      userOperation: {},
      expected_nonce: "0",
      unified_asset_context: {
        assets: [
          {
            canonical_asset_id: "eth",
            chain_id: 1,
            asset_namespace: "native",
            decimals: 18,
          },
        ],
      },
      bundler_asset_context: {
        assets: [
          {
            canonical_asset_id: "eth",
            chain_id: 1,
            asset_namespace: "native",
            decimals: 6,
          },
        ],
      },
    });

    expect(response).toHaveProperty("code", "INVALID_REQUEST");
  });
});
