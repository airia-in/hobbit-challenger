import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { getPrismaClientOptions, PrismaClient } from '@workspace-starter/db';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const options = getPrismaClientOptions();
    super(options);
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
