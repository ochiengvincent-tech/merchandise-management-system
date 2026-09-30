import { describe, expect, it } from "vitest";
import { assertTestDatabaseUrl } from "./database-safety.js";

describe("test database safety", () => {
  it("accepts the local inventory test database", () => {
    expect(() =>
      assertTestDatabaseUrl(
        "postgresql://mms_vendor:secret@localhost:5432/inventory_test_db",
      ),
    ).not.toThrow();
  });

  it.each([
    "postgresql://mms_vendor:secret@localhost:5432/inventory_db",
    "postgresql://mms_vendor:secret@localhost:5432/postgres",
    "postgresql://mms_vendor:secret@db:5432/inventory_test_db",
  ])("rejects unsafe database URL %s", (databaseUrl) => {
    expect(() => assertTestDatabaseUrl(databaseUrl)).toThrow(
      "Refusing to run tests against non-test database",
    );
  });
});
