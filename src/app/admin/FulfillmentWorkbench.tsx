import React from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import toast from "react-hot-toast";
import {
  addressIssues,
  addressKey,
  packingKey,
  physicalItems,
  isDigitalItem,
  queueOf,
  daysInTransit,
  isOverdueInTransit,
  packingInfo,
  preorderShipDate,
  blockingProblem,
  terminal,
} from "./fulfillment";
import { labelVoidable, labelRefunds, refundWords } from "./labelRefunds";
import { getTrackingUrl } from "../lib/tracking";
import { formatReleaseDate } from "../features/site/preorder";
import { addOnLines, bundlePartsText, giftCardLineText, isFreeGiftLine, isGiftCardLine, linePricing, cad } from "./orderLines";
import { orderProgress } from "./orderPage";
import {
  Checkbox,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
} from "./riso/components";
import "./fulfillment.css";
import "./orderPage.css";

type Props = {
  order: any;
  /** Catalog records by book id, for the current cover and shelf location. */
  books?: Record<string, any>;
  checked: Set<number>;
  busy: boolean;
  onCheck: (index: number) => void;
  onReview: () => void;
  onCorrect: () => void;
  onPack: () => void;
  /** Opens a label purchase elsewhere. Unused when `labelStep` is given. */
  onLabel?: () => void;
  /** The order page: the parcel, rates and Buy label, drawn inside the next-step card instead of the Buy label button. */
  labelStep?: React.ReactNode;
  onDispatch: () => void;
  onEditTracking?: () => void;
  onDeliveryStatus?: (status: "out_for_delivery" | "delivered") => void;
  onResendEmail?: () => void;
  onCheckAll?: (indices: number[]) => void;
  onPackingSlip?: () => void;
  onLocalAdvance: () => void;
  onRelease: () => void;
  /** Pre-ordered books arrived early: let an "Awaiting release" order be packed now. */
  onReleasePreorder?: () => void;
  /** Owner checked Shippo after an uncertain label purchase: unlock buying a new label. */
  onClearLabelLock?: () => void;
  /** The label is wrong (weight, address, service): void it and buy another before the parcel leaves. */
  onReplaceLabel?: () => void;
  /** A label bought in the inventory app won't be used: take its tracking off this order. */
  onClearAppLabel?: () => void;
  /** Email, phone, note: drawn under the address in the Ship to card. */
  contact?: React.ReactNode;
  /** Totals and payment links: drawn under the books in the In the parcel card. */
  payment?: React.ReactNode;
  /** Problems that need the owner first (payment, dispute, customer request), drawn between the progress bar and the next step. */
  alerts?: React.ReactNode;
};

type Next = {
  say: string;
  title: string;
  detail?: React.ReactNode;
  /** Secondary actions, left of the main one. */
  actions?: React.ReactNode;
  /** The one main action; pinned to the bottom of the screen on phones. */
  main?: React.ReactNode;
  /** Larger content under the head (the label buyer). */
  body?: React.ReactNode;
  tone?: "warn" | "quiet";
};

const addressLines = (addr: any) => [
  [addr.street, addr.unit].filter(Boolean).join(", "),
  [addr.city, [addr.state, addr.zip].filter(Boolean).join(" ")].filter(Boolean).join(" "),
  addr.country,
].filter(Boolean);

