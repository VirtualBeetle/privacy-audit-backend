import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { TenantsService } from '../../tenants/tenants.service';

/**
 * ApiKeyGuard
 *
 * Validates requests from tenant applications (machine-to-machine auth).
 * The tenant must pass their API key in the x-api-key header.
 *
 * Flow:
 *   1. Extract the raw API key from x-api-key header.
 *   2. SHA-256 hash it and look up the tenant in one DB query.
 *   3. If found and active, attach a minimal user-shaped object to request.user
 *      so that downstream handlers and guards can read request.user.tenantId
 *      exactly as they do with JWT auth.
 *
 * Why SHA-256 and not bcrypt?
 *   API keys are 32 bytes of cryptographic randomness. An attacker who obtains
 *   the stored hash cannot reverse it — not because of bcrypt's intentional
 *   slowness, but because reversing 256 bits of entropy is computationally
 *   infeasible. SHA-256 keeps validation O(1) with a single indexed DB lookup.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly tenantsService: TenantsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const apiKey = request.headers['x-api-key'] as string | undefined;

    if (!apiKey) {
      throw new UnauthorizedException('Missing x-api-key header');
    }

    const tenant = await this.tenantsService.findByApiKeyHash(apiKey);

    if (!tenant) {
      throw new UnauthorizedException('Invalid or inactive API key');
    }

    // Attach tenant identity to request.user so @CurrentUser() and downstream
    // guards (e.g. TenantIsolationGuard) work without modification.
    request.user = {
      tenantId: tenant.id,
      tenantName: tenant.name,
      type: 'api_key',
    };

    return true;
  }
}
