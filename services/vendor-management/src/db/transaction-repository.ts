import { db } from "./index.js";

export const runVendorManagementTransaction = <T>(
  operation: (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ) => Promise<T>,
) => db.transaction(operation);
