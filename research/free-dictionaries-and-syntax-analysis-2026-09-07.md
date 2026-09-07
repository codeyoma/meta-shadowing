# 무료 다국어 사전과 문장 분석 도구 조사

조사일: 2026-09-07. 대상 언어: 영어, 일본어, 중국어, 스페인어, 독일어, 프랑스어. 단어 뜻과 학습용 문법 설명은 한국어로 제공한다.

## 결론

후속 조건: **6개 언어 합계 주 최대 500문장을 미리 등록하며, 직접 운영하는 라이브러리보다 무료 외부 서비스를 우선한다.** 한국어 사전 API의 추가 조사에서는 영어→한국어에 Microsoft Translator Dictionary Lookup F0, 한국어 뜻풀이 공개 데이터에 WiktAPI/Kaikki를 새로 확인했다. 언어별 한계와 실제 응답을 반영한 최신 사전 추천은 [추가 조사](foreign-korean-dictionary-apis-2026-09-07.md)를 따른다. FreeDictionaryAPI.com은 영어 뜻풀이·품사·발음을 보완하는 용도다. 문장 분석은 Google Cloud Natural Language의 `analyzeSyntax`를 우선 추천하며, 한국어 교육용 설명은 별도 보완해야 한다.

문장마다 1,000자 이하이고 syntax만 한 번 호출한다면 주 500문장은 월 약 2,000~2,500단위로 월 5,000 무료 단위 안에 들어간다. 재분석·재시도와 다른 용도의 사용량도 함께 계산한다. [무료 구간과 단위 정의](https://cloud.google.com/products/natural-language/pricing)

사전은 문장 수가 아니라 조회할 어휘 수에 비례한다. 예를 들어 문장당 20단어라면 주 10,000 단어 위치이지만, 언어별 기본형을 중복 제거하고 기존 조회 결과를 저장하면 신규 요청은 줄어든다. 신규 조회를 시간당 1,000회/IP 이내로 분산 처리한다. 기본형별 사전 원문 캐시와 문장별 선택 의미·한국어 풀이를 구분하여, 다의어의 의미 선택까지 단어 하나에 고정하지 않는다. [사전 API 한도](https://freedictionaryapi.com/)

자체 실행을 선택할 경우의 대안은 **공개 사전 데이터 + spaCy/GiNZA 문장 분석 + 한국어 설명 규칙 + 지문별 검수·저장**이다. 문장 전체의 구·절 경계가 필요하면 Stanza나 benepar를 추가 평가한다. 이는 실제 학습 지문에서 정확도·응답 속도를 비교하기 전의 구성 제안이다.

무료는 세 가지로 구분해야 한다. 오픈소스 라이브러리는 호출료가 없어도 실행 비용이 있고, 사전 데이터는 다운로드가 무료여도 표시·재배포 조건이 있으며, 외부 API의 무료 요금제에는 한도가 있다. 소프트웨어, 학습된 모델, 사전 본문, 발음 음성의 이용 조건을 각각 기록한다.

## 1. 원하는 기능을 구현 요소로 나누기

| 화면 기능 | 필요한 처리 | 반환해야 하는 정보 |
| --- | --- | --- |
| 단어를 누르면 뜻 표시 | 문맥 속 단어 구분, 기본형 복원, 사전 검색, 의미 선택 | 원문 위치, 기본형, 품사, 의미별 뜻, 한국어 풀이, 출처 |
| 단어 아래 품사 표시 | 품사·형태 분석 | 명사·동사·형용사, 시제·수·격 등의 정보 |
| 수식 화살표 | 의존 구문 분석 | 어느 단어가 어느 단어와 어떤 관계인지 |
| 명사구·전치사구·주절 밑줄 | 구 구조 분석 또는 언어별 묶음 규칙 | 구간과 구·절 종류 |
| 한국어 문법 해설 | 분석 결과를 학습 문법으로 변환 | 설명 규칙, 예외, 문맥에 맞춘 해설 |

spaCy는 품사·기본형·의존 관계를 제공하며, displaCy는 품사와 의존 관계를 시각화한다. 구 구조는 별도 constituency parser의 영역이다. 따라서 라이브러리 하나의 결과를 그대로 표시하는 것만으로 첨부 이미지의 모든 기능이 완성되지는 않는다. [spaCy 언어 기능](https://spacy.io/usage/linguistic-features), [displaCy](https://spacy.io/usage/visualizers), [Stanza 구 구조 분석](https://stanfordnlp.github.io/stanza/constituency.html)

## 2. 한국어 사전 데이터

### Kaikki의 한국어 위키낱말사전 추출 데이터

6개 언어 모두 한국어판 데이터가 있다. 아래는 사이트에 표시된 의미 항목 수이며, 고유 단어 수나 학습 지문에 대한 검색 성공률이 아니다. 확인한 스냅샷은 2026-09-01 덤프를 2026-09-05 추출한 것이다. [한국어판 목록](https://kaikki.org/kowiktionary/)

| 학습 언어 | 의미 항목 수 |
| --- | ---: |
| 영어 | 22,855 |
| 일본어 | 15,256 |
| 중국어 | 22,915 |
| 스페인어 | 5,530 |
| 독일어 | 7,756 |
| 프랑스어 | 6,549 |

다만 사용자의 예문으로 표제어를 확인하자 중요한 한계가 드러났다.

- `fair`: 현재 한국어판 항목에는 시장·축제·전시회에 해당하는 명사 뜻만 있고, 예문에 필요한 형용사 뜻인 ‘공정한’은 없다. [확인한 항목](https://kaikki.org/kowiktionary/영어/meaning/f/fa/fair.html)
- `everyone`: ‘모두’가 있지만, 뜻풀이로 잘못 추출된 출처 문자열도 있다. [확인한 항목](https://kaikki.org/kowiktionary/영어/meaning/e/ev/everyone.html)
- `creed`: 한국어 뜻은 있으나 품사가 `unknown`인 레코드가 있어 분석 결과의 품사와 연결할 때 보정이 필요하다. [확인한 항목](https://kaikki.org/kowiktionary/영어/meaning/c/cr/creed.html)

따라서 한국어판 Kaikki는 유용한 보완 자료이지만, 그대로 유일한 사전으로 채택하기에는 누락과 추출 오류가 있다. 영어판 Wiktionary 기반 사전과 함께 후보를 수집하고, 실제 문장에서 쓸 한국어 의미를 확정하는 방식이 적합하다. 이는 위 세 항목을 확인한 데 따른 판단이며 전체 데이터 품질 평가 결과는 아니다.

Kaikki는 Wiktionary에서 유래한 데이터의 라이선스를 그대로 적용한다고 설명한다. 추출기 코드의 라이선스와 사전 본문 라이선스는 다르다. 원문 링크, 적용 라이선스, 수정·번역 여부를 보존해야 한다. CC BY-SA는 상업적 이용을 허용하면서 출처 표시와 변경물의 동일 조건 공유 등을 요구한다. [Kaikki 안내](https://kaikki.org/kowiktionary/), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)

새 수집 작업에서는 raw Wiktextract JSONL을 기준으로 언어를 필터링한다. Kaikki는 기존 후처리된 언어별 다운로드를 deprecated로 표시하고 있다. 영어판 추출 데이터에 여러 언어의 표제어가 들어 있는 것과 한국어판 추출 데이터의 한국어 뜻풀이는 구분해야 한다. 발음 음성은 개별 미디어의 라이선스를 별도로 보존한다. [현재 다운로드 안내](https://kaikki.org/dictionary/rawdata.html), [Wikimedia 재사용 조건](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use#7._Licensing_of_Content)

### 함께 검토할 사전·서비스

| 후보 | 적합한 용도 | 한국어 설명 관점의 한계 |
| --- | --- | --- |
| [Kaikki / Wiktextract](https://kaikki.org/) | 여러 언어의 Wiktionary 데이터를 내려받아 자체 검색 | 어느 언어판에서 추출했는지에 따라 뜻풀이 언어가 달라짐. 데이터 정제·검색 인덱스 필요 |
| [FreeDictionaryAPI.com](https://freedictionaryapi.com/) | 영어판 Wiktionary의 다국어 표제어를 REST로 조회 | 뜻풀이는 영어 기반. 선택적인 한국어 번역어가 한국어 문장형 해설을 뜻하지 않음 |
| [dictionaryapi.dev](https://dictionaryapi.dev/) | 영어 단어 사전의 빠른 시제품 | 현재 문서의 지원 범위는 영어. 한국어 뜻과 6개 언어 공통 기반은 별도 |
| [JMdict](https://www.edrdg.org/wiki/JMdict-EDICT_Dictionary_Project.html) | 일본어 표기·읽기·품사·뜻 후보 | 한국어를 기본 뜻풀이로 제공하는 사전으로 간주하면 안 됨 |
| [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cedict) | 중국어 간체·번체·병음·영어 뜻 | 한국어 뜻풀이 보완 필요 |
| [FreeDict](https://freedict.org/) | 특정 언어 쌍의 오프라인 사전 | 언어 쌍별 범위·품질·라이선스가 다름. 요청한 6개 언어의 한국어 풀이를 일괄 해결하지 않음 |

FreeDictionaryAPI.com은 키 없이 IP당 시간당 1,000회, UTC 정각에 한도가 갱신된다고 명시한다. 응답은 품사, 발음 표기, 활용형, 의미, 예문, 출처 및 선택적인 번역어를 포함한다. 중앙 서버가 대신 요청하면 그 서버 IP에 사용량이 모이므로 캐시가 필요하다. Wiktionary 및 서비스 출처 표시 요구를 함께 확인한다. 이름이 비슷한 dictionaryapi.dev와는 별개 서비스다. [공식 API·한도·출처 표시 안내](https://freedictionaryapi.com/)

`fair?translations=true`를 실제 조회한 응답에는 ‘공정한’에 대응하는 영어 형용사 뜻이 있으나 그 의미의 한국어 번역어는 없었다. 형용사 항목에서 확인한 한국어 번역어는 야구 용어의 ‘페어의’였다. 이 샘플은 `translations=true`만으로 문맥에 맞는 한국어 뜻을 얻을 수 없음을 보여준다. Python 기본 User-Agent 요청은 403이었고, `User-Agent: Mozilla/5.0`을 명시한 요청은 200으로 성공했다. 이 결과는 한 표제어의 응답 검증이며 전체 언어의 품질이나 서비스 가용성 보장은 아니다. [조회한 API](https://freedictionaryapi.com/api/v1/entries/en/fair?translations=true)

dictionaryapi.dev의 관리자는 Wiktionary로 전환하면서 영어 외 지원을 제거했다고 공지했다. 오래된 소개 글의 다국어 지원 목록을 현재 기능으로 인용하지 않는다. 이번 환경의 샘플 요청은 403으로 거절되어 서비스 응답이나 운영 한도를 검증하지 못했다. 이는 서비스 중단의 증거가 아니다. [관리자 공지](https://github.com/meetDeveloper/freeDictionaryAPI/issues/102)

JMdict의 일본어·영어 구성 요소와 CC-CEDICT는 CC BY-SA 4.0 조건으로 상업적 이용을 허용한다. JMdict의 다른 언어 구성 요소는 별도 권리를 확인해야 한다. EDRDG는 출처 고지와 정기 데이터 갱신 절차도 요구하며, 웹 사전은 최소 월 1회 갱신을 예로 든다. FreeDict는 사전별 TEI 헤더의 라이선스를 확인해야 하며, 제공 API는 주로 다운로드·메타데이터용이다. [EDRDG 조건](https://www.edrdg.org/edrdg/licence.html), [CC-CEDICT 조건](https://cc-cedict.org/editor/editor.php?handler=Download), [FreeDict 재사용 안내](https://freedict.org/documentation/)

국립국어원 한국어기초사전 API는 한국어 표제어와 그 외국어 번역을 제공하는 한국어 학습용 사전이다. 외국어 단어를 눌렀을 때 한국어 뜻을 주는 일반적인 외국어 사전과 방향이 다르므로, 이번 요구를 바로 해결하는 API로 분류하지 않는다. [공식 API 필드·예제](https://krdict.korean.go.kr/kor/openApi/openApiInfo)

## 3. 문장 분석 라이브러리·서비스

| 후보 | 요청 언어 지원 | 얻는 결과 | 무료 사용의 경계 / 판단 |
| --- | --- | --- | --- |
| [spaCy](https://spacy.io/usage/models) | 6개 모두 학습된 파이프라인 제공 | 단어 구분, 품사, 의존 관계, 언어별 기본형·형태 정보 | 자체 실행. 코드와 모델 라이선스 구분. MVP의 기본 비교 후보 |
| [Stanza](https://stanfordnlp.github.io/stanza/performance.html) | 6개 모두 의존 분석 제공 | UD 기반 품사·형태·기본형·의존 관계, 일부 언어 구 구조 | 자체 실행. 모델별 권리 확인 필요. 공통 분석 체계에 장점 |
| [GiNZA](https://megagonlabs.github.io/ginza/) | 일본어 | Sudachi 기반 형태 분석, 의존 관계, 문절 단위 API | 라이브러리와 GiNZA UD 모델 MIT. 부속 자원 고지도 보존. 일본어 전용 후보 |
| [benepar](https://github.com/nikitakit/self-attentive-parser) | 요청 언어 중 영어·중국어·독일어·프랑스어 | 명사구·동사구·전치사구 등의 constituency tree | 코드 MIT. 모델은 별도 다운로드·조건 확인. 일본어·스페인어 사전학습 모델은 공식 목록에 없음 |
| [Google Cloud Natural Language](https://docs.cloud.google.com/natural-language/docs/languages) | 6개 모두 syntax API 지원 | 단어 위치, 품사, 기본형, 의존 관계 | 월 5,000 syntax 단위 무료, 이후 유료. 한국어 해설이나 사전은 제공하지 않음 |
| [UDPipe](https://ufal.mff.cuni.cz/udpipe/1) | 다국어 UD 모델 | 품사·기본형·의존 관계 | 공개 모델의 CC BY-NC-SA 조건 때문에 상용 무료 기본안에서 제외 |
| [HanLP](https://hanlp.hankcs.com/docs/tutorial.html) | 다국어, 기능별 차이 | 의존·구 구조 및 여러 NLP 기능 | 공개 모델·REST API는 CC BY-NC-SA 4.0 안내. 다국어 지원이 기능별 품질 보장을 뜻하지 않음 |

Google의 syntax 무료 단위는 요청별 Unicode 문자 수를 1,000자 단위로 올림하여 계산한다. 1,000자 이하 문장을 각각 한 번 요청하면 각각 1단위다. 따라서 5,000단위를 무조건 임의 길이의 5,000문장으로 이해하면 안 된다. 프로젝트 인증·설정이 필요하고 추가 클라우드 자원 비용은 별도다. [요금](https://cloud.google.com/products/natural-language/pricing), [API 사용법](https://docs.cloud.google.com/natural-language/docs/analyzing-syntax)

### spaCy 모델의 실제 라이선스 차이

아래는 공식 저장소의 **3.8.0 모델 메타데이터를 직접 조회한 결과**다. spaCy 코드의 MIT를 모든 모델에 적용하면 안 된다. 다른 버전이나 transformer 모델을 고를 때는 그 파일을 다시 확인한다.

| 언어 | 확인한 모델 | 모델 메타데이터의 라이선스 |
| --- | --- | --- |
| 영어 | [en_core_web_sm](https://raw.githubusercontent.com/explosion/spacy-models/master/meta/en_core_web_sm-3.8.0.json) | MIT |
| 일본어 | [ja_core_news_sm](https://raw.githubusercontent.com/explosion/spacy-models/master/meta/ja_core_news_sm-3.8.0.json) | CC BY-SA 4.0 |
| 중국어 | [zh_core_web_sm](https://raw.githubusercontent.com/explosion/spacy-models/master/meta/zh_core_web_sm-3.8.0.json) | MIT |
| 스페인어 | [es_core_news_sm](https://raw.githubusercontent.com/explosion/spacy-models/master/meta/es_core_news_sm-3.8.0.json) | GNU GPL 3.0 |
| 독일어 | [de_core_news_sm](https://raw.githubusercontent.com/explosion/spacy-models/master/meta/de_core_news_sm-3.8.0.json) | MIT |
| 프랑스어 | [fr_core_news_sm](https://raw.githubusercontent.com/explosion/spacy-models/master/meta/fr_core_news_sm-3.8.0.json) | LGPL-LR |

GPL·LGPL·CC BY-SA를 ‘비상업 전용’과 같은 뜻으로 분류하지 않는다. 실제 모델 이용·수정·배포 방식에 맞춰 조건을 확인한다. 특히 서버에서 분석하는 구성과 모델을 다운로드형 앱에 포함하는 구성은 검토 대상이 다르다. [GPLv3 원문](https://www.gnu.org/licenses/gpl-3.0.html), [CC BY-SA 조건](https://creativecommons.org/licenses/by-sa/4.0/)

Stanza 코드는 Apache 2.0이지만 모델의 안내는 일관되지 않다. 공식 성능 페이지는 UD 기반 모델의 권리가 불명확할 수 있다고 안내하고 Stanford가 권리를 갖는 범위에서 ODC-By를 명시한다. 한편 영어 Hugging Face 모델 카드는 Apache 2.0으로 표시된다. 모델 파일과 버전별 확인 없이 전부 Apache로 상용 승인된다고 결론내리지 않는다. [Stanza 라이브러리](https://stanfordnlp.github.io/stanza/), [모델 권리 안내](https://stanfordnlp.github.io/stanza/performance.html), [영어 모델 카드](https://huggingface.co/stanfordnlp/stanza-en)

### 구·절 분석은 언어별로 따로 선택

| 언어 | 의존 관계의 우선 평가 후보 | 구·절 또는 문절 후보 |
| --- | --- | --- |
| 영어 | spaCy / Stanza | Stanza / benepar |
| 일본어 | GiNZA / Stanza | GiNZA 문절 API; Stanza ALT 구 구조 모델 |
| 중국어 | spaCy / Stanza | Stanza / benepar |
| 스페인어 | spaCy / Stanza | Stanza |
| 독일어 | spaCy / Stanza | benepar |
| 프랑스어 | spaCy / Stanza | benepar |

Stanza 공식 constituency 목록에는 요청 언어 중 영어·일본어·중국어·스페인어가 있고, 독일어·프랑스어는 나열되어 있지 않다. benepar 목록에는 영어·중국어·독일어·프랑스어가 있다. ‘다국어 지원’과 ‘모든 언어에서 모든 기능 지원’을 구분해야 한다. 일본어 문절과 영어식 NP/VP도 같은 단위가 아니다. [Stanza 목록](https://stanfordnlp.github.io/stanza/constituency.html), [benepar 목록](https://github.com/nikitakit/self-attentive-parser#available-models), [GiNZA 문절 API](https://megagonlabs.github.io/ginza/)

## 4. 사용자 예문의 학습용 표시

> You should be fair to everyone regardless of national origin, gender, or creed.

아래는 설명용으로 작성한 분석이며 라이브러리를 실행해 얻은 출력이 아니다.

| 부분 | 학습용 설명 |
| --- | --- |
| You | 주어: 공정하게 대해야 하는 사람 |
| should | 조동사: 이 문맥에서는 의무·당위·권고 |
| be fair | ‘공정해야 한다’의 중심. be는 연결동사, fair는 주어의 성질을 설명하는 형용사 보어 |
| to everyone | 누구에게 공정해야 하는지 나타내는 전치사구 |
| regardless of … | ‘…에 상관없이’라는 조건·양보 의미를 더하는 표현 |
| national → origin | national이 origin을 수식 |
| national origin, gender, or creed | 출신 국가·성별·신념을 병렬로 나열 |

단어 사전과 문법 설명을 연결하면 fair의 여러 뜻 중 ‘공정한’을 우선 선택하고, ‘이 문장에서는 형용사이며 be 뒤에서 주어의 성질을 설명합니다’라고 제시할 수 있다. 단, 형용사라는 사실만으로 fair의 모든 형용사 뜻 중 올바른 의미가 자동 확정되지는 않는다. 의미 선택은 별도 문제다.

첨부 이미지의 `everyone = noun`, 마침표의 `noun` 표시는 그대로 학습 정답으로 채택하지 않는다. 학습용 everyone은 부정대명사이고 마침표는 문장부호다. `regardless of`와 같은 여러 단어로 된 표현을 함께 조회하는 기능도 필요하다.

또한 UD에서는 이런 문장의 비동사 서술어인 fair가 중심이 되고 be는 `cop`으로 연결될 수 있다. 이를 화면에서 ‘주어 + should be + 형용사 보어’로 표시하는 것은 별도의 교육용 변환이다. 엔진 간 중심 단어나 관계 이름 차이를 오류로 단정하지 않는다. [Universal Dependencies의 cop 설명](https://universaldependencies.org/u/dep/cop.html)

## 5. 현재 앱에 맞는 도입 제안

현재 프로젝트의 지문은 관리자 업로드·미리보기·게시 흐름을 갖는다. 이 흐름을 이용하여 **지문 입력 시 분석 → 한국어 뜻·설명 확정 → 저장 → 학습 화면에서 조회**하는 방식이 적합하다. 아래는 새 기능에 대한 제안이며 현재 구현된 동작이 아니다. [기존 가져오기 문서](../docs/script-import.md)

1. spaCy를 기본 비교 엔진으로 두고 일본어는 GiNZA도 비교한다. 엔진은 서버 또는 로컬 배치에서 실행한다.
2. 표면형과 기본형, 품사를 이용해 사전 후보를 찾는다. 일본어·중국어는 띄어쓰기만으로 단어를 나누지 않는다. 여러 단어로 된 관용 표현도 별도 후보로 검색한다.
3. 한국어판 데이터의 뜻을 우선 참고하되, 일치하는 의미가 없으면 영어판 데이터의 의미·번역어를 참고하여 한국어 풀이를 보완한다. 자동 번역이나 LLM을 쓰면 생성된 풀이로 표시하고 검수한다.
4. `amod` 등의 관계와 언어별 규칙을 한국어 설명 템플릿으로 바꾼다. 구·절 구조가 필요한 언어에만 추가 parser를 평가한다.
5. 확정 결과는 지문 텍스트 해시, 언어, 분석기·모델·설명 규칙 버전과 함께 저장한다. 학습자가 단어를 누르거나 문장을 반복할 때 분석을 반복하지 않는다.

보존할 데이터는 원문, 단어의 문자 구간, 기본형·품사·형태, 원시 의존 관계, 교육용 구간·관계, 사전 의미 ID, 한국어 풀이, 사전 원문 URL·라이선스, 검수 상태다. 원문 구간과 문법 단위를 분리해야 프랑스어·스페인어의 축약형, 일본어의 형태소 분할, 중국어의 복합 단어를 화면 선택과 연결할 수 있다. 문자 오프셋의 단위도 Python과 JavaScript 사이에서 명시해야 한다. [Stanza의 token/word 구분](https://stanfordnlp.github.io/stanza/faq.html), [spaCy 언어별 토큰화](https://spacy.io/usage/models)

기본적인 ‘주어·보어·형용사 수식’ 설명은 직접 작성한 규칙과 템플릿으로 시작할 수 있다. 자유로운 문맥 해설이나 사전 누락 보완에만 LLM을 선택적으로 사용한다. 로컬 모델도 실행 자원이 들며, 무료 API를 무제한 생산 서비스로 가정하지 않는다.

## 6. 검증 상태와 다음 실험

공식 문서, 모델 메타데이터, 사전 표제어를 조사했다. 실제 앱에 라이브러리를 설치하거나 기능을 추가하지 않았고, 6개 언어의 parser 정확도·지연 시간·메모리 사용량은 측정하지 않았다.

다음 실험은 언어별 실제 학습 문장 30~50개로 작게 시작한다. 사전 검색 성공률 외에 **해당 문맥의 의미가 존재하는지**, 한국어 풀이의 적합성, 단어 선택 구간, 수식 관계, 구·절 경계, 한국어 설명 오류를 따로 측정한다. 사용자의 예문처럼 fair를 찾았어도 필요한 뜻이 없을 수 있으므로 표제어 검색 성공만으로 합격시키지 않는다. 통계적 parser에는 오류가 생길 수 있다는 점도 평가 기준에 반영한다. [Stanza 모델 출력 FAQ](https://stanfordnlp.github.io/stanza/faq.html)

## 7. 외부 사전 iframe과 Cambridge 위젯 후속 검증

2026-09-07 별도 로컬 페이지와 Chrome에서 검증했다. 네이버 영어사전의 `https://en.dict.naver.com/#/search?query=open`은 다른 출처의 iframe 안에서 검색 결과가 표시됐다. 이는 확인한 URL과 환경에서의 기술적 동작이며 다른 언어 사전·iPhone Safari/PWA까지 검증한 결과는 아니다.

Cambridge 영한사전의 `https://dictionary.cambridge.org/search/english-korean/direct/?q=open`은 `https://dictionary.cambridge.org/dictionary/english-korean/open`으로 이동하지만, iframe 표시는 차단됐다. 응답에는 `X-Frame-Options: SAMEORIGIN`과 `Content-Security-Policy: frame-ancestors 'self' *.cambridge.org`가 있었으며, 실제 브라우저 콘솔에서도 해당 CSP에 의한 차단을 확인했다.

Cambridge 공식 더블클릭 스크립트까지 확인했다. 선택한 단어 옆에 표시하는 Definition 요소는 검색 실행 버튼이며, 결과 본문을 앱 내부에 렌더링하지 않는다. 내부 함수가 검색 URL을 구성한 뒤 `window.open()`으로 별도 창을 열거나, `self` 옵션이면 현재 페이지 전체를 이동시킨다. HTML 검색 위젯 역시 `target="_blank"`로 결과를 외부 창/탭에 연다. [공식 검색 위젯](https://dictionary.cambridge.org/freesearch), [공식 더블클릭 기능](https://dictionary.cambridge.org/doubleclick.html), [확인한 스크립트](https://dictionary.cambridge.org/external/scripts/dblclick.js?version=6.0.80)

단어 한 번 클릭으로 이 검색 URL을 여는 별도 실험 화면을 만들었다. `open`과 `window` 모두 실제 영한사전 페이지와 한국어 뜻이 별도 창에서 표시되고 원래 학습 페이지가 유지되는 것을 확인했다. 실험 화면의 iframe 모드에서는 동일한 차단이 재현됐다. 따라서 단어 클릭 트리거를 바꾸는 것은 가능하지만, 무료 위젯 수정만으로 Cambridge 검색 결과를 우리 웹앱의 같은 페이지 안에 표시하는 기능은 완성되지 않는다. 실제 학습 플레이어에는 이 대체 팝업 동작을 적용하지 않았다.

## 8. Cambridge API 신청 경로 후속 확인

2026-09-07 직접 HTTP 응답을 확인한 결과, 기존 개발자 사이트의 `/api/`, `/registration`, `/apply`는 모두 `https://dictionary.cambridge.org/`로 301 이동했다. 검색엔진에는 과거 등록·신청 양식이 남아 있지만 현재 사용할 수 있는 가입 화면으로 확인되지는 않았다. 이 리디렉션만으로 API 서비스 자체가 종료됐다고 단정할 수는 없다.

현재 사용할 수 있는 문의 창은 [공식 License our data 페이지](https://dictionary.cambridge.org/license.html)에 있다. 데이터 목록 아래의 **contact us**를 누르면 이름·이메일·문의 내용을 입력하는 양식이 열리는 것을 Chrome에서 확인했다. 양식 제목은 라이선스 정보 요청이며 즉시 API 키를 발급하는 가입 화면은 아니다. 내용 입력이나 전송은 하지 않았다.

문의할 항목은 신규 API 신청 및 평가용 키 발급 가능 여부, English–Korean 데이터 제공 여부, 앱 내부 정의·예문·발음 표시 허용 범위, 무료 평가 조건과 최소 요금, 사전 조회 결과의 사전 수집·저장·캐시 허용 조건이다. 주 500개 문장은 콘텐츠 등록량이며 사전 API 호출량과 같지 않으므로 구분해 설명해야 한다. 공식 라이선스 페이지는 조직과 사용 방식에 따른 가격 협의를 안내하므로 무료 상용 API라고 가정하지 않는다.

검색에 남아 있는 [과거 API 평가 약관](https://dictionary-api.cambridge.org/api/terms-and-conditions)은 캐시·사전 수집·복사본 저장을 제한한다. 현재 계약 조건은 별도 확인이 필요하며, 다른 분석 서비스에 권장한 사전 처리·캐시 방식을 Cambridge 데이터에도 그대로 적용해서는 안 된다.
