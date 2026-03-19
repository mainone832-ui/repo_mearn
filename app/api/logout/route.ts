import { db } from "@/lib/firebaseadmin";
import { getSessionCookieOptions, SESSION_COOKIE_NAME } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";

type SessionRecord = {
  sessionToken?: unknown;
} & Record<string, unknown>;

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value?.trim();

  if (sessionToken) {
    try {
      const sessionSnapshot = await db.ref("sessions").get();

      if (sessionSnapshot.exists()) {
        const sessions = sessionSnapshot.val() as Record<string, SessionRecord>;
        const matchingKeys = Object.entries(sessions)
          .filter(([, sessionData]) => sessionData.sessionToken === sessionToken)
          .map(([key]) => key);

        const updates = matchingKeys.reduce<Record<string, null>>(
          (accumulator, key) => {
            accumulator[`sessions/${key}`] = null;
            return accumulator;
          },
          {},
        );

        if (Object.keys(updates).length > 0) {
          await db.ref().update(updates);
        }
      }
    } catch (error) {
      console.error("Failed to clear session during logout", error);
    }
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", getSessionCookieOptions(0));

  return response;
}
