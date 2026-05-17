import { IsNotEmpty, IsString } from 'class-validator';

export class SharePlantDto {
  @IsString()
  @IsNotEmpty()
  userId: string;
}
