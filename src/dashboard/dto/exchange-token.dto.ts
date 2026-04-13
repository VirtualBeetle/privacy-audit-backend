import { IsString, MinLength } from 'class-validator';

export class ExchangeTokenDto {
  /**
   * The short-lived dashboard token issued by POST /api/dashboard/token.
   * The frontend receives this in the redirect URL from the tenant app and
   * exchanges it here for a longer-lived session JWT.
   */
  @IsString()
  @MinLength(1)
  token: string;
}
