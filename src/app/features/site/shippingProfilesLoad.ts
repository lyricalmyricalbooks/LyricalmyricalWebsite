import { publicApi } from "../../lib/publicApi";

// Shipping rules are read once per visit (public collection), by the bag the first time it opens and by book
// pages for their search listing. A failed read is forgotten so the next caller tries again.
let shippingProfilesLoad: Promise<any[] | null> | null = null;
export const loadShippingProfiles = () => (shippingProfilesLoad ||= publicApi.getShippingProfiles().catch(() => { shippingProfilesLoad = null; return null; }));
