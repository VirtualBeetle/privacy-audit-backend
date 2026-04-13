import { IsString, MinLength } from 'class-validator';

export class CreateDashboardTokenDto {
  /**
   * The tenant's own identifier for this user.
   * This is whatever ID the tenant app uses internally — it could be a UUID,
   * an email address, or any unique string. The privacy audit service never
   * validates it beyond ensuring it is a non-empty string.
   */
  @IsString()
  @MinLength(1)
  tenantUserId: string;
}
