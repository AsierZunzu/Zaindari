import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import { existsSync } from 'fs';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  );

  app.enableCors();

  // Serve uploaded images
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  // Serve the Vue SPA in production
  const staticDir = join(process.cwd(), 'static');
  if (existsSync(staticDir)) {
    app.useStaticAssets(staticDir);

    // SPA fallback: serve index.html for non-API routes
    const express = app.getHttpAdapter().getInstance();
    const indexPath = join(staticDir, 'index.html');
    express.get(/^\/(?!api\/)(?!uploads\/).*/, (_req: unknown, res: { sendFile: (path: string) => void }) => {
      res.sendFile(indexPath);
    });
  }

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') ?? 3000;

  await app.listen(port);
  console.log(`Zaindari server running on port ${port}`);
}

bootstrap();
