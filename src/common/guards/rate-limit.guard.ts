import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerOptions } from '@nestjs/throttler';

@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Replicate legacy identifier logic: userId || xip
    const userId = req.user?.userId;
    const xip = req.headers['x-forwarded-for'] || req.ip;
    
    return userId ? `user:${userId}` : `ip:${xip}`;
  }

  // Override to handle spider exclusion
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // Legacy: if (!ctx.ua.spiderBot)
    // We assume UA info is parsed by a global middleware or interceptor
    // For now, let's check a basic bot regex if ctx.ua is not yet fully migrated
    const userAgent = request.headers['user-agent'] || '';
    const isBot = /(Googlebot|Yahoo! Slurp|msnbot|YoudaoBot|spider)/i.test(userAgent);
    
    if (isBot) {
        return true;
    }

    return super.canActivate(context);
  }
}
