import { getInventoryLocation } from "../../clients/inventory-client.js";
import {
  recordGoodsReceivedEvent,
  type GoodsReceivedEvent,
} from "./warehouse-event-repository.js";

export async function processGoodsReceivedEvent(event: GoodsReceivedEvent) {
  const location = await getInventoryLocation(event.payload.destinationLocationId);
  if (location.status !== "ACTIVE" || !location.warehouseManaged) {
    return {
      duplicate: false,
      ignored: true,
      reason: "Location is not Warehouse-managed",
    };
  }
  return recordGoodsReceivedEvent(event);
}
