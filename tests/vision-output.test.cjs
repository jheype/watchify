'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createVisionClient, DEFAULT_MODEL, ANALYSIS_SCHEMA, visionDiagnostic } = require('../server/vision.cjs');

const assetIds = ['513b8571-acd3-4dd7-a67f-14bfd6a18115', '02ff652c-d6f2-45d1-b3d6-19c9f62723bd'];
const photos = () => assetIds.map((id, index) => ({
  id, buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), mimeType: 'image/jpeg', role: index ? 'Clasp' : 'Front & dial'
}));
const assessment = () => ({
  candidates: [{ brand: 'Cartier', model: 'Santos', reference: null, confidence: 'medium', reason: 'The case and dial suggest Santos; the reference remains uncertain.' }],
  observations: [{ component: 'case', finding: 'Minor visible surface marks.', severity: 'minor', assetIds: [assetIds[0]] },
    { component: 'clasp', finding: 'Fine marks on the clasp.', severity: 'minor', assetIds: [assetIds[1]] }],
  condition: { suggestedGrade: 'Very good', visibleWear: 'minor' },
  polishing: { assessment: 'not_determinable', evidence: ['These views cannot establish polishing history.'] },
  accessories: { box: 'not_visible', papers: 'not_visible' },
  photoQuality: { usable: true, issues: ['Add photographs of the case sides.'] },
  unknowns: [], warnings: [], reviewRequired: true
});
const message = (text, extras = {}) => ({ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text }], ...extras });
const final = () => message(JSON.stringify(assessment()), { phase: 'final_answer' });
const response = output => ({ id: 'resp_output_test', status: 'completed', model: DEFAULT_MODEL, output });
const json = body => Response.json(body);
function stream(value) {
  const bytes = Buffer.from(`event: response.completed\r\ndata: ${JSON.stringify({ type: 'response.completed', response: value })}\r\n\r\ndata: [DONE]\r\n\r\n`);
  return new Response(new ReadableStream({ start(controller) {
    // Split both CRLF sequences and multibyte UTF-8 independently of frames.
    for (let at = 0; at < bytes.length; at += 7) controller.enqueue(bytes.subarray(at, at + 7));
    controller.close();
  } }), { headers: { 'content-type': 'text/event-stream; charset=utf-8' } });
}
function clientFor(mode, output) {
  const calls = [];
  const auth = { getAccess: async () => ({ accessToken: 'private_test_access_token' }) };
  const client = createVisionClient({ ...(mode === 'chatgpt' ? { auth } : { apiKey: 'private_test_api_key' }), fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/models')) return json({ models: [{ slug: DEFAULT_MODEL, display_name: 'Vision test model', visibility: 'list' }] });
    return mode === 'chatgpt' ? stream(response(output)) : json(response(output));
  } });
  return { calls, analyse: () => client.analyseWatch({ images: photos() }) };
}
function assertSingleInference(fixture, mode) {
  assert.equal(fixture.calls.filter(call => call.url.endsWith('/responses')).length, 1, 'No automatic paid retry');
  assert.equal(fixture.calls.length, mode === 'chatgpt' ? 2 : 1);
  const body = JSON.parse(fixture.calls.at(-1).options.body);
  assert.equal(body.text.format.strict, true);
  assert.deepEqual(body.text.format.schema.properties.observations.items.properties.assetIds.items.enum, assetIds, 'The model may cite only the current uploaded photos');
  assert.equal(body.input[0].content.filter(item => item.type === 'input_image').length, 2);
}

