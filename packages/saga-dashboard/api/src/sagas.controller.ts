import { Controller, Get, Param, Query } from "@nestjs/common";
import { SagasService } from "./sagas.service.js";

@Controller("api/sagas")
export class SagasController {
  constructor(private readonly sagasService: SagasService) {}

  @Get()
  async list(@Query("limit") limit?: string) {
    return this.sagasService.listSagas(limit ? Number(limit) : 50);
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    const saga = await this.sagasService.getSaga(id);
    if (!saga) return { error: "Saga not found" };
    return saga;
  }
}
