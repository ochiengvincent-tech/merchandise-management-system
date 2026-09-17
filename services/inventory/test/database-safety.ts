export const assertTestDatabaseUrl = (databaseUrl: string) => {
  const url = new URL(databaseUrl);

  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/inventory_test_db"
  ) {
    throw new Error(
      `Refusing to run tests against non-test database: ${url.hostname}${url.pathname}`,
    );
  }
};
