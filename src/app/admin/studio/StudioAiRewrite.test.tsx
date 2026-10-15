// @vitest-environment jsdom
import { createElement as h, act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const askAi = vi.fn();
vi.mock("../aiWriter", async (orig) => ({ ...(await orig() as any), askAi: (...args: any[]) => askAi(...args) }));
const { StudioAiContext, StudioAiRewrite } = await import("./StudioAiRewrite");

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const host = document.createElement("div");
document.body.appendChild(host);
let root: ReturnType<typeof createRoot>;
afterEach(() => { act(() => root?.unmount()); host.replaceChildren(); askAi.mockReset(); });

const mount = (props: any, notify = vi.fn()) => {
  root = createRoot(host);
  act(() => root.render(h(StudioAiContext.Provider, { value: { notify } }, h(StudioAiRewrite, props))));
  return notify;
};
const click = (text: string) => act(() => { [...host.querySelectorAll("button")].find(b => b.textContent?.includes(text))!.click(); });
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

describe("Rewrite with AI", () => {
  it("rewrites the field once, as one change, and offers Undo", async () => {
    askAi.mockResolvedValue({ text: "A warmer hello, {name}" });
    const onChange = vi.fn();
    const notify = mount({ kind: "text", label: "Greeting", where: "Header", value: "Hello {name}", onChange });
    click("Rewrite with AI"); click("Friendlier");
    await settle();
    expect(askAi).toHaveBeenCalledWith("rewrite", expect.objectContaining({ text: "Hello {name}", how: "friendlier", label: "Greeting", where: "Header", format: "plain" }), expect.anything());
    expect(onChange).toHaveBeenCalledWith("A warmer hello, {name}");
    expect(notify).toHaveBeenCalledWith("ok", expect.stringContaining("Greeting"), { undo: true });
  });
  it("changes nothing when the answer drops a placeholder, and says why", async () => {
    askAi.mockResolvedValue({ text: "Hello there" });
    const onChange = vi.fn();
    const notify = mount({ kind: "text", label: "Greeting", value: "Hello {name}", onChange });
    click("Rewrite with AI"); click("Improve");
    await settle();
    expect(onChange).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("err", expect.stringMatching(/placeholder/), expect.anything());
  });
  it("keeps the owner's words when they typed while the AI was writing", async () => {
    let resolve!: (v: any) => void;
    askAi.mockReturnValue(new Promise(r => { resolve = r; }));
    const onChange = vi.fn();
    const notify = vi.fn();
    mount({ kind: "textarea", label: "Body", value: "First words", onChange }, notify);
    click("Rewrite with AI"); click("Shorter");
    act(() => root.render(h(StudioAiContext.Provider, { value: { notify } }, h(StudioAiRewrite, { kind: "textarea", label: "Body", value: "First words, edited", onChange }))));
    resolve({ text: "Short" });
    await settle();
    expect(onChange).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("err", expect.stringMatching(/changed while/));
  });
  it("points at the AI settings when no key is saved", async () => {
    const { AiWriteError } = await import("../aiWriter");
    askAi.mockRejectedValue(new AiWriteError("Add your free Google AI key first", true));
    const notify = mount({ kind: "text", label: "Title", value: "Hi", onChange: vi.fn() });
    click("Rewrite with AI"); click("Improve");
    await settle();
    expect(notify).toHaveBeenCalledWith("err", expect.stringMatching(/key/), { needsKey: true });
  });
  it("isn't offered for empty or connected fields, or outside Studio", () => {
    mount({ kind: "text", label: "Title", value: "", onChange: vi.fn() });
    expect(host.textContent).not.toContain("Rewrite");
    act(() => root.render(h(StudioAiRewrite, { kind: "text", label: "Title", value: "Hi", onChange: vi.fn() })));
    expect(host.textContent).not.toContain("Rewrite");
  });
});
