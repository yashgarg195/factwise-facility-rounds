import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const serif = Source_Serif_4({ subsets: ["latin"], style: ["normal", "italic"], variable: "--ff-serif" });
const sans = Inter({ subsets: ["latin"], variable: "--ff-sans" });

export const metadata: Metadata = {
  title: "FeverTrack · Quarantine & Treatment Centre (Prototype)",
  description: "Prototype for daily temperature tracking, doctor visits, discharges and outcomes. Synthetic data only.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
