// Books › edit › Images › Crop & position. Drag the photo (or use the arrow keys) to choose what stays in view,
// zoom to crop its edges, and see it in the shop's own frame shapes. Nothing is cut from the uploaded file:
// the choice is saved on the photo as `framing` and drawn by the shop (features/site/photoFraming.ts).
import { useEffect, useRef, useState } from "react";
import { Dialog, PrimaryButton, SecondaryButton } from "./riso/components";
import { DEFAULT_FRAMING, MAX_ZOOM, MIN_ZOOM, dragFraming, framingStyle, framingToSave, photoFraming, type PhotoFraming } from "../features/site/photoFraming";
import { shopFrameShapes } from "./photoCrop";

export function PhotoCropDialog({ photo, label, design, onSave, onClose }: {
  photo: { url: string; altText?: string; framing?: unknown } | null;
  label: string;
  design: unknown;
  onSave: (framing: PhotoFraming | undefined) => void;
  onClose: () => void;
}) {
  const [framing, setFraming] = useState<PhotoFraming>(DEFAULT_FRAMING);
  const shapes = shopFrameShapes(design);
  const [shapeId, setShapeId] = useState(shapes[0].id);
  const shape = shapes.find((s) => s.id === shapeId) || shapes[0];
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; start: PhotoFraming; id: number } | null>(null);

  useEffect(() => { if (photo) setFraming(photoFraming(photo) || DEFAULT_FRAMING); }, [photo]);
  if (!photo) return null;

  const shown = { framing };
  const set = (next: Partial<PhotoFraming>) => setFraming((f) => ({ ...f, ...next }));
  const nudge = (dx: number, dy: number) => setFraming((f) => ({
    ...f,
    x: Math.min(100, Math.max(0, Math.round((f.x + dx) * 10) / 10)),
    y: Math.min(100, Math.max(0, Math.round((f.y + dy) * 10) / 10)),
  }));

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={`Crop & position · ${label}`}
      description="Drag the photo to choose what stays in view, and zoom in to crop its edges. Your uploaded file is never changed, so you can come back and reset it any time."
      footerStart={<SecondaryButton size="sm" onClick={() => setFraming(DEFAULT_FRAMING)}>Reset</SecondaryButton>}
      footer={<>
        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        <PrimaryButton onClick={() => { onSave(framingToSave(framing)); onClose(); }}>Apply</PrimaryButton>
      </>}
    >
      <div className="be-crop">
        <div className="be-crop-main">
          <div className="be-crop-shapes" role="radiogroup" aria-label="Frame shape">
            {shapes.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={s.id === shape.id}
                className={`rp-btn rp-btn-sm ${s.id === shape.id ? "rp-btn-primary" : "rp-btn-secondary"}`}
                onClick={() => setShapeId(s.id)}>{s.label}</button>
            ))}
          </div>
          <div
            ref={stage}
            className="be-crop-stage"
            // Never taller than 60% of the window: the width shrinks to keep the frame's shape.
            style={{ aspectRatio: shape.aspect, width: `min(100%, calc(60vh * (${shape.aspect})))` }}
            tabIndex={0}
            role="application"
            aria-label={`Photo position: ${Math.round(framing.x)}% across, ${Math.round(framing.y)}% down. Drag, or use the arrow keys (Shift for bigger steps).`}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.currentTarget.setPointerCapture?.(e.pointerId);
              drag.current = { x: e.clientX, y: e.clientY, start: framing, id: e.pointerId };
            }}
            onPointerMove={(e) => {
              const d = drag.current, el = stage.current;
              if (!d || !el || e.pointerId !== d.id) return;
              setFraming(dragFraming(d.start, e.clientX - d.x, e.clientY - d.y, el.clientWidth, el.clientHeight));
            }}
            onPointerUp={() => { drag.current = null; }}
            onPointerCancel={() => { drag.current = null; }}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 10 : 2;
              const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
              const m = moves[e.key];
              if (m) { e.preventDefault(); nudge(m[0], m[1]); }
              else if (e.key === "+" || e.key === "=") { e.preventDefault(); set({ zoom: Math.min(MAX_ZOOM, Math.round((framing.zoom + 0.1) * 100) / 100) }); }
              else if (e.key === "-") { e.preventDefault(); set({ zoom: Math.max(MIN_ZOOM, Math.round((framing.zoom - 0.1) * 100) / 100) }); }
            }}
          >
            <img src={photo.url} alt={photo.altText || ""} draggable={false} style={framingStyle(shown)} />
            <span className="be-crop-grid" aria-hidden="true" />
          </div>
          <p className="be-note">{shape.note}. The shape follows your Studio settings for each place.</p>
        </div>
        <div className="be-crop-side">
          <label className="be-crop-field">
            <span>Zoom · {Math.round(framing.zoom * 100)}%</span>
            <input type="range" min={MIN_ZOOM} max={MAX_ZOOM} step={0.01} value={framing.zoom} onChange={(e) => set({ zoom: Number(e.target.value) })} />
          </label>
          <label className="be-crop-field">
            <span>Left ↔ right · {Math.round(framing.x)}%</span>
            <input type="range" min={0} max={100} step={0.5} value={framing.x} onChange={(e) => set({ x: Number(e.target.value) })} />
          </label>
          <label className="be-crop-field">
            <span>Top ↕ bottom · {Math.round(framing.y)}%</span>
            <input type="range" min={0} max={100} step={0.5} value={framing.y} onChange={(e) => set({ y: Number(e.target.value) })} />
          </label>
          <div className="be-crop-previews" aria-label="How it looks in each place">
            {shapes.map((s) => (
              <figure key={s.id}>
                <div className="be-crop-thumb" style={{ aspectRatio: s.aspect }}>
                  <img src={photo.url} alt="" draggable={false} style={framingStyle(shown)} />
                </div>
                <figcaption>{s.label}</figcaption>
              </figure>
            ))}
          </div>
          <p className="be-note">The enlarged photo viewer on the book page always shows the whole photo.</p>
        </div>
      </div>
    </Dialog>
  );
}
