import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { success, fail } from '../utils/response';
import { asyncHandler } from '../middleware';
import logger from '../utils/logger';

const router = Router();

// Skills directory path - project level (go up from backend/dist/routes to project root)
const SKILLS_DIR = path.resolve(__dirname, '../../../.claude/skills');

interface SkillMeta {
  name: string;
  description: string;
  argumentHint?: string;
  disableModelInvocation?: boolean;
  userInvocable?: boolean;
}

interface Skill {
  name: string;
  description: string;
  path: string;
  content: string;
  argumentHint?: string;
  disableModelInvocation?: boolean;
  userInvocable?: boolean;
  lastModified: string;
}

/**
 * Parse frontmatter from SKILL.md content
 */
function parseFrontmatter(content: string): { meta: SkillMeta; body: string } {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  const meta: SkillMeta = {
    name: '',
    description: '',
  };

  let body = content;

  if (match) {
    const frontmatter = match[1];
    body = match[2];

    // Parse YAML-like frontmatter
    const lines = frontmatter.split('\n');
    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim();
        const value = line.slice(colonIndex + 1).trim();

        switch (key) {
          case 'name':
            meta.name = value;
            break;
          case 'description':
            meta.description = value;
            break;
          case 'argument-hint':
            meta.argumentHint = value;
            break;
          case 'disable-model-invocation':
            meta.disableModelInvocation = value === 'true';
            break;
          case 'user-invocable':
            meta.userInvocable = value !== 'false';
            break;
        }
      }
    }
  }

  return { meta, body };
}

/**
 * Generate frontmatter from meta
 */
function generateFrontmatter(meta: SkillMeta): string {
  let fm = '---\n';
  fm += `name: ${meta.name}\n`;
  fm += `description: ${meta.description}\n`;
  if (meta.argumentHint) {
    fm += `argument-hint: ${meta.argumentHint}\n`;
  }
  if (meta.disableModelInvocation) {
    fm += `disable-model-invocation: true\n`;
  }
  if (meta.userInvocable === false) {
    fm += `user-invocable: false\n`;
  }
  fm += '---\n\n';
  return fm;
}

/**
 * Get all skills
 */
router.get('/list',
  asyncHandler(async (req: Request, res: Response) => {
    const skills: Skill[] = [];

    try {
      // Ensure directory exists
      if (!fs.existsSync(SKILLS_DIR)) {
        fs.mkdirSync(SKILLS_DIR, { recursive: true });
        return success(res, skills);
      }

      const dirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });

      for (const dir of dirs) {
        if (!dir.isDirectory()) continue;

        const skillPath = path.join(SKILLS_DIR, dir.name, 'SKILL.md');
        if (!fs.existsSync(skillPath)) continue;

        try {
          const content = fs.readFileSync(skillPath, 'utf-8');
          const { meta, body } = parseFrontmatter(content);
          const stats = fs.statSync(skillPath);

          skills.push({
            name: meta.name || dir.name,
            description: meta.description || body.split('\n').find(l => l.trim())?.slice(0, 100) || '',
            path: `.claude/skills/${dir.name}/SKILL.md`,
            content: body.trim(),
            argumentHint: meta.argumentHint,
            disableModelInvocation: meta.disableModelInvocation,
            userInvocable: meta.userInvocable,
            lastModified: stats.mtime.toISOString(),
          });
        } catch (err) {
          logger.warn(`Failed to read skill ${dir.name}`, { error: err });
        }
      }

      return success(res, skills);
    } catch (error) {
      logger.error('Failed to list skills', { error });
      return fail(res, 5001, 'Failed to list skills', 500);
    }
  })
);

/**
 * Get a single skill by name
 */
router.get('/:name',
  asyncHandler(async (req: Request, res: Response) => {
    const { name } = req.params;
    const skillPath = path.join(SKILLS_DIR, name, 'SKILL.md');

    if (!fs.existsSync(skillPath)) {
      return fail(res, 5002, 'Skill not found', 404);
    }

    try {
      const content = fs.readFileSync(skillPath, 'utf-8');
      const { meta, body } = parseFrontmatter(content);
      const stats = fs.statSync(skillPath);

      const skill: Skill = {
        name: meta.name || name,
        description: meta.description || '',
        path: `.claude/skills/${name}/SKILL.md`,
        content: body.trim(),
        argumentHint: meta.argumentHint,
        disableModelInvocation: meta.disableModelInvocation,
        userInvocable: meta.userInvocable,
        lastModified: stats.mtime.toISOString(),
      };

      return success(res, skill);
    } catch (error) {
      logger.error('Failed to read skill', { error, name });
      return fail(res, 5003, 'Failed to read skill', 500);
    }
  })
);

