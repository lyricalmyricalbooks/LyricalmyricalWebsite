/**
 * Book images the owner hid (Books › a book › Media › Hide) stay saved on the book for the admin, but shoppers,
 * Google (structured data, Merchant feed, image sitemap) and AI summaries never get them. Every shopper-side
 * read of a book goes through `withShownPhotos`, so the first shown image is the cover everywhere.
 */
export const isHiddenPhoto = (photo) => !!photo && typeof photo === "object" && photo.hidden === true;

/** The photos a shopper sees, in the owner's order. */
export function shownPhotos(photos) {
  return Array.isArray(photos) ? photos.filter(photo => !isHiddenPhoto(photo)) : photos;
}

/** The book as shoppers get it: hidden images left out. Returns the same object when nothing is hidden. */
export function withShownPhotos(book) {
  if (!book || !Array.isArray(book.photos) || !book.photos.some(isHiddenPhoto)) return book;
  return { ...book, photos: shownPhotos(book.photos) };
}
