import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { useCreateProduct } from "../features/products/hooks";

export function NewProductPage() {
  const navigate = useNavigate();
  const createProduct = useCreateProduct();

  const [form, setForm] = useState({
    sku: "",
    name: "",
    description: "",
    category: "",
    unitOfMeasure: "",
    barcode: "",
    reorderLevel: "0",
  });

  const [error, setError] = useState("");

  const updateField = (
    field: keyof typeof form,
    value: string,
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (
      !form.sku.trim() ||
      !form.name.trim() ||
      !form.category.trim() ||
      !form.unitOfMeasure.trim()
    ) {
      setError(
        "SKU, product name, category, and unit of measure are required.",
      );
      return;
    }

    const reorderLevel = Number(form.reorderLevel);

    if (!Number.isInteger(reorderLevel) || reorderLevel < 0) {
      setError("Reorder level must be a non-negative whole number.");
      return;
    }

    try {
      await createProduct.mutateAsync({
        sku: form.sku.trim(),
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        category: form.category.trim(),
        unitOfMeasure: form.unitOfMeasure.trim(),
        barcode: form.barcode.trim() || undefined,
        reorderLevel,
      });

      navigate("/products");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to create product.",
      );
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <button
          type="button"
          onClick={() => navigate("/products")}
          className="text-sm font-medium text-slate-500 hover:text-slate-900"
        >
          ← Products
        </button>

        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
          New Product
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          Add a product to the inventory product master.
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
                Basic information used to identify and manage the product.
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="sku"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  SKU <span className="text-red-600">*</span>
                </label>
                <Input
                  id="sku"
                  value={form.sku}
                  onChange={(event) =>
                    updateField("sku", event.target.value)
                  }
                  placeholder="SKU-001"
                  maxLength={100}
                  required
                />
              </div>

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
                  onChange={(event) =>
                    updateField("name", event.target.value)
                  }
                  placeholder="Product name"
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
                  placeholder="Electronics"
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
                  placeholder="EACH"
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
                  placeholder="Optional barcode"
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
                placeholder="Optional product description"
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

        {error && (
          <Card className="border-red-200 bg-red-50 p-4">
            <div className="flex items-start gap-3">
              <Badge variant="danger">Error</Badge>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </Card>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate("/products")}
            disabled={createProduct.isPending}
          >
            Cancel
          </Button>

          <Button type="submit" disabled={createProduct.isPending}>
            {createProduct.isPending ? "Creating..." : "Create Product"}
          </Button>
        </div>
      </form>
    </div>
  );
}