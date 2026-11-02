import type { Metadata } from "next";
import { NotFoundInShell } from "@/components/brand/not-found-view";

export const metadata: Metadata = { title: "Halaman tidak ditemukan", robots: { index: false, follow: false } };

export default function PanelNotFound() {
  return <NotFoundInShell homeHref="/dashboard" homeLabel="Ke dashboard" />;
}