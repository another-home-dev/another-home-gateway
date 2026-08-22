import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: [
      'http://localhost:5173',
      /^http:\/\/localhost:\d+$/,
      /^http:\/\/10\.0\.2\.2:\d+$/,
    ],
    credentials: true,
  });
  await app.listen(3001);
}
bootstrap();

