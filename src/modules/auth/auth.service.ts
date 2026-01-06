import { Injectable, Inject, Logger, UnauthorizedException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { JwtService } from '@nestjs/jwt';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import * as crypto from 'crypto';
import { UserStatus, AUTH_CACHE_SEC } from './auth.constants';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private jwtService: JwtService,
    @InjectConnection() private connection: Connection,
  ) {}

  async validateUser(username: string, pass: string): Promise<any> {
    const user = await this.connection.collection('sys_users').findOne({ username });
    if (!user) {
        throw new UnauthorizedException('User not found');
    }
    
    // Simple MD5 check. In production, use bcrypt/argon2.
    const hashedPassword = crypto.createHash('md5').update(pass).digest('hex');
    
    // Support both plain text (for dev/init) and hashed password
    if (user.password !== pass && user.password !== hashedPassword) {
        throw new UnauthorizedException('Invalid password');
    }
    
    const { password, ...result } = user;
    return result;
  }

  async login(user: any) {
    const payload = { userId: user._id.toString(), userName: user.username };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }

  async checkUserStatus(userId: string): Promise<boolean> {
    const userStatusCacheKey = `user_status_${userId}`;
    let userStatus = await this.cacheManager.get<string>(userStatusCacheKey);

    if (!userStatus) {
      // If not in cache, try to fetch from DB (Stub implementation replaced with DB check)
      const user = await this.connection.collection('sys_users').findOne({ _id: new Types.ObjectId(userId) });
      if (user && user.status) {
          userStatus = user.status;
          await this.cacheManager.set(userStatusCacheKey, userStatus, AUTH_CACHE_SEC);
      } else {
          return false;
      }
    }

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

  // 外部服务调用的存根 (Stub) - can be improved later
  private async fetchUserStatus(userId: string): Promise<string | null> {
    // Already handled in checkUserStatus
    return null; 
  }

  // 外部服务调用的存根 (Stub)
  private async fetchAuthCodes(userId: string): Promise<string[]> {
    // TODO: Implement fetching permissions from DB
    return [];
  }
}
