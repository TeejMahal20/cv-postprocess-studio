import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import path from 'path';

// Model used for all agent API calls
// Other options: 'claude-sonnet-4-5-20250514', 'claude-haiku-4-5-20251001', 'claude-opus-4-5-20250527'
const CLAUDE_MODEL: Anthropic.Messages.Model = 'claude-sonnet-4-6';
import type { Response as ExpressResponse } from 'express';
import type { AgentRequest, AgentResponse, HumanAnnotation, COCODataset, ConversationMessage } from '../../../shared/types.js';
import { renderTemplate } from '../prompts/renderTemplate.js';
import { getInputsDir } from './fileService.js';
import { enrichAnnotationsWithContext } from './spatialEnrichment.js';

function shouldEnableThinking(request: AgentRequest): boolean {
  const mode = request.context.thinking_mode ?? 'auto';
  if (mode === 'on') return true;
  if (mode === 'off') return false;
  // 'auto': enable on first generation (no previous code), skip on refinements
  return !request.context.previous_code;
}

function formatHumanAnnotations(annotations?: HumanAnnotation[]): string {
  if (!annotations?.length) return '';

  let section = `\n## Human Annotations (User Markings on Image)\nThe user drew the following annotations on the image to guide your analysis:\n\n`;

  for (const anno of annotations) {
    switch (anno.type) {
      case 'point':
        section += `- **Point** at pixel (${anno.x}, ${anno.y})`;
        if (anno.label) section += ` — label: "${anno.label}"`;
        section += '\n';
        break;
      case 'line': {
        const dx = anno.end[0] - anno.start[0];
        const dy = anno.end[1] - anno.start[1];
        const length = Math.sqrt(dx * dx + dy * dy);
        section += `- **Measurement line** from (${anno.start[0]}, ${anno.start[1]}) to (${anno.end[0]}, ${anno.end[1]}) — length: ${length.toFixed(1)} px`;
        if (anno.label) section += `, label: "${anno.label}"`;
        section += '\n';
        break;
      }
      case 'rect':
        section += `- **Region of interest** rectangle at (${anno.x}, ${anno.y}), size ${anno.width}x${anno.height} px`;
        if (anno.label) section += ` — label: "${anno.label}"`;
        section += '\n';
        break;
      case 'text':
        section += `- **Text note** at (${anno.x}, ${anno.y}): "${anno.text}"\n`;
        break;
    }
  }

  section += `
### How to interpret these annotations

These are **rough sketches communicating the user's idea**, NOT precise coordinates. Do NOT hardcode the drawn coordinates into your measurement code. Instead, use them to understand the user's **intent**:

- **Line drawn across a feature** → The user wants to measure the **width or thickness** of that kind of feature. Write a generic algorithm that measures width for ALL matching annotations (e.g., minimum width via contour cross-sections), not just at the drawn line's location.
- **Line drawn between two features** → The user wants the **distance between** those types of features. Measure it properly using contour geometry for all relevant annotation pairs.
- **Point placed on/near a feature** → The user is identifying **which category or feature type** they care about. Process all annotations of that category.
- **Rectangle around a region** → The user wants analysis **focused on that general area**. Filter to annotations overlapping the region.
- **Text note** → Read it as an additional instruction.

**Key principle**: The annotations tell you WHAT to measure and give a rough idea of WHERE. Your code should then apply robust geometric algorithms across ALL relevant COCO annotations of the indicated type — not just at the specific drawn coordinates.
`;

  return section;
}

