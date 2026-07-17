import { NotificationPreferencesForm } from "@/app/components/notification-preferences";
import { requireSessionUser } from "@/app/lib/session";
import { createDatabase, type Database } from "@/app/server/db";
import { getNotificationPreferences } from "@/app/server/account/notification-preferences";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/app/server/db/schema/users";

/**
 * Account notification-preferences screen (M9-T7).
 *
 * Gated server component: it reads the caller's current preferences server-side
 * and hands them to the client toggle form, which round-trips changes through
 * `PATCH /api/me/notifications`.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T7)
 */

let cachedDatabase: Database | undefined;
function database(): Database {
  cachedDatabase ??= createDatabase();
  return cachedDatabase;
}

export default async function NotificationsPage() {
  const user = await requireSessionUser();
  const preferences =
    (await getNotificationPreferences(database(), user.id)) ??
    DEFAULT_NOTIFICATION_PREFERENCES;

  return (
    <main className="mx-auto w-full max-w-xl px-6 py-12">
      <NotificationPreferencesForm initial={preferences} />
    </main>
  );
}
