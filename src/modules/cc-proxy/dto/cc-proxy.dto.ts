import { IsString, IsOptional, IsEnum, IsArray, ValidateNested, IsObject, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
  PATCH = 'PATCH',
}

export class ProjectionDto {
  // 模式：只留这些字段(include) 还是 排除这些字段(exclude)
  @IsEnum(['include', 'exclude'])
  mode: 'include' | 'exclude';

  // 字段列表
  @IsArray()
  @IsString({ each: true })
  fields: string[];
}

export class ProxyRequestItemDto {
  @IsString()
  id: string; // 任务的唯一标识，比如 "userInfo"

  @IsString()
  url: string; // 目标接口地址

  @IsEnum(HttpMethod)
  method: HttpMethod;

  @IsOptional()
  @IsObject()
  headers?: Record<string, string>; // 特定的 Header

  @IsOptional()
  @IsObject()
  params?: Record<string, any>; // URL 查询参数 (Query Params)

  @IsOptional()
  data?: any; // 请求体 (Body)

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dependsOn?: string[]; // 依赖的任务ID列表，比如 ["userInfo"]

  @IsOptional()
  @ValidateNested()
  @Type(() => ProjectionDto)
  projection?: ProjectionDto; // 字段过滤配置
}

export class AggregateRequestDto {
  @IsOptional()
  @IsObject()
  commonHeaders?: Record<string, string>; // 所有请求公用的 Header

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProxyRequestItemDto)
  items: ProxyRequestItemDto[]; // 请求任务列表
  
  @IsOptional()
  @IsBoolean()
  allowPartial?: boolean; // 是否允许部分成功（默认只要有一个失败就整体报错）
}