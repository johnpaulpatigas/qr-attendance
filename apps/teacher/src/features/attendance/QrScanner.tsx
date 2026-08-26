import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats, CameraDevice } from 'html5-qrcode';
import { CameraOff, AlertCircle, Keyboard } from 'lucide-react';
import { Button, Input } from '@qr-attendance/ui';
import { parseQrPayload } from '@qr-attendance/validation';

export interface QrScannerProps {
  isActive: boolean;
  onScan: (decodedText: string) => Promise<void> | void;
  disabled?: boolean;
}

export const QrScanner: React.FC<QrScannerProps> = ({ isActive, onScan, disabled = false }) => {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const isProcessingRef = useRef(false);
  const lastScannedTimeRef = useRef<number>(0);
  const lastScannedPayloadRef = useRef<string>('');
  const elementId = 'qr-camera-viewport';

  const handleDecoded = useCallback((decodedText: string) => {
    if (isProcessingRef.current) return;

    const now = Date.now();
    // Debounce identical QR code payload for 5 seconds to prevent re-scan loops
    if (decodedText === lastScannedPayloadRef.current && now - lastScannedTimeRef.current < 5000) {
      return;
    }

    lastScannedPayloadRef.current = decodedText;
    lastScannedTimeRef.current = now;

    // Validate QR payload format
    const parsed = parseQrPayload(decodedText);
    if (!parsed.success) {
      return;
    }

    isProcessingRef.current = true;
    Promise.resolve(onScanRef.current(decodedText)).finally(() => {
      setTimeout(() => {
        isProcessingRef.current = false;
      }, 1200);
    });
  }, []);

  // Helper to accurately pick the Main 1x back sensor (skipping 0.5x ultra-wide)
  const getMain1xCameraId = (cameras: CameraDevice[]): string => {
    if (!cameras || cameras.length === 0) return '';

    const backCameras = cameras.filter((c) => {
      const l = c.label.toLowerCase();
      return !l.includes('front') && !l.includes('user') && !l.includes('selfie');
    });

    if (backCameras.length === 0) return cameras[0].id;
    if (backCameras.length === 1) return backCameras[0].id;

    const explicitMain = backCameras.find((c) => {
      const l = c.label.toLowerCase();
      return (
        l.includes('main') || l.includes('primary') || l.includes('standard') || l.includes('1x')
      );
    });
    if (explicitMain) return explicitMain.id;

    const nonUltraBack = backCameras.filter((c) => {
      const l = c.label.toLowerCase();
      return (
        !l.includes('ultra') &&
        !l.includes('0.5') &&
        !l.includes('wide-angle') &&
        !l.includes('macro')
      );
    });

    if (nonUltraBack.length === 1) return nonUltraBack[0].id;

    const cam2 = backCameras.find((c) => c.label.toLowerCase().includes('camera2 2'));
    if (cam2) return cam2.id;

    const cam1Back = backCameras.find(
      (c) => c.label.toLowerCase().includes('camera2 1') && !c.label.toLowerCase().includes('front')
    );
    if (cam1Back) return cam1Back.id;

    if (nonUltraBack.length > 0) return nonUltraBack[nonUltraBack.length - 1].id;

    return backCameras[1]?.id || backCameras[0].id;
  };

  const enforce1xZoom = async () => {
    try {
      const videoEl = document.querySelector(`#${elementId} video`) as HTMLVideoElement;
      if (videoEl && videoEl.srcObject) {
        const stream = videoEl.srcObject as MediaStream;
        const track = stream.getVideoTracks()[0];
        if (track && typeof track.getCapabilities === 'function') {
          interface ZoomCapabilities extends MediaTrackCapabilities {
            zoom?: { min?: number; max?: number };
          }
          const caps = track.getCapabilities() as ZoomCapabilities;
          if (caps && caps.zoom) {
            const min = caps.zoom.min || 1;
            const targetZoom = Math.max(1.0, min);

            await track.applyConstraints({
              advanced: [{ zoom: targetZoom } as MediaTrackConstraintSet],
            });
          }
        }
      }
    } catch {
      // Browser constraint not supported
    }
  };

  useEffect(() => {
    if (!isActive) {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current
          .stop()
          .then(() => scannerRef.current?.clear())
          .catch((err) => console.error('Error stopping QR scanner:', err));
      }
      return;
    }

    setCameraError(null);

    const html5QrCode = new Html5Qrcode(elementId, {
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      verbose: false,
    });
    scannerRef.current = html5QrCode;

    const qrConfig = {
      fps: 15,
      qrbox: { width: 260, height: 260 },
      aspectRatio: 1.0,
    };

    Html5Qrcode.getCameras()
      .then((availableCameras) => {
        if (availableCameras && availableCameras.length > 0) {
          const mainCamId = getMain1xCameraId(availableCameras);
          return html5QrCode.start(mainCamId, qrConfig, handleDecoded, undefined);
        } else {
          return html5QrCode.start(
            { facingMode: 'environment' },
            qrConfig,
            handleDecoded,
            undefined
          );
        }
      })
      .then(() => {
        setHasPermission(true);
        setTimeout(() => {
          enforce1xZoom();
        }, 300);
      })
      .catch((err) => {
        console.warn('Initial camera start failed, retrying with environment mode...', err);
        html5QrCode
          .start({ facingMode: 'environment' }, qrConfig, handleDecoded, undefined)
          .then(() => {
            setHasPermission(true);
            setTimeout(() => {
              enforce1xZoom();
            }, 300);
          })
          .catch((secondErr) => {
            console.error('Camera stream error:', secondErr);
            setHasPermission(false);
            setCameraError(
              typeof secondErr === 'string'
                ? secondErr
                : 'Camera permission denied or camera unavailable.'
            );
          });
      });

    return () => {
      if (html5QrCode.isScanning) {
        html5QrCode
          .stop()
          .then(() => html5QrCode.clear())
          .catch(() => {});
      }
    };
  }, [isActive]); // Strictly depends on isActive only to prevent camera reload cycles

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    onScanRef.current(manualInput.trim());
    setManualInput('');
  };

  return (
    <div className="flex w-full flex-col items-center justify-center">
      {/* Viewport Frame */}
      <div className="relative flex aspect-square w-full max-w-md items-center justify-center overflow-hidden rounded-2xl border-2 border-slate-800 bg-slate-950 shadow-2xl">
        {/* HTML5 QR Container */}
        <div id={elementId} className="h-full w-full object-cover" />

        {/* Viewfinder Target Graphic (when scanning) */}
        {isActive && hasPermission && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-64 w-64 rounded-2xl border-2 border-blue-400/80">
              {/* Corner Accents */}
              <div className="absolute -top-1 -left-1 h-6 w-6 rounded-tl-lg border-t-4 border-l-4 border-blue-500" />
              <div className="absolute -top-1 -right-1 h-6 w-6 rounded-tr-lg border-t-4 border-r-4 border-blue-500" />
              <div className="absolute -bottom-1 -left-1 h-6 w-6 rounded-bl-lg border-b-4 border-l-4 border-blue-500" />
              <div className="absolute -right-1 -bottom-1 h-6 w-6 rounded-br-lg border-r-4 border-b-4 border-blue-500" />
              {/* Laser animation */}
              <div className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-gradient-to-r from-transparent via-blue-400 to-transparent shadow-[0_0_8px_#60a5fa]" />
            </div>
          </div>
        )}

        {/* Idle State Screen */}
        {!isActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 p-6 text-center text-white backdrop-blur-xs">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800 text-slate-400">
              <CameraOff className="h-8 w-8" />
            </div>
            <h4 className="text-base font-semibold text-slate-200">Scanner Inactive</h4>
            <p className="mt-1 max-w-xs text-xs text-slate-400">
              Select class session and click start camera to begin taking attendance.
            </p>
          </div>
        )}

        {/* Camera Permission / Error Screen */}
        {isActive && hasPermission === false && (
          <div className="absolute inset-0 flex flex-col items-center justify-center space-y-3 bg-slate-900/95 p-6 text-center text-white">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/20 text-rose-400">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h4 className="text-sm font-semibold text-rose-200">Camera Unavailable</h4>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-400">{cameraError}</p>

            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
                onClick={() => setShowManualInput(true)}
                leftIcon={<Keyboard className="h-4 w-4" />}
              >
                Use Manual Entry
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Footer Controls Bar */}
      <div className="mt-4 w-full max-w-md">
        {showManualInput ? (
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <Input
              placeholder="Paste or type QR payload / LRN"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              disabled={disabled}
              className="font-mono text-xs"
              autoFocus
            />
            <Button type="submit" size="sm" variant="primary" disabled={disabled}>
              Submit
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setShowManualInput(false)}
            >
              Cancel
            </Button>
          </form>
        ) : (
          <div className="flex items-center justify-end px-2 text-xs text-slate-500">
            <button
              type="button"
              onClick={() => setShowManualInput(true)}
              className="flex items-center gap-1 font-medium text-blue-600 hover:underline"
            >
              <Keyboard className="h-3.5 w-3.5" /> Manual Entry
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
