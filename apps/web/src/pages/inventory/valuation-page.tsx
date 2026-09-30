import { Card } from "../../components/ui/card";
import { useInventoryValuation } from "../../features/inventory/hooks";

function formatMoney(amount: string, currency: string) {
  const value = Number(amount);
  return `${currency} ${value.toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function InventoryValuationPage() {
  const query = useInventoryValuation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">
          Inventory valuation
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          On-hand inventory value, calculated from each stock record’s unit cost.
        </p>
      </div>

      {query.isLoading && (
        <Card className="p-6 text-sm text-slate-500">
          Loading valuation…
        </Card>
      )}

      {query.isError && (
        <Card className="p-6 text-sm text-red-700" role="alert">
          Could not load inventory valuation. {query.error.message}
        </Card>
      )}

      {query.data && (
        <>
          <Card className="p-6">
            <p className="text-sm font-medium text-slate-500">
              Total on-hand value
            </p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">
              {formatMoney(query.data.totalValue, query.data.currency)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Uses quantity on hand × unit cost; allocated units remain included.
              Stock cost currency is not stored, so values currently assume KES.
            </p>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    {[
                      "Product",
                      "Location",
                      "On hand",
                      "Allocated",
                      "Unit cost",
                      "Stock value",
                    ].map((heading) => (
                      <th key={heading} className="px-4 py-3 font-medium">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {query.data.records.map((record) => (
                    <tr key={record.stockId}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">
                          {record.productName}
                        </p>
                        <p className="text-xs text-slate-500">{record.sku}</p>
                      </td>
                      <td className="px-4 py-3">
                        {record.locationName}
                        <span className="ml-1 text-xs text-slate-500">
                          {record.locationCode}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {record.quantityOnHand.toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        {record.quantityAllocated.toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        {formatMoney(record.unitCost, query.data.currency)}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {formatMoney(record.extendedValue, query.data.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {query.data.records.length === 0 && (
              <p className="p-8 text-center text-sm text-slate-500">
                No stock records are available to value.
              </p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
