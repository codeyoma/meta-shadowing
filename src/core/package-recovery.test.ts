import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostedDownloadError, materialRemovalNotice } from './library-presentation';

test('intentional download cancellation is quiet for paid, free and sample material, even if status cannot be read', () => {
  for (const kind of ['paid', 'free', 'sample'] as const) {
    assert.equal(hostedDownloadError(Error('package-delivery-cancelled'), null, kind), null);
    assert.equal(hostedDownloadError(Error('request ended'), { phase: 'cancelled', progress: 0 }, kind), null);
  }
});

test('partial cache cleanup reports local removal honestly while successful removal stays quiet', () => {
  assert.equal(materialRemovalNotice({ cacheCleared: true }), null);
  assert.equal(materialRemovalNotice({ cacheCleared: false }),
    '학습 자료는 삭제했지만 Apple 임시 파일을 정리하지 못했어요. 다음 다운로드 때 다시 시도해요. 학습 기록은 유지돼요.');
});

test('incompatible content asks for a compatible app version without suggesting deletion of learning records', () => {
  for (const kind of ['paid', 'free', 'sample'] as const) {
    assert.equal(hostedDownloadError(Error('package-delivery-incompatibleVersion'), null, kind),
      '같은 버전의 자료 구성이 달라요. 학습 기록은 유지돼요. 호환되는 앱·자료 버전으로 업데이트해 주세요.');
  }
});
