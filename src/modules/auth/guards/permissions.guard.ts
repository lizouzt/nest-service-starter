import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../auth.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector, private authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler();
    const request = context.switchToHttp().getRequest();
    const { params, user } = request;

    let permission = this.reflector.get<string>('permission', handler);
    
    // Dynamic Logic for CommonModel: business_model[_action]
    if (params.business && params.model) {
        permission = `${params.business}_${params.model}${permission ? `_${permission}` : ''}`;
    }

    if (!permission) {
      return true;
    }

    if (!user || !user.userId) {
        return false;
    }

    const hasPermission = await this.authService.checkPermission(user.userId, permission);
    if (!hasPermission) {
        throw new ForbiddenException({
            code: 206,
            msg: '无操作权限',
            data: { authCode: permission }
        });
    }

    return true;
  }
}