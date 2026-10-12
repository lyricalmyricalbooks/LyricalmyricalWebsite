import { useId } from "react";
import { getCopyTemplate, type CopyField } from "../../features/site/storeCopy";

/** Missing copy inherits its default; a deliberately empty string remains empty. */
export function StudioCopyField({ field, design, onChange }: {
  field: CopyField; design: any; onChange: (value: string | undefined) => void;
}) {
  const id = useId();
  const override = design.copy?.[field.key];
  const customized = typeof override === "string";
  const Tag = field.multiline ? "textarea" : "input";
  return <div data-copy-key={field.key} className="studio-copy-field">
    <label htmlFor={id}>{field.label}</label>
    <Tag id={id} value={customized ? override : getCopyTemplate(design, field.key)} rows={field.multiline ? 3 : undefined}
      aria-describedby={`${id}-status`} onChange={e => onChange(e.target.value)} />
    <div className="studio-field-status">
      <small id={`${id}-status`}>{customized ? override === "" ? "Intentionally blank" : "Custom text" : "Using default"}</small>
      {customized && <button type="button" className="studio-reset" onClick={() => onChange(undefined)} aria-label={`Reset to default: ${field.label}`}>Reset to default</button>}
    </div>
    {field.hint && <p className="studio-hint">{field.hint}</p>}
  </div>;
}
