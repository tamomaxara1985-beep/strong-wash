import { SettingsForm } from "@/components/admin/settings-form";
import { getSiteSettings } from "@/lib/queries/settings";

export default async function AdminSettingsPage() {
  const settings = await getSiteSettings();

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-display text-2xl">Site settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Contact details, brand colours and the typeface. Clearing a field restores its
          default.
        </p>
      </header>

      <SettingsForm settings={settings} />
    </div>
  );
}
