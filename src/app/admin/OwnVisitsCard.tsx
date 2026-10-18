import { useState } from "react";
import toast from "react-hot-toast";
import { isOwnerDevice, looksAutomated, OWNER_DEVICE_PARAM, SHOP_OWNER_EMAIL, setOwnerDevice } from "../lib/ownerDevice";
import { SecondaryButton, SectionCard, StatusBadge, Toggle } from "./riso/components";

// Settings › General › Your own visits: keeps the owner's browsing and test orders out of the shop's numbers
// (lib/ownerDevice.ts). The switch is per browser; the link marks a phone or another browser in one tap.
export function OwnVisitsCard() {
  const [on, setOn] = useState(() => isOwnerDevice());
  const link = typeof window !== "undefined" ? `${window.location.origin}${import.meta.env.BASE_URL || "/"}?${OWNER_DEVICE_PARAM}=on` : "";

  const flip = (next: boolean) => {
    setOwnerDevice(next);
    setOn(isOwnerDevice());
    toast.success(next ? "This browser's visits are no longer counted" : "This browser's visits count again");
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); toast.success("Link copied"); }
    catch { toast.error("Couldn't copy. Select the link and copy it by hand."); }
  };

  return (
    <SectionCard title="Your own visits"
      description="Your own browsing and test orders are kept out of the Overview, the Monday summary and Google Analytics, so the numbers show real customers only."
      actions={<StatusBadge tone={on ? "success" : "warning"}>{on ? "This browser: not counted" : "This browser: counted"}</StatusBadge>}>
      <Toggle label="Leave this browser out of the shop's numbers" checked={on} onChange={flip} />
      <p className="rp-hint" style={{ margin: "8px 0 0" }}>
        Every browser where you sign in to the admin is left out automatically. For your phone or another browser where you only look at the
        shop, open this link there once:
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
        <span className="rp-mono" style={{ userSelect: "all", overflowWrap: "anywhere" }}>{link}</span>
        <SecondaryButton size="sm" onClick={copy}>Copy link</SecondaryButton>
      </div>
      <ul className="rp-hint" style={{ margin: "12px 0 0", paddingLeft: 20, lineHeight: 1.6 }}>
        <li>Orders placed with <span className="rp-mono">{SHOP_OWNER_EMAIL}</span>, or from a browser left out here, stay in Orders but don't count as sales on the Overview.</li>
        <li>Search-engine robots, speed testers and automated browsers are never counted{looksAutomated() ? " (this browser looks automated, so it isn't counted either)" : ""}.</li>
        <li>Visits already counted before today can't be taken back. Overview › Marketing & traffic › <strong>Start traffic counts again</strong> clears the shop's own counter; Google Analytics keeps its history.</li>
        <li>Clearing this browser's data (cookies and site data) forgets the setting: sign in to the admin or open the link again.</li>
      </ul>
    </SectionCard>
  );
}
