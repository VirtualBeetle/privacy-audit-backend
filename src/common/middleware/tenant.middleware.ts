import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request & { user?: any }, res: Response, next: NextFunction) {
    const user = req.user;

    if (user && user.tenantId) {
      const requestedTenantId = req.params?.tenantId || req.body?.tenantId;

      if (requestedTenantId && requestedTenantId !== user.tenantId) {
        throw new ForbiddenException(
          'Access denied — cross-tenant access is not allowed',
        );
      }
    }

    next();
  }
}
