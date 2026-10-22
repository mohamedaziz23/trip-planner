import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { ToastProvider } from '@/components/Toaster';
import { AppShell } from '@/components/AppShell';
import { ServiceWorker } from '@/components/ServiceWorker';

export const metadata: Metadata = {
  title: { default: 'Trip Planner', template: '%s · Trip Planner' },
  description: 'Plan a trip together: itinerary on a map, shared budget, smart packing list and travel journal - even offline.',
  applicationName: 'Trip Planner',
  appleWebApp: { capable: true, title: 'Trip Planner', statusBarStyle: 'default' },
  icons: {
    icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#0f766e',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <AuthProvider>
          <ToastProvider>
            <ServiceWorker />
            <AppShell>{children}</AppShell>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
