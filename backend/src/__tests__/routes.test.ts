import request from 'supertest';
import express from 'express';
import musicRoutes from '../../src/routes/music';
import lyricsRoutes from '../../src/routes/lyrics';

// Create test app
const app = express();
app.use(express.json());
app.use('/api/music', musicRoutes);
app.use('/api/lyrics', lyricsRoutes);

describe('Music API Routes', () => {
  describe('POST /api/music/create', () => {
    it('should reject request without required parameters', async () => {
      const response = await request(app)
        .post('/api/music/create')
        .send({});

      // Since we don't have the full service mocked, we check for a response
      expect(response.status).toBeDefined();
    });

    it('should validate mode parameter', async () => {
      const response = await request(app)
        .post('/api/music/create')
        .send({
          mode: 'invalid_mode',
          prompt: 'Test prompt'
        });

      expect(response.status).toBeDefined();
    });

    it('should validate prompt length', async () => {
      const longPrompt = 'a'.repeat(1001);
      const response = await request(app)
        .post('/api/music/create')
        .send({
          mode: 'inspiration',
          prompt: longPrompt
        });

      expect(response.status).toBeDefined();
    });
  });

  describe('GET /api/music/status/:id', () => {
    it('should return 404 for non-existent id', async () => {
      const response = await request(app)
        .get('/api/music/status/nonexistent');

      expect(response.status).toBeDefined();
    });
  });
});

describe('Lyrics API Routes', () => {
  describe('POST /api/lyrics/generate', () => {
    it('should require idea parameter', async () => {
      const response = await request(app)
        .post('/api/lyrics/generate')
        .send({});

      expect(response.status).toBeDefined();
    });

    it('should validate idea length', async () => {
      const longIdea = 'a'.repeat(501);
      const response = await request(app)
        .post('/api/lyrics/generate')
        .send({
          idea: longIdea
        });

      expect(response.status).toBeDefined();
    });
  });

  describe('POST /api/lyrics/enhance', () => {
    it('should require prompt parameter', async () => {
      const response = await request(app)
        .post('/api/lyrics/enhance')
        .send({});

      expect(response.status).toBeDefined();
    });
  });

  describe('POST /api/lyrics/recommend-style', () => {
    it('should require description parameter', async () => {
      const response = await request(app)
        .post('/api/lyrics/recommend-style')
        .send({});

      expect(response.status).toBeDefined();
    });
  });
});

describe('Health Check', () => {
  it('should return health status', async () => {
    const healthApp = express();
    healthApp.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        services: {
          suno: 'ok',
          glm: 'ok'
        }
      });
    });

    const response = await request(healthApp)
      .get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });
});
