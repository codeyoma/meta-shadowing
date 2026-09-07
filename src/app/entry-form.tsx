"use client";

import { FormEvent, useState } from "react";
import { Brand, Page } from "./ui";
import { OnlineInstallHelp } from "./online-install-help";

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
    <Page className="entry-page">
      <section className="entry-shell" aria-labelledby="entry-title">
        <Brand />
        <div className="entry-copy">
          <h1 id="entry-title">엄선된 문장으로,<br />여덟 번 다르게.</h1>
        </div>
        <form className="entry-form" onSubmit={submit}>
          <label htmlFor="beta-password">베타 비밀번호</label>
          <input
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
          {errorMessage ? <p id="password-error" className="password-error" role="alert">{errorMessage}</p> : null}
          <button className="primary-button" type="submit" disabled={status === "submitting"}>
            입장하기
          </button>
        </form>
        <OnlineInstallHelp />
      </section>
    </Page>
  );
}