function summarizeAnnotations(annotations: HumanAnnotation[]): string {
  const counts: Record<string, number> = {};
  for (const a of annotations) counts[a.type] = (counts[a.type] || 0) + 1;
  const parts: string[] = [];
  if (counts.line) parts.push(`${counts.line} line(s) sketching the general idea of what to measure`);
  if (counts.point) parts.push(`${counts.point} point(s) indicating features of interest`);
  if (counts.rect) parts.push(`${counts.rect} rectangle(s) highlighting regions of interest`);
  if (counts.text) parts.push(`${counts.text} text note(s)`);
  return `The user drew ${parts.join(', ')}`;
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

export async function invokeAgent(
  request: AgentRequest,
): Promise<AgentResponse> {
  const mode = request.mode ?? 'generate';
  console.log(`[Agent] invokeAgent mode=${mode}, prompt="${request.prompt.slice(0, 80)}..."`);

  if (mode === 'chat') {
    return invokeChatMode(request);
  }

  return invokeGenerateMode(request);
}

export async function invokeAgentStream(
  request: AgentRequest,
  res: ExpressResponse,
): Promise<void> {
  const mode = request.mode ?? 'generate';
  console.log(`[Agent/Stream] mode=${mode}, prompt="${request.prompt.slice(0, 80)}..."`);

  if (mode === 'chat') {
    // Chat mode doesn't use thinking, fall back to non-streaming
    const response = await invokeChatMode(request);
    sendSSE(res, 'explanation', response.explanation);
    sendSSE(res, 'done', JSON.stringify(response));
    res.end();
    return;
  }

  return invokeGenerateModeStream(request, res);
}

async function invokeGenerateMode(
  request: AgentRequest,
): Promise<AgentResponse> {
  console.log(`[Agent/Generate] Building system prompt...`);
  const systemPrompt = await buildSystemPrompt(request);
  console.log(`[Agent/Generate] System prompt: ${systemPrompt.length} chars`);
  const userMessageText = buildUserMessage(request);
  console.log(`[Agent/Generate] User message: ${userMessageText.length} chars`);

  // Build user content: multimodal if canvas snapshot is provided
  const snapshotSize = request.context.canvas_snapshot?.length ?? 0;
  if (snapshotSize > 0) {
    console.log(`[Agent] Sending canvas snapshot: ${(snapshotSize / 1024).toFixed(0)} KB base64`);
  }

  let userContent: Anthropic.MessageCreateParams['messages'][0]['content'];
  if (request.context.canvas_snapshot) {
    userContent = [
      {
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: 'image/jpeg' as const,
          data: request.context.canvas_snapshot,
        },
      },
      {
        type: 'text' as const,
        text: 'The image above shows the canvas with COCO annotation overlays and user-drawn annotations (in orange). Use this to understand the spatial relationships between features and user annotations.\n\n' + userMessageText,
      },
    ];
  } else {
    userContent = userMessageText;
  }

  const useThinking = shouldEnableThinking(request);
  console.log(`[Agent/Generate] Calling Claude API... (thinking: ${useThinking})`);
  const response = await getClient().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 16384,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
    ...(useThinking && { thinking: { type: 'enabled' as const, budget_tokens: 4096 } }),
    stop_sequences: ['</code>'],
  });
  console.log(`[Agent/Generate] Claude responded: ${response.usage?.input_tokens} input, ${response.usage?.output_tokens} output tokens`);

  // Extract thinking blocks for transparency
  const thinkingBlocks = response.content.filter((b) => b.type === 'thinking');
  const thinking = thinkingBlocks
    .map((b) => (b as Anthropic.ThinkingBlock).thinking)
    .join('\n\n') || undefined;

  // Extract text content from response (skip thinking blocks)
  const textBlocks = response.content.filter((b) => b.type === 'text');
  const content = textBlocks.map((b) => (b as Anthropic.TextBlock).text).join('');

  // Extract Python code from <code> XML tags (preferred) or markdown fences (fallback)
  const xmlCodeMatch = content.match(/<code>\n?([\s\S]*?)(?:<\/code>|$)/);
  const fenceMatch = content.match(/```python\n([\s\S]*?)```/);
  const code = xmlCodeMatch ? xmlCodeMatch[1].trim() : fenceMatch ? fenceMatch[1] : content;

  // Extract explanation from <explanation> tags, or text outside code blocks
  const xmlExplMatch = content.match(/<explanation>([\s\S]*?)<\/explanation>/);
  const explanation = xmlExplMatch
    ? xmlExplMatch[1].trim()
    : content
        .replace(/<code>[\s\S]*?(?:<\/code>|$)/, '')
        .replace(/```python\n[\s\S]*?```/, '')
        .trim() || 'Generated by Claude.';

  console.log(`[Agent/Generate] Done. Code: ${code.length} chars, explanation: ${explanation.length} chars`);
  return {
    code,
    explanation,
    thinking,
    agent_message_id: response.id,
  };
}

