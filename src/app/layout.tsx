import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/ui/toast';
import { getCurrentUser } from '@/server/auth/session';

export const metadata: Metadata = {
  title: {
    default: 'Blue Point OS',
    template: '%s · Blue Point OS',
  },
  description: 'نظام Blue Point الداخلي لإدارة العملاء والمبيعات والمشاريع والمالية',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Blue Point OS' },
  icons: { icon: '/brand/icon.png', apple: '/brand/icon.png' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0B1A2F',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const locale = user?.locale === 'en' ? 'en' : 'ar';
  const dir = locale === 'en' ? 'ltr' : 'rtl';

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
