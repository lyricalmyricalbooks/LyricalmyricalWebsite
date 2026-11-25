export interface ArtistLink { name: string; url: string }
export interface Artist<B = any> { slug: string; name: string; bio: string; links: ArtistLink[]; books: B[] }
export function artistSlug(name: unknown): string;
export function bookCreatorLinks(book: any): ArtistLink[];
export function artistDirectory<B = any>(books: B[]): Map<string, Artist<B>>;
export function findArtist<B = any>(books: B[], slug: unknown): Artist<B> | null;
export function artistPath(name: unknown): string;
export function creditParts(text: unknown, hasPage?: (slug: string) => boolean): { text: string; slug?: string }[];
