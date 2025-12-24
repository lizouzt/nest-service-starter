import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('secret') || 'defaultSecret',
    });
  }

  async validate(payload: any) {
    // payload matches the JWT content: { userId: '...', userName: '...' }
    const { userId, userName } = payload;
    
    if (!userId) {
        throw new UnauthorizedException('Invalid Token: Missing userId');
    }

    // Check User Status (Legacy check)
    const isValid = await this.authService.checkUserStatus(userId);
    if (!isValid) {
         // Legacy returns 205 (Token invalid) or 207 (Account stopped)
         // Here we throw Unauthorized, simpler.
         throw new UnauthorizedException('User status is invalid or account stopped');
    }

    return { userId, userName };
  }
}
