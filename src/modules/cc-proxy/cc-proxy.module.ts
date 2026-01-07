import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CcProxyController } from './cc-proxy.controller';
import { CcProxyService } from './cc-proxy.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 5,
    }),
  ],
  controllers: [CcProxyController],
  providers: [CcProxyService],
})
export class CcProxyModule {}
