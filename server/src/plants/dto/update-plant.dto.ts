import { IsOptional, IsString } from 'class-validator';

export class UpdatePlantDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  instructions?: string;
}
