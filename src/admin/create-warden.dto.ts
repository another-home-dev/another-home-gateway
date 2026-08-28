import { IsString, IsNotEmpty, IsEmail } from 'class-validator';

export class CreateWardenDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsEmail()
    email: string;

    @IsString()
    @IsNotEmpty()
    contact: string;
}
