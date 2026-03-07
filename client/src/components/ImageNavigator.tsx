import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ImageEntry } from '../../../shared/types';

interface ImageNavigatorProps {
  imageList: ImageEntry[];
  currentIndex: number;
  onSwitch: (index: number) => void;
  isSwitching: boolean;
}

export default function ImageNavigator({
  imageList,
  currentIndex,
  onSwitch,
  isSwitching,
}: ImageNavigatorProps) {
  if (imageList.length <= 1) return null;

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < imageList.length - 1;
  const currentImage = imageList[currentIndex];

  return (
    <div className="flex items-center gap-1 text-xs">
      <button
        onClick={() => onSwitch(currentIndex - 1)}
        disabled={!hasPrev || isSwitching}
        className="p-1 rounded hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
        title="Previous image (Left arrow)"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      <span className="text-gray-400 min-w-[60px] text-center">
        {isSwitching ? (
          <span className="text-blue-400">...</span>
        ) : (
          <>
            <span className="text-gray-200 font-medium">
              {currentIndex + 1}
            </span>
            {' / '}
            {imageList.length}
          </>
        )}
      </span>

      <button
        onClick={() => onSwitch(currentIndex + 1)}
        disabled={!hasNext || isSwitching}
        className="p-1 rounded hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
        title="Next image (Right arrow)"
      >
        <ChevronRight className="w-4 h-4" />
      </button>

      <span
        className="text-gray-500 truncate max-w-[120px]"
        title={currentImage?.filename}
      >
        {currentImage?.filename}
      </span>
    </div>
  );
}
