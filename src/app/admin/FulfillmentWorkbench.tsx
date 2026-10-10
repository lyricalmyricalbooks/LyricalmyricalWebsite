import React from "react";
import { Check, MapPin, Package, Truck, ExternalLink } from "lucide-react";
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
} from "./fulfillment";
import { getTrackingUrl } from "../lib/tracking";
import { formatReleaseDate } from "../features/site/preorder";
import { addOnLines, bundlePartsText, giftCardLineText, isFreeGiftLine, isGiftCardLine, linePricing, cad } from "./orderLines";
import {
  Checkbox,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
} from "./riso/components";
import "./fulfillment.css";

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
  onLabel: () => void;
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
};
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
  books,
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
  const addressActive = active && method !== "pickup" && !reviewed && !hold;
  const packingActive = queue === "Ready to pack";
  const shippingActive = queue === "Ready to ship";
  return (
    <section
      className="rp-card fw-workbench"
      aria-label="Fulfillment workspace"
    >
      <div className="fw-panel-head">
        <h2>Fulfillment</h2>
        <StatusBadge
          tone={
            queue === "Needs attention"
              ? "warning"
              : queue === "Completed"
                ? "success"
                : "neutral"
          }
        >
          {queue}
        </StatusBadge>
      </div>
      {blockingProblem(order) && !(hold && active) && (
        <div className="fw-notice" role="alert">
          <div>
            <strong>What's blocking this</strong>
            <p>{blockingProblem(order)}</p>
          </div>
        </div>
      )}
      {hold && active && (
        <div className="fw-notice" role="status">
          <div>
            <strong>Order on hold</strong>
            <p>{hold}</p>
          </div>
          <SecondaryButton disabled={busy} onClick={onRelease}>
            Release hold
          </SecondaryButton>
        </div>
      )}
      {queue === "Awaiting release" && (
        <div className="fw-notice" role="status">
          <div>
            <strong>Pre-order — waiting for release</strong>
            <p>
              {preorderShipDate(order)
                ? `Ships from ${formatReleaseDate(preorderShipDate(order), "en-CA")}. It moves to Ready to pack on that day by itself.`
                : "The release date hasn't been announced. Setting it in Books › edit › Inventory updates this order; press Ready to ship now when the books arrive."}
            </p>
          </div>
          {onReleasePreorder && !order.isTest && (
            <SecondaryButton disabled={busy} onClick={onReleasePreorder}>
              Ready to ship now
            </SecondaryButton>
          )}
        </div>
      )}
      {queue === "Unpaid" && (
        <p className="fw-notice">
          Payment has not been confirmed. Fulfillment will unlock when payment
          clears.
        </p>
      )}
      {!shipping && order.items?.length > 0 && (
        <p className="fw-notice">
          Digital order — download access is handled automatically after
          payment. No parcel is required.
        </p>
      )}
      {order.status === "cancelled" && (
        <p className="fw-notice">This order is cancelled.</p>
      )}
      {shipping && method !== "pickup" && (
        <div className="fw-step" data-active={addressActive}>
          <div className="fw-step-heading">
            <span className="fw-step-icon" aria-hidden="true">
              {reviewed ? <Check size={18} /> : <MapPin size={18} />}
            </span>
            <div>
              <h3>Shipping address</h3>
              {reviewed && <span className="rp-hint">Reviewed</span>}
            </div>
            {active && reviewed && !order.labelUrl && !labelPending && (
              <SecondaryButton size="sm" onClick={onCorrect} disabled={busy}>
                Edit
              </SecondaryButton>
            )}
          </div>
          {!reviewed || !active ? (
            <address className="fw-address">
              <strong>{order.customer?.name}</strong>
              <span>{[addr.street, addr.unit].filter(Boolean).join(", ")}</span>
              <span>
                {addr.city}
                {addr.state ? `, ${addr.state}` : ""} {addr.zip}
              </span>
              <span>{addr.country}</span>
            </address>
          ) : (
            <details className="fw-address-details">
              <summary>
                {addr.city}, {addr.state} {addr.zip} · {addr.country}
              </summary>
              <address className="fw-address">
                <strong>{order.customer?.name}</strong>
                <span>{[addr.street, addr.unit].filter(Boolean).join(", ")}</span>
                <span>
                  {addr.city}, {addr.state} {addr.zip}
                </span>
                <span>{addr.country}</span>
              </address>
            </details>
          )}
          {addressActive && (
            <>
              {issues.length > 0 && (
                <ul className="fw-problems" role="alert">
                  {issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              )}
              <div className="fw-actions">
                {issues.length ? (
                  <PrimaryButton disabled={busy} onClick={onCorrect}>
                    Correct address
                  </PrimaryButton>
                ) : (
                  <PrimaryButton disabled={busy} onClick={onReview}>
                    Confirm address
                  </PrimaryButton>
                )}
                {!issues.length && (
                  <SecondaryButton disabled={busy} onClick={onCorrect}>
                    Edit address
                  </SecondaryButton>
                )}
              </div>
            </>
          )}
        </div>
      )}
      <div className="fw-step" data-active={packingActive}>
        <div className="fw-step-heading">
          <span className="fw-step-icon" aria-hidden="true">
            {packed ? <Check size={18} /> : <Package size={18} />}
          </span>
          <div>
            <h3>{shipping ? "Books to pack" : "Order items"}</h3>
            <span className="rp-hint">
              {packed
                ? "All books packed"
                : `${(order.items || []).reduce((n: number, i: any) => n + Number(i.quantity || 0), 0)} items`}
            </span>
          </div>
        </div>
        {packingActive && (onCheckAll || onPackingSlip) && (
          <div className="fw-actions">
            {onCheckAll && physicalItems(order).length > 1 && (
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
                Tick all {physicalItems(order).length} lines
              </SecondaryButton>
            )}
            {onPackingSlip && (
              <SecondaryButton disabled={busy} onClick={onPackingSlip}>
                Print packing slip
              </SecondaryButton>
            )}
          </div>
        )}
        <ul className="fw-items" aria-label="Order items">
          {(order.items || []).map((item: any, index: number) => (
            <li key={index}>
              {packingActive && !isDigitalItem(item) ? (
                <Checkbox
                  label=""
                  aria-label={`Packed ${item.quantity} × ${item.title}`}
                  checked={checked.has(index)}
                  disabled={busy}
                  onChange={() => onCheck(index)}
                />
              ) : packed && !isDigitalItem(item) ? (
                <Check
                  className="fw-item-check"
                  size={16}
                  aria-label="Packed"
                />
              ) : null}
              {(() => {
                const info = packingInfo(item, books?.[item.id]);
                return (
                  <>
                    {info.photo ? (
                      <img className="fw-item-cover" src={info.photo} alt="" width="48" height="64" loading="lazy" />
                    ) : (
                      <span className="fw-item-cover fw-item-cover-empty" aria-hidden="true" />
                    )}
                    <div className="fw-item-name">
                      <strong>{item.title}</strong>
                      <span className="rp-hint">
                        {[item.variantName, item.format, item.sku]
                          .filter(Boolean)
                          .join(" · ")}
                        {isDigitalItem(item) && !isGiftCardLine(item) ? " · Digital" : ""}
                        {item.preorder ? ` · Pre-order${item.releaseDate ? ` (releases ${formatReleaseDate(item.releaseDate, "en-CA")})` : ""}` : ""}
                      </span>
                      {isFreeGiftLine(item) && <span><StatusBadge tone="success">Free gift</StatusBadge></span>}
                      {isGiftCardLine(item) && <span className="rp-hint">{giftCardLineText(item, order)}</span>}
                      {bundlePartsText(item) && (
                        <span className="fw-item-extra">Box set — includes {bundlePartsText(item)}{Number(item.quantity) > 1 ? " in each set" : ""}</span>
                      )}
                      {addOnLines(item).length > 0 && (
                        <ul className="fw-item-addons" aria-label={`Extras for ${item.title}`}>
                          {addOnLines(item).map((line, n) => <li key={n}><strong>{line}</strong>{Number(item.quantity) > 1 ? ` (each of ${item.quantity} copies)` : ""}</li>)}
                        </ul>
                      )}
                      {info.shelf && !isDigitalItem(item) && (
                        <span className="fw-item-shelf">Shelf {info.shelf}</span>
                      )}
                    </div>
                  </>
                );
              })()}
              <span className="fw-quantity">
                × {item.quantity}
                {(() => {
                  const p = linePricing(item);
                  return (
                    <span className="rp-hint rp-mono" style={{ display: "block" }}>
                      {cad(p.unit)} each{p.base != null && p.addOns.length ? ` (${cad(p.base)} + ${p.addOns.map((a) => `${a.label} ${cad(a.price)}`).join(" + ")})` : ""}
                      <br />
                      {cad(p.total)}
                    </span>
                  );
                })()}
              </span>
            </li>
          ))}
        </ul>
        {!order.items?.length && (
          <p className="fw-problems" role="alert">
            This order has no items. Resolve the order data before fulfillment.
          </p>
        )}
        {packingActive && (
          <div className="fw-actions">
            <PrimaryButton
              disabled={busy || (physicalItems(order).length > 1 && checked.size !== physicalItems(order).length)}
              onClick={onPack}
            >
              Confirm packed
            </PrimaryButton>
            <span className="rp-hint">
              {physicalItems(order).length > 1
                ? `${checked.size} of ${physicalItems(order).length} lines checked`
                : "One line — confirm once it's in the box"}
            </span>
          </div>
        )}
      </div>
      {shipping && method !== "pickup" && (
        <div className="fw-step" data-active={shippingActive}>
          <div className="fw-step-heading">
            <span className="fw-step-icon" aria-hidden="true">
              <Truck size={18} />
            </span>
            <div>
              <h3>Shipping & dispatch</h3>
              <span className="rp-hint">
                {queue === "In transit"
                  ? "Handed to carrier"
                  : queue === "Completed"
                    ? "Closed"
                    : order.labelUrl
                      ? "Label purchased · awaiting dispatch"
                      : "After packing"}
              </span>
            </div>
          </div>
          {labelPending && active && !order.labelUrl ? (
            <>
              <p className="fw-problems" role="alert">
                A label purchase needs checking.{" "}
                <a
                  href="https://app.goshippo.com/orders"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open Shippo
                </a>{" "}
                before trying again.
                {order.operations?.shippoTransactionId && (
                  <> Shippo transaction: <span className="rp-mono">{order.operations.shippoTransactionId}</span> (search for it under Shippo › Labels).</>
                )}
              </p>
              {onClearLabelLock && (
                <div className="fw-actions">
                  <SecondaryButton disabled={busy} onClick={onClearLabelLock}>
                    I've checked Shippo — allow a new label
                  </SecondaryButton>
                </div>
              )}
            </>
          ) : (
            shippingActive && (
              <>
                {order.shippingMethod && (
                  <p className="fw-summary">
                    Customer chose: <strong>{order.shippingMethod}</strong>
                    {Number.isFinite(Number(order.shipping)) ? ` · paid CA$${Number(order.shipping).toFixed(2)}` : ""}
                  </p>
                )}
                <p className="fw-summary">
                  {order.labelUrl
                    ? `Label bought · ${order.trackingCarrier || "Carrier"} · ${order.trackingNumber || "Tracking pending"}. Print it, hand the parcel to the carrier, then mark it shipped — you can add or check the tracking link the customer's email uses.`
                    : "Buy a Shippo label, or enter the carrier, tracking number and tracking link yourself. The customer's shipping email uses them when you mark it shipped."}
                </p>
                <div className="fw-actions">
                  {order.labelUrl ? (
                    <>
                      <a
                        className="rp-btn rp-btn-secondary"
                        href={order.labelUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink size={14} aria-hidden="true" />
                        Print label
                      </a>
                      <PrimaryButton onClick={onDispatch} disabled={busy}>
                        Parcel handed over — mark shipped
                      </PrimaryButton>
                      {onReplaceLabel && (
                        <SecondaryButton disabled={busy} onClick={onReplaceLabel}>
                          Wrong label? Replace it
                        </SecondaryButton>
                      )}
                    </>
                  ) : (
                    <>
                      <PrimaryButton disabled={busy} onClick={onLabel}>
                        Buy Shippo label
                      </PrimaryButton>
                      <SecondaryButton disabled={busy} onClick={onDispatch}>
                        Enter tracking &amp; mark shipped
                      </SecondaryButton>
                    </>
                  )}
                </div>
              </>
            )
          )}
          {order.labelUrl && !shippingActive && (
            <div className="fw-actions">
              {" "}
              <a
                className="rp-btn rp-btn-secondary rp-btn-sm"
                href={order.labelUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={14} aria-hidden="true" />
                Reprint label
              </a>
            </div>
          )}
          {queue === "In transit" && (
            <>
              <p className="fw-summary">
                {order.trackingCarrier || "Carrier"} ·{" "}
                {order.trackingNumber || "No tracking recorded"}
                {order.fulfillmentStatus === "out_for_delivery" ? " · Out for delivery" : ""}
                {order.trackingNumber && (
                  <>
                    {" · "}
                    <a
                      href={getTrackingUrl(order.trackingCarrier || "", order.trackingNumber, order.trackingUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Customer's tracking link <ExternalLink size={12} aria-hidden="true" />
                    </a>
                  </>
                )}
              </p>
              {isOverdueInTransit(order) && (
                <p className="fw-problems" role="alert">
                  In transit for {daysInTransit(order)} days. Check the carrier's tracking; if the parcel is lost,
                  open a claim with the carrier and contact the customer.
                </p>
              )}
              {!order.isTest && (onDeliveryStatus || onEditTracking) && (
                <div className="fw-actions">
                  {onDeliveryStatus && order.fulfillmentStatus !== "out_for_delivery" && (
                    <SecondaryButton disabled={busy} onClick={() => onDeliveryStatus("out_for_delivery")}>
                      Mark out for delivery
                    </SecondaryButton>
                  )}
                  {onDeliveryStatus && (
                    <PrimaryButton disabled={busy} onClick={() => onDeliveryStatus("delivered")}>
                      Mark delivered
                    </PrimaryButton>
                  )}
                  {onResendEmail && order.fulfillmentStatus !== "out_for_delivery" && order.trackingNumber && (
                    <SecondaryButton disabled={busy} onClick={onResendEmail}>
                      Resend shipping email
                    </SecondaryButton>
                  )}
                  {onEditTracking && (
                    <SecondaryButton disabled={busy} onClick={onEditTracking}>
                      {order.labelUrl ? "Edit tracking link or number" : "Edit tracking"}
                    </SecondaryButton>
                  )}
                </div>
              )}
              {order.labelUrl && (
                <p className="rp-hint">Shippo updates this parcel automatically; use these only if its tracking stalls.</p>
              )}
            </>
          )}
        </div>
      )}
      {shipping && method !== "shipping" && (
        <div className="fw-step" data-active={queue === "Ready for pickup" || queue === "Ready for local delivery"}>
          <div className="fw-step-heading">
            <span className="fw-step-icon" aria-hidden="true"><MapPin size={18} /></span>
            <div>
              <h3>{method === "pickup" ? "Customer pickup" : "Local delivery"}</h3>
              <span className="rp-hint">
                {order.fulfillment?.name || "Selected local service"}
                {order.fulfillment?.address ? ` · ${[order.fulfillment.address.street, order.fulfillment.address.unit, order.fulfillment.address.city, order.fulfillment.address.state, order.fulfillment.address.zip].filter(Boolean).join(", ")}` : ""}
              </span>
            </div>
          </div>
          {order.fulfillment?.instructions && <p className="fw-summary">{order.fulfillment.instructions}</p>}
          {queue === "Ready for pickup" || queue === "Ready for local delivery" || (method === "local_delivery" && order.fulfillmentStatus === "out_for_delivery") ? (
            <div className="fw-actions">
              <PrimaryButton disabled={busy} onClick={onLocalAdvance}>
                {method === "pickup"
                  ? order.fulfillmentStatus === "ready_for_pickup" ? "Confirm collected" : "Mark ready for pickup"
                  : order.fulfillmentStatus === "ready_for_delivery" ? "Start local delivery" : order.fulfillmentStatus === "out_for_delivery" ? "Confirm delivered" : "Mark ready for delivery"}
              </PrimaryButton>
            </div>
          ) : ["In transit", "Completed"].includes(queue) ? (
            <p className="fw-summary">{order.fulfillmentStatus === "collected" ? "Collected by customer" : order.fulfillmentStatus === "delivered" ? "Delivered" : order.fulfillmentStatus === "out_for_delivery" ? "Out for delivery" : "Local fulfillment complete"}</p>
          ) : null}
        </div>
      )}
    </section>
  );
}
