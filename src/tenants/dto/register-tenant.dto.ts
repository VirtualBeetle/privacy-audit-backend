import { IsString, IsEmail, MinLength } from 'class-validator';

export class RegisterTenantDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}
