import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter, Montserrat, Outfit, Playfair_Display } from "next/font/google";
import "./globals.css";
import { AppProviders } from "./providers";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  display: "swap",
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "NikoBeaApp",
    template: "%s | NikoBeaApp",
  },
  description: "Niko & Bea's wedding app",
};

/** `viewport-fit=cover` lets backgrounds reach the notch / status bar; `env(safe-area-inset-*)` then pads content. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${montserrat.variable} ${inter.variable} ${playfairDisplay.variable}`}>
      <body
        className={`${montserrat.className} ${geistMono.variable} ${outfit.variable} antialiased`}
      >
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