// The order page, concept A "Next step" (14 November 2026): a thin progress bar, one card with the step to do now
// and its button, then the address and the books side by side. Every action the old three-step workbench had is
// still here; only one step's controls show at a time.
export function FulfillmentWorkbench({
  order,
  checked,
  busy,
  onCheck,
  onReview,
  onCorrect,
  onPack,
  onLabel,
  onDispatch,
  onEditTracking,
  onDeliveryStatus,
  onResendEmail,
  onCheckAll,
  onPackingSlip,
  onLocalAdvance,
  onRelease,
  onReleasePreorder,
  onClearLabelLock,
  onReplaceLabel,
  onClearAppLabel,
  labelStep,
  books,
  contact,
  payment,
  alerts,
}: Props) {
  const queue = queueOf(order);
  const addr = order.customer?.address || {};
  const reviewed = order.operations?.addressReviewed === addressKey(order);
  const packed = order.operations?.packed === packingKey(order);
  const shipping = physicalItems(order).length > 0;
  const method = order.fulfillmentSelection?.method || "shipping";
  const active =
    ["Needs attention", "Ready to pack", "Ready to ship", "Ready for pickup", "Ready for local delivery"].includes(queue) &&
    !order.isTest;
  const hold = order.operations?.hold;
  const issues = active ? addressIssues(order) : [];
  const labelPending = order.operations?.labelPurchasePending;
  // A Shippo test-key label carries no parcel: shipping on it would email a dead tracking number.
  const testLabel = !!order.labelUrl && order.operations?.labelTest === true;
  const addressActive = active && method !== "pickup" && !reviewed && !hold;
  const packingActive = queue === "Ready to pack";
  const shippingActive = queue === "Ready to ship";
  const lines = physicalItems(order).length;
  const copies = physicalItems(order).reduce((n: number, i: any) => n + (Number(i.quantity) || 0), 0);
  const progress = orderProgress(order);
  const carrier = order.trackingCarrier || "";
  const trackingLink = order.trackingNumber ? getTrackingUrl(carrier, order.trackingNumber, order.trackingUrl) : "";
  const reprint = order.labelUrl ? (
    <a className="rp-btn rp-btn-secondary" href={order.labelUrl} target="_blank" rel="noopener noreferrer">
      <ExternalLink size={14} aria-hidden="true" />
      Reprint label
    </a>
  ) : null;
  const localWord = method === "pickup"
    ? order.fulfillmentStatus === "ready_for_pickup" ? "Confirm collected" : "Mark ready for pickup"
    : order.fulfillmentStatus === "ready_for_delivery" ? "Start local delivery" : order.fulfillmentStatus === "out_for_delivery" ? "Confirm delivered" : "Mark ready for delivery";

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText([order.customer?.name || "", ...addressLines(addr)].filter(Boolean).join("\n"));
      toast.success("Address copied");
    } catch {
      toast.error("Could not copy address");
    }
  };

  const next: Next | null = (() => {
    if (order.status === "cancelled" || order.paymentStatus === "refunded" || order.paymentStatus === "refund_pending" || terminal(order)) {
      return {
        say: "Closed",
        title: order.paymentStatus === "refunded" ? "This order was refunded" : order.paymentStatus === "refund_pending" ? "Refund in progress" : "This order is cancelled",
        actions: reprint,
        tone: "quiet",
      };
    }
    if (queue === "Unpaid") {
      return { say: "Waiting", title: "Waiting for payment", detail: "Payment has not been confirmed. Packing unlocks when it clears.", tone: "quiet" };
    }
    if (!order.items?.length) {
      return { say: "Needs you", title: "This order has no items", detail: "Resolve the order data before fulfillment.", tone: "warn" };
    }
    if (!shipping) {
      return { say: "Done", title: "Nothing to ship", detail: "Digital order. Download access is handled automatically after payment.", tone: "quiet" };
    }
    if (queue === "Awaiting release") {
      return {
        say: "Pre-order",
        title: "Waiting for release",
        detail: preorderShipDate(order)
          ? `Ships from ${formatReleaseDate(preorderShipDate(order), "en-CA")}. It moves to Ready to pack on that day by itself.`
          : "No release date yet. Set it in Books › edit › Inventory, or press Ready to ship now when the books arrive.",
        main: onReleasePreorder && !order.isTest ? <SecondaryButton disabled={busy} onClick={onReleasePreorder}>Ready to ship now</SecondaryButton> : null,
      };
    }
    if (hold && active) {
      return {
        say: "On hold",
        title: "This order is on hold",
        detail: hold,
        actions: reprint,
        main: <PrimaryButton disabled={busy} onClick={onRelease}>Release hold</PrimaryButton>,
        tone: "warn",
      };
    }
    if (order.isTest && !["In transit", "Completed"].includes(queue)) {
      return { say: "Test order", title: "Test orders aren't packed or shipped", detail: "It stays out of your queue and your sales figures.", tone: "quiet" };
    }
    if (addressActive) {
      return {
        say: "Next step",
        title: issues.length ? "Fix the address" : "Check the address",
        detail: issues.length ? (
          <ul className="op-issues" role="alert">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
        ) : "Make sure it's complete before you pack.",
        actions: !issues.length ? <SecondaryButton disabled={busy} onClick={onCorrect}>Edit address</SecondaryButton> : null,
        main: issues.length
          ? <PrimaryButton disabled={busy} onClick={onCorrect}>Correct address</PrimaryButton>
          : <PrimaryButton disabled={busy} onClick={onReview}>Confirm address</PrimaryButton>,
      };
    }
    if (packingActive) {
      const ready = !(lines > 1 && checked.size !== lines);
      return {
        say: "Next step",
        title: `Pack ${copies} book${copies === 1 ? "" : "s"}`,
        detail: lines > 1 ? `${checked.size} of ${lines} lines ticked below` : "One line. Confirm once it's in the box.",
        actions: (
          <>
            {onCheckAll && lines > 1 && (
              <SecondaryButton
                disabled={busy}
                onClick={() =>
                  onCheckAll(
                    (order.items || [])
                      .map((item: any, index: number) => (isDigitalItem(item) ? -1 : index))
                      .filter((index: number) => index >= 0),
                  )
                }
              >
                Tick all {lines} lines
              </SecondaryButton>
            )}
            {onPackingSlip && <SecondaryButton disabled={busy} onClick={onPackingSlip}>Print packing slip</SecondaryButton>}
          </>
        ),
        main: <PrimaryButton disabled={busy || !ready} onClick={onPack}>Confirm packed</PrimaryButton>,
      };
    }
    if (shippingActive && method !== "pickup") {
      if (labelPending && active && !order.labelUrl) {
        return {
          say: "Needs you",
          title: "Check the label purchase",
          detail: (
            <>
              A label purchase needs checking.{" "}
              <a href="https://app.goshippo.com/orders" target="_blank" rel="noopener noreferrer">Open Shippo</a>{" "}
              before trying again.
              {order.operations?.shippoTransactionId && (
                <> Shippo transaction: <span className="rp-mono">{order.operations.shippoTransactionId}</span> (search for it under Shippo › Labels).</>
              )}
            </>
          ),
          main: onClearLabelLock ? <SecondaryButton disabled={busy} onClick={onClearLabelLock}>I've checked Shippo — allow a new label</SecondaryButton> : null,
          tone: "warn",
        };
      }
      const chose = order.shippingMethod ? (
        <span>
          Customer chose <strong>{order.shippingMethod}</strong>
          {Number.isFinite(Number(order.shipping)) ? ` · paid CA$${Number(order.shipping).toFixed(2)}` : ""}
        </span>
      ) : null;
      if (order.labelUrl) {
        return {
          say: "Next step",
          title: `Hand the parcel to ${carrier || "the carrier"}`,
          detail: (
            <>
              <span>Label bought{carrier ? ` · ${carrier}` : ""} · <span className="rp-mono">{order.trackingNumber || "Tracking pending"}</span></span>
              {testLabel && (
                <span className="op-warn" role="alert"><StatusBadge tone="warning">TEST label</StatusBadge> Not real postage: it won't carry a parcel or track. Replace it with a live label before shipping.</span>
              )}
            </>
          ),
          actions: (
            <>
              {onReplaceLabel && <SecondaryButton className="op-quiet" disabled={busy} onClick={onReplaceLabel}>Replace label</SecondaryButton>}
              <a className="rp-btn rp-btn-secondary" href={order.labelUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={14} aria-hidden="true" />
                Print label
              </a>
            </>
          ),
          main: <PrimaryButton onClick={onDispatch} disabled={busy || testLabel}>Mark shipped</PrimaryButton>,
        };
      }
      const appLabel = order.trackingSource === "inventory-app" && order.trackingNumber ? (
        <span className="op-warn" role="status">
          <StatusBadge tone="info">Inventory app</StatusBadge> Label bought in the inventory app · {carrier || "Carrier"} · {order.trackingNumber}
          {Number.isFinite(Number(order.operations?.externalLabel?.cost)) && order.operations?.externalLabel?.cost != null ? ` · CA$${Number(order.operations.externalLabel.cost).toFixed(2)}` : ""}.
          {" "}Marking it shipped there dispatches this order. Don't buy a second label here.
          {onClearAppLabel && <>{" "}<button type="button" className="op-link" disabled={busy} onClick={onClearAppLabel}>Remove the inventory app label</button></>}
        </span>
      ) : null;
      return {
        say: "Next step",
        title: "Buy a label",
        detail: chose || appLabel ? <>{chose}{appLabel}</> : null,
        actions: labelStep ? null : <SecondaryButton disabled={busy} onClick={onDispatch}>Enter tracking &amp; mark shipped</SecondaryButton>,
        main: labelStep ? null : <PrimaryButton disabled={busy} onClick={onLabel}>Buy Shippo label</PrimaryButton>,
        body: labelStep || null,
      };
    }
    if (method !== "shipping" && (queue === "Ready for pickup" || queue === "Ready for local delivery" || (method === "local_delivery" && order.fulfillmentStatus === "out_for_delivery"))) {
      return {
        say: "Next step",
        title: method === "pickup"
          ? order.fulfillmentStatus === "ready_for_pickup" ? "Hand the books over" : "Get it ready for pickup"
          : order.fulfillmentStatus === "out_for_delivery" ? "Out for delivery" : order.fulfillmentStatus === "ready_for_delivery" ? "Take it out for delivery" : "Get it ready for delivery",
        detail: method === "pickup" ? null : order.fulfillment?.instructions || null,
        main: <PrimaryButton disabled={busy} onClick={onLocalAdvance}>{localWord}</PrimaryButton>,
      };
    }
    if (queue === "In transit" && method === "shipping") {
      return {
        say: order.fulfillmentStatus === "out_for_delivery" ? "Out for delivery" : "On the way",
        title: `With ${carrier || "the carrier"}`,
        detail: (
          <>
            <span>
              <span className="rp-mono">{order.trackingNumber || "No tracking recorded"}</span>
              {trackingLink && <>{" · "}<a href={trackingLink} target="_blank" rel="noopener noreferrer">Customer's tracking link <ExternalLink size={12} aria-hidden="true" /></a></>}
            </span>
            {isOverdueInTransit(order) && (
              <span className="op-warn" role="alert">In transit for {daysInTransit(order)} days. Check the tracking; if it's lost, open a claim and contact the customer.</span>
            )}
            {order.labelUrl && <span className="rp-hint">Shippo updates this parcel by itself; use these only if its tracking stalls.</span>}
          </>
        ),
        actions: order.isTest ? reprint : (
          <>
            {onEditTracking && <SecondaryButton className="op-quiet" disabled={busy} onClick={onEditTracking}>{order.labelUrl ? "Edit tracking link or number" : "Edit tracking"}</SecondaryButton>}
            {onResendEmail && order.fulfillmentStatus !== "out_for_delivery" && order.trackingNumber && (
              <SecondaryButton disabled={busy} onClick={onResendEmail}>Resend shipping email</SecondaryButton>
            )}
            {reprint}
            {onDeliveryStatus && order.fulfillmentStatus !== "out_for_delivery" && (
              <SecondaryButton disabled={busy} onClick={() => onDeliveryStatus("out_for_delivery")}>Mark out for delivery</SecondaryButton>
            )}
          </>
        ),
        main: !order.isTest && onDeliveryStatus ? <PrimaryButton disabled={busy} onClick={() => onDeliveryStatus("delivered")}>Mark delivered</PrimaryButton> : null,
        tone: "quiet",
      };
    }
    if (queue === "In transit" || queue === "Completed") {
      const local = method !== "shipping";
      return {
        say: "Done",
        title: local
          ? order.fulfillmentStatus === "collected" ? "Collected by the customer" : order.fulfillmentStatus === "delivered" ? "Delivered" : order.fulfillmentStatus === "out_for_delivery" ? "Out for delivery" : "Local fulfillment complete"
          : order.fulfillmentStatus === "delivered" ? "Delivered" : "Shipped",
        detail: !local && order.trackingNumber ? (
          <span>
            {carrier ? `${carrier} · ` : ""}<span className="rp-mono">{order.trackingNumber}</span>
            {trackingLink && <>{" · "}<a href={trackingLink} target="_blank" rel="noopener noreferrer">Track parcel <ExternalLink size={12} aria-hidden="true" /></a></>}
          </span>
        ) : null,
        actions: reprint,
        tone: "quiet",
      };
    }
    // Needs attention for another reason (a customer request, a dispute, a payment problem): the alert above is the
    // next step, with its own button, so no second card repeats it.
    return blockingProblem(order)
      ? { say: "Needs you", title: "Sort this out first", detail: blockingProblem(order), actions: reprint, tone: "warn" }
      : null;
  })();

  const shipToTitle = !shipping ? "Customer" : method === "pickup" ? "Pickup" : method === "local_delivery" ? "Deliver to" : "Ship to";
  const canEditAddress = active && reviewed && !order.labelUrl && !labelPending && method !== "pickup";

  return (
    <section className="op-work" aria-label="Fulfillment workspace">
      {progress.length > 0 && (
        <ol className="op-progress" aria-label="Progress">
          {progress.map((part) => (
            <li key={part.key} data-state={part.state} aria-current={part.state === "now" ? "step" : undefined}>
              {part.state === "done" && <Check size={13} aria-hidden="true" />}
              {/* Phones say "Checked" for "Address checked" so the three parts stay on one line. */}
              {part.key === "address" ? <><span className="op-long">{part.label}</span><span className="op-short" aria-hidden="true">{part.state === "done" ? "Checked" : "Address"}</span></> : part.label}
            </li>
          ))}
        </ol>
      )}

      {alerts}
      {blockingProblem(order) && !(hold && active) && next?.title !== "Sort this out first" && (
        <div className="op-alert" role="alert">
          <strong>What's blocking this</strong>
          <p>{blockingProblem(order)}</p>
        </div>
      )}
      {shipping && onReplaceLabel && labelVoidable(order) && !shippingActive && (
        <div className="op-alert" role="status">
          <strong>Unused label</strong>
          <p>
            {terminal(order)
              ? `This order is closed, but label ${order.trackingNumber || ""} was never used. Void it to get the postage back from Shippo.`
              : `Label ${order.trackingNumber || ""} hasn't left the shop. If it won't be used, void it to get the postage back.`}
          </p>
          <div className="op-alert-actions"><SecondaryButton size="sm" disabled={busy} onClick={onReplaceLabel}>Void label for a refund</SecondaryButton></div>
        </div>
      )}
      {labelRefunds(order).length > 0 && (
        <div className="op-alert" role="status">
          <strong>Shippo label refunds</strong>
          {labelRefunds(order).map((entry, index) => (
            <p key={`${entry.transactionId || entry.trackingNumber}-${index}`}>
              <StatusBadge tone={entry.state === "refunded" ? "success" : entry.state === "rejected" ? "danger" : "info"}>
                {entry.state === "refunded" ? "Refunded" : entry.state === "rejected" ? "Rejected" : "Pending"}
              </StatusBadge>{" "}
              {refundWords(entry)}
            </p>
          ))}
        </div>
      )}

      {next && <section className="op-next" data-tone={next.tone} aria-label="Next step">
        <div className="op-next-head">
          <div className="op-next-text">
            <p className="op-next-say">{next.say}</p>
            <h2 className="op-next-title">{next.title}</h2>
            {next.detail ? <div className="op-next-detail">{next.detail}</div> : null}
          </div>
          {(next.actions || next.main) && (
            <div className="op-next-actions">
              {next.actions}
              {next.main ? <div className="op-next-main">{next.main}</div> : null}
            </div>
          )}
        </div>
        {next.body ? <div className="op-next-body">{next.body}</div> : null}
      </section>}

      <div className="op-grid">
        <section className="op-card" aria-label={shipToTitle}>
          <div className="op-card-head">
            <h3>{shipToTitle}</h3>
            <div className="op-card-tools">
              {canEditAddress && <SecondaryButton size="sm" disabled={busy} onClick={onCorrect}>Edit</SecondaryButton>}
              {shipping && method !== "pickup" && addressLines(addr).length > 0 && (
                <SecondaryButton size="sm" icon={<Copy size={13} aria-hidden />} onClick={copyAddress}>Copy</SecondaryButton>
              )}
            </div>
          </div>
          {method === "pickup" ? (
            <address className="op-address">
              <strong>{order.fulfillment?.name || "Selected pickup point"}</strong>
              {order.fulfillment?.address && <span>{[order.fulfillment.address.street, order.fulfillment.address.unit, order.fulfillment.address.city, order.fulfillment.address.state, order.fulfillment.address.zip].filter(Boolean).join(", ")}</span>}
              {order.fulfillment?.instructions && <span className="rp-hint">{order.fulfillment.instructions}</span>}
            </address>
          ) : shipping ? (
            <address className="op-address">
              <strong>{order.customer?.name}</strong>
              {addressLines(addr).map((line) => <span key={line}>{line}</span>)}
              {method === "local_delivery" && order.fulfillment?.name && <span className="rp-hint">Local delivery · {order.fulfillment.name}</span>}
            </address>
          ) : (
            <p className="op-address"><strong>{order.customer?.name || "Guest customer"}</strong></p>
          )}
          {contact ? <div className="op-contact">{contact}</div> : null}
        </section>

        <section className="op-card" aria-label={shipping ? "In the parcel" : "Items"}>
          <div className="op-card-head">
            <h3>{shipping ? "In the parcel" : "Items"}</h3>
            {shipping && packed && <StatusBadge tone="success">Packed</StatusBadge>}
          </div>
          <ul className="op-items" aria-label="Order items">
            {(order.items || []).map((item: any, index: number) => {
              const tick = packingActive && !isDigitalItem(item);
              const info = packingInfo(item, books?.[item.id]);
              const p = linePricing(item);
              return (
                <li
                  key={index}
                  data-tick={tick && !busy ? "true" : undefined}
                  data-checked={tick && checked.has(index) ? "true" : undefined}
                  // While packing, a tap anywhere on the line ticks it (the checkbox alone is a small target on a phone).
                  onClick={(e) => {
                    if (!tick || busy) return;
                    // Selecting a title to copy it (drag or double-click) is not a tick.
                    if (e.detail > 1 || (typeof window !== "undefined" && window.getSelection?.()?.isCollapsed === false)) return;
                    if ((e.target as HTMLElement).closest("input, label, button, a, summary")) return;
                    onCheck(index);
                  }}
                >
                  {tick ? (
                    <Checkbox
                      label=""
                      aria-label={`Packed ${item.quantity} × ${item.title}`}
                      checked={checked.has(index)}
                      disabled={busy}
                      onChange={() => onCheck(index)}
                    />
                  ) : null}
                  {info.photo ? (
                    <img className="op-cover" src={info.photo} alt="" width="44" height="62" loading="lazy" />
                  ) : (
                    <span className="op-cover op-cover-empty" aria-hidden="true" />
                  )}
                  <div className="op-item-name">
                    <strong>{item.title}</strong>
                    <span className="rp-hint">
                      {[item.variantName, item.format, item.sku].filter(Boolean).join(" · ")}
                      {[item.variantName, item.format, item.sku].some(Boolean) ? " · " : ""}
                      {item.quantity} {Number(item.quantity) === 1 ? "copy" : "copies"}
                      {isDigitalItem(item) && !isGiftCardLine(item) ? " · Digital" : ""}
                      {item.preorder ? ` · Pre-order${item.releaseDate ? ` (releases ${formatReleaseDate(item.releaseDate, "en-CA")})` : ""}` : ""}
                    </span>
                    {isFreeGiftLine(item) && <span><StatusBadge tone="success">Free gift</StatusBadge></span>}
                    {isGiftCardLine(item) && <span className="rp-hint">{giftCardLineText(item, order)}</span>}
                    {bundlePartsText(item) && (
                      <span className="op-item-extra">Box set — includes {bundlePartsText(item)}{Number(item.quantity) > 1 ? " in each set" : ""}</span>
                    )}
                    {addOnLines(item).length > 0 && (
                      <ul className="op-item-addons" aria-label={`Extras for ${item.title}`}>
                        {addOnLines(item).map((line, n) => <li key={n}><strong>{line}</strong>{Number(item.quantity) > 1 ? ` (each of ${item.quantity} copies)` : ""}</li>)}
                      </ul>
                    )}
                    {info.shelf && !isDigitalItem(item) && <span className="op-shelf">Shelf {info.shelf}</span>}
                  </div>
                  <span className="op-price">
                    {cad(p.total)}
                    {Number(item.quantity) > 1 || (p.base != null && p.addOns.length) ? (
                      <span className="rp-hint">
                        {cad(p.unit)} each{p.base != null && p.addOns.length ? ` (${cad(p.base)} + ${p.addOns.map((a) => `${a.label} ${cad(a.price)}`).join(" + ")})` : ""}
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
          {payment ? <div className="op-payment">{payment}</div> : null}
        </section>
      </div>
    </section>
  );
}
