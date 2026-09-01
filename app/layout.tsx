import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  ),
  title: 'WerkMatch · Your job radar',
  description:
    'Find technical working-student roles, understand every match, and generate verified application documents on demand.',
  openGraph: {
    title: 'WerkMatch · Your job radar',
    description:
      'Find technical working-student roles and generate verified application documents on demand.',
    images: [
      { url: '/og.png', width: 1792, height: 1024, alt: 'WerkMatch job radar' },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'WerkMatch · Your job radar',
    description:
      'Find technical working-student roles and generate verified application documents on demand.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
