import { useState } from "react";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { Select } from "../components/ui/select";
import { Table } from "../components/ui/table";
import { useLocations } from "../features/locations/hooks";
import { useProducts } from "../features/products/hooks";
import { useStockByProduct } from "../features/inventory/hooks";

function InventoryPage() {
  const [productId, setProductId] = useState("");

  const productsQuery = useProducts({ status: "ACTIVE" });
  const stockQuery = useStockByProduct(productId);
  const locationsQuery = useLocations();

  const selectedProduct = productsQuery.data?.find(
    (product) => product.id === productId,
  );

  const locationsById = new Map(
    locationsQuery.data?.map((location) => [location.id, location]),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">Inventory</h1>
        <p className="mt-1 text-sm text-slate-500">
          View stock levels across inventory locations.
        </p>
      </div>

      <Card>
        <div className="max-w-md">
          <div>
            <label
              htmlFor="inventory-product"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Product
            </label>

            <Select
              id="inventory-product"
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
            >
              <option value="">Select a product</option>
              {productsQuery.data?.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.sku} · {product.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {!productId && (
        <Card>
          <div className="py-12 text-center">
            <p className="text-sm font-medium text-slate-700">
              Select a product to view its inventory.
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Stock is tracked separately for each inventory location.
            </p>
          </div>
        </Card>
      )}

      {productId && selectedProduct && (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold text-slate-950">
                  {selectedProduct.name}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedProduct.sku}
                </p>
              </div>

              <Badge variant="success">ACTIVE</Badge>
            </div>
          </div>

          {stockQuery.isLoading && (
            <div className="px-5 py-12 text-center text-sm text-slate-500">
              Loading inventory...
            </div>
          )}

          {stockQuery.isError && (
            <div className="px-5 py-12 text-center text-sm text-red-600">
              Failed to load inventory.
            </div>
          )}

          {stockQuery.isSuccess && stockQuery.data.length === 0 && (
            <div className="px-5 py-12 text-center">
              <p className="text-sm font-medium text-slate-700">
                No stock records found.
              </p>
              <p className="mt-1 text-sm text-slate-500">
                This product has not been assigned to an inventory location.
              </p>
            </div>
          )}

          {stockQuery.isSuccess && stockQuery.data.length > 0 && (
            <Table>
              <thead>
                <tr>
                  <th>Location</th>
                  <th className="text-right">On Hand</th>
                  <th className="text-right">Allocated</th>
                  <th className="text-right">Available</th>
                  <th className="text-right">On Order</th>
                </tr>
              </thead>

              <tbody>
                {stockQuery.data.map((stock) => {
                  const location = locationsById.get(stock.locationId);

                  return (
                    <tr key={stock.id}>
                      <td className="min-w-52">
                        {location ? (
                          <div className="space-y-0.5">
                            <div className="text-sm font-medium text-slate-900">
                              {location.name}
                            </div>
                            <div className="text-xs font-medium text-slate-500">
                              {location.locationCode}
                            </div>
                          </div>
                        ) : (
                          <span className="font-mono text-xs text-slate-500">
                            {stock.locationId}
                          </span>
                        )}
                      </td>
                      <td className="text-right tabular-nums">
                        {stock.quantityOnHand}
                      </td>
                      <td className="text-right tabular-nums">
                        {stock.quantityAllocated}
                      </td>
                      <td className="text-right font-medium text-slate-900 tabular-nums">
                        {stock.quantityAvailable}
                      </td>
                      <td className="text-right tabular-nums">
                        {stock.quantityOnOrder}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      )}
    </div>
  );
}

export default InventoryPage;
