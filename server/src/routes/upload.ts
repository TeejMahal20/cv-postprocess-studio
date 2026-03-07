import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { imageSize } from 'image-size';
import {
  createSession,
  ensureInputsDir,
  ensureImagesDir,
  getInputsDir,
  getImagesDir,
  getSessionDir,
  sessions,
} from '../services/fileService.js';
import type { SessionState } from '../types.js';
import type {
  COCODataset,
  COCOAnnotation,
  UploadResponse,
  ImageEntry,
  SwitchImageResponse,
} from '../../../shared/types.js';

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

const folderUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 500 },
});

// --- Single image + COCO JSON upload (existing) ---

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

    const imageEntry: ImageEntry = {
      index: 0,
      filename: imageFile.originalname,
      width: imgWidth,
      height: imgHeight,
      annotation_count: cocoSummary.annotation_count,
    };

    // Store session state
    const session: SessionState = {
      id: sessionId,
      createdAt: new Date(),
      imageFile: imageFile.originalname,
      cocoFile: 'annotations.json',
      cocoSummary,
      runs: [],
      allImages: [imageEntry],
      currentIndex: 0,
      fullCocoPath: cocoPath,
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
      image_list: [imageEntry],
      current_index: 0,
      total_images: 1,
    };

    res.json(response);
  } catch (err) {
    next(err);
  }
});

// --- COCO folder upload (multi-image) ---

uploadRouter.post(
  '/upload-folder',
  folderUpload.array('files', 500),
  async (req, res, next) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files?.length) {
        res.status(400).json({ error: 'No files received' });
        return;
      }

      const { images, cocoJson } = classifyFolderFiles(files);
      if (!cocoJson) {
        res.status(400).json({ error: 'No valid COCO JSON found in folder' });
        return;
      }
      if (images.length === 0) {
        res.status(400).json({ error: 'No image files found in folder' });
        return;
      }

      const fullCoco: COCODataset = JSON.parse(
        cocoJson.buffer.toString('utf-8'),
      );

      // Create session
      const sessionId = createSession();
      const inputsDir = await ensureInputsDir(sessionId);
      const imagesDir = await ensureImagesDir(sessionId);

      // Write full COCO to session dir
      const fullCocoPath = path.join(getSessionDir(sessionId), 'full_coco.json');
      await fs.writeFile(fullCocoPath, JSON.stringify(fullCoco, null, 2));

      // Write all images to images/ dir and build ImageEntry list
      const imageEntries: ImageEntry[] = [];
      for (const imgFile of images) {
        const basename = path.basename(imgFile.originalname);
        await fs.writeFile(path.join(imagesDir, basename), imgFile.buffer);

        const dims = imageSize(imgFile.buffer);
        const cocoImage = matchImageToCoco(basename, imgFile.originalname, fullCoco.images || []);
        const annotationCount = cocoImage
          ? (fullCoco.annotations || []).filter((a) => a.image_id === cocoImage.id).length
          : 0;

        imageEntries.push({
          index: 0, // assigned after sort
          filename: basename,
          width: dims.width || 0,
          height: dims.height || 0,
          annotation_count: annotationCount,
        });
      }

      // Sort by filename for deterministic order, assign indices
      imageEntries.sort((a, b) => a.filename.localeCompare(b.filename));
      imageEntries.forEach((e, i) => (e.index = i));

      // Activate the first image
      const firstImage = imageEntries[0];
      await fs.copyFile(
        path.join(imagesDir, firstImage.filename),
        path.join(inputsDir, firstImage.filename),
      );
      const filteredCoco = filterCocoForImage(fullCoco, firstImage.filename);
      await fs.writeFile(
        path.join(inputsDir, 'annotations.json'),
        JSON.stringify(filteredCoco, null, 2),
      );

      const cocoSummary = parseCOCOSummary(filteredCoco);

      const session: SessionState = {
        id: sessionId,
        createdAt: new Date(),
        imageFile: firstImage.filename,
        cocoFile: 'annotations.json',
        cocoSummary,
        runs: [],
        allImages: imageEntries,
        currentIndex: 0,
        fullCocoPath,
      };
      sessions.set(sessionId, session);

      const response: UploadResponse = {
        session_id: sessionId,
        image: {
          filename: firstImage.filename,
          width: firstImage.width,
          height: firstImage.height,
        },
        coco: cocoSummary,
        additional_masks: [],
        image_list: imageEntries,
        current_index: 0,
        total_images: imageEntries.length,
      };

      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

// --- Switch active image within a multi-image session ---

