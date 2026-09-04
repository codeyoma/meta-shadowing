# 영어 텍스트를 원어민처럼 읽는 음성 파일로 만드는 서비스 조사

- 조사 기준일·공식 페이지 최종 접속일: **2026-09-04 (Asia/Seoul)**
- 조사 범위: 영어 텍스트 입력 → 자연스러운 합성 음성 생성 → MP3/WAV 등 파일 저장 또는 스트림 저장
- 출처 원칙: 서비스 운영사의 공식 제품 문서·가격표·약관만 사용했다. 별도 표기가 없는 링크는 모두 2026-09-04에 확인했다.
- 가격 기준: 공개된 USD 정가. 세금, 지역, 연간 결제 할인, 엔터프라이즈 계약은 제외했으며 가격은 수시로 바뀔 수 있다.

## 먼저 보는 결론

“어느 서비스가 가장 사람 같다”는 결론은 공식 문서만으로 확정할 수 없다. 각 회사가 말하는 *human-like*, *lifelike*, *natural*은 자기 제품에 대한 주장이지 독립 블라인드 청취 결과가 아니다. 이 보고서의 추천은 **모델의 절대 음질 순위가 아니라, 공식 문서로 검증한 기능과 사용 조건을 바탕으로 한 용도별 판단**이다.

1. **코드 없이 영상·팟캐스트용 파일을 빨리 만들기**: ElevenLabs, Murf, Speechify Studio가 가장 직접적이다. Azure Speech Studio도 세밀한 편집과 WAV/MP3 내보내기가 강하지만 클라우드 계정 설정이 조금 더 복잡하다.
2. **표현력·연기 지시가 중요한 내레이션**: ElevenLabs v3, Speechify의 instruction 지원 음성, Hume Octave 1, OpenAI `gpt-4o-mini-tts`, Google Gemini-TTS를 먼저 비교할 가치가 있다. Hume Octave 2는 현재 preview이며 자연어 acting instruction은 아직 “coming soon”이다.
3. **정확한 미국·영국·호주 등 영어 억양**: 텍스트 프롬프트만으로 억양을 바꾸기보다, 목표 지역의 원어민 voice/locale을 고르는 것이 안전하다. ElevenLabs도 base voice가 가진 억양이 결과에 큰 영향을 준다고 명시한다.
4. **앱/API에 넣기**: 자유형 말투 지시는 OpenAI·Google Gemini-TTS, 초저지연 대화는 Cartesia·Deepgram Flux·ElevenLabs Flash/v3 Conversational, 전통적 SSML·기업 워크플로는 Azure·Google·Amazon Polly가 적합하다.
5. **상업 콘텐츠의 가장 싼 시작점**: 가격만 보면 Speechify API($10/1M characters), Azure Neural($15/1M), AWS Polly Neural($16/1M)처럼 낮은 옵션이 있다. 다만 음질·표현력·편집 편의가 동일하다는 뜻은 아니다.
6. **PlayHT는 신규 채택 보류**: 공식 API 문서는 검색 가능하지만 `play.ht`와 `play.ai`의 현재 가격 페이지는 브라우저에서 DNS 오류, 웹 수집기에서 502였다. 따라서 2024년 공식 블로그의 과거 가격을 2026년 현재 가격처럼 쓰지 않았다. 구매·가입 가능 상태를 공식 채널에서 다시 확인하기 전에는 신규 프로젝트에 권하지 않는다.

## 한눈에 비교

