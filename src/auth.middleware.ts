import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import * as jwksRsa from 'jwks-rsa';

@Injectable()
export class AuthMiddleware implements NestMiddleware {
    private jwksClient: jwksRsa.JwksClient | null = null;
    private asgardeoJwksUri = process.env.ASGARDEO_JWKS_URI;

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

            req.headers['x-user-id'] = userId;
            req.headers['x-user-roles'] = Array.isArray(roles) ? roles.join(',') : String(roles);

            delete req.headers.authorization;

            next();
        } catch (error) {
            res.status(401).json({ statusCode: 401, message: 'Invalid or expired token' });
            return;
        }
    }
}
