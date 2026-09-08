import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { assertLocalSupabaseUrl, promoteLocalSessionToGoogle } from "./fixtures/local-supabase-google";
import { testRecording, testAudioManifest } from "./fixtures/audio";

test.skip(process.env.ADMIN_SUPABASE_INTEGRATION !== "1" || process.env.CLOUD_LEARNING_ENABLED !== "1", "requires local cloud practice integration");
test.use({actionTimeout:15000});
test("explicit takeover cancels safely and fences the previous browser", async ({ browser, baseURL, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent }, testInfo) => {
  test.setTimeout(180000);
  const url = process.env.SUPABASE_INTEGRATION_URL!; assertLocalSupabaseUrl(url);
  const key = process.env.SUPABASE_INTEGRATION_PUBLISHABLE_KEY!;
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const service = createClient(url,process.env.SUPABASE_INTEGRATION_SECRET_KEY!,options);
  const email = `takeover-${randomUUID()}@example.com`, password = randomUUID();
  const created = await service.auth.admin.createUser({email,password,email_confirm:true});
  const id = created.data.user!.id;
  const client = createClient(url,key,options);
  await client.auth.signInWithPassword({email,password});
  const session = await promoteLocalSessionToGoogle(url,service,client,id,"learner");
  const a = await browser.newContext({baseURL,ignoreHTTPSErrors:true,viewport,isMobile,hasTouch,deviceScaleFactor,userAgent});
  const cookies = createServerClient(url,key,{cookies:{getAll:()=>[],setAll:async values => {
    await a.addCookies(values.map(value=>({name:value.name,value:value.value,url:baseURL!,sameSite:"Lax" as const})));
  }}});
  await cookies.auth.setSession(session);
  await a.request.post("/api/auth",{data:{password:"integration-beta-password"}});
  await a.request.get("/api/learner/preferences?timezone=Asia%2FSeoul");
  const b = await browser.newContext({baseURL,ignoreHTTPSErrors:true,viewport,isMobile,hasTouch,deviceScaleFactor,userAgent,storageState:{cookies:await a.cookies(),origins:[]}});
  const lessonId = randomUUID(), version = new Date().toISOString();
  const errors: string[] = [];
  const journal = async () => (await (await b.request.get("/api/learner/practice")).json());
  const playerUrl = `/player?lesson=${lessonId}&level=1&stage=1`;
  async function open(page: Page) {
    page.on("pageerror",error=>errors.push(error.message));
    await page.addInitScript(() => {
      for (const method of ["getItem","setItem","removeItem"] as const) {
        const original = Storage.prototype[method] as (this:Storage,key:string,value?:string)=>string | null | void;
        Object.defineProperty(Storage.prototype,method,{value:function(this:Storage,key:string,value?:string) {
          if(key.startsWith("meta-shadowing:")) throw new Error(`Learning storage used: ${method}`);
          return original.call(this,key,value!);
        }});
      }
    });
    await page.route("**/api/lessons/*/audio/*",route=>route.fulfill({contentType:"audio/webm",body:testRecording}));
    await page.goto(playerUrl);
  }
  try {
    expect((await service.from("lesson_drafts").insert({id:lessonId,created_by:id,title:"Takeover fixture",language:"english",target_filename:"en.txt",korean_filename:"ko.txt",target_source:"Hello",korean_source:"안녕",
      parsed_entries:[1,2].map(phraseNumber=>({kind:"phrase",sourceLine:phraseNumber,phraseNumber,target:`Hello ${phraseNumber}.`,korean:`안녕 ${phraseNumber}.`})),validation_status:"validated",phrase_count:2,chapter_count:0,section_count:0,publication_status:"published",published_at:version,audio_manifest:testAudioManifest(2)})).error).toBeNull();
    const first = await a.newPage(), second = await b.newPage();
    await open(first);
    const starting = first.waitForResponse(response=>response.request().method()==="POST" && response.url().endsWith("/api/learner/practice") && response.request().postDataJSON()?.action==="start");
    await first.getByRole("button",{name:"계정 학습 시작",exact:true}).click();
    const startResponse = await starting, oldStart = startResponse.request().postDataJSON(), oldLease = await startResponse.json();
    await expect(first.getByRole("button",{name:/첫 원음 듣기/})).toBeVisible();
    await open(second);
    const before = await journal();
    const profile = (await (await b.request.get("/api/learner/preferences")).json()).profile;
    expect((await b.request.patch("/api/learner/preferences",{data:{accountId:id,revision:profile.revision,changes:{speed:2}}})).status()).toBe(200);
    expect((await journal()).progress).toEqual(before.progress);
    expect((await journal()).activeLease.generation).toBe(before.activeLease.generation);
    await second.getByRole("button",{name:"계정 학습 시작",exact:true}).click();
    await second.getByRole("button",{name:"이 기기에서 이어 학습",exact:true}).click();
    const dialog = second.getByRole("dialog",{name:"학습 기기를 변경할까요?"});
    await expect(dialog).toBeVisible();
    await second.screenshot({path:testInfo.outputPath("takeover-confirmation.png"),fullPage:true,animations:"disabled"});
    await dialog.getByRole("button",{name:"취소",exact:true}).click();
    expect((await journal()).activeLease.generation).toBe(before.activeLease.generation);
    expect((await journal()).progress).toEqual(before.progress);
    let releaseFirstCheck!: () => void;
    const firstCheckHeld = new Promise<void>(resolve=>{releaseFirstCheck=resolve;});
    await first.route("**/api/learner/practice",async route=>{
      if(route.request().method()!=="POST" || route.request().postDataJSON()?.action!=="renew") return route.fallback();
      const response = await route.fetch(); await firstCheckHeld; await route.fulfill({response});
    });
    await first.getByRole("button",{name:/첫 원음 듣기/}).click();
    await expect(first.getByRole("status")).toContainText("서버 확인 중");
    expect(await first.locator("audio").evaluate((audio:HTMLAudioElement)=>audio.paused)).toBe(true);
    releaseFirstCheck();
    await first.unroute("**/api/learner/practice");
    await expect(first.getByRole("button",{name:/듣기 완료 확인/})).toBeVisible();
    // Commit A's checkpoint, but hold its successful response until after B owns it.
    let release!: () => void, committed!: () => void;
    const held = new Promise<void>(resolve=>{release=resolve;}), saved = new Promise<void>(resolve=>{committed=resolve;});
    await first.route("**/api/learner/practice",async route=>{
      if(route.request().method()!=="POST" || route.request().postDataJSON()?.action!=="checkpoint") return route.fallback();
      const response = await route.fetch(); expect(response.status()).toBe(200); committed();
      await held; await route.fulfill({response});
    });
    await first.getByRole("button",{name:/듣기 완료 확인/}).click();
    await saved;
    const confirmed = (await journal()).progress;
    await second.getByRole("button",{name:"이 기기에서 이어 학습",exact:true}).click();
    const taking = second.waitForResponse(response=>response.request().method()==="POST" && response.url().endsWith("/api/learner/practice") && response.request().postDataJSON()?.action==="takeover");
    await dialog.getByRole("button",{name:"이어 학습 확인",exact:true}).click();
    const takenResponse = await taking, takeoverBody = takenResponse.request().postDataJSON(), taken = await takenResponse.json();
    expect(takenResponse.status()).toBe(200);
    expect(taken.generation).toBe(oldLease.generation+1);
    expect(taken.record).toEqual(confirmed);
    await expect(second.getByRole("button",{name:/첫 원음 듣기/})).toBeVisible();
    expect(await second.locator("audio").evaluate((audio:HTMLAudioElement)=>audio.paused)).toBe(true);
    release();
    await expect(first.getByRole("alert",{name:"학습 저장 알림"})).toContainText("다른 기기",{timeout:15000});
    await expect(first.getByRole("button",{name:/CONTINUE/})).toBeDisabled();
    expect(await first.locator("audio").evaluate((audio:HTMLAudioElement)=>audio.paused)).toBe(true);
    expect((await journal()).progress).toEqual(confirmed);
    await first.unroute("**/api/learner/practice");
    const oldOwner = {accountId:id,instance:oldStart.instance,runId:oldLease.record.runId,generation:oldLease.generation};
    expect((await a.request.post("/api/learner/practice",{data:{action:"renew",...oldOwner}})).status()).toBe(409);
    expect((await a.request.post("/api/learner/practice",{data:{action:"checkpoint",...oldOwner,operation:randomUUID(),revision:1,kind:"advance",nextUnit:1,activeMs:confirmed.activeMs,confirmedCycles:3}})).status()).toBe(409);
    await second.getByRole("button",{name:/첫 원음 듣기/}).click();
    await b.setOffline(true);
    await expect(second.getByRole("button",{name:"학습 연결 확인",exact:true})).toBeVisible();
    expect(await second.locator("audio").evaluate((audio:HTMLAudioElement)=>audio.paused)).toBe(true);
    await b.setOffline(false);
    await second.evaluate(()=>window.dispatchEvent(new Event("focus")));
    await expect(second.getByRole("button",{name:"학습 연결 확인",exact:true})).toHaveCount(0);
    // A fresh explicit takeover must also fence B's earlier takeover receipt.
    const third = {action:"takeover",accountId:id,instance:randomUUID(),operation:randomUUID(),runId:taken.record.runId,generation:taken.generation};
    const thirdResponse = await a.request.post("/api/learner/practice",{data:third});
    expect(thirdResponse.status()).toBe(200);
    await expect(second.getByRole("alert",{name:"학습 저장 알림"})).toContainText("다른 기기",{timeout:12000});
    expect((await b.request.post("/api/learner/practice",{data:takeoverBody})).status()).toBe(409);
    await second.screenshot({path:testInfo.outputPath("previous-device-stopped.png"),fullPage:true,animations:"disabled"});
    await test.step("simultaneous confirmations and checkpoint races keep one writer",async()=>{
      const previous = await thirdResponse.json();
      const candidates = [a,b].map(()=>({...third,instance:randomUUID(),operation:randomUUID(),generation:previous.generation}));
      const responses = await Promise.all([a,b].map((context,index)=>context.request.post("/api/learner/practice",{data:candidates[index]})));
      expect(responses.map(response=>response.status()).sort()).toEqual([200,409]);
      const winner = responses.findIndex(response=>response.status()===200), current = await responses[winner].json();
      const old = {accountId:id,instance:candidates[winner].instance,runId:current.record.runId,generation:current.generation};
      const checkpoint = {action:"checkpoint",...old,operation:randomUUID(),revision:current.revision,kind:"studied",nextUnit:0,activeMs:current.record.activeMs+1200};
      const next = {...third,instance:randomUUID(),operation:randomUUID(),generation:current.generation};
      const [savedResponse,takenResponse] = await Promise.all([
        a.request.post("/api/learner/practice",{data:checkpoint}),b.request.post("/api/learner/practice",{data:next})
      ]);
      expect([200,409]).toContain(savedResponse.status());
      expect(takenResponse.status()).toBe(200);
      const taken = await takenResponse.json();
      expect(taken.record.activeMs).toBe(savedResponse.status()===200 ? checkpoint.activeMs : current.record.activeMs);
      expect((await journal()).progress).toEqual(taken.record);
      expect((await a.request.post("/api/learner/practice",{data:checkpoint})).status()).toBe(409);
      expect((await a.request.post("/api/learner/practice",{data:oldStart})).status()).toBe(409);
      expect((await a.request.post("/api/learner/practice",{data:{action:"renew",...old}})).status()).toBe(409);
    });
    for (const committedBeforeFailure of [false,true]) await test.step(`pending save retry after takeover, committed=${committedBeforeFailure}`,async()=>{
      const pendingPage = await b.newPage(), takingPage = await a.newPage();
      await open(pendingPage);
      await pendingPage.getByRole("button",{name:"이 기기에서 이어 학습",exact:true}).click();
      await pendingPage.getByRole("button",{name:"이어 학습 확인",exact:true}).click();
      await pendingPage.getByRole("button",{name:/첫 원음 듣기/}).click();
      await expect(pendingPage.getByRole("button",{name:/듣기 완료 확인/})).toBeVisible();
      await pendingPage.route("**/api/learner/practice",async route=>{
        if(route.request().method()!=="POST" || route.request().postDataJSON()?.action!=="checkpoint") return route.fallback();
        if(committedBeforeFailure) expect((await route.fetch()).status()).toBe(200);
        await route.fulfill({status:503,json:{error:"temporary-error"}});
      });
      await pendingPage.getByRole("button",{name:/듣기 완료 확인/}).click();
      await expect(pendingPage.getByRole("button",{name:"저장 재시도",exact:true})).toBeVisible();
      await open(takingPage);
      await takingPage.getByRole("button",{name:"이 기기에서 이어 학습",exact:true}).click();
      await takingPage.getByRole("button",{name:"이어 학습 확인",exact:true}).click();
      await expect(takingPage.getByRole("button",{name:/첫 원음 듣기/})).toBeVisible();
      const after = await journal();
      await pendingPage.unroute("**/api/learner/practice");
      await pendingPage.getByRole("button",{name:"저장 재시도",exact:true}).click();
      await expect(pendingPage.getByRole("alert",{name:"학습 저장 알림"})).toContainText("다른 기기");
      expect((await journal()).progress).toEqual(after.progress);
      await takingPage.getByRole("button",{name:/첫 원음 듣기/}).click();
      await takingPage.evaluate(()=>{
        Object.defineProperty(document,"hidden",{configurable:true,get:()=>true});
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await expect(takingPage.getByRole("button",{name:"학습 연결 확인",exact:true})).toBeVisible();
      expect(await takingPage.locator("audio").evaluate((audio:HTMLAudioElement)=>audio.paused)).toBe(true);
      await takingPage.evaluate(()=>{
        Object.defineProperty(document,"hidden",{configurable:true,get:()=>false});
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await expect(takingPage.getByRole("button",{name:"학습 연결 확인",exact:true})).toHaveCount(0);
      await pendingPage.close();
      // Keep an active lease for the next iteration.
    });
    await test.step("a renewal held across background and takeover cannot restart audio",async()=>{
      const resuming = await b.newPage(); await open(resuming);
      await resuming.getByRole("button",{name:"이 기기에서 이어 학습",exact:true}).click();
      await resuming.getByRole("button",{name:"이어 학습 확인",exact:true}).click();
      await expect(resuming.getByRole("button",{name:/첫 원음 듣기/})).toBeVisible();
      const current = (await journal()).activeLease;
      let release!:()=>void, received!:()=>void;
      const held = new Promise<void>(resolve=>{release=resolve;}), checked = new Promise<void>(resolve=>{received=resolve;});
      let once = true;
      await resuming.route("**/api/learner/practice",async route=>{
        if(!once || route.request().method()!=="POST" || route.request().postDataJSON()?.action!=="renew") return route.fallback();
        once = false;
        const response = await route.fetch(); expect(response.status()).toBe(200); received();
        await held; await route.fulfill({response});
      });
      await resuming.getByRole("button",{name:/첫 원음 듣기/}).click();
      await checked;
      await resuming.evaluate(()=>{
        Object.defineProperty(document,"hidden",{configurable:true,get:()=>true});
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect((await a.request.post("/api/learner/practice",{data:{...third,instance:randomUUID(),operation:randomUUID(),generation:current.generation}})).status()).toBe(200);
      await resuming.evaluate(()=>{
        Object.defineProperty(document,"hidden",{configurable:true,get:()=>false});
        document.dispatchEvent(new Event("visibilitychange"));
      });
      release();
      await expect(resuming.getByRole("alert",{name:"학습 저장 알림"})).toContainText("다른 기기",{timeout:5000});
      expect(await resuming.locator("audio").evaluate((audio:HTMLAudioElement)=>audio.paused)).toBe(true);
      await expect(resuming.getByRole("button",{name:/CONTINUE/})).toBeDisabled();
    });
    await test.step("an open confirmation never adopts a newer owner on focus refresh",async()=>{
      const confirming = await b.newPage(); await open(confirming);
      const observed = (await journal()).activeLease;
      await confirming.getByRole("button",{name:"이 기기에서 이어 학습",exact:true}).click();
      expect((await a.request.post("/api/learner/practice",{data:{...third,instance:randomUUID(),operation:randomUUID(),generation:observed.generation}})).status()).toBe(200);
      const preferencesLoaded = confirming.waitForResponse(response=>response.url().includes("/api/learner/preferences") && response.request().method()==="GET");
      await confirming.evaluate(()=>window.dispatchEvent(new Event("focus")));
      await preferencesLoaded;
      await confirming.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
      const response = confirming.waitForResponse(response=>response.request().method()==="POST" && response.url().endsWith("/api/learner/practice") && response.request().postDataJSON()?.action==="takeover");
      await confirming.getByRole("button",{name:"이어 학습 확인",exact:true}).click();
      const result = await response;
      expect(result.request().postDataJSON().generation).toBe(observed.generation);
      expect(result.status()).toBe(409);
    });
    expect(errors).toEqual([]);
  } finally {
    await Promise.all([a.close(),b.close()]);
    await service.auth.admin.deleteUser(id);
  }
});
