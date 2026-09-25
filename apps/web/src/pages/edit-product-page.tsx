import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { useProduct, useUpdateProduct } from "../features/products/hooks";
import type { Product } from "../features/products/types";

export function EditProductPage() {
  const navigate = useNavigate();
  const { id } = useParams();

  const { data: product, isLoading, isError, error } = useProduct(id ?? "");

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-4 w-20 animate-pulse rounded bg-slate-200" />
          <div className="mt-4 h-8 w-64 animate-pulse rounded bg-slate-200" />
        </div>

        <Card className="p-6">
          <div className="space-y-5">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index}>
                <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
                <div className="mt-2 h-9 w-full animate-pulse rounded bg-slate-200" />
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

  return <EditProductForm product={product} />;
}

type EditProductFormProps = {
  product: Product;
};

function EditProductForm({ product }: EditProductFormProps) {
  const navigate = useNavigate();
  const updateProduct = useUpdateProduct();

  const [form, setForm] = useState({
    name: product.name,
    description: product.description ?? "",
    category: product.category,
    unitOfMeasure: product.unitOfMeasure,
    barcode: product.barcode ?? "",
    reorderLevel: String(product.reorderLevel),
  });

  const [errorMessage, setErrorMessage] = useState("");

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");

    if (
      !form.name.trim() ||
      !form.category.trim() ||
      !form.unitOfMeasure.trim()
    ) {
      setErrorMessage(
        "Product name, category, and unit of measure are required.",
      );
      return;
    }

    const reorderLevel = Number(form.reorderLevel);

    if (!Number.isInteger(reorderLevel) || reorderLevel < 0) {
      setErrorMessage("Reorder level must be a non-negative whole number.");
      return;
    }

    try {
      await updateProduct.mutateAsync({
        id: product.id,
        data: {
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          category: form.category.trim(),
          unitOfMeasure: form.unitOfMeasure.trim(),
          barcode: form.barcode.trim() || undefined,
          reorderLevel,
        },
      });

      navigate(`/products/${product.id}`);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Unable to update product.",
      );
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <button
          type="button"
          onClick={() => navigate(`/products/${product.id}`)}
          className="text-sm font-medium text-slate-500 hover:text-slate-900"
        >
          ← {product.name}
        </button>

        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
          Edit Product
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          Update the product master information.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="p-6">
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-slate-950">
                Product details
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                SKU cannot be changed after product creation.
              </p>
            </div>

            <div>
              <label
                htmlFor="sku"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                SKU
              </label>

              <Input id="sku" value={product.sku} disabled />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="name"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Product name <span className="text-red-600">*</span>
                </label>

                <Input
                  id="name"
                  value={form.name}
                  onChange={(event) => updateField("name", event.target.value)}
                  maxLength={255}
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="category"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Category <span className="text-red-600">*</span>
                </label>

                <Input
                  id="category"
                  value={form.category}
                  onChange={(event) =>
                    updateField("category", event.target.value)
                  }
                  maxLength={100}
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="unitOfMeasure"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Unit of measure <span className="text-red-600">*</span>
                </label>

                <Input
                  id="unitOfMeasure"
                  value={form.unitOfMeasure}
                  onChange={(event) =>
                    updateField("unitOfMeasure", event.target.value)
                  }
                  maxLength={30}
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="barcode"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Barcode
                </label>

                <Input
                  id="barcode"
                  value={form.barcode}
                  onChange={(event) =>
                    updateField("barcode", event.target.value)
                  }
                  maxLength={100}
                />
              </div>

              <div>
                <label
                  htmlFor="reorderLevel"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Reorder level
                </label>

                <Input
                  id="reorderLevel"
                  type="number"
                  min="0"
                  step="1"
                  value={form.reorderLevel}
                  onChange={(event) =>
                    updateField("reorderLevel", event.target.value)
                  }
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="description"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Description
              </label>

              <textarea
                id="description"
                value={form.description}
                onChange={(event) =>
                  updateField("description", event.target.value)
                }
                maxLength={1000}
                rows={4}
                className="w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />

              <p className="mt-1 text-xs text-slate-400">
                {form.description.length}/1000
              </p>
            </div>
          </div>
        </Card>

        {errorMessage && (
          <Card className="border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">{errorMessage}</p>
          </Card>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate(`/products/${product.id}`)}
            disabled={updateProduct.isPending}
          >
            Cancel
          </Button>

          <Button type="submit" disabled={updateProduct.isPending}>
            {updateProduct.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
