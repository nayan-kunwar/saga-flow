import { Module } from "@nestjs/common";
import { Pool } from "pg";
import { runMigrations } from "@sagaflow/postgres";
import { SagasController } from "./sagas.controller.js";
import { SagasService } from "./sagas.service.js";
import { MetricsController } from "./metrics.controller.js";
import { MetricsService } from "./metrics.service.js";

@Module({
  controllers: [SagasController, MetricsController],
  providers: [
    {
      provide: Pool,
      useFactory: async () => {
        const pool = new Pool({
          connectionString:
            process.env.DATABASE_URL ??
            "postgresql://postgres:postgres@localhost:5432/sagaflow",
        });
        await runMigrations(pool);
        return pool;
      },
    },
    SagasService,
    MetricsService,
  ],
})
export class AppModule {}
