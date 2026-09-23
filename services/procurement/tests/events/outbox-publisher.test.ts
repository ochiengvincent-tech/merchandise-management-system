import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  publish: vi.fn().mockReturnValue(true),
  waitForConfirms: vi.fn().mockResolvedValue(undefined),
  getRabbitMQChannel: vi.fn(),
  findPendingOutboxEvents: vi.fn(),
  incrementOutboxEventAttempt: vi.fn(),
  markOutboxEventFailed: vi.fn(),
  markOutboxEventPublished: vi.fn(),
  poolClient: {
    query: vi.fn().mockResolvedValue({ rows: [{ locked: true }] }),
    release: vi.fn(),
  },
}));

mocks.getRabbitMQChannel.mockResolvedValue({
  publish: mocks.publish,
  waitForConfirms: mocks.waitForConfirms,
});

mocks.findPendingOutboxEvents.mockResolvedValue([
  {
    id: "11111111-1111-4111-8111-111111111111",
    eventId: "22222222-2222-4222-8222-222222222222",
    eventType: "PurchaseOrderApproved",
    aggregateType: "PurchaseOrder",
    aggregateId: "33333333-3333-4333-8333-333333333333",
    payload: {
      purchaseOrderId: "33333333-3333-4333-8333-333333333333",
      lines: [],
    },
    status: "PENDING",
    attempts: 0,
    occurredAt: new Date(),
  },
]);

mocks.markOutboxEventPublished.mockResolvedValue({});

vi.mock("../../src/modules/events/rabbitmq.js", () => ({
  getRabbitMQChannel: mocks.getRabbitMQChannel,
}));

vi.mock("../../src/db/index.js", () => ({
  pool: {
    connect: vi.fn().mockResolvedValue(mocks.poolClient),
  },
}));

vi.mock("../../src/modules/events/outbox-repository.js", () => ({
  findPendingOutboxEvents: mocks.findPendingOutboxEvents,
  incrementOutboxEventAttempt: mocks.incrementOutboxEventAttempt,
  markOutboxEventFailed: mocks.markOutboxEventFailed,
  markOutboxEventPublished: mocks.markOutboxEventPublished,
}));

import { publishPendingOutboxEvents } from "../../src/modules/events/outbox-publisher.js";

describe("outbox publisher", () => {
  it("publishes a pending event and marks it as published", async () => {
    await publishPendingOutboxEvents();

    expect(mocks.getRabbitMQChannel).toHaveBeenCalledOnce();
    expect(mocks.publish).toHaveBeenCalledOnce();
    expect(mocks.waitForConfirms).toHaveBeenCalledOnce();
    expect(mocks.markOutboxEventPublished).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(mocks.incrementOutboxEventAttempt).not.toHaveBeenCalled();
    expect(mocks.markOutboxEventFailed).not.toHaveBeenCalled();
  });
  it("increments the attempt when publishing fails", async () => {
    mocks.publish.mockClear();
    mocks.waitForConfirms.mockRejectedValueOnce(
      new Error("RabbitMQ publish confirmation timed out"),
    );
    mocks.incrementOutboxEventAttempt.mockResolvedValueOnce({
      id: "11111111-1111-4111-8111-111111111111",
      attempts: 1,
    });
    mocks.markOutboxEventPublished.mockClear();
    mocks.markOutboxEventFailed.mockClear();

    await publishPendingOutboxEvents();

    expect(mocks.publish).toHaveBeenCalledOnce();
    expect(mocks.waitForConfirms).toHaveBeenCalledOnce();
    expect(mocks.incrementOutboxEventAttempt).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(mocks.markOutboxEventPublished).not.toHaveBeenCalled();
    expect(mocks.markOutboxEventFailed).not.toHaveBeenCalled();
  });
  it("marks the event as failed when the maximum attempts are reached", async () => {
    mocks.publish.mockClear();
    mocks.waitForConfirms.mockRejectedValueOnce(
      new Error("RabbitMQ publish confirmation timed out"),
    );
    mocks.incrementOutboxEventAttempt.mockResolvedValueOnce({
      id: "11111111-1111-4111-8111-111111111111",
      attempts: 3,
    });
    mocks.markOutboxEventPublished.mockClear();
    mocks.markOutboxEventFailed.mockClear();

    await publishPendingOutboxEvents();

    expect(mocks.incrementOutboxEventAttempt).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(mocks.markOutboxEventFailed).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(mocks.markOutboxEventPublished).not.toHaveBeenCalled();
  });
  it("marks an event as failed when it has already reached the maximum attempts", async () => {
    mocks.findPendingOutboxEvents.mockResolvedValueOnce([
      {
        id: "44444444-4444-4444-8444-444444444444",
        eventId: "55555555-5555-4555-8555-555555555555",
        eventType: "PurchaseOrderApproved",
        aggregateType: "PurchaseOrder",
        aggregateId: "33333333-3333-4333-8333-333333333333",
        payload: {
          purchaseOrderId: "33333333-3333-4333-8333-333333333333",
          lines: [],
        },
        status: "PENDING",
        attempts: 3,
        occurredAt: new Date(),
      },
    ]);

    mocks.publish.mockClear();
    mocks.waitForConfirms.mockClear();
    mocks.incrementOutboxEventAttempt.mockClear();
    mocks.markOutboxEventPublished.mockClear();
    mocks.markOutboxEventFailed.mockClear();

    await publishPendingOutboxEvents();

    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.waitForConfirms).not.toHaveBeenCalled();
    expect(mocks.incrementOutboxEventAttempt).not.toHaveBeenCalled();
    expect(mocks.markOutboxEventPublished).not.toHaveBeenCalled();
    expect(mocks.markOutboxEventFailed).toHaveBeenCalledWith(
      "44444444-4444-4444-8444-444444444444",
    );
  });
});
