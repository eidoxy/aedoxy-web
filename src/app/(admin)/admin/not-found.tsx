import type { Metadata } from "next";
import { NotFoundInShell } from "@/components/brand/not-found-view";

export const metadata: Metadata = { title: "Halaman tidak ditemukan", robots: { index: false, follow: false } };

export default function AdminNotFound() {
  return <NotFoundInShell homeHref="/admin" homeLabel="Ke ringkasan admin" />;
}