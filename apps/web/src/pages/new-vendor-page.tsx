import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { ApiError } from "../lib/api/client";
import { useCreateVendor } from "../features/vendors/hooks";

function NewVendorPage() {
  const navigate = useNavigate();
  const createMutation = useCreateVendor();

  const [vendorCode, setVendorCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");

  const fieldErrors =
    createMutation.error instanceof ApiError
      ? Object.fromEntries(
          createMutation.error.fieldErrors.map(({ field, message }) => [
            field,
            message,
          ]),
        )
      : {};

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const vendor = await createMutation.mutateAsync({
      vendorCode: vendorCode.trim(),
      name: name.trim(),
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      address: address.trim() || undefined,
      paymentTerms: paymentTerms.trim() || undefined,
    });

    navigate(`/vendors/${vendor.id}`);
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

        <h1 className="text-2xl font-semibold text-slate-950">New Vendor</h1>

        <p className="mt-1 text-sm text-slate-500">
          Add a supplier for procurement.
        </p>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label
                htmlFor="vendor-code"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Vendor Code
              </label>

              <Input
                id="vendor-code"
                value={vendorCode}
                onChange={(event) => setVendorCode(event.target.value)}
                placeholder="e.g. VND-004"
                required
                aria-invalid={Boolean(fieldErrors.vendorCode)}
              />

              {fieldErrors.vendorCode && (
                <p className="mt-1.5 text-sm text-red-600">
                  {fieldErrors.vendorCode}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="vendor-name"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Name
              </label>

              <Input
                id="vendor-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Vendor name"
                required
                aria-invalid={Boolean(fieldErrors.name)}
              />

              {fieldErrors.name && (
                <p className="mt-1.5 text-sm text-red-600">
                  {fieldErrors.name}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="vendor-email"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Email
              </label>

              <Input
                id="vendor-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="orders@example.com"
                aria-invalid={Boolean(fieldErrors.email)}
              />

              {fieldErrors.email && (
                <p className="mt-1.5 text-sm text-red-600">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="vendor-phone"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Phone
              </label>

              <Input
                id="vendor-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="0700000000"
                aria-invalid={Boolean(fieldErrors.phone)}
              />

              {fieldErrors.phone && (
                <p className="mt-1.5 text-sm text-red-600">
                  {fieldErrors.phone}
                </p>
              )}
            </div>
          </div>

          <div>
            <label
              htmlFor="vendor-address"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Address
            </label>

            <textarea
              id="vendor-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Vendor address"
              rows={3}
              aria-invalid={Boolean(fieldErrors.address)}
              className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
            />

            {fieldErrors.address && (
              <p className="mt-1.5 text-sm text-red-600">
                {fieldErrors.address}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="vendor-payment-terms"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Payment Terms
            </label>

            <Input
              id="vendor-payment-terms"
              value={paymentTerms}
              onChange={(event) => setPaymentTerms(event.target.value)}
              placeholder="e.g. Net 30"
              aria-invalid={Boolean(fieldErrors.paymentTerms)}
            />

            {fieldErrors.paymentTerms && (
              <p className="mt-1.5 text-sm text-red-600">
                {fieldErrors.paymentTerms}
              </p>
            )}
          </div>

          {createMutation.isError && Object.keys(fieldErrors).length === 0 && (
            <p className="text-sm text-red-600">
              {createMutation.error instanceof Error
                ? createMutation.error.message
                : "Failed to create vendor."}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-5">
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate("/vendors")}
            >
              Cancel
            </Button>

            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create vendor"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default NewVendorPage;
