import { useState, lazy, Suspense, useEffect, type ReactNode } from "react";
import { consentAllows } from "./lib/consent";
import { REFERRAL_KEY, referralSourceOf } from "./lib/referralSource";
import { LazyMotion, MotionConfig } from "motion/react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router";
import { ScrollToTop } from "./lib/ScrollToTop";
import { ThemePreviewBanner } from "./features/site/ThemePreviewBanner";
import { CartProvider } from "./CartContext";
import { CurrencyProvider } from "./CurrencyContext";
import { Toaster } from "react-hot-toast";
import { CartDrawer } from "./components/CartDrawer";
import { CookieConsent } from "./components/CookieConsent";
import { UnderConstructionWall } from "./components/UnderConstructionWall";
import { ThemeProvider } from "./components/theme/ThemeProvider";
import { BootSplash } from "./components/BootSplash";
import { ErrorBoundary } from "./components/ErrorBoundary";

// import.meta.env.BASE_URL is the Vite `base` config (e.g. "/LyricalmyricalWebsite/").
// Strip the trailing slash so React Router treats it as a basename.
const ROUTER_BASENAME = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

// Storefront animations use the slim `m` components; their engine arrives in its own small chunk.
const loadMotionFeatures = () => import("./lib/motionFeatures").then(m => m.default);

// Lazy-loaded components for performance
const NotFoundPage = lazy(() => import("./features/site/NotFoundPage"));
const MainSite = lazy(() => import("./components/MainSite"));
const Dashboard = lazy(() => import("./admin/Dashboard").then(m => ({ default: m.Dashboard })));
const Checkout = lazy(() => import("./Checkout").then(m => ({ default: m.Checkout })));
const BookDetail = lazy(() => import("./features/site/BookDetail"));
const PageView = lazy(() => import("./features/site/PageView").then(m => ({ default: m.PageView })));
const WishlistPage = lazy(() => import("./features/site/Wishlist"));
const AccountPage = lazy(() => import("./features/site/Account"));
const OrderTracking = lazy(() => import("./features/site/OrderTracking"));

function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  return <ErrorBoundary resetKey={location.key}>{children}</ErrorBoundary>;
}

export default function App() {
  const [currentPage, setCurrentPage] = useState(0);
  const [showCatalog, setShowCatalog] = useState(false);

  // Redirect to basename if path is outside basename
  useEffect(() => {
    if (ROUTER_BASENAME && !window.location.pathname.startsWith(ROUTER_BASENAME)) {
      const targetPath = ROUTER_BASENAME + window.location.pathname + window.location.search + window.location.hash;
      window.location.replace(targetPath);
    }
  }, []);

  // Capture referral traffic source if present in query parameters or HTTP referrer
  useEffect(() => {
    if (typeof window !== "undefined" && consentAllows("analytics")) {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get("ref");
      if (ref) {
        window.sessionStorage.setItem("referral_source", ref.toLowerCase());
      } else if (!window.sessionStorage.getItem(REFERRAL_KEY) && document.referrer) {
        const source = referralSourceOf(document.referrer, window.location.hostname);
        if (source) window.sessionStorage.setItem(REFERRAL_KEY, source);
      }
    }
  }, []);

  const nextPage = () => {
    setCurrentPage((prev) => prev + 1);
  };

  const prevPage = () => {
    setCurrentPage((prev) => (prev > 0 ? prev - 1 : 0));
  };

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <LazyMotion features={loadMotionFeatures}>
      <MotionConfig reducedMotion="user">
      <CurrencyProvider>
        <CartProvider>
          <BrowserRouter basename={ROUTER_BASENAME}>
          <ScrollToTop />
          <RouteErrorBoundary>
          <CartDrawer />
          <CookieConsent />
          <UnderConstructionWall />
          <ThemePreviewBanner />
          <Suspense fallback={<BootSplash />}>
                <Toaster 
                  position="top-center" 
                  toastOptions={{
                    style: {
                      background: 'var(--surface-2, #171717)',
                      color: 'var(--text-color, #fff)',
                      fontSize: '12px',
                      letterSpacing: '0.05em',
                      zIndex: 99999,
                    },
                  }} 
                />
                <Routes>
                  <Route path="/" element={
                    <MainSite 
                      setShowCatalog={setShowCatalog}
                      showCatalog={showCatalog}
                      setCurrentPage={setCurrentPage}
                      currentPage={currentPage}
                      nextPage={nextPage}
                      prevPage={prevPage}
                    />
                  } />
                  <Route path="/books/:slug" element={<BookDetail />} />
                  {/* A category link opens the normal shop (same header + footer) filtered to that category. */}
                  <Route path="/collections/:slug" element={
                    <MainSite
                      setShowCatalog={setShowCatalog}
                      showCatalog={showCatalog}
                      setCurrentPage={setCurrentPage}
                      currentPage={currentPage}
                      nextPage={nextPage}
                      prevPage={prevPage}
                    />
                  } />
                  <Route path="/wishlist" element={<WishlistPage />} />
                  <Route path="/account/*" element={<AccountPage />} />
                  <Route path="/page/:slug" element={<PageView />} />
                  <Route path="/admin/*" element={<Dashboard />} />
                  <Route path="/checkout" element={<Checkout />} />
                  <Route path="/track" element={<OrderTracking />} />
                <Route path="*" element={<NotFoundPage />} />
                </Routes>
          </Suspense>
          </RouteErrorBoundary>
          </BrowserRouter>
        </CartProvider>
      </CurrencyProvider>
      </MotionConfig>
      </LazyMotion>
    </ThemeProvider>
  );
}
