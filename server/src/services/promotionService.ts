import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Recipe, PromoteRequest, PromoteResponse } from '../../../shared/types.js';
import { renderTemplate } from '../prompts/renderTemplate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MODEL_REPO_DIR = path.resolve(
  process.env.MODEL_REPOSITORY_DIR ||
    path.join(__dirname, '../../../../cv-mcp/model_repository'),
);

const VALID_MODEL_NAME = /^[a-zA-Z0-9_-]+$/;

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

export async function promoteRecipe(
  recipe: Recipe,
  request: PromoteRequest,
): Promise<PromoteResponse> {
  if (!VALID_MODEL_NAME.test(request.model_name)) {
    throw Object.assign(new Error('Invalid model name — use only letters, numbers, hyphens, and underscores'), {
      status: 400,
    });
  }

  const systemPrompt = await buildPromotionSystemPrompt();
  const userMessage = buildPromotionUserMessage(recipe);

  let response;
  try {
    response = await getClient().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });
  } catch (apiErr) {
    const msg = apiErr instanceof Error ? apiErr.message : String(apiErr);
    console.error('[Promotion] Anthropic API error:', msg);
    throw Object.assign(new Error(`Claude API error: ${msg}`), { status: 502 });
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  const content = textBlock?.text || '';

  const fenceMatch = content.match(/```python\n([\s\S]*?)```/);
  const modelPyCode = fenceMatch ? fenceMatch[1] : content;

  const configPbtxt = generateConfigPbtxt(request.model_name);

  // Write artifacts to model repository
  const modelDir = path.join(MODEL_REPO_DIR, request.model_name);
  const versionDir = path.join(modelDir, '1');
  await fs.mkdir(versionDir, { recursive: true });

  const modelPyPath = path.join(versionDir, 'model.py');
  const configPath = path.join(modelDir, 'config.pbtxt');
  await fs.writeFile(modelPyPath, modelPyCode);
  await fs.writeFile(configPath, configPbtxt);

  return {
    success: true,
    model_name: request.model_name,
    model_dir: modelDir,
    artifacts: { model_py: modelPyPath, config_pbtxt: configPath },
    agent_message_id: response.id,
  };
}

function generateConfigPbtxt(modelName: string): string {
  return `name: "${modelName}"
backend: "python"
max_batch_size: 0
input [
  {
    name: "IMAGE"
    data_type: TYPE_UINT8
    dims: [-1]
  },
  {
    name: "ANNOTATIONS"
    data_type: TYPE_STRING
    dims: [1]
  }
]
output [
  {
    name: "RESULTS"
    data_type: TYPE_STRING
    dims: [1]
  }
]
instance_group [
  {
    count: 1
    kind: KIND_CPU
  }
]
`;
}

function buildPromotionUserMessage(recipe: Recipe): string {
  return `Recipe: "${recipe.name}"
Description: ${recipe.description || 'N/A'}
Categories used: ${recipe.source.categories.join(', ')}
Image dimensions: ${recipe.source.image_dimensions.width}x${recipe.source.image_dimensions.height}

Recipe code to transform:
\`\`\`python
${recipe.code}
\`\`\``;
}

async function buildPromotionSystemPrompt(): Promise<string> {
  return renderTemplate('promotion-system.md', {});
}
