import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { useCreateLocation } from "../features/locations/hooks";

function NewLocationPage() {
  const navigate = useNavigate();
  const createMutation = useCreateLocation();

  const [locationCode, setLocationCode] = useState("");
  const [name, setName] = useState("");
  const [locationType, setLocationType] = useState<
    "WAREHOUSE" | "STORE"
  >("WAREHOUSE");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const location = await createMutation.mutateAsync({
      locationCode: locationCode.trim(),
      name: name.trim(),
      locationType,
    });

    navigate(`/locations/${location.id}`);
  };

  const handleCancel = () => {
    navigate("/locations");
  };

  return (
    <div className="space-y-6">
      <div>
        <button
          type="button"
          onClick={handleCancel}
          className="mb-3 text-sm text-slate-500 hover:text-slate-900"
        >
          ← Locations
        </button>

        <h1 className="text-2xl font-semibold text-slate-950">
          New Location
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          Add a warehouse or store for inventory operations.
        </p>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="location-code"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Location Code
            </label>

            <Input
              id="location-code"
              value={locationCode}
              onChange={(event) => setLocationCode(event.target.value)}
              placeholder="e.g. WH-001"
              required
            />
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
              placeholder="e.g. Main Warehouse"
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
                setLocationType(
                  event.target.value as "WAREHOUSE" | "STORE",
                )
              }
            >
              <option value="WAREHOUSE">Warehouse</option>
              <option value="STORE">Store</option>
            </Select>
          </div>

          {createMutation.isError && (
            <p className="text-sm text-red-600">
              {createMutation.error instanceof Error
                ? createMutation.error.message
                : "Failed to create location."}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-5">
            <Button
              type="button"
              variant="secondary"
              onClick={handleCancel}
            >
              Cancel
            </Button>

            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create location"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default NewLocationPage;