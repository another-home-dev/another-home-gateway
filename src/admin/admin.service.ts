import { Injectable, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';
import { CreateWardenDto } from './create-warden.dto';

@Injectable()
export class AdminService {
    private readonly tenant = process.env.ASGARDEO_TENANT ?? 'hiru616';
    private readonly baseUrl = `https://api.asgardeo.io/t/${this.tenant}`;
    private readonly adminClientId = process.env.ASGARDEO_ADMIN_CLIENT_ID;
    private readonly adminClientSecret = process.env.ASGARDEO_ADMIN_CLIENT_SECRET;
    // Fill this in with the 'warden' role's ID from the Asgardeo console (Roles page) once created.
    private readonly wardenRoleId = process.env.ASGARDEO_WARDEN_ROLE_ID;

    private async getManagementToken(): Promise<string> {
        if (!this.adminClientId || !this.adminClientSecret) {
            throw new InternalServerErrorException(
                'Asgardeo admin client credentials are not configured (ASGARDEO_ADMIN_CLIENT_ID / ASGARDEO_ADMIN_CLIENT_SECRET).',
            );
        }

        const basicAuth = Buffer.from(`${this.adminClientId}:${this.adminClientSecret}`).toString('base64');

        const response = await axios.post(
            `${this.baseUrl}/oauth2/token`,
            new URLSearchParams({
                grant_type: 'client_credentials',
                scope: 'internal_user_mgt_create internal_user_mgt_view internal_org_role_mgt_update internal_org_role_mgt_view',
            }),
            {
                headers: {
                    Authorization: `Basic ${basicAuth}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            },
        );

        return response.data.access_token;
    }

    async createWarden(dto: CreateWardenDto) {
        const managementToken = await this.getManagementToken();
        const tempPassword = this.generateTempPassword();
        const [givenName, ...rest] = dto.name.trim().split(' ');
        const familyName = rest.join(' ') || givenName;

        // 1. Create the user via SCIM2.
        const createResponse = await axios.post(
            `${this.baseUrl}/scim2/Users`,
            {
                schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
                // Asgardeo resolves an unprefixed userName to an ambiguous store that
                // rejects writes ("User store is read only"); the DEFAULT/ prefix targets
                // the actual local user store explicitly.
                userName: `DEFAULT/${dto.email}`,
                password: tempPassword,
                name: { givenName, familyName },
                emails: [{ primary: true, value: dto.email }],
                phoneNumbers: [{ value: dto.contact, type: 'mobile' }],
            },
            {
                headers: {
                    Authorization: `Bearer ${managementToken}`,
                    'Content-Type': 'application/scim+json',
                },
            },
        );

        const userId = createResponse.data.id;

        // 2. Assign the 'warden' role. Requires ASGARDEO_WARDEN_ROLE_ID to be set — the
        // exact PATCH shape here should be double-checked against the live tenant's
        // Roles API once real credentials are available.
        if (this.wardenRoleId) {
            await axios.patch(
                `${this.baseUrl}/scim2/v2/Roles/${this.wardenRoleId}`,
                {
                    schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
                    Operations: [{ op: 'add', path: 'users', value: [{ value: userId }] }],
                },
                {
                    headers: {
                        Authorization: `Bearer ${managementToken}`,
                        'Content-Type': 'application/scim+json',
                    },
                },
            );
        }

        return {
            id: userId,
            name: dto.name,
            email: dto.email,
            contact: dto.contact,
            temporaryPassword: tempPassword,
        };
    }

    // Response shape (a `users` array of {value, display}) follows the standard SCIM2
    // Role resource convention — worth a quick sanity check against the real tenant.
    async listWardens() {
        const managementToken = await this.getManagementToken();

        if (!this.wardenRoleId) {
            return [];
        }

        const response = await axios.get(`${this.baseUrl}/scim2/v2/Roles/${this.wardenRoleId}`, {
            headers: { Authorization: `Bearer ${managementToken}` },
        });

        const users = response.data.users ?? [];
        return users.map((user: { value: string; display?: string }) => ({
            id: user.value,
            name: user.display ?? user.value,
        }));
    }

    private generateTempPassword(): string {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
        let password = '';
        for (let i = 0; i < 14; i += 1) {
            password += chars[Math.floor(Math.random() * chars.length)];
        }
        return password;
    }
}