| 서비스 | 사용 방식 | 영어 억양·스타일 제어 | 파일/출력 | 2026-09-04 가격·무료 | 상업 이용과 핵심 제약 |
|---|---|---|---|---|---|
| **ElevenLabs** | 웹 Studio/Playground + API | voice library·voice design·instant/pro cloning; v3 audio tag, emotion, multi-speaker; stability·similarity·style·speed(모델별 차이) | 웹 MP3/WAV/M4A/FLAC; API MP3/PCM/μ-law/A-law 등 | API v3·Multilingual v2 $0.10/1K chars, Flash·v3 Conversational $0.05/1K; Free 10K(v3) 또는 20K(Flash) chars 상당, Starter $6/mo, Creator $22/mo | **유료 플랜에서 생성한 결과만** commercial license. Free는 비상업·attribution. Beta Service 결과는 상업/production 금지 |
| **OpenAI Audio API** | API/SDK 중심; Playground/OpenAI.fm은 시험용 | `gpt-4o-mini-tts`의 자연어 instruction으로 accent, tone, intonation, emotion, speed, whisper; 제한 고객 custom voice | MP3, Opus, AAC, FLAC, WAV, raw PCM | `gpt-4o-mini-tts`: text $0.60/1M tokens + audio $12/1M tokens; `tts-1` $15/1M chars, HD $30/1M; 지속 무료 tier 없음 | API 고객은 Output 소유. AI 음성임을 고지해야 함. **ChatGPT Voice Output은 API와 달리 비상업·독립 파일 재배포 불가** |
| **Google Cloud TTS** | Cloud/Vertex API·SDK + Media Studio | Gemini-TTS 자연어 prompt로 accent/style/pace/tone/emotion; locale, SSML; allowlist custom voice/replication | MP3, OGG Opus, LINEAR16/WAV 계열, PCM, ALAW/MULAW(모델·endpoint별 차이) | Gemini Flash: input $0.50/1M text tokens + output $10/1M audio tokens, 무료 없음; Chirp 3 HD 1M chars/mo 무료 후 $30/1M; Neural2 1M 무료 후 $16/1M; WaveNet/Standard 4M 무료 후 $4/1M | 생성 음성을 앱·미디어에 사용 가능; 새 output IP를 Google이 주장하지 않음. Preview/Pre-GA는 보장 제한. billing 활성화 필요 |
| **Microsoft Azure AI Speech** | Speech Studio no-code + SDK/REST/CLI | locale, SSML, style/role, pitch/rate/volume/emphasis/lexicon; 다수 감정·paralinguistic tag; limited-access custom voice | Speech Studio WAV/MP3 download; API MP3/Opus/WAV·raw PCM·telephony 형식 | F0 Neural 0.5M chars/mo 무료; Central US 소비형 Neural $15/1M, Neural HD $22/1M, Professional Custom Neural realtime $24/1M | Product Terms의 명시적 commercial right는 **paid-tier TTS** 대상. 합성 음성 고지, custom voice의 서면 동의·승인 use case 필요 |
| **Amazon Polly** | AWS Console + SDK/API/CLI | 영어 locale(US/GB/AU/IN/IE/NZ/ZA/SG), SSML; 일부 Neural newscaster; custom Brand Voice는 영업형 | MP3, Ogg Vorbis/Opus, raw PCM, μ-law/A-law; Console download | Standard $4/1M chars(5M/mo 무료), Neural $16/1M(첫 12개월 1M/mo), Generative $30/1M(첫 12개월 0.1M/mo), Long-form $100/1M | AWS와 고객 사이에서 output은 고객 소유. 입력 권리 필요. Generative는 hallucinated/random speech 가능성을 AWS가 공식 경고 |
| **Murf** | 웹 Studio + 별도 API | 200+ voices/styles/tonalities, multi-native voices; pitch·speed·emphasis·pause·pronunciation; custom voice는 기업형 | MP3, WAV, AAC 등; 유료만 download | Studio Free 10분·download 없음·commercial right 없음; Creator $19/mo(연 $228) 24h/year; Business $66/mo(연 $792) 96h/year. API trial 100K chars, PAYG $0.03/1K | Creator 이상 commercial rights. 생성 voice 자체 재판매와 Murf voice를 다른 AI 학습/합성에 사용하는 행위 금지 |
| **Speechify Studio** | 브라우저 Studio + 별도 API | 1,000+ voices; instruction 지원 voice의 자유형 emotion/tone/accent, 비언어 tag; pitch/speed/volume/pronunciation/pause; cloning | Studio OGG/MP3/WAV; 무료는 download 불가 | Studio Free 600 credits·상업권 없음; Starter $100/year(86,400 credits), Creator $300/year(345,600). API Free 50K chars, PAYG $10/1M chars | Studio 유료 플랜은 output·commercial rights를 계속 보유. 일반 Reader 구독과 Studio/API 권리는 서로 다름 |
| **PlayHT / PlayAI** | 과거 웹 editor + API 문서는 남아 있음 | PlayDialog/Play3.0 계열, stock/cloned voice, emotion·style/text guidance, speed; accent별 stock voice | API MP3/WAV/OGG/FLAC/μ-law; PlayDialog Turbo는 WAV만 | **현재 공식 가격·가입 가능 상태 검증 실패**. 과거 가격을 사용하지 않음 | 공식 안전 문서는 권리 있는 voice만 clone하도록 요구. 서비스가 실제 신규 고객에게 제공되는지 재확인 필요 |
| **Hume Octave** | Platform UI/Playground + API/SDK/CLI | voice design·15초 cloning·long-form continuation; Octave 1 자연어 acting instruction, speed, pause; Octave 2는 acting instruction 미지원 preview | MP3, WAV, PCM | Free 10K chars, Starter $3/mo 30K: 둘 다 비상업; Creator $14/mo(첫 달 $7) 140K, overage $0.15/1K | Creator 이상 commercial. output 권리 유지하지만 input/voice model을 서비스 개선 등에 사용하는 넓은 라이선스를 Hume에 부여 |
| **Cartesia Sonic** | Playground + API | voice library·instant/pro cloning·voice localization·accent filter; Sonic 3 감정/속도/볼륨·SSML. 최신 3.5에서 speed/volume 일시 비활성 문서가 있어 snapshot 확인 필요 | WAV, MP3, raw PCM | Free $0, 20K credits(~27분), commercial 없음; Pro $5/mo, 100K(~133분), commercial+instant cloning; Startup $49/mo | 최신 가격표는 Sonic 3.6을 표시하지만 세부 문서는 주로 3.5/3을 설명. production은 날짜 고정 snapshot 권장 |
| **Deepgram Flux/Aura** | API·CLI 중심; Playground/demo | Flux: stock voice, speed 0.5–1.5, expressivity -2~2(beta), 영어 지역 accent 7종; Aura는 pronunciation override·speed. 공개 self-service cloning 문서 없음 | Flux streaming은 raw linear16/μ-law/A-law; Aura는 MP3/Opus/FLAC/AAC/WAV 가능 | 신규 계정 $200 credit. Flux는 2026-09-12까지 무료, 이후 $0.045/1K chars; Aura-2 $0.030/1K | output을 Your Content로 보고 고객 권리를 유지. 합성 음성 고지 의무; 기본적으로 서비스 개선/학습 라이선스가 있고 API 요청별 opt-out 제공 |

