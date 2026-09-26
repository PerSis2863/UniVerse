import { IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Length, Max, MaxLength, Min } from 'class-validator';

/** Student asks for a credential; an admin must verify it before it is signed. */
export class RequestCredentialDto {
  @IsString() @IsNotEmpty() @Length(3, 120)
  title: string;

  @IsString() @IsNotEmpty() @Length(2, 160)
  projectName: string;

  @IsString() @IsNotEmpty() @Length(2, 160)
  organization: string;

  @IsInt() @Min(0) @Max(10000)
  hoursCompleted: number;

  @IsInt() @Min(0) @Max(10000000)
  peopleImpacted: number;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @IsOptional() @IsUrl({ require_protocol: true }, { message: 'evidenceUrl must be a full URL (https://...)' }) @MaxLength(500)
  evidenceUrl?: string;
}

/** Admin issues a verified credential directly to a student. */
export class IssueCredentialDto extends RequestCredentialDto {
  @IsString() @IsNotEmpty()
  studentId: string;
}

export class CredentialDecisionDto {
  @IsOptional() @IsString() @MaxLength(500)
  reason?: string;
}
