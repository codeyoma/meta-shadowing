import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { assertLocalSupabaseUrl, promoteLocalSessionToGoogle } from "./fixtures/local-supabase-google";
import { testRecording } from "./fixtures/audio";
import { createVerifiedTestAudio } from "./fixtures/verified-audio";
import { installPlayerPackage } from "./fixtures/cloud-navigation";
import { confirmManualListen } from "./fixtures/manual-practice";
import { auditLearningStorage } from "./fixtures/storage-audit";

test.skip(process.env.ADMIN_SUPABASE_INTEGRATION !== "1" || process.env.CLOUD_LEARNING_ENABLED !== "1", "requires local cloud practice integration");

for (const level of [1,2,3,4,5,6,7,8]) test(`level ${level} uses acknowledged units, run settings and cross-device resume`, async ({ browser, baseURL, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent }, testInfo) => {
  test.setTimeout(120000);
  const url = process.env.SUPABASE_INTEGRATION_URL!; assertLocalSupabaseUrl(url);
  const key = process.env.SUPABASE_INTEGRATION_PUBLISHABLE_KEY!;
  const options = {auth:{persistSession:false,autoRefreshToken:false}};
  const service = createClient(url,process.env.SUPABASE_INTEGRATION_SECRET_KEY!,options);
  const email = `modes-${randomUUID()}@example.com`, password = randomUUID();
  const created = await service.auth.admin.createUser({email,password,email_confirm:true});
  const id = created.data.user!.id;
  const client = createClient(url,key,options);
  await client.auth.signInWithPassword({email,password});
  const session = await promoteLocalSessionToGoogle(url,service,client,id,"learner");
  const a = await browser.newContext({baseURL,ignoreHTTPSErrors:true,viewport,isMobile,hasTouch,deviceScaleFactor,userAgent});
  const cookies = createServerClient(url,key,{cookies:{getAll:()=>[],setAll: async values => {
    await a.addCookies(values.map(value=>({name:value.name,value:value.value,url:baseURL!,sameSite:"Lax" as const})));
  }}});
  await cookies.auth.setSession(session);
  await a.request.post("/api/auth",{data:{password:"integration-beta-password"}});
  await a.request.get("/api/learner/preferences?timezone=Asia%2FSeoul");
  const b = await browser.newContext({baseURL,ignoreHTTPSErrors:true,viewport,isMobile,hasTouch,deviceScaleFactor,userAgent,storageState:{cookies:await a.cookies(),origins:[]}});
  const persistentAccess = [await auditLearningStorage(a), await auditLearningStorage(b)];
  const grouped = level===4 || level===5, rapid = level>=6;
  const lessonId = randomUUID(), count = grouped ? 5 : 2;
  const errors: string[] = [], storage: string[] = [];
  const journal = async () => (await (await b.request.get("/api/learner/practice")).json());
  const playerUrl = `/player?lesson=${lessonId}&level=${level}&stage=${level*2-1}`;
  const audio = createVerifiedTestAudio(service, id, lessonId, count);
  async function open(page: Page) {
    page.on("pageerror",error=>errors.push(error.message));
    page.on("console",message=>{if(message.text().startsWith("learning-storage:")) storage.push(message.text());});
    await page.addInitScript(() => {
      for(const method of ["getItem","setItem","removeItem"] as const) {
        const original = Storage.prototype[method] as (this:Storage,key:string,value?:string)=>string | null | void;
        Object.defineProperty(Storage.prototype,method,{value:function(this:Storage,key:string,value?:string) {
          if(key.startsWith("meta-shadowing:") && !["meta-shadowing:device-access:v1", "meta-shadowing:device-access-fence:v1"].includes(key)) console.warn(`learning-storage:${method}:${key}`);
          return original.call(this,key,value!);
        }});
      }
    });
    await page.route("**/api/lessons/*/audio/*",route=>route.fulfill({contentType:"audio/webm",body:testRecording}));
    await page.goto(playerUrl);
    await installPlayerPackage(page);

    await expect(page.getByRole("button",{name:/CONTINUE/})).toBeVisible();
  }
  async function leave(page: Page) {
    await page.getByRole("button",{name:"학습 메뉴",exact:true}).click();
    await page.getByRole("button",{name:"스테이지 화면으로",exact:true}).click();
    await expect(page).toHaveURL(/\/stages/);
  }
  async function dropFinal(page: Page) {
    let dropped = false;
    await page.route("**/api/learner/practice",async route=>{
      const command = route.request().method()==="POST" ? route.request().postDataJSON() : null;
      if(dropped || command?.action!=="checkpoint" || !["advance","line"].includes(command.kind) || command.nextUnit!==2) return route.fallback();
      dropped = true; const response = await route.fetch(); expect(response.status()).toBe(200);
      await route.fulfill({status:503,contentType:"application/json",body:'{"error":"temporary-error"}'});
    });
  }
  try {
    expect((await service.from("learner_preferences").update({settings:{mode:grouped?"manual":"automatic",speed:3,groupSize:2,groupGapMs:0,advanceDelayMs:0,wpmLevel:6,speakingExtraMs:0,lineGapMs:0,sectionGapMs:0}}).eq("user_id",id)).error).toBeNull();
    expect((await service.from("lesson_drafts").insert({id:lessonId,created_by:id,title:`Cloud level ${level}`,language:"english",target_filename:"en.txt",korean_filename:"ko.txt",target_source:"Hello",korean_source:"안녕",
      parsed_entries:Array.from({length:count},(_,i)=>({kind:"phrase",sourceLine:i+1,phraseNumber:i+1,target:`Hello ${i+1}.`,korean:`안녕 ${i+1}.`})),validation_status:"validated",phrase_count:count,chapter_count:0,section_count:0,publication_status:"published",published_at:new Date().toISOString(),audio_manifest:audio.manifest})).error).toBeNull();
    await audio.upload();
    let page = await a.newPage(); await open(page);
    const initial = (await journal()).progress;
    expect(initial.unitStarts).toEqual(grouped ? [0,2,5] : [0,1,2]);
    // Navigation is a fenced write, not evidence of study.
    await page.getByRole("button",{name:"학습 메뉴",exact:true}).click();
    await page.getByRole("button",{name:"문장 목록",exact:true}).click();
    await page.getByRole("button",{name:/Hello 1/}).click();
    await expect.poll(async()=> (await journal()).studyDays).toEqual([]);
    // Settings are applied to this run only, and acknowledged before the UI changes.
    await page.getByRole("button",{name:"학습 메뉴",exact:true}).click();
    await page.getByRole("button",{name:"학습 설정",exact:true}).click();
    const setting = rapid ? page.getByLabel("단어 속도") : page.getByLabel("재생속도");
    await setting.selectOption(rapid ? "5" : "2");
    await expect(setting).toHaveValue(rapid ? "5" : "2");
    await expect.poll(async()=> (await journal()).progress.settings[rapid?"wpmLevel":"speed"]).toBe(rapid?5:2);
    expect((await (await b.request.get("/api/learner/preferences")).json()).profile.overrides[rapid?"wpmLevel":"speed"]).toBe(rapid?6:3);
    await page.keyboard.press("Escape");
    if (grouped) {
      await page.getByRole("button",{name:/첫 원음 듣기/}).click();
      await confirmManualListen(page);
      await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
      expect((await journal()).progress).toMatchObject({nextUnit:0,nextPhrase:0});
      await leave(page); await page.close();
      page = await b.newPage(); await open(page);
      await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 0 / 3");
      await page.getByRole("button",{name:/첫 원음 듣기/}).click();
      for(let cycle=1;cycle<=3;cycle++) { await confirmManualListen(page); await expect(page.getByLabel("완료한 듣기")).toHaveText(`필수 ${cycle} / 3`); }
      await page.getByRole("button",{name:/NEXT/}).click();
      await expect.poll(async()=> (await journal()).progress.nextPhrase).toBe(2);
      // The short recording at 2x can finish between Playwright polls. Pause at
      // the visible second-phrase transition so this tests a stable mid-group exit.
      await page.evaluate(()=>{
        const list = document.querySelector('[aria-label="묶음 프레이즈"]')!;
        const observer = new MutationObserver(()=>{
          if(list.children[1]?.getAttribute("aria-current")!=="true") return;
          const pause = document.querySelector<HTMLButtonElement>('button[aria-label^="PAUSE"]');
          if(!pause) return;
          observer.disconnect(); pause.click();
        });
        observer.observe(list,{subtree:true,attributes:true,attributeFilter:["aria-current"]});
      });
      await page.getByRole("button",{name:/첫 원음 듣기/}).click();
      await expect(page.getByRole("list",{name:"묶음 프레이즈"}).getByRole("listitem").nth(1)).toHaveAttribute("aria-current","true");
      await expect(page.locator("audio")).toHaveJSProperty("paused",true);
      await leave(page); await page.close();
      page = await a.newPage(); await open(page);
      await dropFinal(page);
      expect((await journal()).progress).toMatchObject({nextUnit:1,nextPhrase:2,settings:{speed:2}});
      await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 0 / 3");
      await page.getByRole("button",{name:/첫 원음 듣기/}).click();
      for(let cycle=1;cycle<=3;cycle++) { await confirmManualListen(page); await expect(page.getByLabel("완료한 듣기")).toHaveText(`필수 ${cycle} / 3`); }
      await page.getByRole("button",{name:/NEXT/}).click();
    } else {
      // Drop the response after a real committed boundary, never mock successful saves.
      let dropped = false;
      await page.route("**/api/learner/practice",async route=>{
        const command = route.request().method()==="POST" ? route.request().postDataJSON() : null;
        const shouldDrop = !dropped && command?.action==="checkpoint" && command.kind===(rapid?"line":"studied");
        if (!shouldDrop) return route.continue();
        dropped = true; await route.fetch();
        await route.fulfill({status:503,contentType:"application/json",body:'{"error":"temporary-error"}'});
      });
      await page.getByRole("button",{name:/CONTINUE/}).click();
      await expect(page.getByRole("button",{name:"저장 재시도",exact:true})).toBeVisible({timeout:15000});
      const saved = (await journal()).progress;
      await expect(page.getByRole("progressbar").first()).toHaveAttribute("aria-valuenow","0");
      if (rapid) {
        // A lost acknowledgment remains RAM-only. A different device resumes the
        // server-confirmed next line, not a browser token position or duplicate line.
        page.once("dialog",dialog=>dialog.accept());
        await leave(page); await page.close();
        page = await b.newPage(); await open(page);
        expect((await journal()).progress).toMatchObject({nextUnit:1,activeMs:saved.activeMs,settings:{wpmLevel:5}});
        await expect(page.getByRole("progressbar").first()).toHaveAttribute("aria-valuenow","1");
        await dropFinal(page);
        await page.getByRole("button",{name:/CONTINUE/}).click();
      } else {
        await dropFinal(page);
        await page.getByRole("button",{name:"저장 재시도",exact:true}).click();
        await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 3 / 3",{timeout:15000});
        await page.getByRole("button",{name:/NEXT/}).click();
        await expect(page.getByRole("progressbar").first()).toHaveAttribute("aria-valuenow","1");
        await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 3 / 3",{timeout:15000});
        // The fifth automatic repetition itself finishes the run; no final click
        // may bypass its acknowledgment or use the previous four-cycle count.
        await page.getByRole("button",{name:/REPEAT/}).click();
      }
      expect(saved.activeMs).toBeGreaterThan(0);
    }
    await expect(page.getByRole("button",{name:"저장 재시도",exact:true})).toBeVisible({timeout:15000});
    const beforeRetry = await journal();
    expect(beforeRetry.history).toHaveLength(1);
    await expect(page.getByRole("heading",{name:`레벨 ${level} 학습 완료`,exact:true})).toHaveCount(0);
    await page.getByRole("button",{name:"저장 재시도",exact:true}).click();
    await expect(page.getByRole("heading",{name:`레벨 ${level} 학습 완료`,exact:true})).toBeVisible({timeout:15000});
    const completed = await journal();
    expect(completed.progress).toBeNull(); expect(completed.history).toHaveLength(1); expect(completed.studyDays).toHaveLength(1);
    expect(completed.history[0]).toMatchObject({nextUnit:2,nextPhrase:count,settings:rapid?{wpmLevel:5}:{speed:2}});
    expect(completed.history[0].activeMs).toBeGreaterThan(0);
    expect(completed.history[0].activeMs).toBe(beforeRetry.history[0].activeMs);
    expect(storage).toEqual([]); expect(persistentAccess.flat()).toEqual([]); expect(errors).toEqual([]);
    await page.screenshot({path:testInfo.outputPath(`cloud-level-${level}.png`),animations:"disabled"});
  } finally {
    await a.close(); await b.close();
    await service.from("lesson_drafts").delete().eq("id",lessonId);
    await audio.cleanup();
    await service.auth.admin.deleteUser(id);
  }
});
