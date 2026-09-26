import * as faceapi from "face-api.js";

const modelPath = "/models/face-api";
let faceModelsPromise: Promise<void> | null = null;

export async function ensureFaceModels() {
  if (!faceModelsPromise) {
    faceModelsPromise = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(modelPath),
      faceapi.nets.faceLandmark68Net.loadFromUri(modelPath),
      faceapi.nets.faceRecognitionNet.loadFromUri(modelPath),
    ]).then(() => undefined);
  }

  return faceModelsPromise;
}

export async function faceDescriptorFromImage(src: string) {
  await ensureFaceModels();

  const image = await loadImage(src);
  const result = await faceapi
    .detectSingleFace(
      image,
      new faceapi.TinyFaceDetectorOptions({
        inputSize: 320,
        scoreThreshold: 0.45,
      })
    )
    .withFaceLandmarks()
    .withFaceDescriptor();

  return result?.descriptor;
}

export function faceDistance(left: Float32Array, right: Float32Array) {
  return faceapi.euclideanDistance(left, right);
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    if (/^https?:\/\//i.test(src)) {
      image.crossOrigin = "anonymous";
    }
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}
