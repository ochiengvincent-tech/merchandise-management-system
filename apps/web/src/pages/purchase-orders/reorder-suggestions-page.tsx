import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { useLocations } from "../../features/locations/hooks";
import { useProducts } from "../../features/products/hooks";
import {
  useDismissReorderSuggestion,
  useReorderSuggestions,
} from "../../features/purchase-orders/hooks";

export function ReorderSuggestionsPage() {
  const suggestionsQuery = useReorderSuggestions();
  const productsQuery = useProducts();
  const locationsQuery = useLocations();
  const dismissMutation = useDismissReorderSuggestion();

  const productsById = new Map(
    (productsQuery.data ?? []).map((product) => [product.id, product]),
  );
  const locationsById = new Map(
    (locationsQuery.data ?? []).map((location) => [location.id, location]),
  );
  const error =
    suggestionsQuery.error ??
    productsQuery.error ??
    locationsQuery.error ??
    dismissMutation.error;
  const isLoading =
    suggestionsQuery.isLoading ||
    productsQuery.isLoading ||
    locationsQuery.isLoading;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">
          Reorder suggestions
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Review low-stock suggestions and create a draft purchase order for a
          product and destination.
        </p>
      </div>

      {error && (
        <Card
          role="alert"
          className="border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          Could not complete this request. {error.message}
        </Card>
      )}

      {isLoading && (
        <Card className="p-6 text-sm text-slate-500">
          Loading reorder suggestions…
        </Card>
      )}

      {suggestionsQuery.data?.length === 0 && !isLoading && (
        <Card className="p-10 text-center">
          <p className="font-medium text-slate-800">
            No pending reorder suggestions
          </p>
          <p className="mt-1 text-sm text-slate-500">
            New suggestions appear when Inventory publishes a low-stock event.
          </p>
        </Card>
      )}

      {suggestionsQuery.data && suggestionsQuery.data.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  {[
                    "Product",
                    "Location",
                    "Available",
                    "Reorder level",
                    "Suggested quantity",
                    "Actions",
                  ].map((heading) => (
                    <th key={heading} className="px-4 py-3 font-medium">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {suggestionsQuery.data.map((suggestion) => {
                  const product = productsById.get(suggestion.productId);
                  const location = locationsById.get(suggestion.locationId);
                  const params = new URLSearchParams({
                    productId: suggestion.productId,
                    locationId: suggestion.locationId,
                    quantity: String(suggestion.suggestedQuantity),
                    reorderSuggestionId: suggestion.id,
                  });

                  return (
                    <tr key={suggestion.id}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">
                          {product?.name ?? "Product"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {product?.sku ?? suggestion.productId}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {location?.name ?? "Location"}
                        <p className="text-xs text-slate-500">
                          {location?.locationCode ?? suggestion.locationId}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {suggestion.quantityAvailable}
                      </td>
                      <td className="px-4 py-3">
                        {suggestion.reorderLevel}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {suggestion.suggestedQuantity}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Link
                            className="inline-flex h-9 items-center rounded-md bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700"
                            to={`/purchase-orders/new?${params.toString()}`}
                          >
                            Create draft PO
                          </Link>
                          <Button
                            variant="secondary"
                            disabled={dismissMutation.isPending}
                            onClick={() => dismissMutation.mutate(suggestion.id)}
                          >
                            Dismiss
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
