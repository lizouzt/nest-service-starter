import { join } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { CacheModule } from '@nestjs/cache-manager';
import { ServeStaticModule } from '@nestjs/serve-static';
import { LoggerModule } from 'nestjs-pino';
import * as redisStore from 'cache-manager-redis-store';
import configuration from './config/configuration';
import { AuthModule } from './modules/auth/auth.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { FileCenterModule } from './modules/file-center/file-center.module';
import { CommonModelModule } from './modules/common-model/common-model.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    // 配置模块
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
    }),
    
    // 速率限制: 每10分钟(600秒)100次请求
    ThrottlerModule.forRoot([{
      ttl: 600,
      limit: 100,
    }]),

    // 鉴权模块
    AuthModule,

    // 业务模块
    FileCenterModule,
    CommonModelModule,
    
    // 日志模块
    LoggerModule.forRoot({
      pinoHttp: {
        transport: process.env.NODE_ENV !== 'production' ? {
          target: 'pino-pretty',
          options: {
            singleLine: true,
          },
        } : undefined,
      },
    }),

    // MongoDB数据库
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const mongoConfig = configService.get('mongoDB');
        // 构建URI: mongodb://user:pass@host:port/db
        if (!mongoConfig) {
            // 如果没有配置则回退或跳过 (例如: 初始开发环境)
            return { uri: 'mongodb://localhost:27017/test' };
        }
        const uri = `mongodb://${mongoConfig.user}:${encodeURIComponent(mongoConfig.password)}@${mongoConfig.host}:${mongoConfig.port}/${mongoConfig.db}`;
        return {
          uri,
        };
      },
      inject: [ConfigService],
    }),

    // 缓存 (Redis)
    CacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const redisConfig = configService.get('redis');
        if (!redisConfig) {
             return { store: 'memory' } as any;
        }
        return {
          store: redisStore,
          host: redisConfig.host,
          port: redisConfig.port,
          password: redisConfig.password,
          ttl: configService.get('maxAge') || 3600,
        } as any;
      },
      inject: [ConfigService],
      isGlobal: true,
    }),

    // 静态文件服务
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      serveRoot: '/public',
      serveStaticOptions: {
        cacheControl: true,
        maxAge: 3600,
        fallthrough: true,
      },
    }),
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
  ],
})
export class AppModule {}
