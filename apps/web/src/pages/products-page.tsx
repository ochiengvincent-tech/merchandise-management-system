import { useState } from "react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { useProducts } from "../features/products/hooks";
import { useNavigate } from "react-router-dom";

export function ProductsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | "ACTIVE" | "INACTIVE">("");
  const [category, setCategory] = useState("");

  const { data, isLoading, isError, error } = useProducts({
    search: search || undefined,
    status: status || undefined,
    category: category || undefined,
  });

  const products = data ?? [];

  const navigate = useNavigate();
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
            Products
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage the product master used across merchandising and inventory.
          </p>
        </div>
        <Button onClick={() => navigate("/products/new")}>New Product</Button>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px]">
          <Input
            type="search"
            placeholder="Search by SKU or product name..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as "" | "ACTIVE" | "INACTIVE")
            }
            className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>

          <Input
            type="text"
            placeholder="Filter by category..."
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          />
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-900">
            {isLoading ? "Loading products..." : `${products.length} products`}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Product master records
          </p>
        </div>
      </div>

      {isError && (
        <Card className="p-6">
          <p className="text-sm font-medium text-red-700">
            Unable to load products
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {error instanceof Error
              ? error.message
              : "An unexpected error occurred."}
          </p>
        </Card>
      )}

      {!isError && (
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>SKU</TableHeader>
                <TableHeader>Product</TableHeader>
                <TableHeader>Category</TableHeader>
                <TableHeader>UOM</TableHeader>
                <TableHeader>Reorder Level</TableHeader>
                <TableHeader>Status</TableHeader>
              </TableRow>
            </TableHead>

            <TableBody>
              {isLoading &&
                Array.from({ length: 5 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-16 animate-pulse rounded bg-slate-200" />
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-12 animate-pulse rounded bg-slate-200" />
                    </TableCell>
                    <TableCell>
                      <div className="h-5 w-16 animate-pulse rounded-full bg-slate-200" />
                    </TableCell>
                  </TableRow>
                ))}

              {!isLoading &&
                products.map((product) => (
                  <TableRow
                    key={product.id}
                    onClick={() => navigate(`/products/${product.id}`)}
                    className="cursor-pointer hover:bg-slate-50"
                  >
                    <TableCell className="font-medium text-slate-900">
                      {product.sku}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-slate-900">
                          {product.name}
                        </p>
                        {product.barcode && (
                          <p className="mt-0.5 text-xs text-slate-500">
                            Barcode: {product.barcode}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{product.category}</TableCell>
                    <TableCell>{product.unitOfMeasure}</TableCell>
                    <TableCell>{product.reorderLevel}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          product.status === "ACTIVE" ? "success" : "default"
                        }
                      >
                        {product.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}

              {!isLoading && products.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <p className="text-sm font-medium text-slate-700">
                      No products found
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Try adjusting your search or filters.
                    </p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </div>
  );
}
