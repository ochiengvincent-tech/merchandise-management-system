import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { useAllVendorProducts } from "../features/vendor-products/hooks";
import { useVendors } from "../features/vendors/hooks";
import { useProducts } from "../features/products/hooks";

export function SupplierProductsPage() {
  const navigate = useNavigate();

  const vendorProductsQuery = useAllVendorProducts();
  const vendorsQuery = useVendors({ limit: 100 });
  const productsQuery = useProducts();

  const vendorProducts = vendorProductsQuery.data ?? [];
  const vendors = useMemo(
    () => vendorsQuery.data?.data ?? [],
    [vendorsQuery.data?.data],
  );
  const products = useMemo(
    () => productsQuery.data ?? [],
    [productsQuery.data],
  );

  const vendorMap = useMemo(
    () => new Map(vendors.map((vendor) => [vendor.id, vendor])),
    [vendors],
  );

  const productMap = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const isLoading =
    vendorProductsQuery.isLoading ||
    vendorsQuery.isLoading ||
    productsQuery.isLoading;

  const error =
    vendorProductsQuery.error || vendorsQuery.error || productsQuery.error;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h1 className="text-2xl font-semibold">Supplier Products</h1>
            <p className="text-sm text-muted-foreground">
              Manage products supplied by vendors.
            </p>
          </div>

          <Button onClick={() => navigate("/supplier-products/new")}>
            Add New Supplier Product
          </Button>
        </div>

        <Card className="p-6">
          <p className="text-sm text-muted-foreground">
            Loading supplier products...
          </p>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h1 className="text-2xl font-semibold">Supplier Products</h1>
            <p className="text-sm text-muted-foreground">
              Manage products supplied by vendors.
            </p>
          </div>

          <Button onClick={() => navigate("/supplier-products/new")}>
            Add Supplier Product
          </Button>
        </div>

        <Card className="p-6">
          <p className="text-sm text-destructive">
            Failed to load supplier products.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-2xl font-semibold">Supplier Products</h1>
          <p className="text-sm text-muted-foreground">
            Manage products supplied by vendors.
          </p>
        </div>

        <Button onClick={() => navigate("/supplier-products/new")}>
          Add Supplier Product
        </Button>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Supplier</TableHeader>
              <TableHeader>Product</TableHeader>
              <TableHeader>Supplier Code</TableHeader>
              <TableHeader>Current Price</TableHeader>
              <TableHeader>Lead Time</TableHeader>
              <TableHeader>Status</TableHeader>
            </TableRow>
          </TableHead>

          <TableBody>
            {vendorProducts.map((vendorProduct) => {
              const vendor = vendorMap.get(vendorProduct.vendorId);
              const product = productMap.get(vendorProduct.productId);

              return (
                <TableRow
                  key={vendorProduct.id}
                  onClick={() =>
                    navigate(`/supplier-products/${vendorProduct.id}`)
                  }
                  className="cursor-pointer hover:bg-slate-50"
                >
                  <TableCell>
                    <div>
                      <p className="font-medium">
                        {vendor?.name ?? "Unknown supplier"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {vendor?.vendorCode ?? "Unknown code"}
                      </p>
                    </div>
                  </TableCell>

                  <TableCell>
                    <div>
                      <p className="font-medium">
                        {product?.name ?? "Unknown product"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {product?.sku ?? "Unknown SKU"}
                      </p>
                    </div>
                  </TableCell>

                  <TableCell>
                    {vendorProduct.supplierProductCode ?? "—"}
                  </TableCell>

                  <TableCell>
                    KES {Number(vendorProduct.currentPrice).toLocaleString()}
                  </TableCell>

                  <TableCell>{vendorProduct.leadTimeDays} days</TableCell>

                  <TableCell>
                    <Badge
                      variant={
                        vendorProduct.status === "ACTIVE"
                          ? "success"
                          : "default"
                      }
                    >
                      {vendorProduct.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {vendorProducts.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No supplier products found.
          </div>
        )}
      </Card>
    </div>
  );
}
