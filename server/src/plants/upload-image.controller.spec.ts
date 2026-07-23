import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PlantsController } from './plants.controller.js';
import { PlantsService } from './plants.service.js';
import { ImagesService } from './images.service.js';
import { JwtAuthGuard } from '../common/guards/auth.guard.js';
import { PlantAccessGuard } from '../common/guards/plant-access.guard.js';
import { MAX_IMAGE_BYTES } from './image-upload.options.js';

/**
 * These run over real HTTP because the upload contract lives entirely inside
 * multer -- the field name, the size cap and the mimetype filter are all
 * invisible to the type system and to service-level unit tests.
 */
describe('POST /api/plants/:id/images', () => {
  let app: INestApplication;
  const imagesService = { upload: vi.fn() };

  const mockImage = {
    id: 'img-1',
    plantId: 'plant-1',
    filePath: 'uploads/plant-1/test-uuid.webp',
    isCurrent: true,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    imagesService.upload.mockResolvedValue(mockImage);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlantsController],
      providers: [
        { provide: PlantsService, useValue: { findById: vi.fn() } },
        { provide: ImagesService, useValue: imagesService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PlantAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('accepts an image on the "image" field', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/plants/plant-1/images')
      .attach('image', Buffer.from('fake-jpeg-bytes'), {
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 'img-1' });
    expect(imagesService.upload).toHaveBeenCalledTimes(1);
  });

  it('rejects the legacy "file" field name with 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/plants/plant-1/images')
      .attach('file', Buffer.from('fake-jpeg-bytes'), {
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
      });

    expect(res.status).toBe(400);
    expect(imagesService.upload).not.toHaveBeenCalled();
  });

  it('rejects a non-image mimetype with 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/plants/plant-1/images')
      .attach('image', Buffer.from('%PDF-1.4 not an image'), {
        filename: 'notes.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Only image files can be uploaded');
    expect(imagesService.upload).not.toHaveBeenCalled();
  });

  it('rejects a file over the 10 MB cap with 400, not 413', async () => {
    const oversized = Buffer.alloc(MAX_IMAGE_BYTES + 1024, 0x41);

    const res = await request(app.getHttpServer())
      .post('/api/plants/plant-1/images')
      .attach('image', oversized, {
        filename: 'huge.jpg',
        contentType: 'image/jpeg',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Image must be smaller than 10 MB');
    expect(imagesService.upload).not.toHaveBeenCalled();
  });

  it('rejects a request with no file attached', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/plants/plant-1/images')
      .field('unrelated', 'value');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('No image was uploaded');
    expect(imagesService.upload).not.toHaveBeenCalled();
  });
});
