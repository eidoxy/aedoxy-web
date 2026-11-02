import type { Metadata } from "next";
import { Suspense } from "react";
import { ActivityPreferenceForm } from "@/components/panel/activity-preference-form";
import { getShowActivity } from "@/server/domain/activity";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Pengaturan" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<div aria-hidden className="h-72 max-w-xl rounded-[18px] border border-line bg-surface" />}>
      <Settings />
    </Suspense>
  );
}

async function Settings() {
  const { user } = await requireSession();
  const show = await getShowActivity(user.id);
  return (
    <div>
      <p className="eyebrow">Pengaturan</p>
      <h1 className="mt-3 text-4xl font-medium tracking-[-0.04em] text-heading">Pengaturan akun</h1>
      <ActivityPreferenceForm initialShow={show} />
    </div>
  );
}
