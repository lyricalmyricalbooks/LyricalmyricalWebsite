import { preorderActive, releaseDateOf } from '../features/site/preorder';
import { comingSoonActive } from '../features/site/comingSoon';
import type { Book } from '../features/site/types';
import { formatKey } from '../features/site/CatalogControls';
import { descriptionPlainText } from '../features/site/descriptionLinks';

/** Search descriptions are plain text, even when catalog descriptions are rich HTML. */
export function searchText(value = ''): string {
  return value.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#\d+|#x[\da-f]+);/gi, (_, entity) => {
      const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
      if (entity[0] !== '#') return named[entity.toLowerCase()] ?? '';
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    }).replace(/\s+/g, ' ').trim();
}

export function canonicalUrl(value: string): string {
  const url = new URL(value);
  url.search = '';
  url.hash = '';
  // Content routes are published slash-less (`books/<slug>.html`, sitemap, JSON-LD); a visitor who
  // arrived on `/books/<slug>/` must still name the same canonical URL.
  url.pathname = url.pathname.replace(/(\/(?:books|page|collections)\/[^/]+)\/+$/, '$1');
  return url.href;
}

/** Shortens a search snippet at a word boundary (with an ellipsis) instead of mid-word. */
export function snippet(text: string, max = 160): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s.,;:!?\-–—]+$/, '') + '…';
}

/** A valid ISBN-13 (978/979, correct check digit) without hyphens, or ''. Never invented. */
export function isbn13(value: unknown): string {
  const digits = String(value ?? '').replace(/[\s-]/g, '');
  if (!/^97[89]\d{10}$/.test(digits)) return '';
  const sum = [...digits.slice(0, 12)].reduce((total, d, i) => total + Number(d) * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(digits[12]) ? digits : '';
}

const BOOK_FORMATS: Record<string, string> = { paperback: 'Paperback', hardcover: 'Hardcover', ebook: 'EBook', audiobook: 'AudiobookFormat' };

/** The edition facts the catalog actually holds, as schema.org Book properties. */
function bookFacts(book: Book & Record<string, any>) {
  const format = BOOK_FORMATS[formatKey(book.format) || ''];
  const pages = Math.floor(Number(book.pageCount));
  const date = typeof book.publishDate === 'string' && /^\d{4}(-\d{2}(-\d{2})?)?/.test(book.publishDate) ? book.publishDate.match(/^\d{4}(-\d{2}(-\d{2})?)?/)![0] : '';
  const gtin = isbn13(book.isbn);
  return {
    ...(format ? { bookFormat: `https://schema.org/${format}` } : {}),
    ...(pages > 0 ? { numberOfPages: pages } : {}),
    ...(date ? { datePublished: date } : {}),
    ...(searchText(book.edition) ? { bookEdition: searchText(book.edition) } : {}),
    ...(gtin ? { gtin13: gtin } : {}),
  };
}

export function bookMetadata(book: Partial<Book>) {
  return {
    title: searchText(book.metaTitle) || searchText(book.title),
    exactTitle: !!searchText(book.metaTitle),
    description: searchText(book.metaDescription) || snippet(searchText(descriptionPlainText(book.description))),
    image: book.seoImage?.trim() || book.photos?.[0]?.url || '',
  };
}

export type SeoReview = { authorName?: string; rating?: number; title?: string; body?: string; createdAt?: string };

const absolute = (value: string, base: string) => { try { return new URL(value, base).href; } catch { return ''; } };

/** Star rating + a few review snippets, only from approved shopper reviews. Never invented. */
export function ratingData(reviews: SeoReview[] = [], summary?: { count: number; average: number } | null) {
  const rated = reviews.filter(r => Number(r.rating) >= 1 && Number(r.rating) <= 5);
  if (!rated.length) return {};
  // The star rating covers every approved review (Firestore's count/average), not just the page of snippets read here.
  const real = summary && summary.count >= rated.length && summary.average >= 1 && summary.average <= 5 ? summary : null;
  const average = real ? real.average : rated.reduce((sum, r) => sum + Number(r.rating), 0) / rated.length;
  const review = rated.filter(r => searchText(r.body) && searchText(r.authorName)).slice(0, 5).map(r => ({
    '@type': 'Review',
    author: { '@type': 'Person', name: searchText(r.authorName) },
    reviewRating: { '@type': 'Rating', ratingValue: Number(r.rating), bestRating: 5, worstRating: 1 },
    ...(searchText(r.title) ? { name: searchText(r.title) } : {}),
    reviewBody: searchText(r.body).slice(0, 1000),
    ...(r.createdAt && /^\d{4}-\d{2}-\d{2}/.test(r.createdAt) ? { datePublished: r.createdAt.slice(0, 10) } : {}),
  }));
  return {
    aggregateRating: { '@type': 'AggregateRating', ratingValue: Number(average.toFixed(1)), reviewCount: real ? real.count : rated.length, bestRating: 5, worstRating: 1 },
    ...(review.length ? { review } : {}),
  };
}

/** Google shows these trails instead of the raw URL in results. */
export function breadcrumbData(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.filter(i => i.name && i.url).map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: canonicalUrl(item.url) })),
  };
}

