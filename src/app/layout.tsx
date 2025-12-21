import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { ToastProvider } from "@/components/ui/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { PwaInstallPrompt } from "@/components/pwa/pwa-install-prompt";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Verial Services | NZ Local Services",
  description: "Find trusted local services in New Zealand.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/api/pwa/icon?size=32" }],
    apple: [{ url: "/api/pwa/icon?size=180" }],
  },
  appleWebApp: {
    capable: true,
    title: "Verial",
    statusBarStyle: "default",
  },
};

export const viewport = {
  themeColor: "#0b1220",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className={inter.className}>
          <ToastProvider>
            {children}
            <Toaster />
            <PwaInstallPrompt />
          </ToastProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
