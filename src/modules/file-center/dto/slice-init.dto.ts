import { IsString } from 'class-validator';

export class SliceInitDto {
  @IsString()
  taskId: string;
}
