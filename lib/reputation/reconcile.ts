import { HORIZON_URL } from '@/constants';

const DEFAULT_RECONCILE_WINDOW_MS = 5 * 60 * 1000;

export interface ReputationOutcomeRow {
  id: string;
  status: string;
  stellarTransactionId?: string | null;
  settledAt?: Date | string | null;
  quotedAmount?: string | number | null;
  sourceAmount?: string | number | null;
  destinationAccount?: string | null;
  deliveredAssetCode?: string | null;
  deliveredAssetIssuer?: string | null;
  deliveredAmount?: string | number | null;
  reconciledAt?: Date | string | null;
  /** The account that signed the intent hash (#1267). Used to confirm the delivered payment actually came from the party who signed for it, not merely that someone signed some hash. */
  signerAccount?: string | null;
}

export interface ReconciledOutcomeUpdate {
  deliveredAmount: string;
  deliveredRate?: string;
  reconciledAt: Date;
  stellarTransactionId: string;
}

export interface ReconcileOutcomeResult {
  rowId: string;
  status: 'updated' | 'skipped' | 'missing_payment' | 'failed' | 'source_mismatch';
  deliveredAmount?: string;
  deliveredRate?: string;
  error?: string;
}

export interface ReconcileOptions {
  now?: Date;
  reconcileWindowMs?: number;
  fetchPaymentsForTransaction?: ReconcilePaymentLoader;
  /** Called when the delivered payment's source does not match `row.signerAccount` (#1334). */
  onSourceMismatch?: SourceMismatchHandler;
}

/* eslint-disable no-unused-vars */
export interface ReconcilePaymentLoader {
  (stellarTransactionId: string): Promise<HorizonPaymentRecord[]>;
}

export interface UpdateReputationOutcome {
  (row: ReputationOutcomeRow, update: ReconciledOutcomeUpdate): Promise<void>;
}

export interface SourceMismatchHandler {
  (row: ReputationOutcomeRow): Promise<void>;
}
/* eslint-enable no-unused-vars */

export interface HorizonPaymentRecord {
  type?: string;
  amount?: string;
  asset_type?: string;
  asset_code?: string;
  asset_issuer?: string;
  to?: string;
  /** Source account of the payment operation, as returned by most Horizon payment records. */
  from?: string;
  /** Alternate field name Horizon uses for the source account on some operation types. */
  source_account?: string;
  transaction_hash?: string;
}

const RECONCILABLE_STATUSES = new Set(['completed', 'settled']);
const PAYMENT_TYPES = new Set([
  'payment',
  'path_payment_strict_send',
  'path_payment_strict_receive',
]);

function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function parsePositiveAmount(value: string | number | null | undefined): number | undefined {
  if (!isPresent(value)) return undefined;
  const amount = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(amount) && amount > 0 ? amount : undefined;
}

function toDate(value: Date | string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function isDueForReconciliation(
  row: ReputationOutcomeRow,
  now = new Date(),
  reconcileWindowMs = DEFAULT_RECONCILE_WINDOW_MS
): boolean {
  if (!RECONCILABLE_STATUSES.has(row.status)) return false;
  if (!isPresent(row.stellarTransactionId)) return false;
  if (isPresent(row.deliveredAmount) || isPresent(row.reconciledAt)) return false;

  const settledAt = toDate(row.settledAt);
  if (!settledAt) return true;

  const ageMs = now.getTime() - settledAt.getTime();
  return ageMs >= 0 && ageMs <= reconcileWindowMs;
}

export function calculateDeliveredRate(
  row: ReputationOutcomeRow,
  deliveredAmount: string
): string | undefined {
  const basis = parsePositiveAmount(row.quotedAmount) ?? parsePositiveAmount(row.sourceAmount);
  const delivered = parsePositiveAmount(deliveredAmount);
  if (!basis || !delivered) return undefined;
  return (delivered / basis).toFixed(8);
}

export function selectDeliveredPayment(
  row: ReputationOutcomeRow,
  payments: HorizonPaymentRecord[]
): HorizonPaymentRecord | undefined {
  return payments
    .filter((payment) => PAYMENT_TYPES.has(payment.type ?? ''))
    .filter((payment) => parsePositiveAmount(payment.amount) !== undefined)
    .filter((payment) => !row.destinationAccount || payment.to === row.destinationAccount)
    .filter((payment) => !row.deliveredAssetCode || payment.asset_code === row.deliveredAssetCode)
    .filter(
      (payment) => !row.deliveredAssetIssuer || payment.asset_issuer === row.deliveredAssetIssuer
    )
    .at(-1);
}

export async function fetchPaymentsForTransaction(
  stellarTransactionId: string
): Promise<HorizonPaymentRecord[]> {
  const url = new URL(`${HORIZON_URL}/transactions/${stellarTransactionId}/payments`);
  const res = await fetch(url.toString());

  if (!res.ok) {
    throw new Error(`Horizon payment lookup failed: HTTP ${res.status}`);
  }

  const data = (await res.json()) as { _embedded?: { records?: HorizonPaymentRecord[] } };
  return data._embedded?.records ?? [];
}

export async function reconcileReputationOutcomes(
  rows: ReputationOutcomeRow[],
  updateOutcome: UpdateReputationOutcome,
  options: ReconcileOptions = {}
): Promise<ReconcileOutcomeResult[]> {
  const now = options.now ?? new Date();
  const reconcileWindowMs = options.reconcileWindowMs ?? DEFAULT_RECONCILE_WINDOW_MS;
  const loadPayments = options.fetchPaymentsForTransaction ?? fetchPaymentsForTransaction;

  const results: ReconcileOutcomeResult[] = [];

  for (const row of rows) {
    if (!isDueForReconciliation(row, now, reconcileWindowMs)) {
      results.push({ rowId: row.id, status: 'skipped' });
      continue;
    }

    const stellarTransactionId = String(row.stellarTransactionId);

    try {
      const payments = await loadPayments(stellarTransactionId);
      const deliveredPayment = selectDeliveredPayment(row, payments);

      if (!deliveredPayment?.amount) {
        results.push({ rowId: row.id, status: 'missing_payment' });
        continue;
      }

      // A signature over the intent hash only proves *someone* signed for this
      // transaction id — not that the signer is who actually delivered the
      // payment. Require the on-chain payment's source account to match the
      // account that signed, so a stranger cannot claim credit for (or divert
      // scoring impact onto) a transaction they did not send.
      if (isPresent(row.signerAccount)) {
        const paymentSource = deliveredPayment.from ?? deliveredPayment.source_account;
        if (paymentSource !== row.signerAccount) {
          results.push({ rowId: row.id, status: 'source_mismatch' });
          if (options.onSourceMismatch) await options.onSourceMismatch(row);
          continue;
        }
      }

      const deliveredAmount = deliveredPayment.amount;
      const deliveredRate = calculateDeliveredRate(row, deliveredAmount);

      await updateOutcome(row, {
        deliveredAmount,
        ...(deliveredRate && { deliveredRate }),
        reconciledAt: now,
        stellarTransactionId,
      });

      results.push({
        rowId: row.id,
        status: 'updated',
        deliveredAmount,
        ...(deliveredRate && { deliveredRate }),
      });
    } catch (err) {
      results.push({
        rowId: row.id,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Unknown reconciliation error',
      });
    }
  }

  return results;
}
