import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isValidTimeZone } from './tasks/zoned-time.js';
import { join } from 'path';
import { existsSync } from 'fs';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // On SIGTERM (docker stop), close the HTTP server, stop the cron jobs and
  // disconnect Prisma through the modules' destroy hooks instead of dying
  // mid-request when the container is killed.
  app.enableShutdownHooks();

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  );

  // Required to read the httpOnly refresh cookie.
  app.use(cookieParser());

  // Trust the reverse proxy so req.protocol / x-forwarded-proto correctly
  // decides whether the refresh cookie is marked Secure.
  app.set('trust proxy', 1);

  app.enableCors({ credentials: true, origin: true });

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
    express.get(
      /^\/(?!api\/)(?!uploads\/).*/,
      (_req: unknown, res: { sendFile: (path: string) => void }) => {
        res.sendFile(indexPath);
      },
    );
  }

  const configService = app.get(ConfigService);

  // Every reminder hour in the app is read as a wall-clock time in this zone.
  // Refuse to start on a zone the runtime does not know rather than falling
  // back to UTC: a silent fallback is indistinguishable from a correct config
  // until someone notices their reminders arriving an offset late.
  const zone = configService.get<string>('timezone') ?? 'UTC';
  if (!isValidTimeZone(zone)) {
    throw new Error(
      `TZ is set to "${zone}", which is not a timezone this runtime recognises. ` +
        'Use an IANA name such as "Europe/Madrid", or "UTC".',
    );
  }

  const port = configService.get<number>('port') ?? 3000;

  await app.listen(port);
  console.log(
    `Zaindari server running on port ${port} (schedule timezone: ${zone})`,
  );
}

bootstrap().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
