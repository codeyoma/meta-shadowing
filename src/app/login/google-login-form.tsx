"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function GoogleLoginForm({ error }: { error?: string }) {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    // Re-enable the form when Back restores it from the browser's page cache.
    const restored = () => setPending(false);
    window.addEventListener("pageshow", restored);
    return () => window.removeEventListener("pageshow", restored);
  }, []);
  return (
    <form action="/auth/google" method="post" className="grid gap-4" aria-busy={pending} onSubmit={() => setPending(true)}>
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      <Button variant="google" size="lg" className="w-full" type="submit" disabled={pending}>
        <img src="https://developers.google.com/static/identity/images/g-logo.png" width="20" height="20" alt="" referrerPolicy="no-referrer" />
        Google로 로그인하기
      </Button>
      {pending ? <p role="status" className="text-center text-sm text-muted-foreground">Google 로그인으로 이동하고 있어요.</p> : null}
    </form>
  );
}
