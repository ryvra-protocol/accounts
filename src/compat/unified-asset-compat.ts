import type { ServiceError } from "../types.js";

export type AssetNamespace = "native" | "erc20";

export type DecimalSafeAmount = string & { readonly __decimal_safe_amount: unique symbol };

export interface NormalizedAssetReference {
  canonical_asset_id: string;
  chain_id: number;
  asset_namespace: AssetNamespace;
  asset_address?: string;
  asset_symbol?: string;
  decimals: number;
}

export interface UnifiedAssetAmount {
  chain_id: number;
  asset_ref: string;
  amount: string;
}

export interface ChainAwareAssetConstraint {
  chain_id: number;
  asset_ref: string;
  min_amount?: string;
  max_amount?: string;
  enforce_decimals?: number;
}

export interface UnifiedAssetContext {
  assets: NormalizedAssetReference[];
  requested_amounts?: UnifiedAssetAmount[];
  constraints?: ChainAwareAssetConstraint[];
}

export interface UnifiedAssetValidationIssue {
  code:
    | "INVALID_DECIMALS"
    | "INVALID_ASSET_REFERENCE"
    | "DUPLICATE_ASSET_REFERENCE"
    | "ASSET_CHAIN_MISMATCH"
    | "ASSET_DECIMAL_MISMATCH"
    | "AMOUNT_DECIMAL_OVERFLOW"
    | "CONSTRAINT_RANGE_INVALID"
    | "INVALID_AMOUNT_FORMAT";
  message: string;
}

export interface UnifiedAssetValidationResult {
  valid: boolean;
  issues: UnifiedAssetValidationIssue[];
}

export interface PR8UnifiedAssetCompatibilityAdapter {
  normalizeAssetRef(input: NormalizedAssetReference): NormalizedAssetReference | ServiceError;
  validateContext(context: UnifiedAssetContext): UnifiedAssetValidationResult;
  toBundlerPayload(context: UnifiedAssetContext): Record<string, unknown>;
  toPaymasterPayload(context: UnifiedAssetContext): Record<string, unknown>;
}

export interface UnifiedAssetBoundaryContexts {
  userop_context?: UnifiedAssetContext;
  paymaster_context?: UnifiedAssetContext;
  bundler_context?: UnifiedAssetContext;
}

const DECIMAL_AMOUNT_PATTERN = /^(0|[1-9]\d*)(\.\d+)?$/;

export function asDecimalSafeAmount(value: string): DecimalSafeAmount | undefined {
  if (!DECIMAL_AMOUNT_PATTERN.test(value)) {
    return undefined;
  }

  return value as DecimalSafeAmount;
}

function decimalPlaces(value: string): number {
  const index = value.indexOf(".");
  return index === -1 ? 0 : value.length - index - 1;
}

function makeAssetKey(asset: Pick<NormalizedAssetReference, "canonical_asset_id" | "chain_id">): string {
  return `${asset.chain_id}:${asset.canonical_asset_id}`;
}

