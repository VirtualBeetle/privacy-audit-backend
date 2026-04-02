import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { Tenant } from './tenant.entity';
import { User, UserRole } from '../users/user.entity';
import { RegisterTenantDto } from './dto/register-tenant.dto';

export { RegisterTenantDto };

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

    const tenant = new Tenant();
    tenant.name = dto.name;
    tenant.email = dto.email;
    tenant.apiKey = `pak_${randomUUID().replace(/-/g, '')}`;
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
        apiKey: savedTenant.apiKey,
        retentionDays: savedTenant.retentionDays,
        createdAt: savedTenant.createdAt,
      },
      message: 'Tenant registered successfully. Save your API key — it will not be shown again.',
    };
  }

  async findById(id: string) {
    return this.tenantsRepository.findOne({ where: { id } });
  }
}
