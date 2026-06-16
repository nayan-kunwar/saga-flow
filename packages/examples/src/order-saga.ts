import {
  Saga,
  DefaultSagaRegistry,
  InMemorySagaRepository,
  InMemoryEventPublisher,
  exponentialBackoff,
  retry,
} from "@sagaflow/core";

interface OrderContext extends Record<string, unknown> {
  orderId: string;
  inventoryReserved?: boolean;
  paymentCharged?: boolean;
  shipped?: boolean;
}

async function main() {
  const repository = new InMemorySagaRepository();
  const publisher = new InMemoryEventPublisher();

  console.log("Running order saga example...\n");

  const result = await Saga.create<OrderContext>(
    "order-saga",
    { orderId: "ORD-001" },
    { repository, eventPublisher: publisher }
  )
    .step(
      "reserve-inventory",
      async (ctx) => {
        console.log(`[${ctx.stepName}] Reserving inventory (key: ${ctx.idempotencyKey})`);
        return { inventoryReserved: true };
      },
      async (ctx) => {
        console.log(`[${ctx.stepName}] Releasing inventory`);
      }
    )
    .step(
      "charge-payment",
      async (ctx) => {
        console.log(`[${ctx.stepName}] Charging payment`);
        return { paymentCharged: true };
      },
      async (ctx) => {
        console.log(`[${ctx.stepName}] Refunding payment`);
      },
      { retry: retry({ attempts: 3, strategy: exponentialBackoff({ initialDelayMs: 100 }) }) }
    )
    .step(
      "book-shipping",
      async (ctx) => {
        console.log(`[${ctx.stepName}] Booking shipping`);
        return { shipped: true };
      },
      async (ctx) => {
        console.log(`[${ctx.stepName}] Cancelling shipment`);
      }
    )
    .execute();

  console.log("\nResult:", result);
  console.log("\nEvents published:", publisher.events.map((e) => e.type));

  // Demonstrate registered definition for recovery
  const registry = new DefaultSagaRegistry();
  const definition = Saga.define<OrderContext>("order-saga", { orderId: "ORD-002" })
    .step("reserve-inventory", async () => ({ inventoryReserved: true }))
    .step("charge-payment", async () => ({ paymentCharged: true }))
    .define();

  Saga.register(registry, definition);
  console.log("\nRegistered saga definition:", registry.has("order-saga"));
}

main().catch(console.error);
