import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  useDeactivateVendorProduct,
  useReactivateVendorProduct,
  useUpdateVendorProduct,
} from "./hooks";
import type { VendorProduct } from "./types";

type VendorProductActionsProps = {
  vendorProduct: VendorProduct;
};

export function VendorProductActions({
  vendorProduct,
}: VendorProductActionsProps) {
  const [editing, setEditing] = useState(false);
  const [supplierProductCode, setSupplierProductCode] = useState(
    vendorProduct.supplierProductCode ?? "",
  );
  const [currentPrice, setCurrentPrice] = useState(
    vendorProduct.currentPrice,
  );
  const [leadTimeDays, setLeadTimeDays] = useState(
    String(vendorProduct.leadTimeDays),
  );

  const updateMutation = useUpdateVendorProduct();
  const deactivateMutation = useDeactivateVendorProduct();
  const reactivateMutation = useReactivateVendorProduct();

  const isActive = vendorProduct.status === "ACTIVE";
  const isPending =
    updateMutation.isPending ||
    deactivateMutation.isPending ||
    reactivateMutation.isPending;

  const handleCancel = () => {
    setSupplierProductCode(vendorProduct.supplierProductCode ?? "");
    setCurrentPrice(vendorProduct.currentPrice);
    setLeadTimeDays(String(vendorProduct.leadTimeDays));
    setEditing(false);
  };

  const handleSave = async () => {
    await updateMutation.mutateAsync({
      id: vendorProduct.id,
      data: {
        supplierProductCode: supplierProductCode.trim() || undefined,
        currentPrice: Number(currentPrice),
        leadTimeDays: Number(leadTimeDays),
      },
    });

    setEditing(false);
  };

  const handleStatusChange = async () => {
    const action = isActive ? "Deactivate" : "Reactivate";

    if (!window.confirm(`${action} this supplier product?`)) {
      return;
    }

    if (isActive) {
      await deactivateMutation.mutateAsync(vendorProduct.id);
      return;
    }

    await reactivateMutation.mutateAsync(vendorProduct.id);
  };

  if (editing) {
    return (
      <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">
            Supplier Product Code
          </p>
          <Input
            value={supplierProductCode}
            onChange={(event) => setSupplierProductCode(event.target.value)}
            disabled={isPending}
          />
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">
            Current Price
          </p>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={currentPrice}
            onChange={(event) => setCurrentPrice(event.target.value)}
            disabled={isPending}
          />
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">
            Lead Time Days
          </p>
          <Input
            type="number"
            min="0"
            step="1"
            value={leadTimeDays}
            onChange={(event) => setLeadTimeDays(event.target.value)}
            disabled={isPending}
          />
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleSave}
            disabled={
              isPending ||
              currentPrice.trim() === "" ||
              leadTimeDays.trim() === ""
            }
          >
            {updateMutation.isPending ? "Saving..." : "Save"}
          </Button>

          <Button
            variant="secondary"
            onClick={handleCancel}
            disabled={isPending}
          >
            Cancel
          </Button>
        </div>

        {updateMutation.isError && (
          <p className="text-sm text-red-600">
            {updateMutation.error instanceof Error
              ? updateMutation.error.message
              : "Failed to update supplier product."}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button
        variant="secondary"
        onClick={() => setEditing(true)}
        disabled={isPending}
      >
        Edit
      </Button>

      <Button
        variant={isActive ? "danger" : "secondary"}
        onClick={handleStatusChange}
        disabled={isPending}
      >
        {deactivateMutation.isPending || reactivateMutation.isPending
          ? "Updating..."
          : isActive
            ? "Deactivate"
            : "Reactivate"}
      </Button>
    </div>
  );
}