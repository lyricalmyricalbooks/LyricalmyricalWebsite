// Where you are in Studio (Studio 3.0 phase 1): Page › Section › Block for the current selection, under the top bar.
// Each earlier part is a button that steps back out to it.
type Crumb = { label: string; onSelect?: () => void };

export function StudioBreadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  if (crumbs.length < 2) return null;
  return (
    <nav className="studio-breadcrumb" aria-label="Current selection" data-studio-breadcrumb>
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return <span key={i}>
          {i > 0 && <span aria-hidden> › </span>}
          {last || !c.onSelect ? <span aria-current={last ? "location" : undefined}>{c.label}</span>
            : <button type="button" onClick={c.onSelect}>{c.label}</button>}
        </span>;
      })}
    </nav>
  );
}
