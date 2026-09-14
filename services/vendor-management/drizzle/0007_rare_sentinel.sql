CREATE UNIQUE INDEX "vendor_product_prices_one_current_price_unique"
  ON "vendor_product_prices" ("vendor_product_id")
  WHERE "effective_to" IS NULL;
