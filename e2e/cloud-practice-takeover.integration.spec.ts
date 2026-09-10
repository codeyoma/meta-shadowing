import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { assertLocalSupabaseUrl, promoteLocalSessionToGoogle } from "./fixtures/local-supabase-google";
import { createVerifiedTestAudio } from "./fixtures/verified-audio";

test.skip(process.env.ADMIN_SUPABASE_INTEGRATION !== "1" || process.env.CLOUD_LEARNING_ENABLED !== "1", "requires local cloud practice integration");
test.use({actionTimeout:15000});
test("retained takeover API fences stale generations and serializes ownership races", async ({ browser, baseURL, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent }) => {
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
  const journal = async () => (await (await b.request.get("/api/learner/practice")).json());
  const audio = createVerifiedTestAudio(service, id, lessonId, 2);
  try {
    expect((await service.from("lesson_drafts").insert({id:lessonId,created_by:id,title:"Takeover fixture",language:"english",target_filename:"en.txt",korean_filename:"ko.txt",target_source:"Hello",korean_source:"안녕",
      parsed_entries:[1,2].map(phraseNumber=>({kind:"phrase",sourceLine:phraseNumber,phraseNumber,target:`Hello ${phraseNumber}.`,korean:`안녕 ${phraseNumber}.`})),validation_status:"validated",phrase_count:2,chapter_count:0,section_count:0,publication_status:"published",published_at:version,audio_manifest:audio.manifest})).error).toBeNull();
    await audio.upload();
    const oldStart = { action: "start", accountId: id, instance: randomUUID(), operation: randomUUID(), lessonId, lessonVersion: version, level: 2, stage: 3 };
    const started = await a.request.post("/api/learner/practice", { data: oldStart });
    expect(started.status()).toBe(200);
    const oldLease = await started.json();
    const before = await journal();
    const profile = (await (await b.request.get("/api/learner/preferences")).json()).profile;
    expect((await b.request.patch("/api/learner/preferences", { data: { accountId: id, revision: profile.revision, changes: { speed: 2 } } })).status()).toBe(200);
    expect((await journal()).progress).toEqual(before.progress);
    expect((await journal()).activeLease.generation).toBe(before.activeLease.generation);
    const oldOwner = { accountId: id, instance: oldStart.instance, runId: oldLease.record.runId, generation: oldLease.generation };
    const checkpoint = { action: "checkpoint", ...oldOwner, operation: randomUUID(), revision: 0, kind: "studied", nextUnit: 0, activeMs: 1200 };
    expect((await a.request.post("/api/learner/practice", { data: checkpoint })).status()).toBe(200);
    const confirmed = (await journal()).progress;
    const takeoverBody = { action: "takeover", accountId: id, instance: randomUUID(), operation: randomUUID(), runId: oldLease.record.runId, generation: oldLease.generation };
    const takenResponse = await b.request.post("/api/learner/practice", { data: takeoverBody });
    expect(takenResponse.status()).toBe(200);
    const taken = await takenResponse.json();
    expect(taken.generation).toBe(oldLease.generation + 1);
    expect(taken.record).toEqual(confirmed);
    expect((await a.request.post("/api/learner/practice", { data: { action: "renew", ...oldOwner } })).status()).toBe(409);
    expect((await a.request.post("/api/learner/practice", { data: { action: "checkpoint", ...oldOwner, operation: randomUUID(), revision: 1, kind: "advance", nextUnit: 1, activeMs: confirmed.activeMs, confirmedCycles: 3 } })).status()).toBe(409);
    const third = { action: "takeover", accountId: id, instance: randomUUID(), operation: randomUUID(), runId: taken.record.runId, generation: taken.generation };
    const thirdResponse = await a.request.post("/api/learner/practice", { data: third });
    expect(thirdResponse.status()).toBe(200);
    expect((await b.request.post("/api/learner/practice", { data: takeoverBody })).status()).toBe(409);
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
    // A caller retaining an observed generation cannot adopt a newer owner.
    const observed = (await journal()).activeLease;
    const newer = { ...third, instance: randomUUID(), operation: randomUUID(), generation: observed.generation };
    expect((await a.request.post("/api/learner/practice", { data: newer })).status()).toBe(200);
    expect((await b.request.post("/api/learner/practice", { data: { ...newer, instance: randomUUID(), operation: randomUUID() } })).status()).toBe(409);
  } finally {
    await Promise.all([a.close(),b.close()]);
    await service.auth.admin.deleteUser(id);
    await audio.cleanup();
  }
});
