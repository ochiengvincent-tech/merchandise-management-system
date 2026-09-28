import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { ApiError, getFieldErrorMap } from "../../lib/api/client";
import { useProducts } from "../../features/products/hooks";
import { useCreateVendor } from "../../features/vendors/hooks";
import { useCreateVendorProduct } from "../../features/vendor-products/hooks";

type InitialSupplierProduct = {
  productId: string;
  supplierProductCode: string;
  currentPrice: string;
  leadTimeDays: string;
};

function NewVendorPage() {
  const navigate = useNavigate();
  const createVendorMutation = useCreateVendor();
  const createVendorProductMutation = useCreateVendorProduct();
  const productsQuery = useProducts({ status: "ACTIVE" });

  const [vendorCode, setVendorCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailInvalid, setEmailInvalid] = useState(false);
  const [hasTriedSubmit, setHasTriedSubmit] = useState(false);
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");

  const [selectedProductId, setSelectedProductId] = useState("");
  const [supplierProductCode, setSupplierProductCode] = useState("");
  const [currentPrice, setCurrentPrice] = useState("");
  const [leadTimeDays, setLeadTimeDays] = useState("");
  const [initialProducts, setInitialProducts] = useState<
    InitialSupplierProduct[]
  >([]);
  const [productError, setProductError] = useState("");

  const fieldErrors = getFieldErrorMap(createVendorMutation.error);

  if (
    createVendorMutation.error instanceof ApiError &&
    createVendorMutation.error.message === "Vendor code already exists"
  ) {
    fieldErrors.vendorCode = "A vendor with this vendor code already exists.";
  }

  const addSupplierProduct = () => {
    setProductError("");

    if (!selectedProductId) {
      setProductError("Select a product.");
      return;
    }

    if (
      initialProducts.some((product) => product.productId === selectedProductId)
    ) {
      setProductError("This product has already been added.");
      return;
    }

    const price = Number(currentPrice);
    const leadTime = Number(leadTimeDays);

    if (!currentPrice || !Number.isFinite(price) || price < 0) {
      setProductError("Enter a valid price.");
      return;
    }

    if (!leadTimeDays || !Number.isInteger(leadTime) || leadTime < 0) {
      setProductError("Enter a valid lead time.");
      return;
    }

    setInitialProducts((current) => [
      ...current,
      {
        productId: selectedProductId,
        supplierProductCode: supplierProductCode.trim(),
        currentPrice,
        leadTimeDays,
      },
    ]);

    setSelectedProductId("");
    setSupplierProductCode("");
    setCurrentPrice("");
    setLeadTimeDays("");
  };

  const removeSupplierProduct = (productId: string) => {
    setInitialProducts((current) =>
      current.filter((product) => product.productId !== productId),
    );
  };

  const handleSubmit = async () => {
    try {
      const vendor = await createVendorMutation.mutateAsync({
        vendorCode: vendorCode.trim(),
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        paymentTerms: paymentTerms.trim() || undefined,
      });

      for (const product of initialProducts) {
        await createVendorProductMutation.mutateAsync({
          vendorId: vendor.id,
          data: {
            productId: product.productId,
            supplierProductCode: product.supplierProductCode || undefined,
            currentPrice: Number(product.currentPrice),
            leadTimeDays: Number(product.leadTimeDays),
          },
        });
      }

      navigate(`/vendors/${vendor.id}`);
    } catch {
      return;
    }
  };

  const isSubmitting =
    createVendorMutation.isPending || createVendorProductMutation.isPending;

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
          Add a supplier and optionally configure the products they supply.
        </p>
      </div>

      <Card>
        <form
          onInvalidCapture={() => setHasTriedSubmit(true)}
          onSubmit={(event) => {
            event.preventDefault();
            setHasTriedSubmit(true);
            void handleSubmit();
          }}
          className="space-y-8"
        >
          <section className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-slate-950">
                Vendor Information
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Basic information about the supplier.
              </p>
            </div>

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
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setEmailInvalid(event.currentTarget.validity.typeMismatch);
                  }}
                  placeholder="orders@example.com"
                  aria-invalid={Boolean(
                    fieldErrors.email || (hasTriedSubmit && emailInvalid),
                  )}
                />

                {(fieldErrors.email || (hasTriedSubmit && emailInvalid)) && (
                  <p className="mt-1.5 text-sm text-red-600">
                    {fieldErrors.email ?? "Enter a valid email address."}
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
          </section>

          <section className="space-y-5 border-t border-slate-200 pt-8">
            <div>
              <h2 className="text-base font-semibold text-slate-950">
                Initial Supplier Products
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Optionally add the products this vendor supplies.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-[2fr_1.5fr_1fr_1fr_auto]">
              <div>
                <label
                  htmlFor="supplier-product"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Product
                </label>

                <Select
                  id="supplier-product"
                  value={selectedProductId}
                  onChange={(event) => setSelectedProductId(event.target.value)}
                  disabled={productsQuery.isLoading}
                >
                  <option value="">
                    {productsQuery.isLoading
                      ? "Loading products..."
                      : "Select product"}
                  </option>

                  {productsQuery.data?.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} ({product.sku})
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label
                  htmlFor="supplier-product-code"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Supplier Code
                </label>

                <Input
                  id="supplier-product-code"
                  value={supplierProductCode}
                  onChange={(event) =>
                    setSupplierProductCode(event.target.value)
                  }
                  placeholder="Optional"
                />
              </div>

              <div>
                <label
                  htmlFor="supplier-product-price"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Price (KES)
                </label>

                <Input
                  id="supplier-product-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={currentPrice}
                  onChange={(event) => setCurrentPrice(event.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div>
                <label
                  htmlFor="supplier-product-lead-time"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Lead Time
                </label>

                <Input
                  id="supplier-product-lead-time"
                  type="number"
                  min="0"
                  step="1"
                  value={leadTimeDays}
                  onChange={(event) => setLeadTimeDays(event.target.value)}
                  placeholder="Days"
                />
              </div>

              <div className="flex items-end">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={addSupplierProduct}
                >
                  Add Product
                </Button>
              </div>
            </div>

            {productError && (
              <p className="text-sm text-red-600">{productError}</p>
            )}

            {productsQuery.isError && (
              <p className="text-sm text-red-600">Failed to load products.</p>
            )}

            {initialProducts.length > 0 && (
              <div className="overflow-hidden rounded-md border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-slate-200">
                      <th className="px-4 py-3 text-left font-semibold text-slate-600">
                        Product
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-600">
                        Supplier Code
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-600">
                        Price
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-600">
                        Lead Time
                      </th>
                      <th className="w-24 px-4 py-3" />
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {initialProducts.map((supplierProduct) => {
                      const product = productsQuery.data?.find(
                        (item) => item.id === supplierProduct.productId,
                      );

                      return (
                        <tr key={supplierProduct.productId}>
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {product?.name ?? "Product"}
                          </td>

                          <td className="px-4 py-3 text-slate-600">
                            {supplierProduct.supplierProductCode || "—"}
                          </td>

                          <td className="px-4 py-3 text-slate-600">
                            KES{" "}
                            {Number(
                              supplierProduct.currentPrice,
                            ).toLocaleString("en-KE", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>

                          <td className="px-4 py-3 text-slate-600">
                            {supplierProduct.leadTimeDays} days
                          </td>

                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                removeSupplierProduct(supplierProduct.productId)
                              }
                              className="text-sm font-medium text-red-600 hover:text-red-700"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {createVendorMutation.isError &&
            Object.keys(fieldErrors).length === 0 && (
              <p className="text-sm text-red-600">
                {createVendorMutation.error instanceof Error
                  ? createVendorMutation.error.message
                  : "Failed to create vendor."}
              </p>
            )}

          {createVendorProductMutation.isError && (
            <p className="text-sm text-red-600">
              Vendor was created, but one or more supplier products could not be
              added. Open the vendor and add the remaining products there.
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-5">
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate("/vendors")}
              disabled={isSubmitting}
            >
              Cancel
            </Button>

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create vendor"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default NewVendorPage;
