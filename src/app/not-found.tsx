import type { Metadata } from "next";
import { NotFoundPage } from "@/components/brand/not-found-view";

export const metadata: Metadata = { title: "Halaman tidak ditemukan", robots: { index: false, follow: false } };

export default function NotFound() {
  return <NotFoundPage />;
}