import { type FormEvent, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { useLocation, useUpdateLocation } from "../features/locations/hooks";

type LocationFormProps = {
  id: string;
  locationCode: string;
  initialName: string;
  initialLocationType: "WAREHOUSE" | "STORE";
};

function LocationForm({
  id,
  locationCode,
  initialName,
  initialLocationType,
}: LocationFormProps) {
  const navigate = useNavigate();
  const updateMutation = useUpdateLocation();

  const [name, setName] = useState(initialName);
  const [locationType, setLocationType] = useState<"WAREHOUSE" | "STORE">(
    initialLocationType,
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    await updateMutation.mutateAsync({
      id,
      data: {
        name: name.trim(),
        locationType,
      },
    });

    navigate(`/locations/${id}`);
  };

  const handleCancel = () => {
    navigate(`/locations/${id}`);
  };

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label
            htmlFor="location-code"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Location Code
          </label>

          <Input id="location-code" value={locationCode} disabled />

          <p className="mt-1.5 text-xs text-slate-500">
            Location codes cannot be changed.
          </p>
        </div>

        <div>
          <label
            htmlFor="location-name"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Name
          </label>

          <Input
            id="location-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </div>

        <div>
          <label
            htmlFor="location-type"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Type
          </label>

          <Select
            id="location-type"
            value={locationType}
            onChange={(event) =>
              setLocationType(event.target.value as "WAREHOUSE" | "STORE")
            }
          >
            <option value="WAREHOUSE">Warehouse</option>
            <option value="STORE">Store</option>
          </Select>
        </div>

        {updateMutation.isError && (
          <p className="text-sm text-red-600">
            {updateMutation.error instanceof Error
              ? updateMutation.error.message
              : "Failed to update location."}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-5">
          <Button type="button" variant="secondary" onClick={handleCancel}>
            Cancel
          </Button>

          <Button type="submit" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function EditLocationPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const locationQuery = useLocation(id);

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

  return (
    <div className="space-y-6">
      <div>
        <button
          type="button"
          onClick={() => navigate(`/locations/${location.id}`)}
          className="mb-3 text-sm text-slate-500 hover:text-slate-900"
        >
          ← Location
        </button>

        <h1 className="text-2xl font-semibold text-slate-950">Edit Location</h1>

        <p className="mt-1 text-sm text-slate-500">
          Update the location's operational details.
        </p>
      </div>

      <LocationForm
        key={location.id}
        id={location.id}
        locationCode={location.locationCode}
        initialName={location.name}
        initialLocationType={location.locationType}
      />
    </div>
  );
}

export default EditLocationPage;
