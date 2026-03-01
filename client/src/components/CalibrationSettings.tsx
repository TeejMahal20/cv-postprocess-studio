import { Settings } from 'lucide-react';
import type { CalibrationConfig } from '../../../shared/types';

interface CalibrationSettingsProps {
  calibration: CalibrationConfig;
  setCalibration: (c: CalibrationConfig) => void;
}

export default function CalibrationSettings({
  calibration,
  setCalibration,
}: CalibrationSettingsProps) {
  return (
    <div className="border-t border-gray-700 pt-3">
      <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-400">
        <Settings className="w-4 h-4" />
        Calibration
      </div>

      <div className="mt-3 space-y-3">
        {/* Toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={calibration.enabled}
            onChange={(e) =>
              setCalibration({ ...calibration, enabled: e.target.checked })
            }
            className="w-4 h-4 rounded bg-gray-800 border-gray-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
          />
          <span className="text-xs text-gray-300">
            Convert pixels to real-world units
          </span>
        </label>

        {calibration.enabled && (
          <>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Pixels per {calibration.unit_label}
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={calibration.pixels_per_mm}
                onChange={(e) =>
                  setCalibration({
                    ...calibration,
                    pixels_per_mm: parseFloat(e.target.value) || 1,
                  })
                }
                className="w-full px-3 py-1.5 bg-gray-800 border border-gray-600 rounded text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Unit</label>
              <select
                value={calibration.unit_label}
                onChange={(e) =>
                  setCalibration({
                    ...calibration,
                    unit_label: e.target.value,
                  })
                }
                className="w-full px-3 py-1.5 bg-gray-800 border border-gray-600 rounded text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="mm">mm (millimeters)</option>
                <option value="um">um (micrometers)</option>
                <option value="in">in (inches)</option>
                <option value="cm">cm (centimeters)</option>
              </select>
            </div>
          </>
        )}

        {!calibration.enabled && (
          <p className="text-[10px] text-gray-600">
            Measurements will be reported in pixels.
          </p>
        )}
      </div>
    </div>
  );
}
