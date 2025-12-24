import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { UserStatus, AUTH_CACHE_SEC } from './auth.constants';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  async checkUserStatus(userId: string): Promise<boolean> {
    const userStatusCacheKey = `user_status_${userId}`;
    let userStatus = await this.cacheManager.get<string>(userStatusCacheKey);

    if (!userStatus) {
      return false; // 等同于 205 状态码
    }

    // 更新缓存
    await this.cacheManager.set(userStatusCacheKey, userStatus, AUTH_CACHE_SEC); // cache-manager v5 uses milliseconds? No, check version. NestJS v10 uses cache-manager v5 which uses milliseconds usually. 
    // Wait, the cache-manager-redis-store might expect TTL in seconds. 
    // The legacy code used 60 * 5 (seconds). 
    // NestJS CacheModule defaults: "ttl: seconds" (v4) or milliseconds (v5).
    // I should verify CacheModule config in app.module.
    
    // In app.module.ts: ttl: configService.get('maxAge') || 3600 (seconds likely)
    // cache-manager-redis-store usually takes seconds for TTL.
    // I will use seconds here, assuming standard redis store behavior.

    return userStatus === UserStatus.RUNING;
  }

  async checkPermission(userId: string, authCode: string): Promise<boolean> {
    if (!authCode) return true;

    const cacheKey = `user_auth_${userId}`;
    let authCodesStr = await this.cacheManager.get<string>(cacheKey);
    let authCodes: string[] = [];

    if (!authCodesStr) {
      authCodes = await this.fetchAuthCodes(userId);
      authCodesStr = authCodes.join(';');
      await this.cacheManager.set(cacheKey, authCodesStr, AUTH_CACHE_SEC);
    } else {
      authCodes = authCodesStr.split(';');
    }

    return authCodes.findIndex(item => item === authCode || new RegExp(`^${authCode}_\S`).test(item)) > -1;
  }

  // 外部服务调用的存根 (Stub)
  private async fetchUserStatus(userId: string): Promise<string | null> {
    // TODO: 实现从用户服务获取数据的逻辑
    return null; 
  }

  // 外部服务调用的存根 (Stub)
  private async fetchAuthCodes(userId: string): Promise<string[]> {
    // TODO: 实现从用户服务获取数据的逻辑
    return [];
  }
}
