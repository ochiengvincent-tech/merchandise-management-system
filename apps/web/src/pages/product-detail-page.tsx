import { useNavigate, useParams } from "react-router-dom";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import {
  useDeactivateProduct,
  useProduct,
  useReactivateProduct,
} from "../features/products/hooks";

export function ProductDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();

  const { data: product, isLoading, isError, error } = useProduct(id ?? "");
  const deactivateProduct = useDeactivateProduct();
  const reactivateProduct = useReactivateProduct();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-4 w-20 animate-pulse rounded bg-slate-200" />
          <div className="mt-4 h-8 w-64 animate-pulse rounded bg-slate-200" />
          <div className="mt-2 h-4 w-96 animate-pulse rounded bg-slate-200" />
        </div>

        <Card className="p-6">
          <div className="grid gap-6 sm:grid-cols-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index}>
                <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
                <div className="mt-2 h-5 w-40 animate-pulse rounded bg-slate-200" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (isError || !product) {
    return (
      <div className="space-y-4">
        <Button variant="secondary" onClick={() => navigate("/products")}>
          Back to Products
        </Button>

        <Card className="p-6">
          <p className="text-sm font-medium text-red-700">
            Unable to load product
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {error instanceof Error
              ? error.message
              : "The requested product could not be found."}
          </p>
        </Card>
      </div>
    );
  }

  const isUpdatingStatus =
    deactivateProduct.isPending || reactivateProduct.isPending;

  const handleStatusChange = async () => {
    const action = product.status === "ACTIVE" ? "deactivate" : "reactivate";

    const confirmed = window.confirm(
      action === "deactivate"
        ? `Deactivate "${product.name}"?`
        : `Reactivate "${product.name}"?`,
    );

    if (!confirmed) {
      return;
    }

    if (product.status === "ACTIVE") {
      await deactivateProduct.mutateAsync(product.id);
      return;
    }

    await reactivateProduct.mutateAsync(product.id);
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <button
            type="button"
            onClick={() => navigate("/products")}
            className="text-sm font-medium text-slate-500 hover:text-slate-900"
          >
            ← Products
          </button>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
              {product.name}
            </h1>

            <Badge
              variant={product.status === "ACTIVE" ? "success" : "default"}
            >
              {product.status}
            </Badge>
          </div>

          <p className="mt-1 text-sm text-slate-500">{product.sku}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => navigate(`/products/${product.id}/edit`)}
            disabled={isUpdatingStatus}
          >
            Edit Product
          </Button>
          <Button
            variant={product.status === "ACTIVE" ? "danger" : "primary"}
            onClick={handleStatusChange}
            disabled={isUpdatingStatus}
          >
            {isUpdatingStatus
              ? "Updating..."
              : product.status === "ACTIVE"
                ? "Deactivate"
                : "Reactivate"}
          </Button>
        </div>
      </div>

      <Card className="p-6">
        <div>
          <h2 className="text-base font-semibold text-slate-950">
            Product details
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Product master information maintained by Inventory.
          </p>
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              SKU
            </p>
            <p className="mt-1 text-sm font-medium text-slate-900">
              {product.sku}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Category
            </p>
            <p className="mt-1 text-sm text-slate-900">{product.category}</p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Unit of measure
            </p>
            <p className="mt-1 text-sm text-slate-900">
              {product.unitOfMeasure}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Barcode
            </p>
            <p className="mt-1 text-sm text-slate-900">
              {product.barcode || "Not provided"}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Reorder level
            </p>
            <p className="mt-1 text-sm text-slate-900">
              {product.reorderLevel}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Status
            </p>
            <div className="mt-1">
              <Badge
                variant={product.status === "ACTIVE" ? "success" : "default"}
              >
                {product.status}
              </Badge>
            </div>
          </div>

          <div className="sm:col-span-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Description
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-900">
              {product.description || "No description provided"}
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-base font-semibold text-slate-950">
          Record information
        </h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Created
            </p>
            <p className="mt-1 text-sm text-slate-700">
              {new Date(product.createdAt).toLocaleString()}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Last updated
            </p>
            <p className="mt-1 text-sm text-slate-700">
              {new Date(product.updatedAt).toLocaleString()}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
