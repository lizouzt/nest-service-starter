import { Controller, Post, Body, Query, Req, BadRequestException } from '@nestjs/common';
import { Request } from 'express';
import { formidable } from 'formidable';
import { FileCenterService } from './file-center.service';
import { UploadInitDto } from './dto/upload-init.dto';
import { SliceInitDto } from './dto/slice-init.dto';
import { CompleteSliceDto } from './dto/complete-slice.dto';

@Controller('file-center')
export class FileCenterController {
  constructor(private readonly fileCenterService: FileCenterService) {}

  @Post('upload/init')
  async uploadInit(@Body() dto: UploadInitDto) {
    return this.fileCenterService.uploadInit(dto);
  }

  @Post('slice/init')
  async sliceInit(@Body() dto: SliceInitDto) {
    return this.fileCenterService.getSliceStatus(dto.taskId);
  }

  @Post('upload/slice')
  async uploadSlice(@Req() req: Request, @Query('taskId') taskId: string, @Query('trunkNum') trunkNum: string) {
    if (!taskId || !trunkNum) {
        throw new BadRequestException('Missing taskId or trunkNum');
    }

    const form = formidable({});
    const [fields, files] = await form.parse(req);
    const file = files.file?.[0];

    if (!file) {
        throw new BadRequestException('No file uploaded');
    }

    return this.fileCenterService.handleChunk(taskId, trunkNum, file.filepath);
  }

  @Post('slice/complete')
  async completeSlice(@Body() dto: CompleteSliceDto) {
    return this.fileCenterService.completeUpload(dto.taskId);
  }
}
