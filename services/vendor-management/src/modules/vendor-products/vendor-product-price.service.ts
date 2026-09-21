import {
  closeVendorProductPrice,
  createVendorProductPrice,
  findCurrentVendorProductPrice,
} from "./vendor-product-price.repository.js";

export async function createVendorProductPriceService(
  vendorProductId: string,
  price: string,
  effectiveFrom: Date = new Date(),
) {
  return createVendorProductPrice({
    vendorProductId,
    price,
    effectiveFrom,
  });
}

export async function getCurrentVendorProductPriceService(
  vendorProductId: string,
) {
  return findCurrentVendorProductPrice(vendorProductId);
}

export async function closeCurrentVendorProductPriceService(
  vendorProductId: string,
  effectiveTo: Date = new Date(),
) {
  const currentPrice =
    await findCurrentVendorProductPrice(vendorProductId);

  if (!currentPrice) {
    return null;
  }

  return closeVendorProductPrice(currentPrice.id, effectiveTo);
}
