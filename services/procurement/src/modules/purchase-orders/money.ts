import { AppError } from "../../errors/app-error.js";

export function moneyToCents(value: string) {
  const normalized = value.trim();

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new AppError("Invalid monetary value", 400);
  }

  const decimalIndex = normalized.indexOf(".");

  if (decimalIndex === -1) {
    return BigInt(normalized) * 100n;
  }

  const whole = normalized.slice(0, decimalIndex);
  const decimal = normalized.slice(decimalIndex + 1);

  return BigInt(whole) * 100n + BigInt(decimal.padEnd(2, "0"));
}

export function centsToMoney(cents: bigint) {
  const whole = cents / 100n;
  const decimal = (cents % 100n).toString().padStart(2, "0");

  return `${whole}.${decimal}`;
}
