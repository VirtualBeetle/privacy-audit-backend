import {
  IsString,
  IsArray,
  IsBoolean,
  IsOptional,
  IsDateString,
  IsObject,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ActionDto {
  @IsString()
  code: string;

  @IsString()
  label: string;
}

export class ReasonDto {
  @IsString()
  code: string;

  @IsString()
  label: string;
}

export class ActorDto {
  @IsString()
  type: string;

  @IsString()
  label: string;

  @IsOptional()
  @IsString()
  identifier?: string;
}

export class SensitivityDto {
  @IsString()
  code: string;
}

export class CreateEventDto {
  @IsString()
  tenantUserId: string;

  @IsUUID()
  eventId: string;

  @ValidateNested()
  @Type(() => ActionDto)
  action: ActionDto;

  @ValidateNested()
  @Type(() => ReasonDto)
  reason: ReasonDto;

  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @ValidateNested()
  @Type(() => SensitivityDto)
  sensitivity: SensitivityDto;

  @IsArray()
  @IsString({ each: true })
  dataFields: string[];

  @IsOptional()
  @IsBoolean()
  thirdPartyInvolved?: boolean;

  @IsOptional()
  @IsString()
  thirdPartyName?: string;

  @IsOptional()
  retentionDays?: number;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsBoolean()
  consentObtained?: boolean;

  @IsOptional()
  @IsBoolean()
  userOptedOut?: boolean;

  @IsOptional()
  @IsObject()
  meta?: Record<string, any>;

  @IsDateString()
  occurredAt: string;
}