function sendSSE(res: ExpressResponse, event: string, data: string): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function invokeGenerateModeStream(
  request: AgentRequest,
  res: ExpressResponse,
): Promise<void> {
  const systemPrompt = await buildSystemPrompt(request);
  const userMessageText = buildUserMessage(request);

  let userContent: Anthropic.MessageCreateParams['messages'][0]['content'];
  if (request.context.canvas_snapshot) {
    userContent = [
      {
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: 'image/jpeg' as const,
          data: request.context.canvas_snapshot,
        },
      },
      {
        type: 'text' as const,
        text: 'The image above shows the canvas with COCO annotation overlays and user-drawn annotations (in orange). Use this to understand the spatial relationships between features and user annotations.\n\n' + userMessageText,
      },
    ];
  } else {
    userContent = userMessageText;
  }

  const useThinking = shouldEnableThinking(request);
  console.log(`[Agent/Stream] Calling Claude streaming API... (thinking: ${useThinking})`);

  const stream = getClient().messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: 16384,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
    ...(useThinking && { thinking: { type: 'enabled' as const, budget_tokens: 4096 } }),
    stop_sequences: ['</code>'],
  });

  let fullThinking = '';
  let fullText = '';

  stream.on('thinking', (thinkingDelta: string) => {
    fullThinking += thinkingDelta;
    sendSSE(res, 'thinking_delta', thinkingDelta);
  });

  let thinkingDone = false;
  stream.on('text', (textDelta: string) => {
    if (!thinkingDone) {
      thinkingDone = true;
      sendSSE(res, 'thinking_done', '');
    }
    fullText += textDelta;
    // Text is NOT streamed — only reasoning is streamed live.
    // The full code + explanation are sent in the final 'done' event.
  });

  const finalMessage = await stream.finalMessage();
  console.log(`[Agent/Stream] Claude responded: ${finalMessage.usage?.input_tokens} input, ${finalMessage.usage?.output_tokens} output tokens`);

  // Parse the accumulated text into code + explanation
  const xmlCodeMatch = fullText.match(/<code>\n?([\s\S]*?)(?:<\/code>|$)/);
  const fenceMatch = fullText.match(/```python\n([\s\S]*?)```/);
  const code = xmlCodeMatch ? xmlCodeMatch[1].trim() : fenceMatch ? fenceMatch[1] : fullText;

  const xmlExplMatch = fullText.match(/<explanation>([\s\S]*?)<\/explanation>/);
  const explanation = xmlExplMatch
    ? xmlExplMatch[1].trim()
    : fullText
        .replace(/<code>[\s\S]*?(?:<\/code>|$)/, '')
        .replace(/```python\n[\s\S]*?```/, '')
        .trim() || 'Generated by Claude.';

  const result: AgentResponse = {
    code,
    explanation,
    thinking: fullThinking || undefined,
    agent_message_id: finalMessage.id,
  };

  sendSSE(res, 'done', JSON.stringify(result));
  res.end();
}

async function invokeChatMode(
  request: AgentRequest,
): Promise<AgentResponse> {
  console.log(`[Agent/Chat] Building chat system prompt...`);
  const systemPrompt = await buildChatSystemPrompt(request);
  console.log(`[Agent/Chat] System prompt: ${systemPrompt.length} chars`);
  const messages = buildChatMessages(request);
  console.log(`[Agent/Chat] Conversation history: ${messages.length} messages`);

  const snapshotSize = request.context.canvas_snapshot?.length ?? 0;
  if (snapshotSize > 0) {
    console.log(`[Agent/Chat] Sending canvas snapshot: ${(snapshotSize / 1024).toFixed(0)} KB base64`);
  }

  console.log(`[Agent/Chat] Calling Claude API...`);
  const response = await getClient().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages,
  });
  console.log(`[Agent/Chat] Claude responded: ${response.usage?.input_tokens} input, ${response.usage?.output_tokens} output tokens`);

  const textBlock = response.content.find((b) => b.type === 'text');
  const content = textBlock?.text || '';

  return {
    code: null,
    explanation: content,
    agent_message_id: response.id,
  };
}

function buildUserMessage(request: AgentRequest): string {
  const ctx = request.context;

  if (ctx.previous_code) {
    let msg = `Previous code:\n\`\`\`python\n${ctx.previous_code}\n\`\`\`\n\n`;
    if (ctx.previous_error) {
      msg += `Previous execution failed with this error:\n\`\`\`\n${ctx.previous_error}\n\`\`\`\n\nPlease fix the error and regenerate the script.\n\n`;
    } else if (ctx.previous_result) {
      msg += `Previous execution succeeded.\n`;
      if (ctx.previous_result.ctq_results?.length) {
        msg += `It produced ${ctx.previous_result.ctq_results.length} CTQ results.\n`;
        const allKeys = new Set<string>();
        for (const r of ctx.previous_result.ctq_results) {
          Object.keys(r.measurements).forEach((k) => allKeys.add(k));
        }
        if (allKeys.size > 0) {
          msg += `Measurement fields: ${Array.from(allKeys).join(', ')}\n`;
        }
      }
      if (ctx.previous_result.stdout) {
        msg += `Stdout: ${ctx.previous_result.stdout.slice(0, 300)}\n`;
      }
      msg += '\n';
    }
    if (ctx.human_annotations?.length) {
      msg += `\n**IMPORTANT — Visual guidance from user**: ${summarizeAnnotations(ctx.human_annotations)}. See "Human Annotations" in system prompt for exact coordinates. These are rough sketches showing the general idea — see "Human Annotations" in system prompt.\n\n`;
    }
    msg += `New instruction: ${request.prompt}`;
    return msg;
  }

  let basePrompt = request.prompt;
  if (ctx.human_annotations?.length) {
    basePrompt += `\n\n**IMPORTANT — Visual guidance from user**: ${summarizeAnnotations(ctx.human_annotations)}. See "Human Annotations" in system prompt for exact coordinates. These are rough sketches showing the general idea — see "Human Annotations" in system prompt.`;
  }
  return basePrompt;
}

