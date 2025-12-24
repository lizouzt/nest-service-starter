import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FileCenterController } from './file-center.controller';
import { FileCenterService } from './file-center.service';
import { StaticFile, StaticFileSchema } from './schemas/static-file.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: StaticFile.name, schema: StaticFileSchema }]),
  ],
  controllers: [FileCenterController],
  providers: [FileCenterService],
})
export class FileCenterModule {}
