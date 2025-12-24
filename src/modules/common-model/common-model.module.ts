import { Module } from '@nestjs/common';
import { CommonModelController } from './common-model.controller';
import { CommonModelService } from './common-model.service';

@Module({
  controllers: [CommonModelController],
  providers: [CommonModelService],
})
export class CommonModelModule {}
