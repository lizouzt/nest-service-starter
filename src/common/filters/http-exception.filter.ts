import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    let msg = 'Unknown error';
    if (typeof message === 'string') {
      msg = message;
    } else if (typeof message === 'object' && (message as any).message) {
      msg = Array.isArray((message as any).message)
        ? (message as any).message.join(', ')
        : (message as any).message;
    } else if (exception instanceof Error) {
        msg = exception.message;
    }

    const responseBody = {
      code: status,
      msg: msg,
      data: {},
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    response
      .status(status)
      .json(responseBody);
  }
}
