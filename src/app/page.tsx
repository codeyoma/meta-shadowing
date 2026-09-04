import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LEARNER_COOKIE_NAME, verifyLearnerCookie } from "@/lib/auth";
import { readAuthEnvironment } from "@/lib/server-auth";
import { EntryForm } from "./ui";

export default async function EntryPage() {
  const config = readAuthEnvironment();
  const cookie = (await cookies()).get(LEARNER_COOKIE_NAME)?.value;
  if (config && verifyLearnerCookie(cookie, config.secret)) redirect("/home");

  return <EntryForm />;
}
