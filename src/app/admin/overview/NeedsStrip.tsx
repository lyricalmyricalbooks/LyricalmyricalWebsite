// The ink "Needs you" strip under the Overview title (Pressroom refreshed). Model: needsStrip.ts.
import { openOrdersQueue } from "../Orders";
import { needsAction, needsCalm, needsItems, type NeedsInput, type NeedsLink } from "./needsStrip";

export function NeedsStrip({ input, setActiveTab }: { input: NeedsInput; setActiveTab?: (tab: string) => void }) {
  const go = (to: NeedsLink) => {
    if (to.queue) openOrdersQueue(to.queue);
    setActiveTab?.(to.tab);
  };
  const items = needsItems(input);
  const action = needsAction(input);
  return (
    <section className="rp-needs" aria-labelledby="rp-needs-title">
      <h2 className="rp-needs-title" id="rp-needs-title">Needs you</h2>
      {items.length > 0 ? (
        <ul className="rp-needs-list">
          {items.map(item => (
            <li key={item.id}>
              <button type="button" className="rp-needs-link" data-warn={item.warn || undefined} onClick={() => go(item.to)}>
                {item.warn && <span aria-hidden="true">⚠ </span>}{item.text}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rp-needs-calm" role="status">{needsCalm(input)}</p>
      )}
      {items.length > 0 && input.failed && <p className="rp-needs-calm">Some counts could not be loaded.</p>}
      {action && <button type="button" className="rp-needs-action" onClick={() => go(action.to)}>{action.label}</button>}
    </section>
  );
}
