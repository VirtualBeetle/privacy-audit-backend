import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID, createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { Tenant } from './tenant.entity';
import { User, UserRole } from '../users/user.entity';
import { RegisterTenantDto } from './dto/register-tenant.dto';

export { RegisterTenantDto };

// API keys are high-entropy random strings (256 bits). SHA-256 is appropriate
// here — unlike passwords, API keys do not benefit from bcrypt's intentional
// slowness because an attacker who obtains the hash still cannot reverse a
// 32-byte random key in feasible time.
export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private tenantsRepository: Repository<Tenant>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async register(dto: RegisterTenantDto) {
    const existing = await this.tenantsRepository.findOne({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Tenant with this email already exists');
    }

    // Generate a plaintext API key — shown to the tenant once, never stored.
    const plaintextApiKey = `pak_${randomUUID().replace(/-/g, '')}`;

    const tenant = new Tenant();
    tenant.name = dto.name;
    tenant.email = dto.email;
    tenant.apiKeyHash = hashApiKey(plaintextApiKey);
    tenant.retentionDays = 90;
    tenant.isActive = true;

    const savedTenant = await this.tenantsRepository.save(tenant);

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const adminUser = new User();
    adminUser.email = dto.email;
    adminUser.passwordHash = passwordHash;
    adminUser.tenantId = savedTenant.id;
    adminUser.role = UserRole.TENANT_ADMIN;
    adminUser.isActive = true;

    await this.usersRepository.save(adminUser);

    return {
      tenant: {
        id: savedTenant.id,
        name: savedTenant.name,
        email: savedTenant.email,
        // Plaintext key returned once. After this point only the hash is stored.
        apiKey: plaintextApiKey,
        retentionDays: savedTenant.retentionDays,
        createdAt: savedTenant.createdAt,
      },
      message:
        'Tenant registered successfully. Save your API key — it will not be shown again.',
    };
  }

  async findById(id: string): Promise<Tenant | null> {
    return this.tenantsRepository.findOne({ where: { id } });
  }

  // Used by ApiKeyGuard: hash the incoming key and look up in one DB query.
  async findByApiKeyHash(apiKey: string): Promise<Tenant | null> {
    const hash = hashApiKey(apiKey);
    return this.tenantsRepository.findOne({
      where: { apiKeyHash: hash, isActive: true },
    });
  }
}
