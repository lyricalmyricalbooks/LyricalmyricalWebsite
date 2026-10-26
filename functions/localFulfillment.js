// BOGO "% off the free items": missing/blank/invalid means 100 (fully free);
// otherwise clamped to 0-100. (`Number(x) ?? 100` never fell back: NaN or 0.)
const { bogoPercent } = require('./shared/discountMath');
const normalizePostalCode = value => typeof value === 'string' ? value.toUpperCase().replace(/\s/g, '') : '';
const postalPattern = /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\d[ABCEGHJ-NPRSTV-Z]\d$/;
const prefixPattern = /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]$/;
// Pickup areas may be a whole postal district: "M" = all of Toronto, "M6G" = one area.
const pickupAreaPattern = /^[ABCEGHJ-NPRSTVXY](\d[ABCEGHJ-NPRSTV-Z]?)?$/;
const pickupAreas = (location) => Array.isArray(location?.postalPrefixes) ? location.postalPrefixes.map(normalizePostalCode).filter(Boolean) : [];
const money = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1000000 && Math.abs(value * 100 - Math.round(value * 100)) < 0.000001;
const canadian = country => ['CA', 'CANADA'].includes(String(country || '').trim().toUpperCase());
function validPickupAddress(address) {
  // The street and postal code are optional: a shop may share its exact pickup spot after the order.
  // Province and country are required because they set the tax for pickup orders.
  if (!address || typeof address.state !== 'string' || !canadian(address.country)) return false;
  if (!/^(AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT|ONTARIO|QUEBEC|BRITISH COLUMBIA|ALBERTA|MANITOBA|SASKATCHEWAN|NOVA SCOTIA|NEW BRUNSWICK|NEWFOUNDLAND AND LABRADOR|PRINCE EDWARD ISLAND|YUKON|NUNAVUT|NORTHWEST TERRITORIES)$/.test(address.state.trim().toUpperCase())) return false;
  const zip = normalizePostalCode(address.zip || address.postalCode);
  return !zip || postalPattern.test(zip);
}
function validateLocalFulfillment(config) {
  const errors = [];
  if (!config || typeof config.enabled !== 'boolean' || !Array.isArray(config.pickupLocations) || !Array.isArray(config.deliveryZones)) return ['Local fulfillment requires an enable switch, pickup locations and delivery zones.'];
  const ids = new Set();
  for (const [kind, records] of [['pickup', config.pickupLocations], ['delivery', config.deliveryZones]]) {
    for (const record of records) {
      if (!record || typeof record.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(record.id) || ids.has(record.id)) errors.push('Every location and zone needs a unique stable ID.');
      ids.add(record?.id);
      if (!record || typeof record.enabled !== 'boolean') errors.push('Every option needs an enable switch.');
      if (!record || !money(record.price)) errors.push('Fees must be valid non-negative amounts with at most two decimals.');
      if (!record || typeof record.name !== 'string' || !record.name.trim() || record.name.length > 200) errors.push('Every option needs a name (up to 200 characters).');
      for (const field of ['instructions', 'hours', 'estimate']) if (record?.[field] !== undefined && (typeof record[field] !== 'string' || record[field].length > 4000)) errors.push('Public instructions, hours and estimates must be text up to 4000 characters.');
      if (kind === 'pickup' && (!record?.address || typeof record.address !== 'object' || Array.isArray(record.address) || !['street', 'city', 'state', 'zip', 'country'].every(key => typeof record.address[key] === 'string'))) errors.push('Pickup address fields must be text, even while disabled.');
      if (kind === 'pickup' && record?.postalPrefixes !== undefined && (!Array.isArray(record.postalPrefixes) || record.postalPrefixes.length > 500 || record.postalPrefixes.some((value) => !pickupAreaPattern.test(normalizePostalCode(value))))) errors.push('Pickup areas must be Canadian postal prefixes of one to three characters, such as M for Toronto (maximum 500).');
      if (kind === 'pickup' && record?.enabled && !validPickupAddress(record.address)) errors.push('Pickup needs a Canadian province (e.g. ON); a postal code, if entered, must be valid.');
      if (kind === 'delivery') {
        if (!money(record?.minimumSubtotal)) errors.push('Delivery minimum must be a valid non-negative amount.');
        const prefixes = record?.postalPrefixes, codes = record?.postalCodes;
        if (!Array.isArray(prefixes) || !Array.isArray(codes) || prefixes.length + codes.length === 0 || prefixes.length + codes.length > 500 || prefixes.some(value => !prefixPattern.test(normalizePostalCode(value))) || codes.some(value => !postalPattern.test(normalizePostalCode(value)))) errors.push('Delivery needs valid three-character Canadian prefixes or complete six-character postal codes (maximum 500).');
      }
    }
  }
  return [...new Set(errors)];
}
// cartSubtotal is discounted physical merchandise, excluding delivery and tax.
function quoteLocalFulfillment(config, destination, cartSubtotal, physicalItems) {
  if (!config?.enabled || !money(cartSubtotal) || !Array.isArray(physicalItems) || !physicalItems.some(item => item && !/digital|ebook|e-book|epub|pdf|audiobook/i.test(String(item.format || '')) && item.digital !== true && item.isDigital !== true && Number.isInteger(item.quantity) && item.quantity > 0) || validateLocalFulfillment(config).length) return [];
  const quotes = [];
  const postal = normalizePostalCode(destination?.zip || destination?.postalCode);
  const servesPostal = canadian(destination?.country) && postalPattern.test(postal);
  for (const location of config.pickupLocations) if (location.enabled && (!pickupAreas(location).length || (servesPostal && pickupAreas(location).some(area => postal.startsWith(area))))) quotes.push({ id: `pickup:${location.id}`, method: 'pickup', locationId: location.id, name: location.name, price: Math.round(location.price * 100) / 100, address: { ...location.address, zip: normalizePostalCode(location.address.zip || location.address.postalCode) }, instructions: location.instructions ?? '', hours: location.hours ?? '', estimate: location.estimate ?? '' });
  if (servesPostal) for (const zone of config.deliveryZones) {
    if (zone.enabled && Math.round(cartSubtotal * 100) >= Math.round(zone.minimumSubtotal * 100) && (zone.postalPrefixes.some(prefix => postal.startsWith(normalizePostalCode(prefix))) || zone.postalCodes.some(code => postal === normalizePostalCode(code)))) quotes.push({ id: `local_delivery:${zone.id}`, method: 'local_delivery', zoneId: zone.id, name: zone.name, price: Math.round(zone.price * 100) / 100, instructions: zone.instructions ?? '', estimate: zone.estimate ?? '' });
  }
  return quotes;
}
const isPhysicalItem = item => item && item.digital !== true && item.isDigital !== true && !/digital|ebook|e-book|epub|pdf|audiobook/i.test(String(item.format || ''));
const cents = value => Math.round(Number(value || 0) * 100);
function discountedPhysicalSubtotal(items, discountAmount, discount, booksById = {}) {
  const physicalCents = items.filter(isPhysicalItem).reduce((sum, item) => sum + cents(item.price) * item.quantity, 0);
  const allCents = items.reduce((sum, item) => sum + cents(item.price) * item.quantity, 0);
  if (!physicalCents || !allCents) return 0;
  const discountCents = Math.max(0, Math.min(cents(discountAmount), allCents));
  if (!discountCents) return physicalCents / 100;
  const selected = item => discount?.appliesTo === 'products'
    ? (discount.selectedProducts || []).includes(item.id)
    : discount?.appliesTo === 'categories'
      ? (booksById[item.id]?.categories || []).some(category => (discount.selectedCategories || []).includes(category))
      : true;
  // A free gift's discount pays for the gift line itself.
  if (discount?.type === 'gift') {
    const gift = items.find(item => item.promoGift === true);
    const giftCents = gift && isPhysicalItem(gift) ? cents(gift.price) * gift.quantity : 0;
    return Math.max(0, physicalCents - Math.min(giftCents, discountCents)) / 100;
  }
  const eligible = items.filter(selected);
  if (discount?.type === 'bogo') {
    const getQty = Number(discount.getQuantity) || 1;
    const setSize = (Number(discount.buyQuantity) || 1) + getQty;
    const units = eligible.flatMap(item => Array.from({ length: item.quantity }, () => ({ price: cents(item.price), physical: isPhysicalItem(item) })));
    units.sort((a, b) => b.price - a.price);
    const count = Math.floor(units.length / setSize) * getQty;
    const discountedUnits = count ? units.slice(-count) : [];
    const physicalDiscount = discountedUnits.filter(unit => unit.physical).reduce((sum, unit) => sum + Math.round(unit.price * bogoPercent(discount.getDiscountValue) / 100), 0);
    return Math.max(0, physicalCents - Math.min(physicalDiscount, discountCents)) / 100;
  }
  const eligibleCents = eligible.reduce((sum, item) => sum + cents(item.price) * item.quantity, 0);
  const eligiblePhysicalCents = eligible.filter(isPhysicalItem).reduce((sum, item) => sum + cents(item.price) * item.quantity, 0);
  const physicalDiscount = eligibleCents ? Math.round(discountCents * eligiblePhysicalCents / eligibleCents) : 0;
  return Math.max(0, physicalCents - physicalDiscount) / 100;
}
function resolveLocalSelection(config, selection, destination, discountedSubtotal, physicalItems, freeShipping = false) {
  if (!selection || !['pickup', 'local_delivery'].includes(selection.method) || typeof selection.optionId !== 'string') throw new Error('Choose an available fulfillment option.');
  if (selection.method === 'local_delivery') {
    if (!destination || !['street', 'city', 'state', 'zip', 'country'].every(key => typeof destination[key] === 'string' && destination[key].trim()) || !canadian(destination.country) || !postalPattern.test(normalizePostalCode(destination.zip))) throw new Error('Enter a complete Canadian delivery address.');
  }
  const quote = quoteLocalFulfillment(config, destination, discountedSubtotal, physicalItems).find(choice => choice.id === selection.optionId && choice.method === selection.method);
  if (!quote) throw new Error('That fulfillment option is no longer available. Please review the options and try again.');
  const fulfillment = { method: quote.method, optionId: quote.id, ...(quote.locationId ? { locationId: quote.locationId } : {}), ...(quote.zoneId ? { zoneId: quote.zoneId } : {}), name: quote.name, price: freeShipping ? 0 : quote.price, ...(quote.address ? { address: quote.address } : {}), ...(destination && quote.method === 'local_delivery' ? { destination: { street: destination.street, ...(destination.unit ? { unit: destination.unit } : {}), city: destination.city, state: destination.state, zip: normalizePostalCode(destination.zip), country: 'CA' } } : {}), instructions: quote.instructions, ...(quote.hours !== undefined ? { hours: quote.hours } : {}), estimate: quote.estimate };
  return { cost: fulfillment.price, method: quote.method, fulfillment };
}
module.exports = { bogoPercent, normalizePostalCode, validPickupAddress, validateLocalFulfillment, quoteLocalFulfillment, discountedPhysicalSubtotal, resolveLocalSelection, isPhysicalItem };
