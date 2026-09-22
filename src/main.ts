import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as swaggerUi from 'swagger-ui-express';
import { AppModule } from './app.module';
import { DocsAggregatorService } from './docs/docs-aggregator.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));
  app.enableCors({
    origin: [
      'http://localhost:5173',
      /^http:\/\/localhost:\d+$/,
      /^http:\/\/10\.0\.2\.2:\d+$/,
    ],
    credentials: true,
  });

  // Unified developer portal: served directly (not through AuthMiddleware/ProxyMiddleware,
  // which only apply to 'api/v1/*') and rebuilt from the live downstream docs on every request.
  const docsAggregator = app.get(DocsAggregatorService);
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.get('/api/docs-json', async (_req: Request, res: Response) => {
    res.json(await docsAggregator.getAggregatedDocument());
  });
  expressApp.use('/api/docs', swaggerUi.serve, async (req: Request, res: Response, next: NextFunction) => {
    const document = await docsAggregator.getAggregatedDocument();
    swaggerUi.setup(document)(req, res, next);
  });

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
  await app.listen(port);
}
bootstrap();

