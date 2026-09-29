import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../lib/api/client";
import { API_URLS, CURRENT_ACTOR_ID } from "../../lib/api/config";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { useLocations } from "../../features/locations/hooks";

type Register = {
  id: string;
  code: string;
  name: string;
  inventoryLocationId: string;
};
type Product = {
  id: string;
  sku: string;
  name: string;
  barcode?: string | null;
  status: string;
  quantityAvailable: number | null;
};
type RetailPrice = {
  amountMinor: number;
  taxRateBps: number;
  currency: string;
} | null;
type Sale = {
  id: string;
  receiptNumber: string;
  status: string;
  subtotalMinor: number | null;
  taxMinor: number | null;
  totalMinor: number | null;
  createdAt: string;
  completedAt: string | null;
  lines: Array<{
    id: string;
    nameSnapshot: string;
    skuSnapshot: string;
    quantity: number;
    unitPriceMinor: number;
    taxMinor: number;
    lineTotalMinor: number;
    returnedQuantity?: number;
    refundedMinor?: number;
  }>;
  tenders: Array<{ method: string; amountMinor: number }>;
};
type CartLine = Product & {
  amountMinor: number;
  taxRateBps: number;
  quantity: number;
};
type ListResponse<T> = { data: T[] };
const money = (minor: number) =>
  `KES ${(minor / 100).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The request could not be completed.";

export function RetailSalesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [registerId, setRegisterId] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [pricingProduct, setPricingProduct] = useState<Product | null>(null);
  const [priceText, setPriceText] = useState("");
  const [taxText, setTaxText] = useState("0");
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [returnSale, setReturnSale] = useState<Sale | null>(null);
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null);
  const [returnQuantities, setReturnQuantities] = useState<
    Record<string, number>
  >({});
  const [returnDisposition, setReturnDisposition] = useState<
    "RESTOCK_SELLABLE" | "QUARANTINE" | "NO_STOCK_RETURN"
  >("RESTOCK_SELLABLE");
  const [returnReason, setReturnReason] = useState("");
  const [returnMessage, setReturnMessage] = useState("");
  const checkoutKey = useRef<{ signature: string; key: string } | null>(null);
  const returnKey = useRef<{ signature: string; key: string } | null>(null);
  const [formError, setFormError] = useState("");
  const [registerCode, setRegisterCode] = useState("");
  const [registerName, setRegisterName] = useState("");
  const [locationId, setLocationId] = useState("");
  const registersQuery = useQuery({
    queryKey: ["retail-sales", "registers"],
    queryFn: () =>
      apiRequest<ListResponse<Register>>(`${API_URLS.retailSales}/registers`),
  });
  const locationsQuery = useLocations({
    status: "ACTIVE",
    locationType: "STORE",
  });
  const registers = registersQuery.data?.data ?? [];
  const activeRegisterId = registers.some((item) => item.id === registerId)
    ? registerId
    : (registers[0]?.id ?? "");
  const productsQuery = useQuery({
    queryKey: ["retail-sales", "product-search", search, activeRegisterId],
    queryFn: () =>
      apiRequest<ListResponse<Product>>(
        `${API_URLS.retailSales}/products/search?q=${encodeURIComponent(search.trim())}&registerId=${activeRegisterId}`,
      ),
    enabled: search.trim().length >= 2 && Boolean(activeRegisterId),
  });
  const salesQuery = useQuery({
    queryKey: ["retail-sales", "sales"],
    queryFn: () =>
      apiRequest<ListResponse<Sale>>(`${API_URLS.retailSales}/sales?limit=10`),
  });
  const subtotal = cart.reduce(
    (sum, line) => sum + line.amountMinor * line.quantity,
    0,
  );
  const tax = cart.reduce(
    (sum, line) =>
      sum +
      Math.round((line.amountMinor * line.quantity * line.taxRateBps) / 10000),
    0,
  );
  const total = subtotal + tax;

  const addRegister = useMutation({
    mutationFn: (input: {
      code: string;
      name: string;
      inventoryLocationId: string;
    }) =>
      apiRequest<{ data: Register }>(`${API_URLS.retailSales}/registers`, {
        method: "POST",
        headers: { "x-actor-id": CURRENT_ACTOR_ID },
        body: JSON.stringify(input),
      }),
    onSuccess: async (result) => {
      setRegisterId(result.data.id);
      setRegisterCode("");
      setRegisterName("");
      await queryClient.invalidateQueries({
        queryKey: ["retail-sales", "registers"],
      });
    },
  });
  const setPrice = useMutation({
    mutationFn: (input: {
      productId: string;
      amountMinor: number;
      taxRateBps: number;
    }) =>
      apiRequest(`${API_URLS.retailSales}/prices/${input.productId}`, {
        method: "PUT",
        headers: { "x-actor-id": CURRENT_ACTOR_ID },
        body: JSON.stringify({
          amountMinor: input.amountMinor,
          taxRateBps: input.taxRateBps,
        }),
      }),
    onSuccess: async () => {
      if (pricingProduct) await addProduct(pricingProduct);
      setPricingProduct(null);
      setPriceText("");
      setTaxText("0");
    },
  });
  const checkout = useMutation({
    mutationFn: (input: {
      registerId: string;
      lines: Array<{ productId: string; quantity: number }>;
      tenders: Array<{ method: "CASH"; amountMinor: number }>;
    }) => {
      const signature = JSON.stringify(input);
      if (!checkoutKey.current || checkoutKey.current.signature !== signature)
        checkoutKey.current = { signature, key: crypto.randomUUID() };
      return apiRequest<{ data: Sale }>(`${API_URLS.retailSales}/sales`, {
        method: "POST",
        headers: {
          "x-actor-id": CURRENT_ACTOR_ID,
          "Idempotency-Key": checkoutKey.current.key,
        },
        body: JSON.stringify(input),
      });
    },
    onSuccess: async (result) => {
      checkoutKey.current = null;
      setLastSale(result.data);
      setCart([]);
      setFormError("");
      await queryClient.invalidateQueries({
        queryKey: ["retail-sales", "sales"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["retail-sales", "product-search"],
      });
      await queryClient.invalidateQueries({ queryKey: ["stock"] });
    },
    onError: (error) => setFormError(errorMessage(error)),
  });
  const returnMutation = useMutation({
    mutationFn: (input: {
      sale: Sale;
      reason: string;
      lines: Array<{
        saleLineId: string;
        quantity: number;
        disposition: string;
      }>;
      totalMinor: number;
    }) => {
      const body = {
        reason: input.reason,
        lines: input.lines,
        tenders: [{ method: "CASH", amountMinor: input.totalMinor }],
      };
      const signature = JSON.stringify({ saleId: input.sale.id, ...body });
      if (!returnKey.current || returnKey.current.signature !== signature)
        returnKey.current = { signature, key: crypto.randomUUID() };
      return apiRequest<{
        data: { returnNumber: string; totalRefundMinor: number };
      }>(`${API_URLS.retailSales}/sales/${input.sale.id}/returns`, {
        method: "POST",
        headers: {
          "x-actor-id": CURRENT_ACTOR_ID,
          "Idempotency-Key": returnKey.current.key,
        },
        body: JSON.stringify(body),
      });
    },
    onSuccess: async (result) => {
      returnKey.current = null;
      setReturnMessage(
        `Return ${result.data.returnNumber} recorded for ${money(result.data.totalRefundMinor)}. Cash refund was recorded; no payment processor is connected.`,
      );
      setReturnSale(null);
      setReturnReason("");
      await queryClient.invalidateQueries({ queryKey: ["retail-sales"] });
      await queryClient.invalidateQueries({ queryKey: ["stock"] });
    },
  });

  async function addProduct(product: Product) {
    setFormError("");
    try {
      const result = await apiRequest<{ data: RetailPrice }>(
        `${API_URLS.retailSales}/prices?productId=${product.id}`,
      );
      if (!result.data) {
        setPricingProduct(product);
        return;
      }
      setCart((current) => {
        const existing = current.find((line) => line.id === product.id);
        return existing
          ? current.map((line) =>
              line.id === product.id
                ? { ...line, quantity: line.quantity + 1 }
                : line,
            )
          : [
              ...current,
              {
                ...product,
                amountMinor: result.data!.amountMinor,
                taxRateBps: result.data!.taxRateBps,
                quantity: 1,
              },
            ];
      });
      setSearch("");
    } catch (error) {
      setFormError(errorMessage(error));
    }
  }

  async function configurePrice(product: Product) {
    try {
      const result = await apiRequest<{ data: RetailPrice }>(
        `${API_URLS.retailSales}/prices?productId=${product.id}`,
      );
      setPricingProduct(product);
      setPriceText(
        result.data ? (result.data.amountMinor / 100).toFixed(2) : "",
      );
      setTaxText(result.data ? (result.data.taxRateBps / 100).toFixed(2) : "0");
    } catch (error) {
      setFormError(errorMessage(error));
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-950">Retail Sales</h1>
        <p className="mt-1 text-sm text-slate-500">
          Sell items from an active store register. Inventory is reserved before
          the sale is completed.
        </p>
      </header>

      {lastSale && (
        <Card
          role="status"
          className="border-green-200 bg-green-50 p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-green-700">
                Sale completed · {lastSale.receiptNumber}
              </h2>
              <p className="mt-1 text-sm text-green-700">
                Total {money(lastSale.totalMinor ?? 0)} · Tender recorded as
                cash. The cash payment was recorded by POS; no payment processor
                is connected.
              </p>
            </div>
            <Button variant="secondary" onClick={() => setLastSale(null)}>
              Dismiss
            </Button>
          </div>
        </Card>
      )}

      {!registers.length && (
        <Card className="space-y-4 p-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              Set up a store register
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Choose an active Store location from Inventory. Register setup is
              required before checkout.
            </p>
          </div>
          {registersQuery.isError && (
            <p role="alert" className="text-sm text-red-700">
              {errorMessage(registersQuery.error)}
            </p>
          )}
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              addRegister.mutate({
                code: registerCode,
                name: registerName,
                inventoryLocationId: locationId,
              });
            }}
          >
            <label className="text-sm font-medium text-slate-700">
              Register code
              <Input
                required
                value={registerCode}
                onChange={(e) => setRegisterCode(e.target.value)}
                placeholder="STORE-01-TILL-1"
                className="mt-1"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Register name
              <Input
                required
                value={registerName}
                onChange={(e) => setRegisterName(e.target.value)}
                placeholder="Front counter"
                className="mt-1"
              />
            </label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">
              Store location
              <Select
                required
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="mt-1"
              >
                <option value="">Select a store</option>
                {(locationsQuery.data ?? []).map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.locationCode} · {location.name}
                  </option>
                ))}
              </Select>
            </label>
            {(addRegister.isError || locationsQuery.isError) && (
              <p
                role="alert"
                className="text-sm text-red-700 sm:col-span-2"
              >
                {errorMessage(addRegister.error ?? locationsQuery.error)}
              </p>
            )}
            <div className="sm:col-span-2">
              <Button
                type="submit"
                disabled={addRegister.isPending || !locationId}
              >
                {addRegister.isPending
                  ? "Creating register…"
                  : "Create register"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {registers.length > 0 && (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_350px]">
          <div className="space-y-5">
            <Card className="space-y-4 p-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">
                  Checkout
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Find products by name or SKU, then review the price before
                  recording a cash tender.
                </p>
              </div>
              <label className="block text-sm font-medium text-slate-700">
                Register
                <Select
                  value={activeRegisterId}
                  onChange={(e) => setRegisterId(e.target.value)}
                  className="mt-1"
                >
                  {registers.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code} · {item.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Search products
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Type a product name or SKU"
                  className="mt-1"
                />
              </label>
              {productsQuery.isFetching && (
                <p className="text-sm text-slate-500">Searching Inventory…</p>
              )}
              {productsQuery.isError && (
                <p
                  role="alert"
                  className="text-sm text-red-700"
                >
                  {errorMessage(productsQuery.error)}
                </p>
              )}
              {!!productsQuery.data?.data.length && (
                <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
                  {productsQuery.data.data.map((product) => (
                    <li
                      key={product.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-3"
                    >
                      <div>
                        <p className="font-medium text-slate-950">
                          {product.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {product.sku}
                          {product.barcode ? ` · ${product.barcode}` : ""}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => void configurePrice(product)}
                        >
                          Price
                        </Button>
                        <Button
                          disabled={product.quantityAvailable === 0}
                          onClick={() => void addProduct(product)}
                        >
                          {product.quantityAvailable === 0
                            ? "Out of stock"
                            : `Add · ${product.quantityAvailable ?? "?"} available`}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {search.trim().length >= 2 &&
                !productsQuery.isFetching &&
                !productsQuery.isError &&
                !productsQuery.data?.data.length && (
                  <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
                    No active products match this search.
                  </p>
                )}
            </Card>
            <Card className="overflow-hidden">
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="font-semibold text-slate-950">Current sale</h2>
              </div>
              {cart.length === 0 ? (
                <p className="p-8 text-center text-sm text-slate-500">
                  Search and add products to start a sale.
                </p>
              ) : (
                <ul className="divide-y divide-slate-200">
                  {cart.map((line) => (
                    <li
                      key={line.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-4"
                    >
                      <div>
                        <p className="font-medium text-slate-950">
                          {line.name}
                        </p>
                        <p className="text-sm text-slate-500">
                          {line.sku} · {money(line.amountMinor)} each · tax{" "}
                          {(line.taxRateBps / 100).toFixed(2)}%
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          onClick={() =>
                            setCart((items) =>
                              items.flatMap((item) =>
                                item.id !== line.id
                                  ? [item]
                                  : item.quantity <= 1
                                    ? []
                                    : [
                                        {
                                          ...item,
                                          quantity: item.quantity - 1,
                                        },
                                      ],
                              ),
                            )
                          }
                        >
                          −
                        </Button>
                        <span className="min-w-8 text-center font-semibold">
                          {line.quantity}
                        </span>
                        <Button
                          variant="secondary"
                          onClick={() =>
                            setCart((items) =>
                              items.map((item) =>
                                item.id === line.id
                                  ? { ...item, quantity: item.quantity + 1 }
                                  : item,
                              ),
                            )
                          }
                        >
                          +
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {formError && (
                <p
                  role="alert"
                  className="mx-5 mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800"
                >
                  {formError}
                </p>
              )}
            </Card>
          </div>
          <Card className="space-y-4 p-5 lg:sticky lg:top-24">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                Sale summary
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Totals are recalculated by Retail Sales at checkout.
              </p>
            </div>
            <div className="space-y-2 border-b border-slate-200 pb-4 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Subtotal</span>
                <span>{money(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Tax</span>
                <span>{money(tax)}</span>
              </div>
              <div className="flex justify-between text-base font-bold">
                <span>Total due</span>
                <span>{money(total)}</span>
              </div>
            </div>
            <p className="text-xs leading-5 text-slate-500">
              Cash tender is recorded in this system. No card processor or
              gift-card balance service is connected yet.
            </p>
            <Button
              disabled={!cart.length || !activeRegisterId || checkout.isPending}
              onClick={() => {
                setFormError("");
                checkout.mutate({
                  registerId: activeRegisterId,
                  lines: cart.map(({ id, quantity }) => ({
                    productId: id,
                    quantity,
                  })),
                  tenders: [{ method: "CASH", amountMinor: total }],
                });
              }}
            >
              {checkout.isPending
                ? "Reserving stock and recording…"
                : `Record cash sale · ${money(total)}`}
            </Button>
          </Card>
        </div>
      )}

      {pricingProduct && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"
          role="presentation"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="price-dialog-title"
            className="app-card w-full max-w-lg space-y-4 rounded-xl border p-5 shadow-xl"
          >
            <div>
              <h2
                id="price-dialog-title"
                className="text-lg font-semibold text-slate-950"
              >
                Set retail price
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {pricingProduct.name} · {pricingProduct.sku}. This price is
                owned by Retail Sales; supplier cost is not used.
              </p>
            </div>
            <label className="block text-sm font-medium">
              Unit price (KES)
              <Input
                inputMode="decimal"
                value={priceText}
                onChange={(e) => setPriceText(e.target.value)}
                placeholder="0.00"
                className="mt-1"
              />
            </label>
            <label className="block text-sm font-medium">
              Tax rate (%)
              <Input
                inputMode="decimal"
                value={taxText}
                onChange={(e) => setTaxText(e.target.value)}
                placeholder="0"
                className="mt-1"
              />
              <span className="mt-1 block text-xs text-slate-500">
                Enter the configured rate for this product. Tax defaults to
                zero.
              </span>
            </label>
            {setPrice.isError && (
              <p
                role="alert"
                className="text-sm text-red-700"
              >
                {errorMessage(setPrice.error)}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setPricingProduct(null)}
              >
                Cancel
              </Button>
              <Button
                disabled={
                  setPrice.isPending ||
                  !/^\d+(\.\d{1,2})?$/.test(priceText) ||
                  !/^\d+(\.\d{1,2})?$/.test(taxText)
                }
                onClick={() =>
                  setPrice.mutate({
                    productId: pricingProduct.id,
                    amountMinor: Math.round(Number(priceText) * 100),
                    taxRateBps: Math.round(Number(taxText) * 100),
                  })
                }
              >
                {setPrice.isPending ? "Saving…" : "Save price and add"}
              </Button>
            </div>
          </section>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold text-slate-950">Recent sales</h2>
          <p className="mt-1 text-sm text-slate-500">
            Completed receipts from Retail Sales
          </p>
        </div>
        {returnMessage && (
          <p
            role="status"
            className="border-b border-green-200 bg-green-50 px-5 py-3 text-sm text-green-700"
          >
            {returnMessage}
          </p>
        )}
        {salesQuery.isError ? (
          <p
            role="alert"
            className="p-5 text-sm text-red-700"
          >
            {errorMessage(salesQuery.error)}
          </p>
        ) : salesQuery.data?.data.length ? (
          <ul className="divide-y divide-slate-200">
            {salesQuery.data.data.map((sale) => (
              <li
                key={sale.id}
                className="flex flex-wrap justify-between gap-2 p-4"
              >
                <div>
                  <p className="font-semibold text-slate-950">
                    {sale.receiptNumber}
                  </p>
                  <p className="text-sm text-slate-500">
                    {sale.completedAt
                      ? new Date(sale.completedAt).toLocaleString()
                      : "Pending"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <strong>{money(sale.totalMinor ?? 0)}</strong>
                  <Button
                    variant="secondary"
                    onClick={() => setReceiptSale(sale)}
                  >
                    View receipt
                  </Button>
                  {sale.lines.some(
                    (line) => line.quantity > (line.returnedQuantity ?? 0),
                  ) && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setReturnSale(sale);
                        setReturnQuantities({});
                        setReturnReason("");
                      }}
                    >
                      Return items
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-8 text-center text-sm text-slate-500">
            No completed sales yet.
          </p>
        )}
      </Card>
      {receiptSale && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="receipt-dialog-title"
            className="app-card max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-xl border p-5 shadow-xl"
          >
            <div>
              <h2
                id="receipt-dialog-title"
                className="text-lg font-semibold text-slate-950"
              >
                Receipt · {receiptSale.receiptNumber}
              </h2>
              <p className="text-sm text-slate-500">
                {receiptSale.completedAt
                  ? new Date(receiptSale.completedAt).toLocaleString()
                  : ""}
              </p>
            </div>
            <ul className="divide-y divide-slate-200">
              {receiptSale.lines.map((line) => (
                <li key={line.id} className="flex justify-between gap-3 py-3">
                  <span>
                    {line.quantity} × {line.nameSnapshot}
                    <span className="block text-xs text-slate-500">
                      {line.skuSnapshot} · {money(line.unitPriceMinor)} each
                    </span>
                  </span>
                  <strong>{money(line.lineTotalMinor)}</strong>
                </li>
              ))}
            </ul>
            <div className="flex justify-between border-t border-slate-200 pt-3 font-bold">
              <span>Total</span>
              <span>{money(receiptSale.totalMinor ?? 0)}</span>
            </div>
            <p className="text-sm text-slate-500">
              Tender recorded:{" "}
              {receiptSale.tenders
                .map((t) => `${t.method} ${money(t.amountMinor)}`)
                .join(" · ")}
            </p>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setReceiptSale(null)}>
                Close receipt
              </Button>
            </div>
          </section>
        </div>
      )}
      {returnSale && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="return-dialog-title"
            className="app-card max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-xl border p-5 shadow-xl"
          >
            <div>
              <h2
                id="return-dialog-title"
                className="text-lg font-semibold text-slate-950"
              >
                Return items · {returnSale.receiptNumber}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Refund values use the original sale prices. Returned stock is
                routed according to its condition.
              </p>
            </div>
            <div className="space-y-3">
              {returnSale.lines
                .filter((line) => line.quantity > (line.returnedQuantity ?? 0))
                .map((line) => (
                  <div
                    key={line.id}
                    className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_120px]"
                  >
                    <div>
                      <p className="font-medium text-slate-950">
                        {line.nameSnapshot}
                      </p>
                      <p className="text-xs text-slate-500">
                        {line.skuSnapshot} · sold {line.quantity} · remaining{" "}
                        {line.quantity - (line.returnedQuantity ?? 0)} ·{" "}
                        {money(line.lineTotalMinor / line.quantity)} per unit
                      </p>
                    </div>
                    <label className="text-sm">
                      Quantity
                      <Input
                        type="number"
                        min="0"
                        max={line.quantity - (line.returnedQuantity ?? 0)}
                        value={returnQuantities[line.id] ?? 0}
                        onChange={(e) =>
                          setReturnQuantities((v) => ({
                            ...v,
                            [line.id]: Math.min(
                              line.quantity - (line.returnedQuantity ?? 0),
                              Math.max(0, Number(e.target.value)),
                            ),
                          }))
                        }
                      />
                    </label>
                  </div>
                ))}
            </div>
            <label className="block text-sm font-medium">
              Stock disposition for selected items
              <Select
                value={returnDisposition}
                onChange={(e) =>
                  setReturnDisposition(
                    e.target.value as typeof returnDisposition,
                  )
                }
                className="mt-1"
              >
                <option value="RESTOCK_SELLABLE">
                  Good condition · restock as sellable
                </option>
                <option value="QUARANTINE">Damaged · quarantine</option>
                <option value="NO_STOCK_RETURN">Do not return to stock</option>
              </Select>
            </label>
            <label className="block text-sm font-medium">
              Reason
              <Input
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder="Customer return reason"
                className="mt-1"
              />
            </label>
            {returnMutation.isError && (
              <p
                role="alert"
                className="text-sm text-red-700"
              >
                {errorMessage(returnMutation.error)}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
              <p className="text-sm">
                Estimated cash refund{" "}
                <strong>
                  {money(
                    returnSale.lines.reduce((sum, line) => {
                      const already = line.returnedQuantity ?? 0;
                      const refunded = line.refundedMinor ?? 0;
                      const requested = returnQuantities[line.id] ?? 0;
                      return (
                        sum +
                        Math.round(
                          (line.lineTotalMinor * (already + requested)) /
                            line.quantity,
                        ) -
                        refunded
                      );
                    }, 0),
                  )}
                </strong>
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setReturnSale(null)}>
                  Cancel
                </Button>
                <Button
                  disabled={
                    returnMutation.isPending ||
                    !returnReason.trim() ||
                    !Object.values(returnQuantities).some((q) => q > 0)
                  }
                  onClick={() => {
                    const lines = returnSale.lines
                      .filter((line) => (returnQuantities[line.id] ?? 0) > 0)
                      .map((line) => ({
                        saleLineId: line.id,
                        quantity: returnQuantities[line.id]!,
                        disposition: returnDisposition,
                      }));
                    const totalMinor = returnSale.lines.reduce((sum, line) => {
                      const already = line.returnedQuantity ?? 0;
                      const refunded = line.refundedMinor ?? 0;
                      const requested = returnQuantities[line.id] ?? 0;
                      return (
                        sum +
                        Math.round(
                          (line.lineTotalMinor * (already + requested)) /
                            line.quantity,
                        ) -
                        refunded
                      );
                    }, 0);
                    returnMutation.mutate({
                      sale: returnSale,
                      reason: returnReason,
                      lines,
                      totalMinor,
                    });
                  }}
                >
                  {returnMutation.isPending
                    ? "Recording return…"
                    : "Record cash refund"}
                </Button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