uploadRouter.post(
  '/sessions/:sessionId/switch-image',
  async (req, res, next) => {
    try {
      const { sessionId } = req.params;
      const { index } = req.body as { index: number };

      const session = sessions.get(sessionId);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      if (
        !session.allImages ||
        index < 0 ||
        index >= session.allImages.length
      ) {
        res.status(400).json({ error: 'Invalid image index' });
        return;
      }

      const targetImage = session.allImages[index];
      const inputsDir = getInputsDir(sessionId);
      const imagesDir = getImagesDir(sessionId);

      // Clear current inputs (except config.json)
      const existingFiles = await fs.readdir(inputsDir);
      for (const file of existingFiles) {
        if (file !== 'config.json') {
          await fs.unlink(path.join(inputsDir, file));
        }
      }

      // Copy new image into inputs
      await fs.copyFile(
        path.join(imagesDir, targetImage.filename),
        path.join(inputsDir, targetImage.filename),
      );

      // Filter and write annotations
      const fullCocoRaw = await fs.readFile(session.fullCocoPath, 'utf-8');
      const fullCoco: COCODataset = JSON.parse(fullCocoRaw);
      const filteredCoco = filterCocoForImage(fullCoco, targetImage.filename);
      await fs.writeFile(
        path.join(inputsDir, 'annotations.json'),
        JSON.stringify(filteredCoco, null, 2),
      );

      // Update session state
      const cocoSummary = parseCOCOSummary(filteredCoco);
      session.imageFile = targetImage.filename;
      session.cocoSummary = cocoSummary;
      session.currentIndex = index;

      const response: SwitchImageResponse = {
        image: {
          filename: targetImage.filename,
          width: targetImage.width,
          height: targetImage.height,
        },
        coco: cocoSummary,
        filtered_coco: filteredCoco,
      };

      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

// --- Serve uploaded files from inputs/ ---

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

// --- Serve images from the images/ subdir (multi-image sessions) ---

uploadRouter.get(
  '/workspace/:sessionId/images/:filename',
  async (req, res, next) => {
    try {
      const { sessionId, filename } = req.params;
      const filePath = path.join(getImagesDir(sessionId), filename);

      const resolvedPath = path.resolve(filePath);
      const resolvedDir = path.resolve(getImagesDir(sessionId));
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

// --- Helpers ---

function classifyFolderFiles(files: Express.Multer.File[]): {
  images: Express.Multer.File[];
  cocoJson: Express.Multer.File | null;
} {
  const IMAGE_EXTS = /\.(png|jpe?g|tiff?|bmp|webp)$/i;
  const images: Express.Multer.File[] = [];
  let cocoJson: Express.Multer.File | null = null;

  for (const file of files) {
    const basename = path.basename(file.originalname);
    if (IMAGE_EXTS.test(basename)) {
      images.push(file);
    } else if (basename.endsWith('.json')) {
      try {
        const parsed = JSON.parse(file.buffer.toString('utf-8'));
        if (parsed.images && parsed.annotations && parsed.categories) {
          // Pick the largest valid COCO JSON if multiple exist
          if (
            !cocoJson ||
            file.buffer.length > cocoJson.buffer.length
          ) {
            cocoJson = file;
          }
        }
      } catch {
        // not valid JSON, skip
      }
    }
  }

  return { images, cocoJson };
}

function matchImageToCoco(
  imageBasename: string,
  imageRelPath: string,
  cocoImages: COCODataset['images'],
) {
  // Try exact basename match
  let match = cocoImages.find(
    (ci) => path.basename(ci.file_name) === imageBasename,
  );
  if (match) return match;

  // Try matching against the full relative path
  const normalizedRel = imageRelPath.replace(/\\/g, '/');
  match = cocoImages.find((ci) => {
    const normalizedCoco = ci.file_name.replace(/\\/g, '/');
    return (
      normalizedRel.endsWith(normalizedCoco) ||
      normalizedCoco.endsWith(imageBasename)
    );
  });
  return match;
}

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
  // Find the image entry matching the filename (try exact then basename)
  const matchedImage = (coco.images || []).find(
    (img) =>
      img.file_name === imageFilename ||
      path.basename(img.file_name) === imageFilename,
  );

  if (!matchedImage) {
    // No matching image found — return everything as-is
    return coco;
  }

  const imageId = matchedImage.id;
  return {
    images: [{ ...matchedImage, file_name: path.basename(matchedImage.file_name) }],
    categories: coco.categories || [],
    annotations: (coco.annotations || []).filter(
      (ann) => ann.image_id === imageId,
    ),
  };
}
