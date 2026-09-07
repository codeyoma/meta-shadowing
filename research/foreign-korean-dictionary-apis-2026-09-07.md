# 외국어 → 한국어 무료 사전 API 추가 조사

조사일: 2026-09-07. 대상: 영어·일본어·중국어·스페인어·독일어·프랑스어. 앱에는 합계 주 최대 500문장을 미리 등록한다. 한국어 단어 번역, 한국어로 작성된 사전 뜻풀이, 발음·품사·예문을 구분한다.

## 판단

영어 → 한국어의 무료 외부 사전 기능은 **Microsoft Translator Dictionary Lookup F0**를 우선 시험할 만하다. 6개 언어 공통의 한국어 뜻풀이 후보는 **WiktAPI의 한국어판 Wiktionary / Kaikki 데이터**다. 전자는 상세한 출판사 사전 본문이 아닌 번역 후보 중심이고, 후자는 의미 누락과 추출 품질 문제를 직접 확인했다. 한국어 사전 데이터를 완전하게 제공하는 단일 무료 서비스를 찾았다고 결론내리지는 않는다.

일본어·중국어·스페인어·독일어·프랑스어에서 부족한 뜻은 공개 사전의 의미별 설명을 한국어로 번역하고 검수하는 방식이 현실적이다. 단어 하나만 자동 번역한 결과를 사전의 모든 의미나 해당 문맥의 정답으로 표시하지 않는다. 네이버·Cambridge 본문을 크롤링해 앱 데이터베이스로 복제하는 방식을 기본안으로 권하지 않는다.

## 1. Microsoft Translator: 사전과 일반 번역을 구분

