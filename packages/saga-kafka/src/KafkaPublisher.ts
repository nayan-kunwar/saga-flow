import { Kafka, type Producer, type ProducerRecord } from "kafkajs";
import type { EventPublisher, SagaEvent, SagaRepository } from "@sagaflow/core";

export interface KafkaPublisherOptions {
  brokers: string[];
  clientId?: string;
  topic?: string;
}

export class KafkaPublisher implements EventPublisher {
  private readonly kafka: Kafka;
  private readonly topic: string;
  private producer?: Producer;
  private connected = false;

  constructor(options: KafkaPublisherOptions) {
    this.kafka = new Kafka({
      clientId: options.clientId ?? "sagaflow",
      brokers: options.brokers,
    });
    this.topic = options.topic ?? "saga-events";
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    this.producer = this.kafka.producer();
    await this.producer.connect();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.producer) {
      await this.producer.disconnect();
      this.producer = undefined;
      this.connected = false;
    }
  }

  async publish(event: SagaEvent): Promise<void> {
    await this.connect();
    const record: ProducerRecord = {
      topic: this.topic,
      messages: [
        {
          key: event.sagaId,
          value: JSON.stringify({
            type: event.type,
            sagaId: event.sagaId,
            sagaName: event.sagaName,
            timestamp: event.timestamp.toISOString(),
            payload: event.payload,
          }),
        },
      ],
    };
    await this.producer!.send(record);
  }
}

export interface OutboxRelayOptions {
  repository: SagaRepository;
  publisher: EventPublisher;
  pollIntervalMs?: number;
  batchSize?: number;
}

export class OutboxRelay {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(private readonly options: OutboxRelayOptions) {}

  async relayOnce(): Promise<number> {
    const { repository, publisher, batchSize = 100 } = this.options;

    if (!repository.getPendingOutboxEvents || !repository.markOutboxEventPublished) {
      return 0;
    }

    const pending = await repository.getPendingOutboxEvents(batchSize);
    let published = 0;

    for (const entry of pending) {
      await publisher.publish(entry.event);
      await repository.markOutboxEventPublished(entry.id);
      published++;
    }

    return published;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const interval = this.options.pollIntervalMs ?? 2_000;

    this.timer = setInterval(() => {
      this.relayOnce().catch((err) => {
        console.error("Outbox relay failed:", err);
      });
    }, interval);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.running = false;
  }
}
