// Artist pages (/artists/<slug>): one public page per photographer, derived from the published catalog alone (no
// collection of its own). Shared by the shop (ArtistPage.tsx, BookDetail's name links, Studio Health) and the build
// scripts (sitemap, prerender route list, llms.txt), so every place agrees on who has a page and at which address.
import { creatorNames, plain } from './merchantFeed.mjs';

/** "Ian Willms" → "ian-willms"; accents fold ("Zoë" → "zoe"). '' for a name with no Latin letters or digits. */
export function artistSlug(name) {
  return String(name ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const fold = value => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Same rule as lib/bookSeo.ts creatorLinks (artistPages.test.ts checks they agree): named http(s) links, at most 10. */
export function bookCreatorLinks(book) {
  const raw = Array.isArray(book?.creatorLinks) ? book.creatorLinks : [];
  const out = [];
  for (const item of raw) {
    const name = plain(item?.name).replace(/\s+/g, ' ');
    const href = typeof item?.url === 'string' ? item.url.trim() : '';
    if (!name || !/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(href)) continue;
    try { out.push({ name, url: new URL(href).href }); } catch { /* not an address */ }
    if (out.length >= 10) break;
  }
  return out;
}

// Newest first: the release date the editor saves, else when the book was added; the catalog order breaks ties.
const releasedOn = book => String(book?.publishDate || book?.scheduleDate || book?.createdAt || '');

/**
 * Every artist with at least one of `books` (pass only live, slug-resolved books), keyed by slug.
 * Names that fold to the same address ("Zoë Leon" / "Zoe Leon", "J. Smith" / "J Smith") are one person: the page
 * uses the spelling on most of their books (ties: the newest book's). Group credits ("Various artists") name nobody.
 * Gift cards are not books.
 */
export function artistDirectory(books) {
  const list = (Array.isArray(books) ? books : []).filter(book => book && book.productType !== 'giftCard');
  const ordered = list.map((book, index) => ({ book, index }))
    .sort((a, b) => releasedOn(b.book).localeCompare(releasedOn(a.book)) || a.index - b.index)
    .map(entry => entry.book);
  const bySlug = new Map();
  for (const book of ordered) {
    const names = creatorNames(book);
    for (const name of names) {
      const slug = artistSlug(name);
      if (!slug) continue;
      let artist = bySlug.get(slug);
      if (!artist) bySlug.set(slug, artist = { slug, spellings: new Map(), books: [], soleBooks: [] });
      artist.spellings.set(name, (artist.spellings.get(name) || 0) + 1);
      if (!artist.books.includes(book)) artist.books.push(book);
      if (names.length === 1) artist.soleBooks.push(book);
    }
  }
  const out = new Map();
  for (const artist of bySlug.values()) {
    let name = '';
    let best = 0;
    for (const [spelling, count] of artist.spellings) if (count > best) { name = spelling; best = count; }
    const same = candidate => fold(candidate) === fold(name) || artistSlug(candidate) === artist.slug;
    // The bio written on a book they made alone describes them; a shared book's bio may describe someone else.
    const bioBook = [...artist.soleBooks, ...artist.books].find(book => typeof book.artistBio === 'string' && book.artistBio.trim());
    const links = [];
    for (const book of artist.books) for (const link of bookCreatorLinks(book)) {
      if (same(link.name) && !links.some(l => l.url === link.url)) links.push(link);
    }
    out.set(artist.slug, { slug: artist.slug, name, bio: bioBook ? bioBook.artistBio.trim() : '', links: links.slice(0, 10), books: artist.books });
  }
  return out;
}

/** The artist at this address, or null. */
export function findArtist(books, slug) {
  return artistDirectory(books).get(String(slug ?? '').toLowerCase()) || null;
}

/**
 * A credit line ("Ian Willms & Ana Ruiz") cut into its text and the names in it, so a page can link each name to its
 * artist page and keep every other character exactly as written. `hasPage(slug)` says which names have one.
 */
export function creditParts(text, hasPage = () => true) {
  const line = String(text ?? '');
  const parts = [];
  let at = 0;
  for (const name of creatorNames({ subtitle: line })) {
    const start = line.indexOf(name, at);
    const slug = artistSlug(name);
    if (start < 0 || !slug || !hasPage(slug)) continue;
    if (start > at) parts.push({ text: line.slice(at, start) });
    parts.push({ text: name, slug });
    at = start + name.length;
  }
  if (at < line.length) parts.push({ text: line.slice(at) });
  return parts;
}

/** Shop path of an artist's page ('' when the name gives no address). */
export function artistPath(name) {
  const slug = artistSlug(name);
  return slug ? `/artists/${slug}` : '';
}