/** A shop category as a list of the books in it. */
export function collectionStructuredData(options: { name: string; description?: string; url: string; books: { name: string; url: string; image?: string }[] }) {
  const url = canonicalUrl(options.url);
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': url + '#collection',
    url,
    name: options.name,
    ...(options.description ? { description: searchText(options.description) } : {}),
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: Math.min(options.books.length, 30),
      itemListElement: options.books.slice(0, 30).map((book, index) => ({
        '@type': 'ListItem', position: index + 1, url: canonicalUrl(book.url), name: book.name,
        ...(book.image ? { image: absolute(book.image, url) } : {}),
      })),
    },
  };
}

/** The shop itself (brand panel) and the website, linked by @id. */
export function siteStructuredData(options: { name: string; url: string; description?: string; logo?: string; sameAs?: unknown[] }) {
  const url = canonicalUrl(options.url);
  const sameAs = (options.sameAs || []).filter((v): v is string => typeof v === 'string' && /^https:\/\//i.test(v.trim())).map(v => v.trim());
  const logo = options.logo ? absolute(options.logo, url) : '';
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'BookStore',
      '@id': url + '#organization',
      name: options.name,
      url,
      ...(options.description ? { description: searchText(options.description) } : {}),
      ...(logo ? { logo, image: logo } : {}),
      ...(sameAs.length ? { sameAs } : {}),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': url + '#website',
      name: options.name,
      url,
      publisher: { '@id': url + '#organization' },
    },
  ];
}

export function bookStructuredData(book: Book & Record<string, any>, options: { currency: string; price: number; url: string; reviews?: SeoReview[]; ratingSummary?: { count: number; average: number } | null; seller?: string }) {
  const variants = book.variants || [];
  const backorder = book.onBackorder || (variants.length > 0 && variants.every((v: any) => v.onBackorder));
  // Coming soon (Books › Inventory): shown but not for sale yet, so it is honestly out of stock.
  const soon = comingSoonActive(book);
  const available = !soon && (variants.length ? variants.some(v => Number(v.stockLevel ?? v.stock ?? 0) > 0) : Number(book.stockLevel ?? 999) > 0);
  // Pre-order (Books › Inventory): PreOrder availability, starting on the release day when known.
  const preorder = available && preorderActive(book);
  const release = preorder ? releaseDateOf(book) : '';
  return {
    '@context': 'https://schema.org',
    '@type': ['Product', 'Book'],
    '@id': options.url + '#book',
    url: options.url,
    name: book.title,
    description: searchText(descriptionPlainText(book.description)),
    image: [...new Set([...(book.photos || []).map(p => p.url), book.seoImage].filter((url): url is string => !!url?.trim()).map(url => absolute(url.trim(), options.url)).filter(Boolean))],
    ...(book.isbn ? { isbn: String(book.isbn).trim() } : {}),
    ...bookFacts(book),
    ...(book.sku ? { sku: book.sku } : {}),
    ...(book.language ? { inLanguage: book.language } : {}),
    ...(book.authorName ? { author: { '@type': 'Person', name: book.authorName } } : {}),
    ...(book.publisher ? { publisher: { '@type': 'Organization', name: book.publisher } } : {}),
    offers: {
      '@type': 'Offer', url: options.url,
      priceCurrency: options.currency,
      price: Number(options.price).toFixed(2),
      availability: `https://schema.org/${preorder ? 'PreOrder' : soon ? 'OutOfStock' : backorder ? 'BackOrder' : available ? 'InStock' : 'OutOfStock'}`,
      ...(release ? { availabilityStarts: release } : {}),
      itemCondition: 'https://schema.org/NewCondition',
      ...(options.seller ? { seller: { '@type': 'Organization', name: options.seller } } : {}),
    },
    ...ratingData(options.reviews, options.ratingSummary),
  };
}

export function seoChecks(book: Partial<Book>, listingTitle = bookMetadata(book).title) {
  const meta = bookMetadata(book);
  return [
    { id: 'title', ok: listingTitle.length > 0 && listingTitle.length <= 60, label: 'Use a clear, unique search title; about 60 characters is a useful guide.' },
    { id: 'description', ok: meta.description.length >= 80 && meta.description.length <= 160, label: 'Write a useful search summary of about 80–160 characters. Google may choose its own snippet.' },
    { id: 'content', ok: searchText(descriptionPlainText(book.description)).length >= 100, label: 'Describe this book’s subject, creator and edition in the book description.' },
    { id: 'cover', ok: !!book.photos?.[0]?.url, label: 'Add a cover photo so product results can include an image.' },
    { id: 'alt', ok: !!book.photos?.length && book.photos.every(p => !!p.altText?.trim()), label: 'Describe each book photo with meaningful alt text in Media.' },
    { id: 'isbn', ok: !!book.isbn?.trim(), label: 'Add the ISBN when this edition has one; do not invent an identifier.' },
    { id: 'published', ok: book.status === 'published', label: 'Publish the book to make its public page available to search engines.' },
  ];
}
