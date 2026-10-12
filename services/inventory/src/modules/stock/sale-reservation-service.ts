import { createHash } from "node:crypto";
import {
  consumeSaleCompletedEvent as consumeSaleCompletedEventRepository,
  releaseSaleStock as releaseSaleStockRepository,
  reserveSaleStock as reserveSaleStockRepository,
  type SaleStockReservationInput,
} from "./sale-reservation-repository.js";

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function reserveSaleStock(input: SaleStockReservationInput) {
  const requestHash = hash({
    reservationId: input.reservationId,
    saleId: input.saleId,
    productId: input.productId,
    locationId: input.locationId,
    quantity: input.quantity,
    actorId: input.actorId,
  });
  return reserveSaleStockRepository(input, requestHash);
}

export const releaseSaleStock = releaseSaleStockRepository;

export const consumeSaleCompletedEvent = consumeSaleCompletedEventRepository;
