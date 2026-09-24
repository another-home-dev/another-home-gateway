import { Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { RolesGuard } from './roles.guard';

@Module({
    controllers: [AdminController],
    // RolesGuard isn't referenced anywhere else in this module, only via
    // @UseGuards(RolesGuard) on the controller, which is enough for Nest to
    // instantiate it when the whole app boots through NestFactory.create() —
    // Reflector comes for free there. But building GatewayModule on its own
    // via Test.createTestingModule() (see gateway.e2e-spec.ts) doesn't get
    // that free global Reflector, and fails with "Nest can't resolve
    // dependencies of the RolesGuard" — so both need to be explicit here.
    providers: [AdminService, RolesGuard, Reflector],
})
export class AdminModule {}
