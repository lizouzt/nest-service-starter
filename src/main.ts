import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';

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
  app.useLogger(app.get(Logger));
  
  // 注册全局管道、过滤器、拦截器
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));

  await app.listen(8002);
  const logger = app.get(Logger);
  logger.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