/**
 * Create a new skill
 */
router.post('/create',
  asyncHandler(async (req: Request, res: Response) => {
    const { name, description, content, argumentHint } = req.body;

    if (!name || !name.match(/^[a-z0-9-]+$/)) {
      return fail(res, 5004, 'Invalid skill name. Use lowercase letters, numbers, and hyphens only.', 400);
    }

    if (!description) {
      return fail(res, 5005, 'Description is required', 400);
    }

    const skillDir = path.join(SKILLS_DIR, name);
    const skillPath = path.join(skillDir, 'SKILL.md');

    // Check if skill already exists
    if (fs.existsSync(skillPath)) {
      return fail(res, 5006, 'Skill already exists', 409);
    }

    try {
      // Create directory
      fs.mkdirSync(skillDir, { recursive: true });

      // Generate content with frontmatter
      const meta: SkillMeta = {
        name,
        description,
        argumentHint,
      };

      const fullContent = generateFrontmatter(meta) + (content || '');

      fs.writeFileSync(skillPath, fullContent, 'utf-8');

      logger.info('Skill created', { name });

      return success(res, {
        name,
        description,
        path: `.claude/skills/${name}/SKILL.md`,
        content: content || '',
        argumentHint,
        lastModified: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to create skill', { error, name });
      return fail(res, 5007, 'Failed to create skill', 500);
    }
  })
);

/**
 * Update an existing skill
 */
router.put('/:name',
  asyncHandler(async (req: Request, res: Response) => {
    const { name } = req.params;
    const { description, content, argumentHint } = req.body;

    const skillPath = path.join(SKILLS_DIR, name, 'SKILL.md');

    if (!fs.existsSync(skillPath)) {
      return fail(res, 5002, 'Skill not found', 404);
    }

    try {
      // Read existing skill to get current meta
      const existingContent = fs.readFileSync(skillPath, 'utf-8');
      const { meta: existingMeta } = parseFrontmatter(existingContent);

      // Update meta with new values
      const meta: SkillMeta = {
        name,
        description: description || existingMeta.description,
        argumentHint: argumentHint !== undefined ? argumentHint : existingMeta.argumentHint,
        disableModelInvocation: existingMeta.disableModelInvocation,
        userInvocable: existingMeta.userInvocable,
      };

      // Generate new content
      const fullContent = generateFrontmatter(meta) + (content || '');

      fs.writeFileSync(skillPath, fullContent, 'utf-8');

      logger.info('Skill updated', { name });

      return success(res, {
        name,
        description: meta.description,
        path: `.claude/skills/${name}/SKILL.md`,
        content: content || '',
        argumentHint: meta.argumentHint,
        lastModified: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to update skill', { error, name });
      return fail(res, 5008, 'Failed to update skill', 500);
    }
  })
);

/**
 * Delete a skill
 */
router.delete('/:name',
  asyncHandler(async (req: Request, res: Response) => {
    const { name } = req.params;
    const skillDir = path.join(SKILLS_DIR, name);

    if (!fs.existsSync(skillDir)) {
      return fail(res, 5002, 'Skill not found', 404);
    }

    try {
      // Recursively delete the skill directory
      fs.rmSync(skillDir, { recursive: true, force: true });

      logger.info('Skill deleted', { name });

      return success(res, { message: 'Skill deleted successfully' });
    } catch (error) {
      logger.error('Failed to delete skill', { error, name });
      return fail(res, 5009, 'Failed to delete skill', 500);
    }
  })
);

/**
 * Get skill context for a specific page (auto-load)
 */
router.get('/context/:page',
  asyncHandler(async (req: Request, res: Response) => {
    const { page } = req.params;

    // Map page to skill name
    const pageSkillMap: Record<string, string> = {
      'create': 'music-create',
      'cover': 'ai-cover',
      'library': 'music-library',
      'history': 'music-history',
      'explore': 'music-discover',
      'community': 'music-community',
    };

    const skillName = pageSkillMap[page];
    if (!skillName) {
      return success(res, null);
    }

    const skillPath = path.join(SKILLS_DIR, skillName, 'SKILL.md');

    if (!fs.existsSync(skillPath)) {
      return success(res, null);
    }

    try {
      const content = fs.readFileSync(skillPath, 'utf-8');
      const { meta, body } = parseFrontmatter(content);

      return success(res, {
        name: meta.name || skillName,
        description: meta.description,
        content: body.trim(),
        argumentHint: meta.argumentHint,
      });
    } catch (error) {
      logger.error('Failed to get skill context', { error, page, skillName });
      return success(res, null);
    }
  })
);

export default router;