공식 F0 요금제에는 **Bilingual Dictionary**가 포함되며, 번역 등 같은 요금제 기능과 합산하여 월 **200만 자**까지 무료다. Azure 구독과 Translator 리소스 생성 및 키가 필요하다. 일회성 가입 크레딧과 별개의 요금제 무료 구간이다. [요금](https://azure.microsoft.com/en-us/pricing/details/translator/), [키 발급 및 호출 안내](https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation/how-to/use-rest-api)

| 기능 | 영어 → 한국어 | 나머지 5개 언어 → 한국어 | 반환 정보 |
| --- | --- | --- | --- |
| Dictionary Lookup | 직접 지원 | 직접 지원하지 않음 | 번역 후보, 영어 쪽을 기준으로 한 품사, 번역 쌍의 확률, 역번역 후보 |
| Dictionary Examples | 직접 지원 | 직접 지원하지 않음 | 지정한 원어·번역어 쌍이 쓰이는 용례 |
| Translate | 지원 | 지원 | 기계 번역문. 사전식 품사·의미 구분 결과가 아님 |

`/languages?api-version=3.0&scope=dictionary,translation`을 인증 없이 실제 호출했다. dictionary의 영어 목록에 `ko`가 있고, `ko`, `ja`, `zh-Hans`, `es`, `de`, `fr` 각각의 dictionary 대상 목록에는 `en`만 있었다. translation에는 이 언어들이 모두 있었다. 따라서 일본어→영어→한국어의 두 단계 사전 조회는 직접 일한사전이 아니며 의미가 바뀔 수 있다. [실제 확인한 언어 목록 API](https://api.cognitive.microsofttranslator.com/languages?api-version=3.0&scope=dictionary,translation), [언어 지원 문서](https://learn.microsoft.com/en-us/azure/ai-services/translator/language-support)

조회 결과의 `confidence`는 학습 데이터에서 번역 쌍이 나타나는 확률에 가깝다. 현재 문장에서 해당 뜻이 옳을 확률로 해석하지 않는다. 발음·어원·장문의 한국어 뜻풀이를 제공하는 출판사 사전과도 구분한다. [Dictionary Lookup](https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation/reference/v3/dictionary-lookup), [Dictionary Examples](https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation/reference/v3/dictionary-examples)

신청 후 사용할 요청 형태:

```http
POST https://api.cognitive.microsofttranslator.com/dictionary/lookup?api-version=3.0&from=en&to=ko
Ocp-Apim-Subscription-Key: YOUR_TRANSLATOR_KEY
Ocp-Apim-Subscription-Region: YOUR_RESOURCE_REGION
Content-Type: application/json

[{"Text":"open"},{"Text":"fair"}]
```

위 지역 헤더는 리소스 종류에 맞게 설정한다. Dictionary Lookup은 요청당 최대 10개 항목, 항목당 100자, 요청 합계 1,000자를 허용한다. 이번에는 사용자 계정·키를 만들거나 검색하지 않았으며, 인증이 필요한 실제 사전 본문 응답의 품질은 시험하지 않았다. [호출 제한](https://learn.microsoft.com/en-us/azure/ai-services/translator/service-limits)

## 2. WiktAPI / Kaikki: 실제 한국어 뜻풀이를 얻는 공개 데이터 경로

WiktAPI는 키 없이 한국어판 Wiktionary를 조회할 수 있는 API다. `/v1/ko/word/open?lang=en`에서 경로의 `ko`는 뜻풀이가 작성된 사전 언어판이고, `lang=en`은 표제어의 언어다. 무료·오픈소스 및 자체 호스팅을 안내하지만, 검토한 문서에서 공개 서버의 명확한 호출 한도나 가용성 보장은 찾지 못했다. [시작 문서](https://wiktapi.dev/quickstart), [프로젝트 안내](https://wiktapi.dev/about)

```text
https://api.wiktapi.dev/v1/ko/word/open?lang=en
https://api.wiktapi.dev/v1/ko/word/gerecht?lang=de
```

실측에서 `open`의 한국어 동사 뜻과 `gerecht`의 공평함 관련 뜻을 얻었다. 그러나 `fair`는 시장·축제·전시회 의미만 있었고, `juste`도 필요한 형용사 뜻이 빠져 있었다. 일본어·중국어의 인코딩된 단어 경로는 404를 반환했으며 검색에서는 같은 표제어가 발견됐다. 검색 결과에는 뜻풀이가 없어 우회 조회 수단으로 사용할 수 없었다. 경로의 URL 디코딩 문제로 추정되며, 실제 앱에 공개 API를 바로 연결하기에는 이 문제가 남아 있다. [open 조회](https://api.wiktapi.dev/v1/ko/word/open?lang=en), [fair 조회](https://api.wiktapi.dev/v1/ko/word/fair?lang=en), [구체적인 재현 결과](korean-dictionary-open-data-2026-09-07.md)

반면 원천인 Kaikki 한국어판 다운로드에서는 일본어 `学校`·`猫`, 중국어 `公平`·`你好`의 한국어 뜻을 확인했다. **6개 언어를 대상으로 저장 가능한 무료 사전 기반이 필요하면 한국어판 JSONL을 받아 작은 DB와 자체 API로 제공하는 쪽이 더 적합하다.** 현재 한국어판 raw 압축 파일은 약 24.6 MB로 표시된다. 데이터의 CC BY-SA 등 조건을 지키고 출처를 보존해야 하며, 서버 운영 비용은 별도다. [한국어판](https://kaikki.org/kowiktionary/), [다운로드](https://kaikki.org/dictionary/rawdata.html), [자체 호스팅](https://wiktapi.dev/guides/self-hosting)

| 표제어 언어 → 한국어 | 바로 시험할 외부 기능 | 저장 가능한 공개 데이터 | 현재 확인한 한계 |
| --- | --- | --- | --- |
| 영어 | Azure Dictionary Lookup, WiktAPI | Kaikki 한국어판 | Azure는 번역 후보 중심, Wiktionary는 의미 누락 |
| 일본어 | WiktAPI는 현재 단어 경로 문제 | Kaikki 한국어판 | 직접 일한 Azure 사전은 없고, 공개 API 조회 문제 해결 필요 |
| 중국어 | WiktAPI는 현재 단어 경로 문제 | Kaikki 한국어판 | 직접 중한 Azure 사전은 없고, 일부 품사가 unknown |
| 스페인어 | WiktAPI | Kaikki 한국어판 | 한국어 의미 항목 규모가 작음 |
| 독일어 | WiktAPI | Kaikki 한국어판 | 전체 학습 어휘의 검색 성공률은 미측정 |
| 프랑스어 | WiktAPI | Kaikki 한국어판 | 악센트 문자 경로 문제도 별도 검증 필요, 의미 누락 |

국립국어원 한국어기초사전도 무료 API와 공식 다운로드를 제공하고 텍스트의 상업적 재사용을 CC BY-SA 2.0 KR로 허용한다. 다만 한국어 표제어를 외국어로 설명하는 사전이다. 번역어를 역색인하여 한국어 후보를 찾는 보완 방식은 가능하나, 완전한 외국어 사전이 되지는 않는다. 요청한 언어 중 독일어 번역은 없으며, 다운로드 전체의 번역 필드 포함 여부는 추가 검증이 필요하다. [API](https://krdict.korean.go.kr/kor/openApi/openApiInfo), [다운로드](https://krdict.korean.go.kr/download/downloadPopup), [저작권 정책](https://krdict.korean.go.kr/kor/kboardPolicy/copyRightTermsInfo)

## 3. Lexicala: 정식 사전 데이터지만 무료 운영·저장에 한계

영어 Password 사전의 번역 대상에 한국어가 있다. 나머지 5개 언어의 한국어 대응은 MultiGloss 후보로, 영어 연결을 통해 자동 확장된 자료다. Global의 각 언어 사전이 모두 한국어를 직접 제공하는 것은 아니다. `/translate-to?source=password&language=en&targetLang=ko&text=open` 같은 요청을 RapidAPI 키로 호출한다. [공식 문서](https://api.lexicala.com/documentation/)

공식 FAQ는 하루 50회 무료 시험을 안내하고, **응답을 로컬에 캐시해 재사용하는 것은 허용하지 않는다**고 명시한다. 저장이 필요하면 별도 협의하거나 JSON/XML 데이터 구매를 안내한다. 단어당 여러 요청이 들 수 있어 50회가 50개의 완전한 사전 항목을 뜻하지도 않는다. 주 500문장을 미리 등록해 저장하는 이번 앱의 무료 기본안에는 맞지 않는다. 유료 사전 데이터의 품질 비교 후보로는 남긴다. [무료 호출·캐시 FAQ](https://api.lexicala.com/documentation/), [서비스 이용 조건](https://api.lexicala.com/)

## 4. MyMemory: 무인증 번역 API, 사전 주 데이터로는 부적합

익명 호출은 하루 5,000자, 유효한 연락용 이메일을 `de`로 제공하면 하루 50,000자를 안내한다. 번역 메모리와 기계 번역을 제공하며 사전식 품사·발음·의미별 정의 스키마가 아니다. 개별 요청의 `q`는 500바이트 제한이 있다. [한도](https://mymemory.translated.net/doc/usagelimits.php), [API](https://mymemory.translated.net/doc/spec.php)

6개의 짧은 요청을 실제 호출했으며 모두 HTTP 200, 응답 status 200이었다. 아래는 해당 시점의 첫 결과다. 한 단어씩의 점검이지 언어별 정확도 벤치마크가 아니다.

| 원어 | 단어 | 실제 첫 반환값 | 사전 용도로 평가 |
| --- | --- | --- | --- |
| 영어 | fair | 공평한 | 예문의 형용사 의미에 사용 가능한 후보 |
| 일본어 | 公平 | 공정성 | 문맥·품사에 맞춰 선택해야 함 |
| 중국어 | 公平 | 공정성 | 문맥·품사에 맞춰 선택해야 함 |
| 스페인어 | justo | 공정성 | 형용사 의미를 그대로 설명하지 않음 |
| 독일어 | gerecht | 정의 | 형용사 의미를 그대로 설명하지 않음 |
| 프랑스어 | juste | 참 | 다의어의 일부 뜻만 반환 |

스페인어 `matches`에는 한국어 대상 요청인데 영어 문구도 들어 있었고, 프랑스어 후보에는 HTML 잔재가 있었다. 첫 결과나 점수만으로 학습용 정답을 확정하지 않는다. [재현 가능한 영어 요청](https://api.mymemory.translated.net/get?q=fair&langpair=en%7Cko), [스페인어 요청](https://api.mymemory.translated.net/get?q=justo&langpair=es%7Cko), [프랑스어 요청](https://api.mymemory.translated.net/get?q=juste&langpair=fr%7Cko)

MyMemory는 공식 API를 통한 자동 조회를 허용하지만 아카이브 전체 크롤링이나 제한 우회를 허용하지 않는다. 무료 호출 권한과 사전 전체 데이터베이스를 복제할 권한을 구분한다. [이용 조건](https://mymemory.translated.net/terms-and-conditions)

## 5. 추가 후보 및 제외 이유

| 후보 | 이번 요구에 대한 판단 |
| --- | --- |
| FreeDictionaryAPI.com | 영어판 Wiktionary 기반의 여러 언어 사전. 키 없이 시간당 1,000회/IP. 한국어 번역어가 일부 있어도 뜻풀이 전체가 한국어는 아님. 원어 품사·발음·영어 정의 보완에 적합 |
| DeepL API Free | 월 50만 자 번역 무료 구간. 사전식 의미·품사·발음을 제공하는 API의 대체물은 아님 |
| Glosbe | 공식 API 안내에 서비스 중단 공지가 남아 있음. 과거 무료 API 소개를 현재 신청 가능한 기능으로 인용하지 않음 |
| NAVER Developers | 현재 공개 API 목록에서 6개 외국어 사전의 한국어 뜻풀이를 반환하는 API를 확인하지 못함. 백과사전 검색 API를 영한·일한사전 API와 혼동하지 않음 |
| Cambridge | 기존 가입·신청 URL은 메인 페이지로 이동. 공식 라이선스 문의 창은 열리지만 무료 API와 저장 권한은 확인되지 않음 |

출처: [FreeDictionaryAPI](https://freedictionaryapi.com/), [DeepL 무료 한도](https://developers.deepl.com/docs/resources/usage-limits), [Glosbe 공식 중단 안내](https://glosbe.com/help/api), [NAVER API 목록](https://developers.naver.com/products/intro/plan/plan.md), [Cambridge 라이선스 문의](https://dictionary.cambridge.org/license.html)

## 6. 주 500문장의 비용과 크롤링 판단

예를 들어 주 500문장 × 문장당 20단어 × 단어당 8자 × 5주라면, 중복 제거 전 Dictionary Lookup 입력량은 월 약 **40만 자**다. 이는 가정에 따른 산술 예시이며, 실제 신규 기본형 수를 측정한 결과는 아니다. 같은 F0에서 다른 번역 기능을 쓰거나 예문을 추가 요청하면 입력량이 합산되고, 학습자 클릭마다 외부 조회하면 사용량은 이용자 수에 따라 증가한다. Microsoft는 Dictionary Lookup/Examples의 입력 문자와 반복 요청도 계산한다고 설명한다. [문자 계산 FAQ](https://www.microsoft.com/en-us/translator/business/faq/)

권장 흐름은 지문 등록 시 필요한 기본형·다단어 표현만 추출하고, 공개 사전에서 의미 후보를 얻어 문맥에 맞는 한국어 설명을 검수하는 것이다. 공개 데이터와 직접 작성한 설명은 출처·라이선스·수정 여부와 함께 저장한다. 외부 API의 원문 보관은 해당 계약의 저장 조건을 확인한 경우에만 같은 저장 방식을 적용한다. Lexicala·Cambridge에 공개 사전의 저장 정책을 그대로 적용하지 않는다.

크롤러는 HTML에서 데이터를 읽는 기술적 작업을 줄여 줄 수 있지만, 서비스 개편·차단·의미 누락에 대응해야 한다. 특히 네이버는 사전 허락 없는 자동화 검색·수집 및 차단 조치 무력화를 이용약관에서 제한한다. 소량 요청이나 출처 표시만으로 앱 내부 재배포 권한이 자동으로 생기는 것은 아니다. [NAVER 이용약관](https://policy.naver.com/policy/service.html)

Wiktionary처럼 재사용 조건이 명시된 자료라면 공개 API·덤프를 우선 사용한다. 데이터 출처가 불명확한 GitHub의 사전 JSON·StarDict 파일은 저장소 코드에 MIT가 표시돼 있다는 이유만으로 사전 본문까지 재배포 가능하다고 판단하지 않는다. [Wikimedia 재사용 조건](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use#7._Licensing_of_Content)

한국어 공개 데이터와 WiktAPI의 언어별 실측은 [별도 조사](korean-dictionary-open-data-2026-09-07.md)에 기록한다.
