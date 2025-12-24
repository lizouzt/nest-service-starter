import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum FileStorageType {
  LOCAL = 0,
  OSS = 1,
  PRIVATE_CDN = 2,
}

@Schema({ timestamps: { createdAt: 'createTime', updatedAt: 'updateTime' } })
export class StaticFile extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  size: number;

  @Prop({ required: true })
  lastModified: Date;

  @Prop({ required: true, index: true })
  etag: string;

  @Prop({ 
    type: Number, 
    enum: FileStorageType, 
    default: FileStorageType.LOCAL,
    required: true 
  })
  storeType: number;

  @Prop({ required: true })
  url: string;

  @Prop()
  pcUrl?: string;

  @Prop()
  h5Url?: string;
}

export const StaticFileSchema = SchemaFactory.createForClass(StaticFile);
StaticFileSchema.index({ etag: 1 }, { unique: true });
