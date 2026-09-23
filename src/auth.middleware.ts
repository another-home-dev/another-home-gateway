import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';
import axios from 'axios';

interface UserInfo {
    email?: string;
    name?: string;
}

// How long an Asgardeo userinfo lookup is reused for the same user.
const USERINFO_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class AuthMiddleware implements NestMiddleware {
    private jwksClient: jwksRsa.JwksClient | null = null;
    private asgardeoJwksUri = process.env.ASGARDEO_JWKS_URI;
    private userInfoUrl = `https://api.asgardeo.io/t/${process.env.ASGARDEO_TENANT ?? 'hiru616'}/oauth2/userinfo`;
    private userInfoCache = new Map<string, { info: UserInfo; expiresAt: number }>();

    constructor() {
        if (this.asgardeoJwksUri) {
            this.jwksClient = jwksRsa({
                jwksUri: this.asgardeoJwksUri,
                cache: true,
                rateLimit: true,
                jwksRequestsPerMinute: 10,
            });
        }
    }

    async use(req: Request, res: Response, next: NextFunction) {
        // Downstream services trust these headers as the caller's identity, so anything
        // the client sent under these names must go before we set them from the token.
        // Otherwise a token without an email claim would let a caller supply their own
        // x-user-email and be linked to another student's record.
        for (const header of ['x-user-id', 'x-user-roles', 'x-user-email', 'x-user-name']) {
            delete req.headers[header];
        }

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ statusCode: 401, message: 'Authorization header is missing or invalid' });
            return;
        }

        const token = authHeader.split(' ')[1];

        try {
            const decodedToken = jwt.decode(token, { complete: true }) as any;
            if (!decodedToken || !decodedToken.header) {
                res.status(401).json({ statusCode: 401, message: 'Invalid token format' });
                return;
            }

            let verifiedPayload: any;

            if (this.jwksClient && decodedToken.header.kid) {
                const key = await this.jwksClient.getSigningKey(decodedToken.header.kid);
                const publicKey = key.getPublicKey();
                verifiedPayload = jwt.verify(token, publicKey, {
                    algorithms: ['RS256'],
                });
            } else {
                verifiedPayload = decodedToken.payload;
                const now = Math.floor(Date.now() / 1000);
                if (verifiedPayload.exp && verifiedPayload.exp < now) {
                    res.status(401).json({ statusCode: 401, message: 'Token has expired' });
                    return;
                }
            }

            const userId = verifiedPayload.sub;
            const roles = verifiedPayload.roles || verifiedPayload['http://wso2.org/claims/role'] || [];
            let email = verifiedPayload.email;
            let name =
                verifiedPayload.name ||
                [verifiedPayload.given_name, verifiedPayload.family_name].filter(Boolean).join(' ');

            // An Asgardeo app only puts email/name in its access token when they are listed
            // as access token attributes in the console, and new apps don't list them. The
            // services need the email to link a student's first login to their record, so
            // fall back to asking Asgardeo with the caller's own token.
            if (!email && userId) {
                const info = await this.fetchUserInfo(userId, token);
                email = info.email;
                name = name || info.name;
            }

            req.headers['x-user-id'] = userId;
            req.headers['x-user-roles'] = Array.isArray(roles) ? roles.join(',') : String(roles);
            if (email) {
                req.headers['x-user-email'] = email;
            }

            // Used to create a student's record on their first login. URI-encoded because
            // header values must be ASCII and names may not be.
            if (name) {
                req.headers['x-user-name'] = encodeURIComponent(name);
            }

            delete req.headers.authorization;

            next();
        } catch (error) {
            res.status(401).json({ statusCode: 401, message: 'Invalid or expired token' });
            return;
        }
    }

    private async fetchUserInfo(userId: string, token: string): Promise<UserInfo> {
        const cached = this.userInfoCache.get(userId);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.info;
        }

        let info: UserInfo = {};
        try {
            const { data } = await axios.get(this.userInfoUrl, {
                headers: { Authorization: `Bearer ${token}` },
                timeout: 5000,
            });
            // Only trust the answer if Asgardeo says it's about the same user as the token.
            if (data?.sub === userId) {
                const fullName = [data.given_name, data.family_name].filter(Boolean).join(' ');
                info = { email: data.email, name: data.name || fullName || undefined };
            }
        } catch (error) {
            console.warn(`Asgardeo userinfo lookup failed for ${userId}: ${(error as Error).message}`);
            return info;
        }

        this.userInfoCache.set(userId, { info, expiresAt: Date.now() + USERINFO_TTL_MS });
        return info;
    }
}
