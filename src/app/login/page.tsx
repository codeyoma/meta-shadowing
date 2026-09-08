import { redirect } from "next/navigation";
import { hasBetaAccess, getGoogleLearnerIdentity } from "@/lib/server-auth";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Brand, Page } from "../ui";
import styles from "../learner.module.css";
import { GoogleLoginForm } from "./google-login-form";

const errors: Record<string, string> = {
  cancelled: "Google 로그인이 취소되었습니다. 다시 로그인해 주세요.",
  "invalid-session": "로그인을 완료하지 못했습니다. 다시 시도해 주세요.",
  unavailable: "지금은 Google 로그인에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요."
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!(await hasBetaAccess())) redirect("/");
  if (await getGoogleLearnerIdentity()) redirect("/languages");
  const { error } = await searchParams;
  return (
    <Page className={styles.entryPage}>
      <ScrollArea className={styles.entryScroll} viewportProps={{ className: styles.entryViewport, role: "region", "aria-label": "로그인 안내" }}>
        <section className={styles.entryShell} aria-labelledby="login-title">
          <Brand />
          <div className="grid gap-4">
            <h1 id="login-title" className={styles.entryTitle}>로그인</h1>
            <p className="text-muted-foreground">Google 계정으로 Meta Shadowing을 시작하세요.</p>
          </div>
          <GoogleLoginForm error={typeof error === "string" && Object.hasOwn(errors, error) ? errors[error] : undefined} />
        </section>
      </ScrollArea>
    </Page>
  );
}