for (const mode of ['chatgpt', 'api_key']) {
  test(`${mode}: an explicit final assessment is not concatenated with commentary`, async () => {
    const fixture = clientFor(mode, [
      { type: 'reasoning', summary: [{ type: 'summary_text', text: 'Non-assessment metadata.' }] },
      message('I’m checking the dial and clasp photographs.', { phase: 'commentary' }), final()
    ]);
    const result = await fixture.analyse();
    assert.equal(result.candidates[0].model, 'Santos');
    assert.deepEqual(result.observations.map(item => item.assetIds), assetIds.map(id => [id]));
    assert.equal(result.reviewRequired, true);
    assert.doesNotMatch(JSON.stringify(result), /checking the dial|Non-assessment metadata/);
    assertSingleInference(fixture, mode);
  });

  test(`${mode}: a single unphased or null-phase final remains compatible`, async () => {
    for (const extras of [{}, { phase: null }]) {
      const fixture = clientFor(mode, [message(JSON.stringify(assessment()), extras)]);
      assert.equal((await fixture.analyse()).condition.suggestedGrade, 'Very good');
      assertSingleInference(fixture, mode);
    }
  });

  test(`${mode}: commentary cannot substitute for a final assessment even when it is valid JSON`, async () => {
    const fixture = clientFor(mode, [message(JSON.stringify(assessment()), { phase: 'commentary' })]);
    await assert.rejects(fixture.analyse(), { code: 'VISION_INVALID_RESPONSE', reason: 'FINAL_MISSING' });
    assertSingleInference(fixture, mode);
  });

  test(`${mode}: an unfinished message is rejected despite a completed response envelope`, async () => {
    for (const status of ['in_progress', 'incomplete']) {
      const fixture = clientFor(mode, [{ ...final(), status }]);
      await assert.rejects(fixture.analyse(), { code: 'VISION_INCOMPLETE' });
      assertSingleInference(fixture, mode);
    }
  });

  test(`${mode}: multiple candidate final messages are never merged or selected heuristically`, async () => {
    for (const output of [[final(), final()], [message('Unlabelled preamble.'), final()], [message(JSON.stringify(assessment())), message(JSON.stringify(assessment()))]]) {
      const fixture = clientFor(mode, output);
      await assert.rejects(fixture.analyse(), { code: 'VISION_INVALID_RESPONSE', reason: 'FINAL_AMBIGUOUS' });
      assertSingleInference(fixture, mode);
    }
  });

  test(`${mode}: refusal in commentary or final content cannot be hidden by a valid assessment`, async () => {
    for (const phase of ['commentary', 'final_answer']) {
      const fixture = clientFor(mode, [message('', { phase, content: [{ type: 'refusal', refusal: 'PRIVATE_REFUSAL_TEXT' }] }), final()]);
      await assert.rejects(fixture.analyse(), error => {
        assert.equal(error.code, 'VISION_REFUSED');
        assert.doesNotMatch(error.message + JSON.stringify(error), /PRIVATE_REFUSAL_TEXT|private_test_access_token|private_test_api_key/);
        return true;
      });
      assertSingleInference(fixture, mode);
    }
  });

  test(`${mode}: rejected assessments expose only safe diagnostic categories and schema paths`, async () => {
    const secret = 'PRIVATE_PROVIDER_OR_PHOTO_VALUE';
    const badCondition = assessment(); badCondition.condition.suggestedGrade = secret;
    const badPhoto = assessment(); badPhoto.observations[0].assetIds = [secret];
    const cases = [
      [[message(secret, { phase: 'final_answer' })], 'ASSESSMENT_JSON', undefined],
      [[message(JSON.stringify(badCondition), { phase: 'final_answer' })], 'SCHEMA_MISMATCH', 'assessment.condition.suggestedGrade'],
      [[message(JSON.stringify(badPhoto), { phase: 'final_answer' })], 'UNKNOWN_PHOTO_ID', 'assessment.observations[0].assetIds[0]'],
      [[null, final()], 'OUTPUT_SHAPE', undefined]
    ];
    for (const [output, reason, field] of cases) {
      const fixture = clientFor(mode, output);
      await assert.rejects(fixture.analyse(), error => {
        assert.equal(error.code, 'VISION_INVALID_RESPONSE');
        assert.equal(error.reason, reason);
        assert.equal(error.field, field);
        assert.deepEqual(visionDiagnostic(error), { reason, ...(field ? { field } : {}) });
        assert.doesNotMatch(error.message + JSON.stringify(error), /PRIVATE_PROVIDER_OR_PHOTO_VALUE|private_test_access_token|private_test_api_key/);
        return true;
      });
      assertSingleInference(fixture, mode);
    }
  });
}

test('photo ID restrictions remain local to each concurrent request without mutating the shared schema', async () => {
  const originalSchema = JSON.stringify(ANALYSIS_SCHEMA);
  const idsByRequest = [assetIds, ['90427603-7012-4bf3-ab78-cc5d254f861b', '6b710a83-664b-40cc-95f4-77c979a4db09']];
  const bodies = [];
  const client = createVisionClient({ apiKey: 'private_test_api_key', fetchImpl: async (_url, options) => {
    const requestIndex = bodies.length;
    bodies.push(JSON.parse(options.body));
    const value = assessment();
    value.observations.forEach((item, index) => { item.assetIds = [idsByRequest[requestIndex][index]]; });
    return json(response([message(JSON.stringify(value), { phase: 'final_answer' })]));
  } });
  const results = await Promise.all(idsByRequest.map(ids => client.analyseWatch({ images: photos().map((photo, index) => ({ ...photo, id: ids[index] })) })));
  assert.equal(bodies.length, 2, 'Each explicit analysis makes exactly one inference request');
  for (let index = 0; index < 2; index++) {
    assert.deepEqual(bodies[index].text.format.schema.properties.observations.items.properties.assetIds.items.enum, idsByRequest[index]);
    assert.deepEqual(results[index].observations.map(item => item.assetIds), idsByRequest[index].map(id => [id]));
  }
  assert.equal(JSON.stringify(ANALYSIS_SCHEMA), originalSchema);
  assert.equal(Object.hasOwn(ANALYSIS_SCHEMA.properties.observations.items.properties.assetIds.items, 'enum'), false);
});
