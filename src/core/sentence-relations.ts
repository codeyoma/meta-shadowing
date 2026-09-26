import type { AnalysisSentence } from './sentence-analysis';

export type WordRelation = { head: number; dependent: number; label: string; name: string; explanation: string };

// Google Natural Language dependency labels, not Universal Dependencies aliases.
// https://docs.cloud.google.com/natural-language/docs/morphology
const descriptions: Record<string, readonly [string, string]> = {
  DOBJ: ['직접 목적어', '동작이 직접 향하는 대상을 나타냅니다.'],
  NSUBJ: ['주어', '문장에서 동작이나 상태의 주체 역할을 합니다.'],
  NSUBJPASS: ['수동태 주어', '수동태 문장에서 동작을 받는 주어입니다.'],
  CSUBJ: ['주어절', '절이 주어 역할을 합니다.'],
  CSUBJPASS: ['수동태 주어절', '절이 수동태 문장의 주어 역할을 합니다.'],
  IOBJ: ['간접 목적어', '동작과 관련된 받는 사람이나 대상을 나타냅니다.'],
  ACOMP: ['형용사 보어', '형용사가 중심어의 의미를 보충합니다.'],
  ATTR: ['보어', '연결 동사와 이어져 주어의 속성을 설명합니다.'],
  AUX: ['조동사', '중심 동사의 시제나 가능성 등의 의미를 돕습니다.'],
  AUXPASS: ['수동태 조동사', '중심 동사와 함께 수동태를 만듭니다.'],
  AMOD: ['형용사 수식', '명사의 성질이나 특징을 설명합니다.'],
  ADVMOD: ['부사 수식', '중심어의 방식이나 정도 등을 설명합니다.'],
  ADVCL: ['부사절 수식', '절이 중심어에 상황이나 조건 등의 의미를 더합니다.'],
  DET: ['한정사', '명사가 가리키는 대상을 한정합니다.'],
  NN: ['명사 수식', '명사가 다른 명사의 의미를 구체화합니다.'],
  POSS: ['소유 수식', '중심어와 소유 관계를 나타냅니다.'],
  PREP: ['전치사 수식', '전치사를 통해 중심어에 추가 정보를 연결합니다.'],
  POBJ: ['전치사 목적어', '전치사 등에 이어지는 명사구의 중심어입니다.'],
  PCOMP: ['전치사 보어절', '절이 전치사의 의미를 보충합니다.'],
  CCOMP: ['보충절', '절이 중심어의 의미를 보충합니다.'],
  XCOMP: ['열린 보충절', '별도의 주어를 명시하지 않는 보충절입니다.'],
  CONJ: ['병렬 연결', '동등한 역할의 요소가 연결되어 있습니다.'],
  CC: ['등위 접속사', '동등한 역할의 요소를 연결하는 접속사입니다.'],
  MARK: ['종속절 표지', '종속절을 도입하는 요소입니다.'],
  NEG: ['부정', '중심어에 부정의 의미를 더합니다.'],
  NUM: ['수량 수식', '명사의 수량을 나타냅니다.'],
  RCMOD: ['관계절 수식', '관계절이 명사를 설명합니다.'],
  APPOS: ['동격', '같은 대상을 다른 표현으로 설명합니다.'],
  PRT: ['동사 불변화사', '동사와 결합해 의미를 구성하는 불변화사입니다.'],
  TMOD: ['시간 수식', '시간에 관한 정보를 더합니다.'],
  P: ['문장 부호', '문장의 구조나 경계를 표시하는 부호입니다.'],
};

/** Arrows point from the head to its dependent; identity is the sentence-local token index. */
export function relationsForToken(sentence: AnalysisSentence, selected: number | null) {
  const edges: WordRelation[] = [];
  const connected = new Set<number>();
  const token = selected === null || !Number.isSafeInteger(selected) || selected < 0 ? undefined : sentence.tokens[selected];
  if (token) {
    connected.add(selected!);
    sentence.tokens.forEach((dependent, index) => {
      if (!Number.isSafeInteger(dependent.head) || dependent.head < 0 || dependent.head >= sentence.tokens.length
        || dependent.head === index || dependent.relation === 'ROOT'
        || (index !== selected && dependent.head !== selected)) return;
      const [name, explanation] = Object.hasOwn(descriptions, dependent.relation) ? descriptions[dependent.relation]!
        : ['기타 관계', '이 관계는 원본 분석 라벨로 표시합니다.'];
      edges.push({ head: dependent.head, dependent: index, label: dependent.relation, name, explanation });
      connected.add(dependent.head); connected.add(index);
    });
  }
  return { edges, connected: [...connected].sort((a, b) => a - b), root: token?.relation === 'ROOT' && token.head === selected };
}