export function validateUnifiedAssetContext(context: UnifiedAssetContext): UnifiedAssetValidationResult {
  const issues: UnifiedAssetValidationIssue[] = [];
  const assetsByKey = new Map<string, NormalizedAssetReference>();

  for (const asset of context.assets) {
    const key = makeAssetKey(asset);
    if (assetsByKey.has(key)) {
      issues.push({
        code: "DUPLICATE_ASSET_REFERENCE",
        message: `asset ${key} appears more than once`,
      });
      continue;
    }

    if (!Number.isInteger(asset.chain_id) || asset.chain_id <= 0) {
      issues.push({
        code: "ASSET_CHAIN_MISMATCH",
        message: `asset ${asset.canonical_asset_id} has invalid chain_id`,
      });
    }

    if (!Number.isInteger(asset.decimals) || asset.decimals < 0 || asset.decimals > 255) {
      issues.push({
        code: "INVALID_DECIMALS",
        message: `asset ${asset.canonical_asset_id} has invalid decimals`,
      });
    }

    if (asset.asset_namespace === "native" && asset.asset_address) {
      issues.push({
        code: "INVALID_ASSET_REFERENCE",
        message: `native asset ${asset.canonical_asset_id} cannot include asset_address`,
      });
    }

    if (asset.asset_namespace === "erc20" && !asset.asset_address) {
      issues.push({
        code: "INVALID_ASSET_REFERENCE",
        message: `erc20 asset ${asset.canonical_asset_id} requires asset_address`,
      });
    }

    assetsByKey.set(key, asset);
  }

  for (const amount of context.requested_amounts ?? []) {
    if (!Number.isInteger(amount.chain_id) || amount.chain_id <= 0) {
      issues.push({
        code: "ASSET_CHAIN_MISMATCH",
        message: `amount for ${amount.asset_ref} has invalid chain_id`,
      });
      continue;
    }

    const knownAsset = assetsByKey.get(`${amount.chain_id}:${amount.asset_ref}`);
    if (!knownAsset) {
      issues.push({
        code: "INVALID_ASSET_REFERENCE",
        message: `amount references unknown asset ${amount.chain_id}:${amount.asset_ref}`,
      });
      continue;
    }

    if (!DECIMAL_AMOUNT_PATTERN.test(amount.amount)) {
      issues.push({
        code: "INVALID_AMOUNT_FORMAT",
        message: `asset ${amount.asset_ref} has invalid amount format`,
      });
      continue;
    }

    if (decimalPlaces(amount.amount) > knownAsset.decimals) {
      issues.push({
        code: "AMOUNT_DECIMAL_OVERFLOW",
        message: `asset ${amount.asset_ref} amount precision exceeds declared decimals`,
      });
    }
  }

  for (const constraint of context.constraints ?? []) {
    const knownAsset = assetsByKey.get(`${constraint.chain_id}:${constraint.asset_ref}`);
    if (!knownAsset) {
      issues.push({
        code: "INVALID_ASSET_REFERENCE",
        message: `constraint references unknown asset ${constraint.chain_id}:${constraint.asset_ref}`,
      });
      continue;
    }

    if (
      typeof constraint.enforce_decimals === "number" &&
      constraint.enforce_decimals !== knownAsset.decimals
    ) {
      issues.push({
        code: "ASSET_DECIMAL_MISMATCH",
        message: `constraint decimals mismatch for ${constraint.asset_ref}`,
      });
    }

    if (constraint.min_amount && !DECIMAL_AMOUNT_PATTERN.test(constraint.min_amount)) {
      issues.push({
        code: "INVALID_AMOUNT_FORMAT",
        message: `constraint min_amount has invalid format for ${constraint.asset_ref}`,
      });
    }

    if (constraint.max_amount && !DECIMAL_AMOUNT_PATTERN.test(constraint.max_amount)) {
      issues.push({
        code: "INVALID_AMOUNT_FORMAT",
        message: `constraint max_amount has invalid format for ${constraint.asset_ref}`,
      });
    }

    if (
      constraint.min_amount &&
      constraint.max_amount &&
      Number.parseFloat(constraint.min_amount) > Number.parseFloat(constraint.max_amount)
    ) {
      issues.push({
        code: "CONSTRAINT_RANGE_INVALID",
        message: `constraint min_amount cannot exceed max_amount for ${constraint.asset_ref}`,
      });
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function validateUnifiedAssetBoundaryContexts(
  contexts: UnifiedAssetBoundaryContexts,
): UnifiedAssetValidationResult {
  const combinedIssues: UnifiedAssetValidationIssue[] = [];
  const contextEntries = Object.entries(contexts) as Array<[string, UnifiedAssetContext | undefined]>;
  const validatedContexts: Array<[string, UnifiedAssetContext]> = [];

  for (const [name, context] of contextEntries) {
    if (!context) {
      continue;
    }

    validatedContexts.push([name, context]);
    const validation = validateUnifiedAssetContext(context);
    if (!validation.valid) {
      combinedIssues.push(
        ...validation.issues.map((issue) => ({
          ...issue,
          message: `${name}: ${issue.message}`,
        })),
      );
    }
  }

  for (let i = 0; i < validatedContexts.length; i += 1) {
    for (let j = i + 1; j < validatedContexts.length; j += 1) {
      const [leftName, leftContext] = validatedContexts[i];
      const [rightName, rightContext] = validatedContexts[j];

      const leftSet = new Set(leftContext.assets.map((asset) => makeAssetKey(asset)));
      const rightSet = new Set(rightContext.assets.map((asset) => makeAssetKey(asset)));
      if (leftSet.size !== rightSet.size || [...leftSet].some((key) => !rightSet.has(key))) {
        combinedIssues.push({
          code: "INVALID_ASSET_REFERENCE",
          message: `${leftName} and ${rightName} include different asset references`,
        });
      }

      for (const leftAsset of leftContext.assets) {
        const rightAsset = rightContext.assets.find(
          (asset) =>
            asset.chain_id === leftAsset.chain_id &&
            asset.canonical_asset_id === leftAsset.canonical_asset_id,
        );
        if (rightAsset && rightAsset.decimals !== leftAsset.decimals) {
          combinedIssues.push({
            code: "ASSET_DECIMAL_MISMATCH",
            message: `${leftName} and ${rightName} disagree on decimals for ${makeAssetKey(leftAsset)}`,
          });
        }
      }
    }
  }

  return {
    valid: combinedIssues.length === 0,
    issues: combinedIssues,
  };
}
