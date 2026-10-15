import { useId } from "react";
import { getCopyTemplate, shopCopyFallback, type CopyField } from "../../features/site/storeCopy";

/**
 * The {words} in a default that the shop fills in (an order count, an email…). Listed under the box
 * when the field's own hint doesn't already explain them, so they aren't deleted or misspelt.
 */
export function copyPlaceholders(field: CopyField): string[] {
  const found = [...new Set((String(field.default ?? "").match(/\{[a-zA-Z_]+\}/g) || []))];
  return found.filter(token => !(field.hint || "").includes(token));
}

/** Missing copy inherits its default; a deliberately empty string remains empty. */
export function StudioCopyField({ field, design, settings, onChange }: {
  field: CopyField; design: any; onChange: (value: string | undefined) => void;
  /** Published shop settings, for defaults that come from the shop's own text (`shopCopyFallback`). */
  settings?: any;
}) {
  const id = useId();
  const override = design.copy?.[field.key];
  const customized = typeof override === "string";
  const Tag = field.multiline ? "textarea" : "input";
  return <div data-copy-key={field.key} className="studio-copy-field">
    <label htmlFor={id}>{field.label}</label>
    <Tag id={id} value={customized ? override : shopCopyFallback(settings, field.key) ?? getCopyTemplate(design, field.key)} rows={field.multiline ? 3 : undefined}
      aria-describedby={`${id}-status`} onChange={e => onChange(e.target.value)} />
    <div className="studio-field-status">
      <small id={`${id}-status`}>{customized ? override === "" ? "Intentionally blank" : "Custom text" : "Using default"}</small>
      {customized && <button type="button" className="studio-reset" onClick={() => onChange(undefined)} aria-label={`Reset to default: ${field.label}`}>Reset to default</button>}
    </div>
    {field.hint && <p className="studio-hint">{field.hint}</p>}
    {copyPlaceholders(field).length > 0 && <p className="studio-hint" data-copy-tokens>
      Words in {"{ }"} are filled in by the shop; keep them as they are: {copyPlaceholders(field).join(", ")}
    </p>}
  </div>;
}
