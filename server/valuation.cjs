'use strict';

const { validateListingCondition } = require('../src/domain.js');
class ValuationError extends Error {
  constructor(code, message, status = 422) { super(message); this.code = code; this.status = status; }
}
const grades = ['Excellent', 'Very good', 'Good'];
function checkDeclarations(analysis, declarations, year) {
  const result = validateListingCondition({ ...declarations, year });
  if (!result.valid) throw new ValuationError('INVALID_DECLARATIONS', result.errors[0].message);
  if (!analysis.photoQuality.usable) throw new ValuationError('MORE_PHOTOS_REQUIRED', 'Add clearer photographs before requesting a valuation.');
  const severities = analysis.observations.filter(o=>!['box','papers'].includes(o.component)).map(o=>o.severity);
  const severeObservation = severities.some(s=>['moderate','heavy'].includes(s));
  const aiWear = severeObservation ? 'visible' : severities.includes('minor') && analysis.condition.visibleWear === 'none' ? 'minor' : analysis.condition.visibleWear;
  if ((aiWear === 'minor' && declarations.visibleWear === 'none') || (aiWear === 'visible' && declarations.visibleWear !== 'visible')) {
    throw new ValuationError('CONDITION_CONFLICT', 'The photo assessment and declared wear differ. Correct the declaration or request specialist review.');
  }
  if (analysis.polishing.assessment === 'possible' && declarations.polishing === 'unpolished') {
    throw new ValuationError('POLISHING_CONFLICT', 'The photos suggest possible refinishing. Select Not sure or disclose the known history for specialist review.');
  }
  if ((analysis.condition.suggestedGrade === 'Good' || severeObservation) && declarations.condition !== 'Good') {
    throw new ValuationError('CONDITION_CONFLICT', 'The photo assessment indicates visible wear. Correct the grade or request specialist review.');
  }
  if (declarations.condition === 'Unworn' && (aiWear !== 'none' || analysis.condition.suggestedGrade !== 'Excellent' || analysis.polishing.assessment === 'possible')) {
    throw new ValuationError('CONDITION_CONFLICT', 'These photos do not support an Unworn declaration. Further evidence and inspection are required.');
  }
  return true;
}

// Experimental Watchify policy, not a calibrated appraisal or provider methodology.
// Keep the upstream range intact. Show the separately adjusted indication with its
// assumptions, and never invent a market range when the provider supplies none.
function buildIndication(price, analysis, declarations, now = Date.now(), baseline = 'unspecified', reference = '') {
  const base = { ...price, reviewRequired: true, indicativeLow: null, indicativeMid: null, indicativeHigh: null,
    adjustments: [], policyVersion: 'watchify-local-indication-v1', warnings: [] };
  if (price.status !== 'available') return base;
  if (price.reviewStatus === 'disputed' || !['market_quote','model_estimate'].includes(price.basis) || !price.asOf || !Number.isFinite(Date.parse(price.asOf))) {
    return { ...base, status: 'review_required', warnings: ['The market reference needs review before it can support an indication.'] };
  }
  if (Date.parse(price.asOf) > now + 300000 || now - Date.parse(price.asOf) > 30 * 86400000) {
    return { ...base, status: 'stale', warnings: ['The market reference is more than 30 days old or has an invalid future date.'] };
  }
  if (analysis.condition.suggestedGrade === 'unknown' || analysis.condition.visibleWear === 'unknown') {
    return { ...base, status: 'review_required', warnings: ['The photos do not provide enough condition evidence for an adjusted indication.'] };
  }
  if (baseline !== 'excellent_full_set') {
    return { ...base, status: 'reference_only', warnings: ['This is a trade market reference, not a retail offer. Its condition and accessory baseline is unspecified. A specialist must assess the condition adjustment.'] };
  }
  const normalized = value => String(value).toLowerCase().replace(/[^a-z0-9]/g,'');
  if (!analysis.candidates.some(c=>c.confidence === 'high' && c.reference && normalized(c.reference) === normalized(reference))) {
    return { ...base, status: 'review_required', warnings: ['The exact reference could not be confidently matched in the photographs. Confirm the identity with a specialist before an adjusted indication.'] };
  }
  const grade = grades[Math.max(grades.indexOf(analysis.condition.suggestedGrade), grades.indexOf(declarations.condition))] || 'Excellent';
  const entries = [
    { label: `Condition: ${grade}`, percent: ({ Excellent: 0, 'Very good': -5, Good: -10 })[grade] },
    { label: declarations.box ? 'Box declared included' : 'Box not included', percent: declarations.box ? 0 : -2 },
    { label: declarations.papers ? 'Papers declared included' : 'Papers not included', percent: declarations.papers ? 0 : -5 }
  ];
  const factor = 1 + entries.reduce((sum, item) => sum + item.percent, 0) / 100;
  const adjusted = value => typeof value === 'number' && value > 0 ? Math.round(value * factor * 100) / 100 : null;
  const marketMid = price.marketPrice ?? (price.lowerBound !== null && price.upperBound !== null ? (price.lowerBound + price.upperBound) / 2 : null);
  return { ...base, indicativeLow: adjusted(price.lowerBound), indicativeMid: adjusted(marketMid), indicativeHigh: adjusted(price.upperBound),
    adjustments: entries, effectiveGrade: grade,
    warnings: ['An experimental condition adjustment, subject to inspection. The upstream price does not specify this watch’s condition or accessories.',
      ...(price.basis === 'model_estimate' ? ['The market reference is a provider model estimate.'] : []),
      ...(price.reviewStatus !== 'validated' ? ['The market reference has not been independently validated.'] : []),
      ...(price.basedOnHistoricData ? ['The provider identifies this reference as based on historical data.'] : [])] };
}
module.exports = { checkDeclarations, buildIndication, ValuationError };
