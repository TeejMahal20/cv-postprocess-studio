import { useState, useRef, useCallback } from 'react';
import { Upload, FileImage, FileJson, CheckCircle } from 'lucide-react';
import { uploadFiles, getFileUrl } from '../api';
import type { UploadResponse, COCODataset } from '../../../shared/types';

interface UploadPanelProps {
  sessionId: string | null;
  setSessionId: (id: string) => void;
  uploadResult: UploadResponse | null;
  setUploadResult: (r: UploadResponse) => void;
  setCocoData: (d: COCODataset) => void;
}

export default function UploadPanel({
  sessionId,
  setSessionId,
  uploadResult,
  setUploadResult,
  setCocoData,
}: UploadPanelProps) {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [cocoFile, setCocoFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cocoInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    for (const f of files) {
      if (f.type.startsWith('image/') || /\.(png|jpe?g|tiff?)$/i.test(f.name)) {
        setImageFile(f);
      } else if (f.name.endsWith('.json')) {
        setCocoFile(f);
      }
    }
  }, []);

  const handleUpload = async () => {
    if (!imageFile || !cocoFile) return;
    setIsUploading(true);
    setError(null);
    try {
      // Parse COCO locally for the frontend, filtered to this image
      const cocoText = await cocoFile.text();
      const fullCoco: COCODataset = JSON.parse(cocoText);
      const matchedImage = fullCoco.images?.find(
        (img) => img.file_name === imageFile.name,
      );
      if (matchedImage) {
        setCocoData({
          images: [matchedImage],
          categories: fullCoco.categories,
          annotations: fullCoco.annotations.filter(
            (ann) => ann.image_id === matchedImage.id,
          ),
        });
      } else {
        setCocoData(fullCoco);
      }

      const result = await uploadFiles(imageFile, cocoFile);
      setUploadResult(result);
      setSessionId(result.session_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
        Upload
      </h2>

      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          isDragging
            ? 'border-blue-400 bg-blue-900/20'
            : 'border-gray-600 hover:border-gray-500'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <Upload className="w-8 h-8 mx-auto mb-2 text-gray-500" />
        <p className="text-sm text-gray-400">
          Drop image + COCO JSON here
        </p>
      </div>

      {/* File selectors */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <FileImage className="w-4 h-4 text-gray-500 shrink-0" />
          <button
            className="text-sm text-blue-400 hover:text-blue-300"
            onClick={() => fileInputRef.current?.click()}
          >
            {imageFile ? imageFile.name : 'Select image...'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.tiff,.tif"
            className="hidden"
            onChange={(e) => setImageFile(e.target.files?.[0] || null)}
          />
        </div>
        <div className="flex items-center gap-2">
          <FileJson className="w-4 h-4 text-gray-500 shrink-0" />
          <button
            className="text-sm text-blue-400 hover:text-blue-300"
            onClick={() => cocoInputRef.current?.click()}
          >
            {cocoFile ? cocoFile.name : 'Select COCO JSON...'}
          </button>
          <input
            ref={cocoInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => setCocoFile(e.target.files?.[0] || null)}
          />
        </div>
      </div>

      {/* Upload button */}
      <button
        onClick={handleUpload}
        disabled={!imageFile || !cocoFile || isUploading}
        className="w-full py-2 px-4 rounded bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-sm font-medium transition-colors"
      >
        {isUploading ? 'Uploading...' : 'Upload'}
      </button>

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      {/* Upload result summary */}
      {uploadResult && sessionId && (
        <div className="space-y-3 border-t border-gray-700 pt-3">
          <div className="flex items-center gap-2 text-green-400 text-sm">
            <CheckCircle className="w-4 h-4" />
            <span>Uploaded successfully</span>
          </div>

          {/* Thumbnail */}
          <img
            src={getFileUrl(sessionId, uploadResult.image.filename)}
            alt="Uploaded"
            className="w-full rounded border border-gray-700"
          />

          <div className="text-xs text-gray-400 space-y-1">
            <p>
              Image: {uploadResult.image.width} x {uploadResult.image.height}
            </p>
            <p>Annotations: {uploadResult.coco.annotation_count}</p>
            <p>Segmentation: {uploadResult.coco.segmentation_type}</p>
            <p>
              Categories:{' '}
              {uploadResult.coco.categories.map((c) => c.name).join(', ')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
