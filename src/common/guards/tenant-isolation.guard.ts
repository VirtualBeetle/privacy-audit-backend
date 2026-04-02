import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class TenantIsolationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) return true;

    const bodyTenantId = request.body?.tenantId;
    const paramTenantId = request.params?.tenantId;
    const requestedTenantId = paramTenantId || bodyTenantId;

    if (requestedTenantId && requestedTenantId !== user.tenantId) {
      throw new ForbiddenException(
        'Access denied — cross-tenant access is not allowed',
      );
    }

    return true;
  }
}
