import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Aadhaar QR Code Scanner',
  description: 'Scan and process Aadhaar QR codes with high accuracy',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
        <meta name="description" content="Aadhaar QR Code Scanner" />
        {/* Required for camera access */}
        <meta httpEquiv="permissions-policy" content="camera=*" />
        {/* Set Dynamsoft license before loading the SDK */}
        <Script 
          id="dynamsoft-dbr-init"
          dangerouslySetInnerHTML={{
            __html: `
              if (document) {
                window.dynamsoft = window.dynamsoft || {};
                window.dynamsoft.dbrEnv = window.dynamsoft.dbrEnv || {};
                window.dynamsoft.dbrEnv.licenseKey = "${process.env.NEXT_PUBLIC_DYNAMSOFT_LICENSE}";
                window.dynamsoft.dbrEnv.resourcesPath = "https://cdn.jsdelivr.net/npm/dynamsoft-javascript-barcode@9.6.40/dist/";
              }
            `
          }}
          strategy="beforeInteractive"
        />
        <Script 
          src="https://cdn.jsdelivr.net/npm/dynamsoft-javascript-barcode@9.6.40/dist/dbr.js"
          strategy="afterInteractive"
        />
      </head>
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}
