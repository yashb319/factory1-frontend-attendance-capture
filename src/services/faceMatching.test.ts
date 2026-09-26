import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("face-api.js", () => ({
  nets: {
    tinyFaceDetector: { loadFromUri: vi.fn().mockResolvedValue(undefined) },
    faceLandmark68Net: { loadFromUri: vi.fn().mockResolvedValue(undefined) },
    faceRecognitionNet: { loadFromUri: vi.fn().mockResolvedValue(undefined) },
  },
  TinyFaceDetectorOptions: class {},
  detectSingleFace: vi.fn(() => ({
    withFaceLandmarks: () => ({
      withFaceDescriptor: () => Promise.resolve(undefined),
    }),
  })),
  euclideanDistance: vi.fn(),
}));

import { faceDescriptorFromImage } from "./faceMatching";

type AssignedImage = {
  crossOrigin: string | null;
  crossOriginWhenAssigned: string | null;
};

const assignedImages: AssignedImage[] = [];

class FakeImage {
  crossOrigin: string | null = null;
  crossOriginWhenAssigned: string | null = null;
  onload: (() => void) | null = null;
  onerror: OnErrorEventHandler | null = null;

  set src(_value: string) {
    this.crossOriginWhenAssigned = this.crossOrigin;
    assignedImages.push(this);
    this.onload?.();
  }
}

describe("faceDescriptorFromImage", () => {
  beforeEach(() => {
    assignedImages.length = 0;
    vi.stubGlobal("Image", FakeImage);
  });

  it("requests HTTP(S) employee photos with anonymous CORS before setting src", async () => {
    await faceDescriptorFromImage("https://objects.example.com/photo.jpg?signature=abc");

    expect(assignedImages[0]?.crossOriginWhenAssigned).toBe("anonymous");
  });

  it("leaves Base64 camera and legacy employee photos unchanged", async () => {
    await faceDescriptorFromImage("data:image/jpeg;base64,ZmFrZQ==");

    expect(assignedImages[0]?.crossOriginWhenAssigned).toBeNull();
  });
});
