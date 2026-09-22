import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthMiddleware } from './auth.middleware';
import { ProxyMiddleware } from './proxy.middleware';
import { AdminModule } from './admin/admin.module';
import { DiscoveryModule } from './discovery/discovery.module';
import { DocsModule } from './docs/docs.module';

@Module({
  imports: [AdminModule, DiscoveryModule, DocsModule],
  controllers: [AppController],
  providers: [AppService, AuthMiddleware, ProxyMiddleware],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AuthMiddleware, ProxyMiddleware)
      .forRoutes('api/v1/*');
  }
}