## 서비스별 판단과 근거

### 1. ElevenLabs — 표현형 no-code 제작의 우선 비교 대상

Eleven v3는 감정 표현, multi-speaker dialogue, `[laughs]`, `[whispering]` 같은 audio tag를 제공하고, Multilingual v2는 장문 안정성을 목표로 한다. 웹에서는 voice·model·stability·similarity·style 등을 조절하고 결과를 바로 내려받을 수 있다. 다만 같은 설정에서도 결과가 매번 조금 달라지는 비결정적 모델이며, 공식 문서도 voice 선택이 model과 slider보다 결과에 더 큰 영향을 준다고 설명한다. 목표가 British English라면 “American voice + British 지시”보다 처음부터 British native voice를 고르는 편이 낫다.

- 기능: [TTS product guide](https://elevenlabs.io/docs/eleven-creative/playground/text-to-speech), [모델 목록](https://elevenlabs.io/docs/overview/models), [voice settings](https://elevenlabs.io/docs/api-reference/voices/settings/get)
- 파일: [MP3/WAV/M4A/FLAC 다운로드](https://elevenlabs.io/docs/help-center/product/core-capabilities/text-to-speech/how-do-i-download-wav-m4a-and-flac-files), [API 형식](https://elevenlabs.io/docs/overview/capabilities/text-to-speech)
- 가격·권리: [API 가격](https://elevenlabs.io/pricing/api), [billing과 commercial right](https://elevenlabs.io/docs/overview/administration/billing), [free/paid publication 조건](https://help.elevenlabs.io/hc/en-us/articles/13313564601361-Can-I-publish-the-content-I-generate-on-the-platform)

**적합:** 광고, 스토리텔링, 캐릭터 대사, 팟캐스트처럼 연기와 편집을 반복할 때.  
**주의:** Free 생성물은 상업적으로 쓸 수 없고, Beta Service 생성물은 paid plan이어도 상업·production 사용이 금지될 수 있다.

### 2. OpenAI — 코드로 자연어 연출 지시를 넣을 때

`gpt-4o-mini-tts`는 “차분한 BBC 다큐멘터리 진행자처럼, 또렷한 영국 영어로” 같은 자연어 instruction으로 accent, emotion, intonation, speed, tone, whispering을 지시할 수 있다. 기본 음성은 영어에 최적화되어 있고 MP3 외에도 편집 친화적인 WAV/PCM을 반환한다. 제품 UI에서 완성본을 편집·관리하는 creator studio라기보다 API로 반복 생성하는 개발자 도구에 가깝다.

- 기능·출력·custom voice: [OpenAI TTS guide](https://developers.openai.com/api/docs/guides/text-to-speech), [모델](https://developers.openai.com/api/docs/models/gpt-4o-mini-tts)
- 가격: [`tts-1-hd` model pricing](https://developers.openai.com/api/docs/models/tts-1-hd)
- 권리: [OpenAI Services Agreement](https://openai.com/policies/services-agreement/), [ChatGPT Voice와 API의 구분](https://openai.com/policies/service-terms/)

**적합:** 앱에서 문맥별로 말투를 자동 생성하거나 많은 파일을 programmatic하게 만들 때.  
**주의:** API TTS는 상업용 output을 만들 수 있지만 ChatGPT의 Voice Output을 녹음·추출해 commercial 파일처럼 쓰는 것은 별도 약관상 허용되지 않는다. AI-generated voice 고지도 필요하다.

### 3. Google Cloud TTS — 최신 prompt 제어와 전통적 locale/SSML을 함께 원할 때

Gemini-TTS는 자유형 style instruction, accent, pace, tone, emotion과 single/multi-speaker를 지원한다. Chirp 3 HD, Neural2, WaveNet 등 가격과 품질 위치가 다른 계열도 있어 비용을 단계별로 맞출 수 있다. `en-US`, `en-GB`, `en-IN` 같은 locale과 voice를 먼저 고른 뒤 prompt를 쓰는 것이 안정적이다. Cloud TTS API의 base64 audio를 디코딩해 파일로 저장할 수 있으며, Media Studio에서 no-code preview도 가능하다.

- 기능: [Gemini-TTS](https://docs.cloud.google.com/text-to-speech/docs/gemini-tts), [voices/locales](https://cloud.google.com/text-to-speech/docs/voices)
- 파일·custom voice: [audio basics](https://docs.cloud.google.com/text-to-speech/docs/basics), [Chirp 3 Instant Custom Voice](https://docs.cloud.google.com/text-to-speech/docs/chirp3-instant-custom-voice), [Gemini voice replication](https://docs.cloud.google.com/text-to-speech/docs/gemini-tts-voice-replication)
- 가격·권리: [공식 가격표](https://cloud.google.com/text-to-speech/pricing), [Google Cloud Service Specific Terms](https://cloud.google.com/terms/service-terms)

**적합:** Google Cloud를 이미 쓰고, prompt형 표현과 안정적인 API·locale 선택을 함께 원하는 팀.  
**주의:** 최신 Gemini preview/voice replication은 Pre-GA 또는 allowlist일 수 있고, 모델별 SSML·streaming·출력 형식 지원이 다르다.

### 4. Microsoft Azure AI Speech — 세밀한 no-code SSML 편집과 기업용 custom voice

Speech Studio의 Audio Content Creation은 plain text/SSML 편집, voice/style/pitch/rate/pronunciation 조정, preview, WAV/MP3 export와 download까지 공식 문서에 명확히 나와 있다. 음성별로 chat, newscast, narration-professional, cheerful, sad, whispering 같은 style이 있고, Dragon HD Omni는 감정과 laughter/cough/sigh 같은 tag를 지원한다. Professional Custom Voice는 강력하지만 limited access이며 녹음 배우의 동의와 use-case 승인이 필요하다.

- 기능: [TTS overview](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/text-to-speech), [HD voices](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/high-definition-voices), [accent quickstart](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/get-started-text-to-speech)
- no-code·출력: [Audio Content Creation](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-audio-content-creation), [REST formats](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech)
- custom·가격·권리: [Custom Neural Voice](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/custom-neural-voice), [Azure Speech pricing](https://azure.microsoft.com/en-us/pricing/details/speech/), [Microsoft Product Terms](https://www.microsoft.com/licensing/terms/en-US/productoffering/MicrosoftAzureServices/MCA/), [AI Services Code of Conduct](https://learn.microsoft.com/en-us/legal/ai-code-of-conduct)

**적합:** e-learning, 기업 교육, 긴 내레이션처럼 발음 사전·SSML·버전 관리가 중요한 제작.  
**주의:** 공개 Product Terms의 명시적 상업 이용 권한은 paid-tier TTS에 연결되어 있으므로 F0 무료 결과를 상업용으로 쓸 때는 계정 약관을 재확인한다.

### 5. Amazon Polly — 예측 가능한 비용과 구조화된 SSML

Polly는 Standard, Neural, Long-form, Generative engine을 제공한다. 영어 locale이 넓고 Console에서 Listen 후 MP3/OGG/PCM 등을 Download할 수 있다. 자유형 연기 prompt보다는 voice/locale/engine/SSML을 조합하는 방식이다. Generative가 Polly 내부에서 가장 사람 같고 감정에 적응하는 계열이라는 설명은 AWS의 공식 주장이다.

- 기능·스타일: [voice engines](https://docs.aws.amazon.com/polly/latest/dg/voice-engines-polly.html), [Generative voices](https://docs.aws.amazon.com/polly/latest/dg/generative-voices.html), [Newscaster](https://docs.aws.amazon.com/polly/latest/dg/newscaster-voices.html), [SSML support](https://docs.aws.amazon.com/polly/latest/dg/supportedtags.html)
- 파일·UI: [SynthesizeSpeech API](https://docs.aws.amazon.com/polly/latest/APIReference/API_SynthesizeSpeech.html), [Console download example](https://docs.aws.amazon.com/polly/latest/dg/synthesize-example.html)
- 가격·권리: [Polly pricing](https://aws.amazon.com/polly/pricing/), [FAQ](https://aws.amazon.com/polly/faqs/), [AWS Service Terms](https://aws.amazon.com/service-terms/), [quotas](https://docs.aws.amazon.com/polly/latest/dg/limits.html)

**적합:** 비용 예측과 대량 batch가 중요하고, 감정 연기보다 명료한 안내·교육 음성이 필요한 경우.  
**주의:** AWS는 Generative engine에서 드물게 random/hallucinated speech나 단어 중간 절단이 생길 수 있다고 직접 경고한다. 최종 파일 검수가 필요하다.

### 6. Murf — 비개발자용 편집과 상업 라이선스가 단순한 편

Murf Studio는 200+ voice/style/tonality, multi-native voice, pitch·speed·emphasis·pause·pronunciation을 UI에서 제공한다. MP3, WAV, AAC 등으로 내보낼 수 있고, Creator 이상은 commercial rights가 포함된다. Free는 10분 시험이 가능하지만 다운로드와 상업권이 없다.

- 기능·가격·파일: [Murf pricing](https://murf.ai/pricing), [AI Voice Generator](https://murf.ai/ai-voice-generator), [free trial download 제한](https://help.murf.ai/can-i-download-my-project-during-the-free-trial)
- API: [Murf API plans](https://help.murf.ai/murf-api-plans-and-limits)
- 권리: [Murf Terms §5](https://murf.ai/legal/terms-of-service)

**적합:** 프레젠테이션, 강의, YouTube voice-over를 코드 없이 편집하는 개인·소규모 팀.  
**주의:** commercial rights는 Murf 서비스나 voice library 자체의 재판매 권리가 아니며, Murf voice를 다른 AI 모델 학습·합성에 사용할 수 없다.

### 7. Speechify Studio — creator UI와 저가 API를 별도로 선택

Studio와 API는 서로 다른 상품이다. Studio는 timeline형 voice-over 편집, 다양한 stock voice, pitch/speed/volume/pronunciation/pause, instruction 지원 voice의 자유형 tone·emotion·accent와 `[laugh]`, `[whisper]` 같은 tag를 제공한다. OGG/MP3/WAV로 export할 수 있다. 현재 Studio Free는 600 credits이지만 MP3 다운로드와 commercial right를 위해서는 paid plan이 필요하다. API는 50K characters 무료, 이후 $10/1M characters로 별도 제공된다.

- Studio 기능·파일: [Studio voices/instructions](https://speechify.com/studio-voices/), [voice-over export guide](https://speechify.com/blog/ultimate-guide-to-creating-ai-voice-overs-in-speechify-studio/)
- 가격: [Studio pricing](https://speechify.com/pricing-studio/), [API pricing](https://speechify.com/pricing-api/)
- 권리: [Speechify Terms](https://speechify.com/terms/)

**적합:** 직접 편집하는 creator는 Studio, 제품에 대량 삽입하는 개발자는 API.  
**주의:** Speechify Reader/Premium 구독은 Studio의 상업 이용·다운로드 권한과 같지 않다. 무료 Studio는 상업 이용 불가다.

### 8. PlayHT / PlayAI — 기능은 확인되지만 현재 서비스 상태가 불명확

남아 있는 공식 API 문서는 PlayDialog, Play3.0 mini, PlayHT 2.0 계열과 MP3/WAV/OGG/FLAC/μ-law, speed, emotion, voice/style/text guidance, cloned voice를 설명한다. stock voice 목록에는 American, British, Canadian 등 accent metadata가 있다. 그러나 2026-09-04 현재 공식 도메인의 가격 URL을 직접 열 수 없었다.

- 남아 있는 공식 문서: [TTS streaming endpoint](https://docs.play.ht/reference/api-generate-tts-audio-stream), [stock voice 목록](https://docs.play.ht/reference/list-of-prebuilt-voices), [voice cloning과 consent 원칙](https://play.ht/ai-safety/)
- 가용성 경계: `https://play.ht/pricing`은 브라우저에서 `ERR_NAME_NOT_RESOLVED`, 웹 수집기에서 502. `https://play.ai/pricing`도 502였다. 확인 시각: 2026-09-04.

**판단:** 기존 계정에서 정상 접속되는지와 공식 지원·결제 계약을 확인하기 전에는 대안 shortlist에서 제외한다. 과거 공식 블로그에 있던 Free/Creator/Unlimited 가격은 현재값으로 간주하지 않는다.

## 추가로 볼 가치가 큰 최신 대안

### 9. Hume Octave — 의미·감정 이해와 long-form continuation

Octave는 voice design, 짧은 sample 기반 cloning, 문단/장면 사이의 emotional continuity를 위한 continuation을 제공한다. Octave 1은 자연어 acting instruction으로 “calm, pedagogical”, “frightened, rushed”처럼 연기를 지시할 수 있다. Octave 2는 더 낮은 지연과 다국어를 제공하는 preview지만, 현재 acting instruction과 multilingual voice design은 아직 지원되지 않는다. 따라서 **영어 파일의 연기 지시가 목적이면 Octave 1도 반드시 함께 테스트**해야 한다.

- 기능·제약: [TTS overview](https://dev.hume.ai/docs/text-to-speech-tts/overview), [acting instructions](https://dev.hume.ai/docs/text-to-speech-tts/acting-instructions), [voice design](https://dev.hume.ai/docs/voice/voice-design), [continuation](https://dev.hume.ai/docs/text-to-speech-tts/continuation)
- 가격·권리: [Hume pricing](https://www.hume.ai/pricing), [TTS FAQ](https://dev.hume.ai/docs/text-to-speech-tts/faq), [Terms](https://www.hume.ai/terms-of-use)

**추천 이유:** 고정 slider보다 자연어로 배우의 연기를 지시하고, 장문에서 감정 흐름을 유지하는 기능이 핵심인 최신 후보.  
**주의:** Free/Starter는 비상업이고 Creator 이상만 commercial. Octave 2는 preview이므로 production 일관성을 직접 검증한다.

### 10. Cartesia Sonic — 저지연과 voice cloning을 함께 원하는 개발자

Cartesia는 Playground와 API, instant/pro voice cloning, accent/voice localization, WAV/MP3/raw PCM을 제공한다. 공식 가격표는 현재 Sonic 3.6을 표시하지만 세부 기능 문서는 Sonic 3.5와 3에 더 많이 맞춰져 있다. 2026 changelog는 Irish, New Zealand, South African 등 accent filter 추가를 기록한다. Sonic 3은 emotion/speed/volume controls가 있으나 3.5에서는 speed와 volume이 일시 비활성이라는 문서가 있으므로 사용하는 snapshot에서 확인해야 한다.

- 기능: [Sonic overview](https://docs.cartesia.ai/get-started/overview), [2026 changelog](https://docs.cartesia.ai/changelog/2026), [speed/volume/emotion](https://docs.cartesia.ai/build-with-cartesia/capability-guides/volume-speed-emotion)
- 파일: [TTS endpoint 비교](https://docs.cartesia.ai/use-the-api/compare-tts-endpoints)
- 가격: [Cartesia pricing](https://www.cartesia.ai/pricing)

**추천 이유:** creator studio보다 실시간 앱·voice agent·game 대사에 가깝지만, 자연스러운 저지연 합성과 custom voice가 필요하면 강한 후보.  
**주의:** `-latest` alias는 예고 없이 바뀔 수 있으므로 production에서는 날짜가 붙은 model snapshot을 고정한다.

### 11. Deepgram Flux/Aura — 영어 대화형 API와 현재 무료 실험에 유리

Deepgram은 2026년 최신 Flux TTS를 영어 전 용도에 권장하며, 미국·영국·아일랜드·호주·인도·싱가포르·필리핀 영어 voice를 제공한다. speed와 calm↔animated expressivity(beta), 대화 turn 간 voice consistency가 특징이다. 2026-09-12까지 Flux TTS가 무료이고 신규 계정에는 $200 credit이 있어 API 실험 비용이 낮다. 단, Flux streaming은 raw audio frame만 지원하므로 바로 MP3/WAV가 필요하면 batch 변환 또는 Aura를 사용한다.

- 모델·accent·control: [TTS model overview](https://developers.deepgram.com/docs/tts-models-languages-overview), [Flux voices](https://developers.deepgram.com/docs/flux-tts/voices), [expressivity](https://developers.deepgram.com/docs/tts-expressivity)
- 파일·가격: [TTS output formats](https://developers.deepgram.com/docs/voice-agent-tts-models), [pricing](https://deepgram.com/pricing)
- 권리: [Deepgram Terms, updated 2026-08-06](https://deepgram.com/terms)

**추천 이유:** 긴 대화의 turn consistency와 낮은 지연이 중요하고, 2026년 최신 영어 API를 바로 시험하고 싶을 때.  
**주의:** 공개 문서에서 ElevenLabs/Hume 같은 self-service voice design/cloning은 확인되지 않았다. 완성형 no-code 파일 제작기보다는 개발자 API다.

## 실제 선택 순서

### 비개발자가 개인 청취용 파일을 만들 때

1. ElevenLabs Free, Murf Free, Speechify Studio Free에서 같은 문단을 생성한다.
2. 목표 accent가 미국/영국/호주 중 무엇인지 먼저 정하고 해당 지역 native voice만 비교한다.
3. 다운로드가 필요한 시점에 유료 플랜을 고른다. 무료 미리듣기가 된다고 해서 무료 결과의 상업 이용·파일 다운로드가 허용되는 것은 아니다.

### YouTube·강의·광고처럼 수익화할 때

1. **편집 편의 우선:** Murf Creator, Speechify Studio Starter, ElevenLabs Starter 이상.
2. **연기·캐릭터 우선:** ElevenLabs v3와 Hume Octave 1을 먼저 A/B 테스트.
3. **기업 SSML·발음 사전 우선:** Azure Speech Studio.
4. 최종 선택 전에 commercial license가 **생성 시점의 플랜**에 적용되는지와 voice clone 동의 서류를 저장한다.

### 앱에서 자동으로 많은 파일을 만들 때

1. OpenAI `gpt-4o-mini-tts`, Google Gemini-TTS, Cartesia, Deepgram Flux를 같은 스크립트로 시험한다.
2. 장문/batch에는 Azure, Google, AWS Polly의 비동기·batch 경로도 비교한다.
3. 비용은 character와 token 단위가 섞이므로 실제 스크립트 100개를 생성해 평균 비용을 재고, cache/replay 조건까지 포함한다.

## 15분짜리 블라인드 테스트 방법

광고의 “human-like” 순위를 믿는 대신 다음처럼 직접 비교하는 것이 가장 확실하다.

1. 150–250단어짜리 동일 영어 스크립트를 준비한다. 일반 문장뿐 아니라 숫자(`7:45`, `$1,250.30`), 약어, 고유명사, 질문, 감탄, 짧은 인용문을 넣는다.
2. target accent를 하나만 정한다. 예: General American 또는 Contemporary RP/British.
3. 서비스마다 stock native voice 2개를 고르고, 같은 voice에서 3번씩 생성한다. 생성형 TTS는 비결정적이어서 한 번의 lucky sample만 비교하면 안 된다.
4. 서비스 이름을 숨기고 다음을 1–5점으로 평가한다.
   - 발음 정확도: 숫자·고유명사·약어
   - prosody: 문장 억양, 강세, pause
   - 자연스러운 연결: 문장·문단 사이 호흡
   - accent consistency: 중간에 미국↔영국 억양이 섞이지 않는지
   - artifact: 금속성 음색, click, 이상한 숨, 반복·누락
   - 장문 일관성: 3–5분 뒤 속도·음색·볼륨이 변하지 않는지
5. 이 점수와 파일 편집 시간, 실제 발생 비용, commercial 조건을 합쳐 선택한다.

## 라이선스·안전 체크리스트

- commercial license는 “타인의 목소리를 무단 복제할 권리”가 아니다. clone하려면 화자의 명시적 동의와 업로드할 녹음의 권리가 모두 필요하다.
- 서비스가 output을 “소유한다/상업 사용을 허용한다”고 해도, 입력한 원문·음악·브랜드·실존 인물의 publicity right 문제까지 해결해 주지는 않는다.
- AI voice임을 고지하라는 조건이 OpenAI, Azure, Deepgram 등에 명시돼 있다. 플랫폼·국가별 추가 표시 의무도 확인한다.
- Preview/Beta 모델은 상업 이용이 금지되거나 SLA·지원·재현성이 제한될 수 있다. 특히 ElevenLabs Beta, Google Pre-GA, Hume Octave 2 preview는 production 전에 해당 약관을 다시 읽는다.
- 장문 파일은 반드시 끝까지 들어본다. AWS Polly와 ElevenLabs 모두 생성형 음성의 random/hallucinated speech, mispronunciation, instability 가능성을 공식 문서에서 경고하거나 설명한다.

## 최종 shortlist

- **가장 간단한 no-code 상업 voice-over:** Murf Creator 또는 Speechify Studio Starter
- **표현력 높은 creator workflow:** ElevenLabs v3
- **자연어 연기 지시를 API에서 자동화:** OpenAI `gpt-4o-mini-tts` 또는 Google Gemini-TTS
- **세밀한 SSML·발음 사전·기업용 제작:** Azure Speech Studio
- **예측 가능한 대량 안내 음성:** Amazon Polly Neural/Generative 또는 Google Neural2/Chirp 3 HD
- **최신 감정·장문 실험:** Hume Octave 1/2 비교
- **실시간 voice agent/game:** Cartesia Sonic 또는 Deepgram Flux
- **현재 보류:** PlayHT/PlayAI — 공식 구매·지원 가능 상태 재확인 전