async function loadSessionCoco(sessionId: string): Promise<COCODataset | null> {
  try {
    const cocoPath = path.join(getInputsDir(sessionId), 'annotations.json');
    const raw = await fs.readFile(cocoPath, 'utf-8');
    return JSON.parse(raw) as COCODataset;
  } catch {
    return null;
  }
}

async function buildSystemPrompt(request: AgentRequest): Promise<string> {
  const ctx = request.context;
  const rleNote =
    ctx.coco_summary.segmentation_type === 'rle'
      ? ' (RLE encoded — decode before geometric operations)'
      : '';

  // Build human annotations section with spatial enrichment
  let humanAnnotationsSection = formatHumanAnnotations(ctx.human_annotations);

  if (ctx.human_annotations?.length) {
    const cocoData = await loadSessionCoco(request.session_id);
    if (cocoData) {
      const enriched = enrichAnnotationsWithContext(ctx.human_annotations, cocoData);
      if (enriched) {
        humanAnnotationsSection += enriched;
      }
    }
  }

  return renderTemplate('agent-system.md', {
    image_filename: ctx.image_info.filename,
    image_width: String(ctx.image_info.width),
    image_height: String(ctx.image_info.height),
    annotation_count: String(ctx.coco_summary.annotation_count),
    categories: ctx.coco_summary.categories.join(', '),
    segmentation_type: ctx.coco_summary.segmentation_type,
    rle_note: rleNote,
    human_annotations_section: humanAnnotationsSection,
  });
}

function getTemplateVars(request: AgentRequest) {
  const ctx = request.context;
  const rleNote =
    ctx.coco_summary.segmentation_type === 'rle'
      ? ' (RLE encoded — decode before geometric operations)'
      : '';
  return {
    image_filename: ctx.image_info.filename,
    image_width: String(ctx.image_info.width),
    image_height: String(ctx.image_info.height),
    annotation_count: String(ctx.coco_summary.annotation_count),
    categories: ctx.coco_summary.categories.join(', '),
    segmentation_type: ctx.coco_summary.segmentation_type,
    rle_note: rleNote,
  };
}

async function buildChatSystemPrompt(request: AgentRequest): Promise<string> {
  const vars = getTemplateVars(request);

  // Build human annotations section with spatial enrichment (same as generate mode)
  let humanAnnotationsSection = formatHumanAnnotations(request.context.human_annotations);

  if (request.context.human_annotations?.length) {
    const cocoData = await loadSessionCoco(request.session_id);
    if (cocoData) {
      const enriched = enrichAnnotationsWithContext(request.context.human_annotations, cocoData);
      if (enriched) {
        humanAnnotationsSection += enriched;
      }
    }
  }

  // Add previous result context if available
  const ctx = request.context;
  if (ctx.previous_result) {
    let resultContext = '\n## Previous Execution Results\n';
    if (ctx.previous_result.ctq_results?.length) {
      resultContext += `The last code execution produced ${ctx.previous_result.ctq_results.length} CTQ results.\n`;
      const allKeys = new Set<string>();
      for (const r of ctx.previous_result.ctq_results) {
        Object.keys(r.measurements).forEach((k) => allKeys.add(k));
      }
      if (allKeys.size > 0) {
        resultContext += `Measurement fields: ${Array.from(allKeys).join(', ')}\n`;
      }
    }
    if (ctx.previous_result.stdout) {
      resultContext += `Stdout: ${ctx.previous_result.stdout.slice(0, 300)}\n`;
    }
    humanAnnotationsSection += resultContext;
  } else if (ctx.previous_error) {
    humanAnnotationsSection += `\n## Previous Execution Error\nThe last code execution failed with: ${ctx.previous_error.slice(0, 300)}\n`;
  }

  return renderTemplate('agent-chat.md', {
    ...vars,
    human_annotations_section: humanAnnotationsSection,
  });
}

function buildChatMessages(
  request: AgentRequest,
): Anthropic.MessageCreateParams['messages'] {
  const messages: Anthropic.MessageCreateParams['messages'] = [];

  // Add conversation history
  if (request.conversation_history?.length) {
    for (const msg of request.conversation_history) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  // Build the final user message (with optional canvas snapshot)
  let userContent: Anthropic.MessageCreateParams['messages'][0]['content'];
  if (request.context.canvas_snapshot) {
    userContent = [
      {
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: 'image/jpeg' as const,
          data: request.context.canvas_snapshot,
        },
      },
      {
        type: 'text' as const,
        text: 'The image above shows the canvas with COCO annotation overlays and user-drawn annotations (in orange).\n\n' + request.prompt,
      },
    ];
  } else {
    userContent = request.prompt;
  }

  messages.push({ role: 'user', content: userContent });

  return messages;
}
