import { Injectable, Logger } from '@nestjs/common';
import Consul from 'consul';

export interface ServiceInstance {
    address: string;
    port: number;
}

/**
 * Resolves healthy service instances from Consul instead of hardcoded host:port pairs.
 * Falls back to an empty result (never throws) so callers can fall back to a static
 * address if the registry is unreachable or has nothing registered yet.
 */
@Injectable()
export class DiscoveryService {
    private readonly logger = new Logger(DiscoveryService.name);
    private readonly consul: Consul | null;
    private readonly cache = new Map<string, { instances: ServiceInstance[]; expiresAt: number }>();
    private readonly roundRobinIndex = new Map<string, number>();
    private readonly cacheTtlMs = 5000;

    constructor() {
        const host = process.env.CONSUL_HOST;
        this.consul = host ? new Consul({ host, port: Number(process.env.CONSUL_PORT ?? 8500) }) : null;
        if (!this.consul) {
            this.logger.warn('CONSUL_HOST not set — dynamic service discovery is disabled, routes will use their static fallback URLs.');
        }
    }

    /** Returns one healthy instance of `serviceName`, round-robining across instances when there are several. */
    async resolve(serviceName: string): Promise<ServiceInstance | null> {
        const instances = await this.getInstances(serviceName);
        if (instances.length === 0) return null;

        const index = this.roundRobinIndex.get(serviceName) ?? 0;
        const instance = instances[index % instances.length];
        this.roundRobinIndex.set(serviceName, index + 1);
        return instance;
    }

    private async getInstances(serviceName: string): Promise<ServiceInstance[]> {
        if (!this.consul) return [];

        const cached = this.cache.get(serviceName);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.instances;
        }

        try {
            const results = await this.consul.health.service({ service: serviceName, passing: true });
            const instances: ServiceInstance[] = results.map((entry: any) => ({
                address: entry.Service.Address || entry.Node.Address,
                port: entry.Service.Port,
            }));
            this.cache.set(serviceName, { instances, expiresAt: Date.now() + this.cacheTtlMs });
            return instances;
        } catch (err) {
            this.logger.error(`Consul lookup failed for "${serviceName}": ${err instanceof Error ? err.message : err}`);
            // Serve the last known-good list rather than nothing, if we have one.
            return cached?.instances ?? [];
        }
    }
}
