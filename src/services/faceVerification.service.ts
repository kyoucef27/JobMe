export interface FaceVerificationResult {
  match: boolean;
  similarity: number;
}

const FACE_SERVICE_URL = "http://localhost:8000/compare";

export const verifyFaceWithInsightService = async (
  idImage: Express.Multer.File,
  selfie: Express.Multer.File
): Promise<FaceVerificationResult> => {
  const formData = new FormData();
  const idImageBytes = Uint8Array.from(idImage.buffer);
  const selfieBytes = Uint8Array.from(selfie.buffer);

  formData.append(
    "id_image",
    new Blob([idImageBytes], {
      type: idImage.mimetype || "application/octet-stream",
    }),
    idImage.originalname || "id-image.jpg"
  );

  formData.append(
    "selfie",
    new Blob([selfieBytes], {
      type: selfie.mimetype || "application/octet-stream",
    }),
    selfie.originalname || "selfie.jpg"
  );

  const response = await fetch(FACE_SERVICE_URL, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Face service request failed: ${response.status} ${errText}`);
  }

  const data = (await response.json()) as Partial<FaceVerificationResult>;

  if (typeof data.similarity !== "number" || typeof data.match !== "boolean") {
    throw new Error("Invalid response from face verification service");
  }

  return {
    match: data.match,
    similarity: data.similarity,
  };
};
