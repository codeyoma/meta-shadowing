"use client";

import { FormEvent, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Brand, Page } from "./ui";
import { OnlineInstallHelp } from "./online-install-help";
import styles from "./learner.module.css";

export function EntryForm() {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "wrong-password" | "unavailable">("idle");
  const errorMessage = status === "wrong-password"
    ? "비밀번호가 올바르지 않습니다."
    : status === "unavailable"
      ? "지금은 입장할 수 없습니다. 잠시 후 다시 시도해 주세요."
      : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    try {
      const response = await fetch("/api/auth", {
        body: JSON.stringify({ password }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });

      if (response.ok) {
        window.location.assign("/home");
        return;
      }

      setStatus(response.status === 401 ? "wrong-password" : "unavailable");
    } catch {
      setStatus("unavailable");
    }
  }

  return (
    <Page className={styles.entryPage}>
      <ScrollArea className={styles.entryScroll} viewportProps={{ className: styles.entryViewport, role: "region", "aria-label": "입장 안내" }}>
      <section className={styles.entryShell} aria-labelledby="entry-title">
        <Brand />
        <h1 id="entry-title" className={styles.entryTitle}>엄선된 문장으로,<br />여덟 번 다르게.</h1>
        <form onSubmit={submit} aria-busy={status === "submitting"}>
          <FieldGroup>
            <Field data-invalid={status === "wrong-password"}>
              <FieldLabel htmlFor="beta-password">베타 비밀번호</FieldLabel>
              <Input
                id="beta-password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={status === "wrong-password"}
                aria-describedby={errorMessage ? "password-error" : undefined}
                required
              />
              {errorMessage ? <Alert id="password-error" variant="destructive"><AlertDescription>{errorMessage}</AlertDescription></Alert> : null}
            </Field>
            <Button size="lg" className="w-full" type="submit" disabled={status === "submitting"}>
              입장하기
            </Button>
          </FieldGroup>
        </form>
        <OnlineInstallHelp />
      </section>
      </ScrollArea>
    </Page>
  );
}
