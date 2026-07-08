/// <reference types="vite/client" />

interface Window {
  BarcodeDetector?: new (options?: { formats?: string[] }) => {
    detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
  };
}
