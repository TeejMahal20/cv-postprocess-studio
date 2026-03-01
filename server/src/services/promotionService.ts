import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Recipe, PromoteRequest, PromoteResponse } from '../../../shared/types.js';

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

  const systemPrompt = buildPromotionSystemPrompt();
  const userMessage = buildPromotionUserMessage(recipe);

  const response = await getClient().messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

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

function buildPromotionSystemPrompt(): string {
  return `You are a code transformer that converts standalone Python CV measurement scripts into NVIDIA Triton Inference Server Python backend models.

## Your Task
You will receive a Python script that reads images and COCO annotations from the filesystem, performs measurements using OpenCV/numpy, and writes results to a JSON file. You must transform it into a **lean Triton Python backend model.py** that only performs measurements — no visualization.

## Input Script Structure
The input script follows this pattern:
- \`# --- MEASUREMENT FUNCTIONS ---\` section with pure measurement logic
- \`# --- PIPELINE ---\` section with I/O, overlay building, and result assembly
- A \`main()\` function that reads from INPUT_DIR, processes annotations, and writes to OUTPUT_DIR/result.json

## Output: Triton model.py
Generate a complete model.py file that:

1. Imports at the top level: \`triton_python_backend_utils as pb_utils\`, \`numpy as np\`, \`cv2\`, \`json\`, and any other libraries the measurement functions need.

2. **Preserves ALL measurement functions** from the \`# --- MEASUREMENT FUNCTIONS ---\` section EXACTLY as-is. Do not modify measurement logic.

3. Implements a \`TritonPythonModel\` class with \`initialize()\`, \`execute()\`, and \`finalize()\` methods.

4. In \`execute(self, requests)\`, for each request:
   a. Extract the IMAGE tensor:
      \`\`\`python
      image_bytes = pb_utils.get_input_tensor_by_name(request, "IMAGE").as_numpy()
      image = cv2.imdecode(np.frombuffer(image_bytes.flatten(), np.uint8), cv2.IMREAD_COLOR)
      \`\`\`
   b. Extract the ANNOTATIONS tensor:
      \`\`\`python
      annotations_str = pb_utils.get_input_tensor_by_name(request, "ANNOTATIONS").as_numpy()[0].decode("utf-8")
      coco = json.loads(annotations_str)
      \`\`\`
   c. Build \`cat_map = {c["id"]: c["name"] for c in coco["categories"]}\`
   d. Iterate annotations, call the preserved measurement functions (same logic as the original pipeline).
   e. Assemble the result dict: \`{"metrics": {...}, "ctq_results": [...]}\`
   f. Serialize: \`result_json = json.dumps(result)\`
   g. Create output tensor: \`output = pb_utils.Tensor("RESULTS", np.array([result_json], dtype=object))\`
   h. Append \`pb_utils.InferenceResponse(output_tensors=[output])\` to responses.

5. Return the responses list.

## What to REMOVE (visualization is not needed in the deployed model)
- **Remove ALL overlay/visualization code**: any functions or logic that build overlays, contour drawings, bounding box drawings, text labels, measurement lines, or color assignments for display purposes.
- Remove \`build_overlays()\` and any similar visualization functions entirely.
- Do NOT include an \`"overlays"\` key in the result dict.
- Do NOT include a \`"stdout"\` key in the result dict.
- The result dict should ONLY contain \`"metrics"\` and \`"ctq_results"\`.

## What to KEEP
- All \`# --- MEASUREMENT FUNCTIONS ---\` — preserve verbatim.
- The annotation iteration and measurement call logic from the pipeline.
- The \`metrics\` dict (summary statistics).
- The \`ctq_results\` array (per-feature measurements).

## Critical Rules
- Keep ALL measurement functions VERBATIM — do not modify measurement logic.
- Remove ALL file I/O: \`os.path.join\`, \`open()\`, \`cv2.imread\` from file, \`json.dump\` to file.
- Remove all references to \`INPUT_DIR\` and \`OUTPUT_DIR\`.
- Remove the \`load_data()\` function and the \`main()\` function call.
- Do NOT use \`print()\` for debug output.
- All numpy values must be converted to plain Python types before JSON serialization (\`int(x)\`, \`float(x)\`, \`.tolist()\`).
- Wrap per-request logic in try/except — on error, return an InferenceResponse with error JSON:
  \`\`\`python
  error_result = json.dumps({"metrics": {"error": str(e)}, "ctq_results": []})
  output = pb_utils.Tensor("RESULTS", np.array([error_result], dtype=object))
  responses.append(pb_utils.InferenceResponse(output_tensors=[output]))
  \`\`\`

## Output Format
Return ONLY the complete model.py content inside a \`\`\`python fence. No explanation text.`;
}
