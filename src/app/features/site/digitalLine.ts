// Same rule as the server's downloadDigitalAsset: only an order line for the digital edition
// unlocks the e-book. A paperback of a book that also sells an e-book does not.
const DIGITAL_FORMAT = /digital|ebook|e-book|epub|pdf|audiobook/i;

/**
 * Stand-in for a book shoppers can no longer read (archived or drafted after they bought it: the catalog only serves
 * published books). The order line's recorded format still says "e-book", and the server decides on download.
 */
export const UNREADABLE_BOOK = { digitalFileName: "(not readable)" };

export function lineIsDigital(line: any, book: any): boolean {
  // Gift cards are digital but have nothing to download: their code is emailed.
  if (!line || line.giftCard === true || book?.productType === "giftCard" || !book?.digitalFileName) return false;
  const recorded = line.digital !== undefined || line.isDigital !== undefined || line.format !== undefined;
  if (recorded) return line.digital === true || line.isDigital === true || DIGITAL_FORMAT.test(String(line.format || ""));
  // Older orders saved no format: check the edition in the catalog.
  const variant = line.variantId ? (book.variants || []).find((v: any) => v.id === line.variantId) : null;
  return variant ? variant.digital === true || variant.isDigital === true : book.digital === true || book.isDigital === true;
}
