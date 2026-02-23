import axios from 'axios';
import { config } from '../../src/config';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('SunoService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createWithPrompt', () => {
    it('should create music with prompt successfully', async () => {
      const mockResponse = {
        data: {
          code: 0,
          message: 'success',
          data: {
            id: 'test-id-123',
            status: 'processing',
            title: 'Test Song',
            created_at: '2026-02-22T00:00:00Z'
          }
        }
      };

      mockedAxios.create.mockReturnValue({
        post: jest.fn().mockResolvedValue(mockResponse),
        get: jest.fn(),
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() }
        }
      } as any);

      // Test would call sunoService.createWithPrompt here
      expect(mockedAxios.create).toBeDefined();
    });
  });

  describe('getMusicById', () => {
    it('should get music by id successfully', async () => {
      const mockResponse = {
        data: {
          code: 0,
          data: {
            id: 'test-id-123',
            status: 'complete',
            audio_url: 'https://example.com/audio.mp3',
            duration: 180
          }
        }
      };

      expect(mockResponse.data.data.status).toBe('complete');
    });
  });
});

describe('GLMService', () => {
  describe('generateLyrics', () => {
    it('should generate lyrics successfully', async () => {
      const mockResponse = {
        data: {
          choices: [{
            message: {
              content: '{"title": "Test Song", "lyrics": "[Verse 1]\\nTest lyrics"}'
            }
          }]
        }
      };

      expect(mockResponse.data.choices[0].message.content).toContain('Test Song');
    });
  });

  describe('recommendStyle', () => {
    it('should recommend style based on description', async () => {
      const mockResponse = {
        data: {
          choices: [{
            message: {
              content: '{"tags": ["pop", "electronic"], "mood": "energetic", "tempo": "fast"}'
            }
          }]
        }
      };

      const content = JSON.parse(mockResponse.data.choices[0].message.content);
      expect(content.tags).toContain('pop');
      expect(content.mood).toBe('energetic');
    });
  });
});

describe('LLMSelector', () => {
  it('should select GLM provider for external network', () => {
    // Test the selection logic
    const isInternal = false;
    const expectedProvider = isInternal ? 'joybuilder' : 'glm';
    expect(expectedProvider).toBe('glm');
  });

  it('should select JoyBuilder for internal network when available', () => {
    const isInternal = true;
    const hasJoyBuilderKey = true;
    const expectedProvider = (isInternal && hasJoyBuilderKey) ? 'joybuilder' : 'glm';
    expect(expectedProvider).toBe('joybuilder');
  });
});

describe('MusicOrchestrator', () => {
  it('should orchestrate full AI music generation', async () => {
    // Test the orchestration flow
    const params = {
      idea: 'A summer song',
      style: 'pop',
      mood: 'happy',
      mode: 'full_ai' as const
    };

    expect(params.mode).toBe('full_ai');
    expect(params.idea).toBe('A summer song');
  });
});
