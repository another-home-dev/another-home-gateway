import { Injectable, CanActivate, ExecutionContext, ForbiddenException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const Roles = (...roles: string[]) => SetMetadata('roles', roles);

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        const requiredRoles = this.reflector.get<string[]>('roles', context.getHandler());
        if (!requiredRoles) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const userRolesHeader = request.headers['x-user-roles'];

        if (!userRolesHeader) {
            throw new ForbiddenException('Access denied: No roles provided');
        }

        const userRoles = String(userRolesHeader).split(',').map((role) => role.trim().toLowerCase());

        const hasRole = requiredRoles.some((role) => userRoles.includes(role.toLowerCase()));
        if (!hasRole) {
            throw new ForbiddenException('Access denied: Insufficient permissions');
        }

        return true;
    }
}
