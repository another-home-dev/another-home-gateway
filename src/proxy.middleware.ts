import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { DiscoveryService } from './discovery/discovery.service';

interface RouteConfig {
    prefix: string;
    serviceName: string;
    /** Used only when Consul has no healthy instance registered (registry down, or nothing deployed yet). */
    fallback: string;
}

@Injectable()
export class ProxyMiddleware implements NestMiddleware {
    private readonly logger = new Logger(ProxyMiddleware.name);

    private readonly routes: RouteConfig[] = [
        { prefix: '/api/v1/accommodation', serviceName: 'accommodation', fallback: process.env.ACCOMMODATION_SERVICE_URL ?? 'http://accommodation:4001' },
        { prefix: '/api/v1/operations', serviceName: 'operations', fallback: process.env.OPERATIONS_SERVICE_URL ?? 'http://operations:4002' },
        { prefix: '/api/v1/finance', serviceName: 'finance', fallback: process.env.FINANCE_SERVICE_URL ?? 'http://finance:4003' },
        { prefix: '/api/v1/notifications', serviceName: 'notification', fallback: process.env.NOTIFICATION_SERVICE_URL ?? 'http://notification:4004' },
    ];

    constructor(private readonly discovery: DiscoveryService) {}

    async use(req: Request, res: Response, next: NextFunction) {
        const matchingRoute = this.routes.find((r) => req.originalUrl.startsWith(r.prefix));
        if (!matchingRoute) {
            next();
            return;
        }

        const target = await this.resolveTarget(matchingRoute);

        try {
            const rewrittenPath = req.originalUrl.replace('/api/v1', '');
            const targetUrl = `${target}${rewrittenPath}`;

            const response = await axios({
                method: req.method,
                url: targetUrl,
                data: req.body,
                headers: {
                    ...req.headers,
                    host: new URL(target).host,
                },
                validateStatus: () => true,
            });

            res.status(response.status);
            Object.entries(response.headers).forEach(([key, val]) => {
                res.setHeader(key, val as string);
            });
            res.send(response.data);
            return;
        } catch (error) {
            this.logger.error(`Proxy error for "${matchingRoute.serviceName}" via ${target}: ${error.message}`);
            res.status(502).json({ statusCode: 502, message: 'Bad Gateway' });
            return;
        }
    }

    /** Resolves an instance dynamically from Consul, falling back to the static docker-compose hostname if the registry has nothing healthy. */
    private async resolveTarget(route: RouteConfig): Promise<string> {
        const instance = await this.discovery.resolve(route.serviceName);
        if (instance) {
            return `http://${instance.address}:${instance.port}`;
        }
        return route.fallback;
    }
}
