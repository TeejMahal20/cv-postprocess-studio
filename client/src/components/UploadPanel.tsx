import { useState, useRef, useCallback } from 'react';
import { Upload, FileImage, FileJson, FolderOpen, CheckCircle } from 'lucide-react';
import { uploadFiles, uploadFolder, getFileUrl } from '../api';
import type { UploadResponse, COCODataset, ImageEntry } from '../../../shared/types';

interface UploadPanelProps {
  sessionId: string | null;
  setSessionId: (id: string) => void;
  uploadResult: UploadResponse | null;
  setUploadResult: (r: UploadResponse) => void;
  setCocoData: (d: COCODataset) => void;
  setImageList: (list: ImageEntry[]) => void;
  setCurrentImageIndex: (index: number) => void;
}

export default function UploadPanel({
  sessionId,
  setSessionId,
  uploadResult,
  setUploadResult,
  setCocoData,
  setImageList,
  setCurrentImageIndex,
}: UploadPanelProps) {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [cocoFile, setCocoFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cocoInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

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
      setImageList(result.image_list);
      setCurrentImageIndex(result.current_index);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsUploading(true);
    setError(null);
    try {
      const result = await uploadFolder(files);
      setUploadResult(result);
      setSessionId(result.session_id);
      setImageList(result.image_list);
      setCurrentImageIndex(result.current_index);

      // Fetch filtered COCO for the first image from server
      const response = await fetch(getFileUrl(result.session_id, 'annotations.json'));
      const filteredCoco: COCODataset = await response.json();
      setCocoData(filteredCoco);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Folder upload failed');
    } finally {
      setIsUploading(false);
      // Reset the input so re-selecting the same folder works
      if (folderInputRef.current) folderInputRef.current.value = '';
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

      {/* Folder upload */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-700" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-gray-850 px-2 text-xs text-gray-500">or</span>
        </div>
      </div>

      <button
        onClick={() => folderInputRef.current?.click()}
        disabled={isUploading}
        className="w-full py-2 px-4 rounded border border-gray-600 hover:border-gray-500 hover:bg-gray-800 disabled:opacity-50 text-sm font-medium transition-colors flex items-center justify-center gap-2"
      >
        <FolderOpen className="w-4 h-4" />
        {isUploading ? 'Uploading...' : 'Upload COCO folder'}
      </button>
      <input
        ref={folderInputRef}
        type="file"
        // @ts-expect-error webkitdirectory is not in standard HTMLInputElement types
        webkitdirectory=""
        className="hidden"
        onChange={handleFolderUpload}
      />

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      {/* Upload result summary */}
      {uploadResult && sessionId && (
        <div className="space-y-3 border-t border-gray-700 pt-3">
          <div className="flex items-center gap-2 text-green-400 text-sm">
            <CheckCircle className="w-4 h-4" />
            <span>
              {uploadResult.total_images > 1
                ? `Uploaded ${uploadResult.total_images} images`
                : 'Uploaded successfully'}
            </span>
          </div>

          {/* Thumbnail */}
          <img
            src={getFileUrl(sessionId, uploadResult.image.filename)}
            alt="Uploaded"
            className="w-full rounded border border-gray-700"
          />

          <div className="text-xs text-gray-400 space-y-1">
            <p>
              {uploadResult.image.filename} ({uploadResult.image.width} x {uploadResult.image.height})
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
