import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { imageSize } from 'image-size';
import {
  createSession,
  ensureInputsDir,
  getInputsDir,
  sessions,
} from '../services/fileService.js';
import type { SessionState } from '../types.js';
import type { COCODataset, COCOAnnotation, UploadResponse } from '../../../shared/types.js';

export const uploadRouter = Router();

// Multer: store files in memory first, then write to session dir
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const uploadFields = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'coco', maxCount: 1 },
  { name: 'masks', maxCount: 20 },
]);

uploadRouter.post('/upload', uploadFields, async (req, res, next) => {
  try {
    const files = req.files as Record<string, Express.Multer.File[]>;
    if (!files.image?.[0] || !files.coco?.[0]) {
      res.status(400).json({ error: 'Both image and coco files are required' });
      return;
    }

    const imageFile = files.image[0];
    const cocoFile = files.coco[0];
    const maskFiles = files.masks || [];

    // Create session
    const sessionId = createSession();
    const inputsDir = await ensureInputsDir(sessionId);

    // Write image to disk
    const imagePath = path.join(inputsDir, imageFile.originalname);
    await fs.writeFile(imagePath, imageFile.buffer);

    const additionalMasks: string[] = [];
    for (const mask of maskFiles) {
      const maskPath = path.join(inputsDir, mask.originalname);
      await fs.writeFile(maskPath, mask.buffer);
      additionalMasks.push(mask.originalname);
    }

    // Read image dimensions
    const dimensions = imageSize(imageFile.buffer);
    const imgWidth = dimensions.width || 0;
    const imgHeight = dimensions.height || 0;

    // Parse COCO and filter to only annotations for this image
    const cocoData: COCODataset = JSON.parse(cocoFile.buffer.toString('utf-8'));
    const filteredCoco = filterCocoForImage(cocoData, imageFile.originalname);

    // Write filtered annotations to disk
    const cocoPath = path.join(inputsDir, 'annotations.json');
    await fs.writeFile(cocoPath, JSON.stringify(filteredCoco, null, 2));

    const cocoSummary = parseCOCOSummary(filteredCoco);

    // Store session state
    const session: SessionState = {
      id: sessionId,
      createdAt: new Date(),
      imageFile: imageFile.originalname,
      cocoFile: 'annotations.json',
      cocoSummary,
      runs: [],
    };
    sessions.set(sessionId, session);

    const response: UploadResponse = {
      session_id: sessionId,
      image: {
        filename: imageFile.originalname,
        width: imgWidth,
        height: imgHeight,
      },
      coco: cocoSummary,
      additional_masks: additionalMasks,
    };

    res.json(response);
  } catch (err) {
    next(err);
  }
});

// Serve uploaded files
uploadRouter.get(
  '/workspace/:sessionId/files/:filename',
  async (req, res, next) => {
    try {
      const { sessionId, filename } = req.params;
      const filePath = path.join(getInputsDir(sessionId), filename);

      // Security: prevent path traversal
      const resolvedPath = path.resolve(filePath);
      const resolvedDir = path.resolve(getInputsDir(sessionId));
      if (!resolvedPath.startsWith(resolvedDir)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      await fs.access(filePath);
      res.sendFile(resolvedPath);
    } catch {
      res.status(404).json({ error: 'File not found' });
    }
  },
);

function parseCOCOSummary(coco: COCODataset) {
  const categories = (coco.categories || []).map((c) => ({
    id: c.id,
    name: c.name,
  }));

  let hasRLE = false;
  let hasPolygon = false;
  let hasScores = false;

  for (const ann of coco.annotations || []) {
    if (ann.score !== undefined) hasScores = true;
    if (isRLE(ann)) {
      hasRLE = true;
    } else {
      hasPolygon = true;
    }
  }

  const segmentation_type: 'polygon' | 'rle' | 'mixed' =
    hasRLE && hasPolygon ? 'mixed' : hasRLE ? 'rle' : 'polygon';

  return {
    annotation_count: (coco.annotations || []).length,
    categories,
    segmentation_type,
    has_rle: hasRLE,
    has_scores: hasScores,
  };
}

function isRLE(ann: COCOAnnotation): boolean {
  return (
    ann.segmentation !== null &&
    typeof ann.segmentation === 'object' &&
    !Array.isArray(ann.segmentation) &&
    'counts' in ann.segmentation
  );
}

function filterCocoForImage(
  coco: COCODataset,
  imageFilename: string,
): COCODataset {
  // Find the image entry matching the uploaded filename
  const matchedImage = (coco.images || []).find(
    (img) => img.file_name === imageFilename,
  );

  if (!matchedImage) {
    // No matching image found — return everything as-is
    return coco;
  }

  const imageId = matchedImage.id;
  return {
    images: [matchedImage],
    categories: coco.categories || [],
    annotations: (coco.annotations || []).filter(
      (ann) => ann.image_id === imageId,
    ),
  };
}
