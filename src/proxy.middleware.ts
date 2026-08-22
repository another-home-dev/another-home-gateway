import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import axios from 'axios';

@Injectable()
export class ProxyMiddleware implements NestMiddleware {
    private routes = [
        { prefix: '/api/v1/accommodation', target: 'http://localhost:4001' },
        { prefix: '/api/v1/operations', target: 'http://localhost:4002' },
        { prefix: '/api/v1/finance', target: 'http://localhost:4003' },
    ];

    async use(req: Request, res: Response, next: NextFunction) {
        const matchingRoute = this.routes.find((r) => req.originalUrl.startsWith(r.prefix));

        if (matchingRoute) {
            try {
                const rewrittenPath = req.originalUrl.replace('/api/v1', '');
                const targetUrl = `${matchingRoute.target}${rewrittenPath}`;

                const response = await axios({
                    method: req.method,
                    url: targetUrl,
                    data: req.body,
                    headers: {
                        ...req.headers,
                        host: new URL(matchingRoute.target).host,
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
                console.error('Proxy error:', error.message);
                res.status(502).json({ statusCode: 502, message: 'Bad Gateway' });
                return;
            }
        }

        next();
    }
}
