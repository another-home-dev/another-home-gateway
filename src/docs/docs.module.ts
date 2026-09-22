import { Module } from '@nestjs/common';
import { DocsAggregatorService } from './docs-aggregator.service';
import { DiscoveryModule } from '../discovery/discovery.module';

@Module({
    imports: [DiscoveryModule],
    providers: [DocsAggregatorService],
    exports: [DocsAggregatorService],
})
export class DocsModule {}
