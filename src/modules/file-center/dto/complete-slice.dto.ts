import { IsString } from 'class-validator';

export class CompleteSliceDto {
  @IsString()
  taskId: string;
}
