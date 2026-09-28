import type { BadgeVariant } from "../../components/ui/badge";

export function purchaseOrderStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case "PENDING_APPROVAL":
      return "warning";
    case "APPROVED":
      return "info";
    case "SENT":
      return "sent";
    case "PARTIALLY_RECEIVED":
      return "partial";
    case "COMPLETED":
      return "success";
    case "CANCELLED":
      return "danger";
    default:
      return "default";
  }
}
