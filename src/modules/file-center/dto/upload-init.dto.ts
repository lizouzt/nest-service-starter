import { IsString, IsNumber } from 'class-validator';

export class UploadInitDto {
  @IsString()
  fileName: string;

  @IsString()
  fileSignature: string;

  @IsNumber()
  fileSize: number;

  @IsNumber()
  trunkSize: number;

  @IsNumber()
  lastModified: number;
}
