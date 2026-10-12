type EventEnvelope<TType extends string, TAggregate extends string, TPayload> = {
  eventId: string;
  eventType: TType;
  aggregateType: TAggregate;
  aggregateId: string;
  occurredAt: string;
  payload: TPayload;
};

type Tender = {
  id: string;
  method: "CASH" | "CARD" | "GIFT_CARD";
  amountMinor: number;
  outcome: "RECORDED" | "SUCCEEDED";
};

export type FinancialEvent =
  | EventEnvelope<"SaleCompleted", "Sale", {
      schemaVersion: 1;
      saleId: string;
      receiptNumber: string;
      registerId: string;
      actorId: string;
      locationId: string;
      currency: string;
      completedAt: string;
      totalMinor: number;
      lines: Array<{
        productId: string;
        locationId?: string;
        quantity: number;
        taxMinor: number;
        lineTotalMinor: number;
      }>;
      tenders: Tender[];
    }>
  | EventEnvelope<"SaleReturned", "Sale", {
      schemaVersion: 1;
      returnId: string;
      saleId: string;
      actorId: string;
      locationId: string;
      currency: string;
      returnedAt: string;
      totalRefundMinor: number;
      lines: Array<{
        productId: string;
        quantity: number;
        refundMinor: number;
        taxRefundMinor?: number;
      }>;
      tenders: Tender[];
    }>
  | EventEnvelope<"InventoryValuationChanged", "InventoryStock", {
      schemaVersion: 1;
      sourceType: "OPENING_BALANCE" | "RECEIPT" | "SALE" | "RETURN" | "ADJUSTMENT";
      sourceId: string;
      sourceEventId: string;
      productId: string;
      locationId: string;
      currency: string;
      quantityDelta: number;
      carryingValueDeltaMinor: string;
      costPolicyVersion: string;
      reason:
        | "OPENING_BALANCE"
        | "RECEIPT"
        | "SALE_CONSUMPTION"
        | "RETURN_RESTOCK"
        | "WRITE_OFF"
        | "ADJUSTMENT_GAIN"
        | "ADJUSTMENT_LOSS"
        | "RECEIPT_COST_RECONCILIATION";
    }>;
