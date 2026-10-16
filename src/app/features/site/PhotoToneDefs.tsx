// The SVG filter behind a photo's highlights, shadows, warmth, tint and sharpen edits (features/site/photoFraming.ts
// `photoTone`). Render it beside every photo that gets `framingStyle` / `motionFraming` / `adjustStyle`: the photo's
// CSS filter points at this element by id. It takes no room (absolute, 0×0) and renders nothing for photos without
// those edits. Photos with the same edits share an id, and identical copies on one page are harmless.
import { photoAdjust, photoTone } from "./photoFraming";

export function PhotoToneDefs({ photo }: { photo: unknown }) {
  const tone = photoTone(photoAdjust(photo));
  if (!tone) return null;
  return (
    <svg aria-hidden="true" focusable="false" width="0" height="0" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden", pointerEvents: "none" }}>
      <filter id={tone.id} colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
        {tone.matrix && <feColorMatrix type="matrix" values={tone.matrix} />}
        {tone.table && (
          <feComponentTransfer>
            <feFuncR type="table" tableValues={tone.table} />
            <feFuncG type="table" tableValues={tone.table} />
            <feFuncB type="table" tableValues={tone.table} />
          </feComponentTransfer>
        )}
        {tone.kernel && <feConvolveMatrix order="3" kernelMatrix={tone.kernel} preserveAlpha="true" edgeMode="duplicate" />}
      </filter>
    </svg>
  );
}
