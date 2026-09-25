import { useNavigate, useParams } from "react-router-dom";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import {
  useDeactivateLocation,
  useLocation,
  useReactivateLocation,
} from "../features/locations/hooks";

function LocationDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();

  const locationQuery = useLocation(id);
  const deactivateMutation = useDeactivateLocation();
  const reactivateMutation = useReactivateLocation();

  if (locationQuery.isLoading) {
    return (
      <div className="py-12 text-center text-sm text-slate-500">
        Loading location...
      </div>
    );
  }

  if (locationQuery.isError || !locationQuery.data) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-slate-950">
          Location not found
        </h1>
        <Button variant="secondary" onClick={() => navigate("/locations")}>
          Back to locations
        </Button>
      </div>
    );
  }

  const location = locationQuery.data;
  const isActive = location.status === "ACTIVE";
  const isPending =
    deactivateMutation.isPending || reactivateMutation.isPending;

  const handleStatusChange = async () => {
    const confirmed = window.confirm(
      isActive
        ? `Deactivate "${location.name}"?`
        : `Reactivate "${location.name}"?`,
    );

    if (!confirmed) {
      return;
    }

    if (isActive) {
      await deactivateMutation.mutateAsync(location.id);
      return;
    }

    await reactivateMutation.mutateAsync(location.id);
  };

  return (
    <div className="space-y-6">
      <div>
        <button
          type="button"
          onClick={() => navigate("/locations")}
          className="mb-3 text-sm text-slate-500 hover:text-slate-900"
        >
          ← Locations
        </button>

        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-slate-950">
                {location.name}
              </h1>

              <Badge variant={isActive ? "success" : "default"}>
                {location.status}
              </Badge>
            </div>

            <p className="mt-1 text-sm text-slate-500">
              {location.locationCode}
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => navigate(`/locations/${location.id}/edit`)}
            >
              Edit
            </Button>

            <Button
              variant={isActive ? "danger" : "primary"}
              disabled={isPending}
              onClick={handleStatusChange}
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
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Location Code
            </p>
            <p className="mt-1 text-sm font-medium text-slate-900">
              {location.locationCode}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Name
            </p>
            <p className="mt-1 text-sm font-medium text-slate-900">
              {location.name}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Type
            </p>
            <p className="mt-1 text-sm font-medium text-slate-900">
              {location.locationType}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Status
            </p>
            <div className="mt-1">
              <Badge variant={isActive ? "success" : "default"}>
                {location.status}
              </Badge>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default LocationDetailPage;
