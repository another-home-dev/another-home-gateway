import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { CreateWardenDto } from './create-warden.dto';
import { RolesGuard, Roles } from './roles.guard';

// Prefixed with api/v1 so this route falls under AuthMiddleware's forRoutes('api/v1/*')
// scope in app.module.ts and actually gets authenticated before reaching here.
@UseGuards(RolesGuard)
@Controller('api/v1/admin')
export class AdminController {
    constructor(private readonly adminService: AdminService) {}

    @Get('wardens')
    @Roles('super-admin')
    async getWardens() {
        const wardens = await this.adminService.listWardens();
        return {
            message: 'Wardens retrieved successfully.',
            data: wardens,
        };
    }

    @Post('wardens')
    @Roles('super-admin')
    async createWarden(@Body() dto: CreateWardenDto) {
        const warden = await this.adminService.createWarden(dto);
        return {
            message: 'Warden created successfully.',
            data: warden,
        };
    }
}
