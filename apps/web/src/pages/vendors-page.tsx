import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Table } from "../components/ui/table";
import { useVendors } from "../features/vendors/hooks";

function VendorsPage() {
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | "ACTIVE" | "INACTIVE">("ACTIVE");
  const [page, setPage] = useState(1);

  const limit = 20;

  const vendorsQuery = useVendors({
    page,
    limit,
    search: search || undefined,
    status: status || undefined,
  });

  const total = vendorsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleStatusChange = (value: "" | "ACTIVE" | "INACTIVE") => {
    setStatus(value);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Vendors</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage suppliers used for procurement.
          </p>
        </div>

        <Button onClick={() => navigate("/vendors/new")}>New Vendor</Button>
      </div>

      <Card>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="vendor-search"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Search
            </label>

            <Input
              id="vendor-search"
              value={search}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder="Search code or name"
            />
          </div>

          <div>
            <label
              htmlFor="vendor-status"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Status
            </label>

            <Select
              id="vendor-status"
              value={status}
              onChange={(event) =>
                handleStatusChange(
                  event.target.value as "" | "ACTIVE" | "INACTIVE",
                )
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
        {vendorsQuery.isLoading && (
          <div className="px-5 py-12 text-center text-sm text-slate-500">
            Loading vendors...
          </div>
        )}

        {vendorsQuery.isError && (
          <div className="px-5 py-12 text-center text-sm text-red-600">
            Failed to load vendors.
          </div>
        )}

        {vendorsQuery.isSuccess && vendorsQuery.data.data.length === 0 && (
          <div className="px-5 py-12 text-center">
            <p className="text-sm font-medium text-slate-700">
              No vendors found.
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Try changing the filters or create a new vendor.
            </p>
          </div>
        )}

        {vendorsQuery.isSuccess && vendorsQuery.data.data.length > 0 && (
          <>
            <Table>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="w-40 px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Vendor Code
                  </th>
                  <th className="min-w-64 px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Name
                  </th>
                  <th className="min-w-56 px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Email
                  </th>
                  <th className="w-40 px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Phone
                  </th>
                  <th className="w-32 px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Status
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {vendorsQuery.data.data.map((vendor) => (
                  <tr
                    key={vendor.id}
                    onClick={() => navigate(`/vendors/${vendor.id}`)}
                    className="cursor-pointer hover:bg-slate-50"
                  >
                    <td className="px-5 py-4 font-medium text-slate-900">
                      {vendor.vendorCode}
                    </td>

                    <td className="px-5 py-4 font-medium text-slate-800">
                      {vendor.name}
                    </td>

                    <td className="px-5 py-4 text-slate-600">
                      {vendor.email ?? "—"}
                    </td>

                    <td className="px-5 py-4 tabular-nums text-slate-600">
                      {vendor.phone ?? "—"}
                    </td>

                    <td className="px-5 py-4">
                      <Badge
                        variant={
                          vendor.status === "ACTIVE" ? "success" : "default"
                        }
                      >
                        {vendor.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>

            <div className="flex flex-col justify-between gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center">
              <p className="text-sm text-slate-500">
                Showing{" "}
                <span className="font-medium text-slate-700">
                  {(page - 1) * limit + 1}
                </span>{" "}
                to{" "}
                <span className="font-medium text-slate-700">
                  {Math.min(page * limit, total)}
                </span>{" "}
                of <span className="font-medium text-slate-700">{total}</span>{" "}
                vendors
              </p>

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  disabled={page === 1 || vendorsQuery.isFetching}
                  onClick={() => setPage((current) => current - 1)}
                >
                  Previous
                </Button>

                <span className="px-2 text-sm text-slate-600">
                  Page {page} of {totalPages}
                </span>

                <Button
                  variant="secondary"
                  disabled={page >= totalPages || vendorsQuery.isFetching}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

export default VendorsPage;
