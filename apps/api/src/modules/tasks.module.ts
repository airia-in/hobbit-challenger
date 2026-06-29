import { Module } from '@nestjs/common';
import { ProofVerifierService } from '../services/proof-verifier.service';
import { TasksService } from '../services/tasks.service';

@Module({
  providers: [ProofVerifierService, TasksService],
  exports: [TasksService, ProofVerifierService],
})
export class TasksModule {}
