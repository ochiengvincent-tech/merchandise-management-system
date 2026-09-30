# Financials posting approval

**Status:** approved as proposed by Vincent on 2026-09-30. The local account mappings and opening Inventory valuation have been reconciled; production enablement remains environment-specific.

## Decisions ready for review

| Decision | Implemented behavior / approved policy | Approval record |
| --- | --- | --- |
| Entity and currency | One ledger entity, KES only. No entity dimension or foreign-currency posting. | Approved as proposed. |
| Chart and mappings | Seeded mappings: 1000 cash clearing, 1010 card clearing, 1020 gift-card clearing, 1200 inventory, 1300 input tax, 2000 GRNI, 2010 AP, 2100 sales-tax payable, 3000 opening equity, 4000 sales revenue, 4010 returns, 5000 COGS, 5100 inventory variance. | Approved as proposed; all seeded mappings verified active, KES, and type/balance-compatible. |
| Tender treatment | Retail tender is posted to method-specific clearing accounts. No bank, processor, or gift-card settlement is implied. | Approved as proposed. |
| Retail tax | Retail Sales sends tax amount per completed/refunded line. Financials credits all reported sale tax to 2100 and reverses refund tax from 2100. Financials does not calculate rates. | Approved as proposed; Retail Sales remains the source for tax amounts and rates. |
| Supplier invoice tax | The invoice workflow captures tax amounts and posts them all to 1300 Recoverable input tax. It has no tax-category or recoverability field. | Approved as proposed; all captured supplier invoice tax maps to recoverable input tax. |
| Inventory costing | Moving weighted-average cost is retained, with the aggregate carrying amount stored as exact currency minor units. Unit average cost is derived to six decimal places; receipts add the exact accepted purchase amount, and sale/adjustment quantities allocate the stored amount with rounding remainder retained in stock until depletion. Sellable returns use captured original cost; returns without a cost snapshot are held as Financials exceptions. Historical receipt-rounding differences are corrected through Inventory valuation outbox events and balanced GRNI/inventory journals. | Approved costing method; exact minor-unit carrying value preserves its monetary amount without unit-cost rounding drift. Write-offs and inventory adjustments use the inventory variance account. |
| Accounting periods | UTC calendar months are created on first posting. Closed-period events become exceptions until an authorized reopen. No separate fiscal calendar or backdating workflow is configured. | Approved as proposed: UTC calendar months; closed periods require audited reopen. |
| Supplier approval | Invoice capture/matching and an approval action are implemented. Actor IDs are recorded, but shared authentication and enforceable roles are not available. | Approved as proposed for interim operation; actor IDs are audit metadata pending shared authorization. |

## Local database migrations

The Inventory valuation/opening-balance migration and Retail Sales refund-tax migration were applied successfully to the configured local databases on 2026-09-30. The Financials schema migration was also applied to its local database and seeded the approved chart/mappings. The migrations are additive. The Inventory migration emits one opening valuation outbox event for each existing stock row with positive on-hand quantity.

## Enablement gate

The approval and reconciliation gates are satisfied for the configured local environment. The opening Inventory event was republished after the Financials queue was established and posted once. Its journal debits inventory asset 1200 and credits opening equity 3000 by KES 31,497.60; the event is recorded as POSTED. The local Financials feature/posting flags and web feature flag are enabled. Checked-in `.env.example` defaults remain disabled; production must be configured and reconciled separately. Enabling the web feature flag exposes the UI.

**Approver:** Vincent (approval reported by project owner)  **Date:** 2026-09-30

**Approved decisions / required changes:** Approved all proposed policies in this sheet without changes.

## Reconciliation record (2026-09-30)

- Inventory stock: 1 positive-on-hand record, 320 units, carrying value 3,149,760 minor units.
- Opening events: 1 event for 1 unique stock record, 320 units, 3,149,760 minor units; no stock rows were missing an opening event.
- Financials: one matching source event is POSTED and produces a balanced 1200/3000 journal.
- Retail Sales currently has no completed-sale or return events in its source outbox, so there were no historical retail events to replay during this local activation.
