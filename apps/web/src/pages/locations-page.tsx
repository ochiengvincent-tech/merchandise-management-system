import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Table } from "../components/ui/table";
import { useLocations } from "../features/locations/hooks";

function LocationsPage() {
  const [search, setSearch] = useState("");
  const [locationType, setLocationType] = useState<"" | "WAREHOUSE" | "STORE">(
    "",
  );
  const [status, setStatus] = useState<"" | "ACTIVE" | "INACTIVE">("ACTIVE");

  const navigate = useNavigate();

  const locationsQuery = useLocations({
    search: search || undefined,
    locationType: locationType || undefined,
    status: status || undefined,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Locations</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage warehouses and stores used for inventory.
          </p>
        </div>

        <Button onClick={() => navigate("/locations/new")}>New Location</Button>
      </div>

      <Card>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label
              htmlFor="location-search"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Search
            </label>
            <Input
              id="location-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search code or name"
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
                  event.target.value as "" | "WAREHOUSE" | "STORE",
                )
              }
            >
              <option value="">All types</option>
              <option value="WAREHOUSE">Warehouse</option>
              <option value="STORE">Store</option>
            </Select>
          </div>

          <div>
            <label
              htmlFor="location-status"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Status
            </label>
            <Select
              id="location-status"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as "" | "ACTIVE" | "INACTIVE")
              }
            >
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="">All statuses</option>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        {locationsQuery.isLoading && (
          <div className="px-5 py-12 text-center text-sm text-slate-500">
            Loading locations...
          </div>
        )}

        {locationsQuery.isError && (
          <div className="px-5 py-12 text-center text-sm text-red-600">
            Failed to load locations.
          </div>
        )}

        {locationsQuery.isSuccess && locationsQuery.data.length === 0 && (
          <div className="px-5 py-12 text-center">
            <p className="text-sm font-medium text-slate-700">
              No locations found.
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Try changing the filters or create a new location.
            </p>
          </div>
        )}

        {locationsQuery.isSuccess && locationsQuery.data.length > 0 && (
          <Table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Type</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {locationsQuery.data.map((location) => (
                <tr
                  key={location.id}
                  onClick={() => navigate(`/locations/${location.id}`)}
                  className="cursor-pointer hover:bg-slate-50"
                >
                  <td className="font-medium text-slate-900">
                    {location.locationCode}
                  </td>
                  <td>{location.name}</td>
                  <td>{location.locationType}</td>
                  <td>
                    <Badge
                      variant={
                        location.status === "ACTIVE" ? "success" : "default"
                      }
                    >
                      {location.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

export default LocationsPage;
