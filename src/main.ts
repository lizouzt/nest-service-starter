import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { 
    bufferLogs: true, 
    cors: {
      origin: '*',
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      allowedHeaders: 'Content-Type, Authorization',
      preflightContinue: false,
      optionsSuccessStatus: 204,
      credentials: true,
    }
  });
  
  const configService = app.get(ConfigService);
  const logger = app.get(Logger);
  
  app.useLogger(logger);
  app.use(helmet());
  
  // 注册全局管道、过滤器、拦截器
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));

  const port = configService.get('port') || 8001;
  await app.listen(port);
  logger.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
