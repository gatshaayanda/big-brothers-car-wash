import { createUploadthing, type FileRouter } from "uploadthing/next";

const f = createUploadthing();

// Match the proven Admin Hub / Sparkle Legacy UploadThing setup.
// Keep the client-side validation in request-form.tsx in sync with these limits.
export const ourFileRouter = {
  fileUploader: f({
    image: { maxFileSize: "4MB", maxFileCount: 1 },
    video: { maxFileSize: "16MB", maxFileCount: 1 },
    pdf: { maxFileSize: "4MB", maxFileCount: 1 },
  }).onUploadComplete(async ({ file }) => {
    console.info("[Iteration 13] account/service attachment uploaded", {
      name: file.name,
      size: file.size,
      type: file.type,
      urlAvailable: Boolean(file.url || file.ufsUrl),
    });
  }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
