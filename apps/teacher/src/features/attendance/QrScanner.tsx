import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, CameraOff, AlertCircle, Keyboard } from 'lucide-react';
import { Button, Input } from '@qr-attendance/ui';
import { parseQrPayload } from '@qr-attendance/validation';

export interface QrScannerProps {
  isActive: boolean;
  onScan: (decodedText: string) => void;
  disabled?: boolean;
}

export const QrScanner: React.FC<QrScannerProps> = ({
  isActive,
  onScan,
  disabled = false,
}) => {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScannedTimeRef = useRef<number>(0);
  const lastScannedPayloadRef = useRef<string>('');
  const elementId = 'qr-camera-viewport';

  useEffect(() => {
    if (!isActive) {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current
          .stop()
          .then(() => {
            scannerRef.current?.clear();
          })
          .catch((err) => {
            console.error('Error stopping QR scanner:', err);
          });
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
      fps: 10,
      qrbox: { width: 260, height: 260 },
      aspectRatio: 1.0,
    };

    html5QrCode
      .start(
        { facingMode: 'environment' },
        qrConfig,
        (decodedText) => {
          const now = Date.now();
          // Debounce same QR code scanned within 2 seconds
          if (
            decodedText === lastScannedPayloadRef.current &&
            now - lastScannedTimeRef.current < 2000
          ) {
            return;
          }

          lastScannedPayloadRef.current = decodedText;
          lastScannedTimeRef.current = now;

          // Pre-validate QR payload format
          const parsed = parseQrPayload(decodedText);
          if (parsed.success) {
            onScan(decodedText);
          } else {
            console.warn('Scanned payload failed format validation:', decodedText);
            onScan(decodedText);
          }
        },
        undefined
      )
      .then(() => {
        setHasPermission(true);
      })
      .catch((err) => {
        console.error('Unable to start camera:', err);
        setHasPermission(false);
        setCameraError(
          typeof err === 'string'
            ? err
            : 'Camera access denied or camera not found on this device.'
        );
      });

    return () => {
      if (html5QrCode.isScanning) {
        html5QrCode
          .stop()
          .then(() => html5QrCode.clear())
          .catch(() => {});
      }
    };
  }, [isActive, onScan]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    onScan(manualInput.trim());
    setManualInput('');
  };

  return (
    <div className="flex flex-col items-center justify-center w-full">
      {/* Viewport Frame */}
      <div className="relative w-full max-w-md aspect-square rounded-2xl overflow-hidden bg-slate-950 border-2 border-slate-800 shadow-2xl flex items-center justify-center">
        {/* HTML5 QR Container */}
        <div id={elementId} className="w-full h-full object-cover" />

        {/* Viewfinder Target Graphic (when scanning) */}
        {isActive && hasPermission && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative w-64 h-64 border-2 border-blue-400/80 rounded-2xl">
              {/* Corner Accents */}
              <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-blue-500 rounded-tl-lg" />
              <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-blue-500 rounded-tr-lg" />
              <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-blue-500 rounded-bl-lg" />
              <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-blue-500 rounded-br-lg" />
              {/* Laser animation */}
              <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-blue-400 to-transparent animate-pulse shadow-[0_0_8px_#60a5fa]" />
            </div>
          </div>
        )}

        {/* Idle State Screen */}
        {!isActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-white bg-slate-900/90 backdrop-blur-xs">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800 text-slate-400 mb-4">
              <CameraOff className="h-8 w-8" />
            </div>
            <h4 className="text-base font-semibold text-slate-200">Scanner Inactive</h4>
            <p className="mt-1 max-w-xs text-xs text-slate-400">
              Select class session and activate camera to start taking attendance.
            </p>
          </div>
        )}

        {/* Camera Permission / Error Screen */}
        {isActive && hasPermission === false && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-white bg-slate-900/95">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/20 text-rose-400 mb-3">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h4 className="text-sm font-semibold text-rose-200">Camera Unavailable</h4>
            <p className="mt-1 text-xs text-slate-400 max-w-xs">{cameraError}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4 border-slate-700 text-slate-300 hover:bg-slate-800"
              onClick={() => setShowManualInput(true)}
              leftIcon={<Keyboard className="h-4 w-4" />}
            >
              Use Manual Code Input
            </Button>
          </div>
        )}
      </div>

      {/* Manual Input Toggle / Quick Simulation */}
      <div className="mt-4 w-full max-w-md">
        {showManualInput ? (
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <Input
              placeholder="e.g. ATTENDANCE:7f9a1b2c-3d4e..."
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              disabled={disabled}
              className="text-xs font-mono"
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
          <div className="flex items-center justify-between text-xs text-slate-500 px-2">
            <span className="flex items-center gap-1">
              <Camera className="h-3.5 w-3.5 text-blue-500" />
              Environment Camera (Back)
            </span>
            <button
              type="button"
              onClick={() => setShowManualInput(true)}
              className="text-blue-600 hover:underline flex items-center gap-1"
            >
              <Keyboard className="h-3 w-3" /> Manual Entry
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
