import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { SectionCard, TextField, TextArea, useConfirm } from './riso/components';
import { adminApi } from './api';
import { loadCatalog } from '../features/site/loadCatalog';
import { resolveProductRoutes } from '../features/site/productRoutes';
import { getCopy } from '../features/site/storeCopy';
import { autoBookSeo, bookMetadata, defaultBookTitle, seoChecks } from '../lib/bookSeo';
import type { Book } from '../features/site/types';
import { askAi, bookAiInput } from './aiWriter';

// Settings + whole catalog, shared by every opening of this pane for a minute (it used to reload both each time).
let seoCache: { at: number; promise: Promise<[any, Book[]]> } | null = null;
function loadSeoData(): Promise<[any, Book[]]> {
  if (seoCache && Date.now() - seoCache.at < 60_000) return seoCache.promise;
  const promise = Promise.all([adminApi.getSettings(), loadCatalog((size, cursor) => adminApi.getStorefrontBooks(size, cursor))]) as Promise<[any, Book[]]>;
  seoCache = { at: Date.now(), promise };
  promise.catch(() => { if (seoCache?.promise === promise) seoCache = null; });
  return promise;
}

export function BookSeoPane({ book, onChange }: { book: Partial<Book>; onChange: (key: string, value: string | boolean) => void }) {
  const [design, setDesign] = useState<any>(null);
  const [catalog, setCatalog] = useState<Book[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [askConfirm, confirmNode] = useConfirm();
  useEffect(() => {
    let cancelled = false;
    loadSeoData()
      .then(([settings, books]) => { if (!cancelled) { setDesign(settings?.design); setCatalog(books as Book[]); setLoaded(true); } })
      .catch(() => { /* Show pending URL guidance; never pretend the route was verified. */ });
    return () => { cancelled = true; };
  }, []);
  const meta = bookMetadata(book);
  const title = meta.exactTitle ? meta.title : getCopy(design, 'siteTitleFormat', { title: defaultBookTitle(book, (t, author) => getCopy(design, 'seoBookTitleByline', { title: t, author })) || meta.title });
  const description = meta.description || getCopy(design, 'seoBookDescription', { title: book.title || '' });
  const resolved = loaded && book.id ? resolveProductRoutes([...catalog.filter(b => b.id !== book.id), book]).find(b => b.id === book.id) : null;
  const url = resolved ? new URL(`${import.meta.env.BASE_URL}books/${encodeURIComponent(resolved.slug)}`, window.location.origin).href : '';
  const image = meta.image || design?.shareImageUrl || '';
  const checks = seoChecks(book, title);
  // Fills blank search boxes from the book's own catalog facts; asks before replacing written ones.
  const autoFill = async () => {
    const auto = autoBookSeo(book, getCopy(design, 'siteName'));
    if (!auto.metaTitle && !auto.metaDescription) { toast.error('Add the book title and description first, then auto-fill.'); return; }
    const blankTitle = !(book.metaTitle || '').trim(), blankDescription = !(book.metaDescription || '').trim();
    if (blankTitle || blankDescription) {
      if (blankTitle && auto.metaTitle) onChange('metaTitle', auto.metaTitle);
      if (blankDescription && auto.metaDescription) onChange('metaDescription', auto.metaDescription);
      toast.success('Search listing filled in from the book. Check it, then save the book.');
      return;
    }
    if (auto.metaTitle === book.metaTitle && auto.metaDescription === book.metaDescription) { toast.success('The search listing already matches the book.'); return; }
    if (!(await askConfirm({ title: 'Replace the search listing?', message: 'The search title and description will be rewritten from the book’s title, author and description. Nothing is saved until you save the book.', confirmLabel: 'Replace' }))) return;
    if (auto.metaTitle) onChange('metaTitle', auto.metaTitle);
    if (auto.metaDescription) onChange('metaDescription', auto.metaDescription);
    toast.success('Search listing rewritten from the book. Check it, then save the book.');
  };
  // Write with AI (Gemini, Settings › General › AI writing assistant): same rule as Auto-fill — blank boxes are
  // filled straight away, written ones only after asking. The title is used exactly, so it may carry the shop name.
  const [aiBusy, setAiBusy] = useState(false);
  const writeWithAi = async () => {
    if (!(book.title || '').trim()) { toast.error('Give the book a title first.'); return; }
    const written = (book.metaTitle || '').trim() || (book.metaDescription || '').trim();
    if (written && !(await askConfirm({ title: 'Rewrite the search listing with AI?', message: 'Gemini writes a new search title and description from the book’s details. Nothing is saved until you save the book.', confirmLabel: 'Rewrite' }))) return;
    setAiBusy(true);
    try {
      const out = await askAi('bookSeo', bookAiInput(book), { siteName: getCopy(design, 'siteName') });
      if (out.metaTitle) onChange('metaTitle', out.metaTitle);
      if (out.metaDescription) onChange('metaDescription', out.metaDescription);
      toast.success('Search listing drafted with AI. Check it, then save the book.');
    } catch (err: any) {
      toast.error(err?.message || 'The AI assistant couldn’t answer.');
    } finally {
      setAiBusy(false);
    }
  };
  return <>
    {confirmNode}
    <SectionCard title="Search engine listing" description="Edit this book’s search and sharing details. Google may rewrite titles and snippets; rankings are not guaranteed.">
      <div><button type="button" className="rp-btn rp-btn-secondary rp-btn-sm" onClick={autoFill}
        title="Write the search title and description from this book's title, author and description">Auto-fill from book</button>
        {' '}<button type="button" className="rp-btn rp-btn-secondary rp-btn-sm" onClick={() => void writeWithAi()} disabled={aiBusy}
          title="Draft the search title and description with Google Gemini (Settings › General › AI writing assistant)">{aiBusy ? 'Writing…' : '✦ Write with AI'}</button></div>
      <label className="rp-hint"><input type="checkbox" checked={book.seoNoindex === true} onChange={event => onChange('seoNoindex', event.target.checked)} /> Exclude this listing from search engines</label>
      <p className="rp-hint">Useful for test and duplicate listings. The book stays available in the shop; Google receives noindex and the sitemap omits it.</p>
      <div className="be-grid">
        <div className="be-span-2"><TextField label="Search title" value={book.metaTitle || ''} onChange={e => onChange('metaTitle', e.target.value)} placeholder={getCopy(design, 'siteTitleFormat', { title: book.title || '' })} hint={`${title.length} characters in the effective title. A custom title is used exactly as written.`} /></div>
        <div className="be-span-2"><TextArea label="Search description" value={book.metaDescription || ''} onChange={e => onChange('metaDescription', e.target.value)} rows={3} placeholder={meta.description} hint={`${description.length} characters. Leave blank to use a plain-text summary of the book description.`} /></div>
        <div className="be-span-2"><TextField label="Sharing image URL" type="url" value={book.seoImage || ''} onChange={e => onChange('seoImage', e.target.value)} placeholder={book.photos?.[0]?.url || design?.shareImageUrl || ''} hint="Optional HTTPS image. Leave blank to use the cover, then the Studio sharing image." /></div>
      </div>
      <div className="be-serp" aria-label="Search listing preview" aria-live="polite">
        <span className="be-label-xs">Search preview · approximate</span>
        <p className="be-serp-url">{url || (book.id ? 'Loading canonical book URL…' : 'Save the book to establish its public URL.')}</p>
        <p className="be-serp-title">{title || 'Your book title'}</p>
        <p className="be-serp-desc">{description || 'Add a useful description of this book.'}</p>
      </div>
      {image && <div className="be-serp"><span className="be-label-xs">Sharing image preview</span><img src={image} alt="Sharing preview" style={{ display: 'block', maxWidth: '100%', maxHeight: 180, marginTop: 12 }} /></div>}
      <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={() => { onChange('metaTitle', ''); onChange('metaDescription', ''); onChange('seoImage', ''); }}>Use catalog defaults</button>
    </SectionCard>
    <SectionCard title={`SEO checks · ${checks.filter(c => c.ok).length}/${checks.length}`} description="Content checks are guidance, not a Google ranking score. Changes save with the book.">
      <ul className="be-check">{checks.map(c => <li key={c.id} className={c.ok ? 'is-ok' : ''}><span aria-hidden>{c.ok ? '✓' : '○'}</span> {c.label}<span className="rp-sr-only">{c.ok ? ' Complete.' : ' Needs attention.'}</span></li>)}</ul>
      <p className="rp-hint">Canonical URLs and product details are generated automatically. The public price, currency and availability feed structured data. Submit the deployed sitemap in Google Search Console and inspect the book URL after publishing.</p>
      {url && <a className="rp-btn rp-btn-ghost rp-btn-sm" href={`https://search.google.com/test/rich-results?url=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer">Test deployed URL with Google</a>}
    </SectionCard>
  </>;
}
