"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SECONDARY_BUTTON } from "./parts";

/*
 * An optional scanner inside the page. Nobody needs it: a phone's own camera
 * app reads the square code and opens this site with the record filled in.
 * It is offered, as a secondary button, only where the browser has a barcode
 * detector and a camera.
 */

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;

function barcodeDetector(): BarcodeDetectorCtor | null {
  const w = window as unknown as { BarcodeDetector?: BarcodeDetectorCtor };
  return typeof w.BarcodeDetector === "function" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
    ? w.BarcodeDetector
    : null;
}

const never = () => () => {};

/** True once the page runs in a browser that can scan. Always false on the server. */
export function useCanScan(): boolean {
  return useSyncExternalStore(
    never,
    () => barcodeDetector() !== null,
    () => false,
  );
}

/**
 * Reads a QR code with the browser's own barcode detector and the back camera.
 * The camera stops as soon as a code is read or the scanner is closed. Nothing
 * from the camera is sent anywhere.
 */
export function QrScanner({
  onText,
  onClose,
}: {
  onText: (text: string) => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const Detector = barcodeDetector();
    const element = video.current;
    if (!Detector || !element) return;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let stopped = false;
    const detector = new Detector({ formats: ["qr_code"] });

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (stopped || !element) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        element.srcObject = stream;
        await element.play();
        const tick = async () => {
          if (stopped || !element) return;
          try {
            const codes = await detector.detect(element);
            const text = codes[0]?.rawValue;
            if (text) {
              onText(text);
              return;
            }
          } catch {
            // Keep trying: a single frame can fail to decode.
          }
          timer = window.setTimeout(tick, 250);
        };
        void tick();
      } catch {
        setProblem(
          "The camera could not be opened. Use your phone's own camera app, or paste a receipt instead.",
        );
      }
    }
    void start();

    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onText]);

  return (
    <div className="mt-3 rounded-xl border border-line bg-surface p-3" aria-live="polite">
      <p className="text-sm font-semibold">
        Point the camera at the square code on the record.
      </p>
      {problem ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {problem}
        </p>
      ) : (
        <video
          ref={video}
          muted
          playsInline
          aria-label="Camera view for scanning a square code"
          className="mt-2 aspect-[4/3] w-full rounded-lg bg-sunken object-cover"
        />
      )}
      <button type="button" onClick={onClose} className={`${SECONDARY_BUTTON} mt-3`}>
        Stop the camera
      </button>
    </div>
  );
}
