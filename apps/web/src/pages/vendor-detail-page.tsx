import { useNavigate, useParams } from "react-router-dom";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import {
  useDeactivateVendor,
  useReactivateVendor,
  useVendor,
} from "../features/vendors/hooks";

function VendorDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();

  const vendorQuery = useVendor(id);
  const deactivateMutation = useDeactivateVendor();
  const reactivateMutation = useReactivateVendor();

  if (vendorQuery.isLoading) {
    return (
      <div className="py-12 text-center text-sm text-slate-500">
        Loading vendor...
      </div>
    );
  }

  if (vendorQuery.isError || !vendorQuery.data) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-slate-950">
          Vendor not found
        </h1>

        <Button
          variant="secondary"
          onClick={() => navigate("/vendors")}
        >
          Back to vendors
        </Button>
      </div>
    );
  }

  const vendor = vendorQuery.data;
  const isActive = vendor.status === "ACTIVE";
  const isPending =
    deactivateMutation.isPending || reactivateMutation.isPending;

  const handleStatusChange = async () => {
    const action = isActive ? "deactivate" : "reactivate";

    const confirmed = window.confirm(
      action === "deactivate"
        ? `Deactivate "${vendor.name}"?`
        : `Reactivate "${vendor.name}"?`,
    );

    if (!confirmed) {
      return;
    }

    if (isActive) {
      await deactivateMutation.mutateAsync(vendor.id);
      return;
    }

    await reactivateMutation.mutateAsync(vendor.id);
  };

  return (
    <div className="space-y-6">
      <div>
        <button
          type="button"
          onClick={() => navigate("/vendors")}
          className="mb-3 text-sm text-slate-500 hover:text-slate-900"
        >
          ← Vendors
        </button>

        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold text-slate-950">
                {vendor.name}
              </h1>

              <Badge variant={isActive ? "success" : "default"}>
                {vendor.status}
              </Badge>
            </div>

            <p className="mt-1 text-sm text-slate-500">
              {vendor.vendorCode}
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => navigate(`/vendors/${vendor.id}/edit`)}
            >
              Edit
            </Button>

            <Button
              variant={isActive ? "danger" : "secondary"}
              onClick={handleStatusChange}
              disabled={isPending}
            >
              {isPending
                ? "Updating..."
                : isActive
                  ? "Deactivate"
                  : "Reactivate"}
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Vendor Code
            </p>
            <p className="mt-1.5 font-medium text-slate-900">
              {vendor.vendorCode}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Name
            </p>
            <p className="mt-1.5 font-medium text-slate-900">
              {vendor.name}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Email
            </p>
            <p className="mt-1.5 text-slate-700">
              {vendor.email ?? "Not provided"}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Phone
            </p>
            <p className="mt-1.5 text-slate-700">
              {vendor.phone ?? "Not provided"}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Payment Terms
            </p>
            <p className="mt-1.5 text-slate-700">
              {vendor.paymentTerms ?? "Not provided"}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Status
            </p>
            <div className="mt-1.5">
              <Badge variant={isActive ? "success" : "default"}>
                {vendor.status}
              </Badge>
            </div>
          </div>

          <div className="sm:col-span-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Address
            </p>
            <p className="mt-1.5 whitespace-pre-wrap text-slate-700">
              {vendor.address ?? "Not provided"}
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <div>
          <h2 className="text-base font-semibold text-slate-950">
            Record Information
          </h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Created
              </p>
              <p className="mt-1 text-sm text-slate-700">
                {new Date(vendor.createdAt).toLocaleString()}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Last Updated
              </p>
              <p className="mt-1 text-sm text-slate-700">
                {new Date(vendor.updatedAt).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default VendorDetailPage;