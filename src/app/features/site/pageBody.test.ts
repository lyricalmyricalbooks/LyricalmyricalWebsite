import { describe, expect, it } from "vitest";
import { dataUrlToFile, firstBodyImage, imageSources, pageBodyStats, pageDescription, pastedImageSources, replaceImageSources } from "./pageBody";

const BODY = `<h2>Open call</h2><p>Submissions are&nbsp;now closed.</p>
<p class="ql-align-center"><img src="https://cdn.example/a.webp" alt="Cover spread" width="50%"></p>
<p><img src="data:image/png;base64,iVBORw0KGgo="></p><iframe class="ql-video" src="https://www.youtube.com/embed/x"></iframe>`;

describe("pageBodyStats", () => {
  it("counts words, pictures, missing descriptions, pasted pictures and videos", () => {
    expect(pageBodyStats(BODY)).toEqual({ words: 6, minutes: 1, images: 2, missingAlt: 1, pasted: 1, videos: 1 });
  });
  it("is empty for an empty page", () => {
    expect(pageBodyStats("")).toEqual({ words: 0, minutes: 0, images: 0, missingAlt: 0, pasted: 0, videos: 0 });
    expect(pageBodyStats("<p><br></p>").words).toBe(0);
  });
  it("treats a blank alt as missing", () => {
    expect(pageBodyStats(`<img src="https://x/y.jpg" alt="  ">`).missingAlt).toBe(1);
  });
});

describe("picture sources", () => {
  it("lists distinct sources and picks the first uploaded one", () => {
    expect(imageSources(BODY)).toHaveLength(2);
    expect(firstBodyImage(BODY)).toBe("https://cdn.example/a.webp");
    expect(firstBodyImage(`<img src="data:image/png;base64,AA==">`)).toBe("");
    expect(pastedImageSources(BODY)).toEqual(["data:image/png;base64,iVBORw0KGgo="]);
  });
  it("replaces only the mapped sources and keeps other attributes", () => {
    const out = replaceImageSources(BODY, { "data:image/png;base64,iVBORw0KGgo=": "https://cdn.example/p.webp" });
    expect(out).toContain(`<img src="https://cdn.example/p.webp">`);
    expect(out).toContain(`alt="Cover spread" width="50%"`);
    expect(pastedImageSources(out)).toEqual([]);
  });
});

describe("dataUrlToFile", () => {
  it("turns a base64 picture into a File with a matching extension", () => {
    const file = dataUrlToFile("data:image/jpeg;base64,/9j/4AAQ", "pic")!;
    expect(file.name).toBe("pic.jpg");
    expect(file.type).toBe("image/jpeg");
    expect(file.size).toBe(6);
  });
  it("refuses anything that isn't a picture", () => {
    expect(dataUrlToFile("data:text/html,<b>x</b>")).toBeNull();
    expect(dataUrlToFile("https://x/y.png")).toBeNull();
  });
});

describe("pageDescription", () => {
  it("ends on a whole sentence instead of cutting a word or email address in half", () => {
    const body = "We accept refunds before the order has been shipped. Once the order has been shipped we cannot process refund. To initiate a refund, please contact us at lyricalmyricalbooks@example.com with your order number.";
    const out = pageDescription(body);
    expect(out).toBe("We accept refunds before the order has been shipped. Once the order has been shipped we cannot process refund.");
    expect(out.length).toBeLessThanOrEqual(160);
  });
  it("reads rich text and markdown marks as plain words", () => {
    expect(pageDescription("<h2>**Hello**</h2><p>Short &amp; sweet.</p>")).toBe("Hello Short & sweet.");
  });
  it("keeps going on a whole word when the first sentence alone is too short for Google", () => {
    const out = pageDescription("All orders are processed within 1–3 business days. Domestic shipping within Canada is estimated at 3–7 business days, approximately 5-7 business days for orders to the United States.");
    expect(out.startsWith("All orders are processed within 1–3 business days. Domestic shipping")).toBe(true);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(160);
  });
  it("cuts one long sentence on a word with an ellipsis", () => {
    const out = pageDescription("word ".repeat(60));
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(160);
  });
});
