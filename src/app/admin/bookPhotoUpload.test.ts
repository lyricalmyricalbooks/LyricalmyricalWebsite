import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminApi } from "./api";
import { mediaApi } from "./mediaApi";
import { uploadBookPhoto } from "./bookPhotoUpload";

const original = { uploadFile: adminApi.uploadFile, removeFiles: mediaApi.removeFiles };
let uploads: string[], removed: string[][];
beforeEach(() => {
  uploads = []; removed = [];
  (adminApi as any).uploadFile = async (_file: File, path: string) => { uploads.push(path); return `https://cdn.test/${path}`; };
  mediaApi.removeFiles = async (paths: string[]) => { removed.push(paths); };
});
afterEach(() => {
  (adminApi as any).uploadFile = original.uploadFile;
  mediaApi.removeFiles = original.removeFiles;
  vi.unstubAllGlobals();
});

function fakeBrowser(width: number, height: number) {
  vi.stubGlobal("createImageBitmap", async () => ({ width, height, close() {} }));
  vi.stubGlobal("document", {
    createElement: () => {
      const canvas: any = { getContext: () => ({ drawImage() {} }), toBlob: (done: (b: Blob) => void) => done(new Blob(["x"], { type: "image/webp" })) };
      return canvas;
    },
  });
}

describe("uploadBookPhoto", () => {
  it("stores 480–2400 px copies and keeps the largest as the photo's URL", async () => {
    fakeBrowser(4000, 6000);
    const photo = await uploadBookPhoto(new File(["x"], "My Cover.jpg", { type: "image/jpeg" }), 1700000000000);
    expect(uploads).toEqual([480, 960, 1600, 2400].map(w => `products/1700000000000-My-Cover-${w}w.webp`));
    expect(photo.url).toBe("https://cdn.test/products/1700000000000-My-Cover-2400w.webp");
    expect(photo.srcset?.map(s => s.w)).toEqual([480, 960, 1600, 2400]);
    expect([photo.width, photo.height]).toEqual([4000, 6000]);
  });

  it("uploads GIFs as one plain file", async () => {
    const photo = await uploadBookPhoto(new File(["x"], "anim.gif", { type: "image/gif" }), 5);
    expect(uploads).toEqual(["products/5-anim.gif"]);
    expect(photo).toEqual({ url: "https://cdn.test/products/5-anim.gif" });
  });

  it("removes copies already stored when one upload fails", async () => {
    fakeBrowser(1200, 1600);
    let n = 0;
    (adminApi as any).uploadFile = async (_f: File, path: string) => { if (++n === 2) throw new Error("offline"); uploads.push(path); return path; };
    await expect(uploadBookPhoto(new File(["x"], "c.png", { type: "image/png" }), 9)).rejects.toThrow("offline");
    expect(removed).toEqual([["products/9-c-480w.webp"]]);
  });
});
