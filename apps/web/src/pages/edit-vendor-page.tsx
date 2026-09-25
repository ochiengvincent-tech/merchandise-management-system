import { type FormEvent, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { ApiError } from "../lib/api/client";
import { useUpdateVendor, useVendor } from "../features/vendors/hooks";

type VendorFormProps = {
  id: string;
  vendorCode: string;
  initialName: string;
  initialEmail: string;
  initialPhone: string;
  initialAddress: string;
  initialPaymentTerms: string;
};

function VendorForm({
  id,
  vendorCode,
  initialName,
  initialEmail,
  initialPhone,
  initialAddress,
  initialPaymentTerms,
}: VendorFormProps) {
  const navigate = useNavigate();
  const updateMutation = useUpdateVendor();

  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState(initialPhone);
  const [address, setAddress] = useState(initialAddress);
  const [paymentTerms, setPaymentTerms] = useState(initialPaymentTerms);

  const fieldErrors =
    updateMutation.error instanceof ApiError
      ? Object.fromEntries(
          updateMutation.error.fieldErrors.map(({ field, message }) => [
            field,
            message,
          ]),
        )
      : {};

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const vendor = await updateMutation.mutateAsync({
      id,
      data: {
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        paymentTerms: paymentTerms.trim() || undefined,
      },
    });

    navigate(`/vendors/${vendor.id}`);
  };

  return (
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

            <Input id="vendor-code" value={vendorCode} disabled />

            <p className="mt-1.5 text-xs text-slate-500">
              Vendor codes cannot be changed.
            </p>
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
              required
              aria-invalid={Boolean(fieldErrors.name)}
            />

            {fieldErrors.name && (
              <p className="mt-1.5 text-sm text-red-600">{fieldErrors.name}</p>
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
              aria-invalid={Boolean(fieldErrors.email)}
            />

            {fieldErrors.email && (
              <p className="mt-1.5 text-sm text-red-600">{fieldErrors.email}</p>
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
              aria-invalid={Boolean(fieldErrors.phone)}
            />

            {fieldErrors.phone && (
              <p className="mt-1.5 text-sm text-red-600">{fieldErrors.phone}</p>
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
            rows={3}
            aria-invalid={Boolean(fieldErrors.address)}
            className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
          />

          {fieldErrors.address && (
            <p className="mt-1.5 text-sm text-red-600">{fieldErrors.address}</p>
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
            aria-invalid={Boolean(fieldErrors.paymentTerms)}
          />

          {fieldErrors.paymentTerms && (
            <p className="mt-1.5 text-sm text-red-600">
              {fieldErrors.paymentTerms}
            </p>
          )}
        </div>

        {updateMutation.isError && Object.keys(fieldErrors).length === 0 && (
          <p className="text-sm text-red-600">
            {updateMutation.error instanceof Error
              ? updateMutation.error.message
              : "Failed to update vendor."}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-5">
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate(`/vendors/${id}`)}
          >
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

function EditVendorPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const vendorQuery = useVendor(id);

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

        <Button variant="secondary" onClick={() => navigate("/vendors")}>
          Back to vendors
        </Button>
      </div>
    );
  }

  const vendor = vendorQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <button
          type="button"
          onClick={() => navigate(`/vendors/${vendor.id}`)}
          className="mb-3 text-sm text-slate-500 hover:text-slate-900"
        >
          ← Vendor
        </button>

        <h1 className="text-2xl font-semibold text-slate-950">Edit Vendor</h1>

        <p className="mt-1 text-sm text-slate-500">
          Update the vendor's contact and payment information.
        </p>
      </div>

      <VendorForm
        key={vendor.id}
        id={vendor.id}
        vendorCode={vendor.vendorCode}
        initialName={vendor.name}
        initialEmail={vendor.email ?? ""}
        initialPhone={vendor.phone ?? ""}
        initialAddress={vendor.address ?? ""}
        initialPaymentTerms={vendor.paymentTerms ?? ""}
      />
    </div>
  );
}

export default EditVendorPage;
