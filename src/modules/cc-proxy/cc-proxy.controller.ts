import { Controller, Post, Body, Headers } from '@nestjs/common';
import { CcProxyService } from './cc-proxy.service';
import { AggregateRequestDto, ProxyRequestItemDto } from './dto/cc-proxy.dto';

@Controller('cc')
export class CcProxyController {
  constructor(private readonly ccProxyService: CcProxyService) {}

  @Post('aggregate')
  async aggregate(
    @Body() dto: AggregateRequestDto,
    @Headers() headers: Record<string, string>,
  ) {
    // 调用 Service 处理聚合逻辑，透传客户端的所有 Header（Service 层会做白名单过滤）
    return this.ccProxyService.aggregate(dto, headers);
  }

  @Post('proxy')
  async proxy(
    @Body() dto: ProxyRequestItemDto,
    @Headers() headers: Record<string, string>,
  ) {
    // 把单个代理请求当成只包含一个任务的聚合请求来处理
    // 这样逻辑就复用了，不用写两遍
    const aggregateDto: AggregateRequestDto = {
      items: [dto],
      commonHeaders: {}, // Headers 直接通过 request headers 传就行
    };
    
    const result = await this.ccProxyService.aggregate(aggregateDto, headers);
    
    // 因为这里是单接口代理，如果结果里有错误，最好直接抛出去或者只返回那个结果
    // aggregate 返回的是 { success, data: { id: ... }, errors: ... }
    // 我们直接返回对应的 data 数据
    
    // 如果这个任务失败了，抛错或者返回错误信息
    if (!result.success && result.errors && result.errors[dto.id]) {
       // 这里其实已经在 Service 层处理过错误了（严格模式会抛异常）
       // 如果是部分成功模式（虽然单请求没啥意义），这里防御性返回一下
       return result.errors[dto.id];
    }
    
    return result.data[dto.id];
  }
}