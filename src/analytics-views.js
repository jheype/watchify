/* Pure presentation for private collection analytics and dated sample market data. */
(function attachAnalyticsViews(root) {
  'use strict';

  const PERIODS = ['1M', '6M', '1Y', 'All'];
  const PERIOD_LABELS = { '1M': '1 month', '6M': '6 months', '1Y': '1 year', All: 'the full sample period' };
  const COLOURS = ['#c7aa76', '#829fb8', '#e6e0d1', '#9ba58e', '#b99791'];
  const periodFor = ui => PERIODS.includes(ui.period) ? ui.period : '6M';
  const countLabel = count => count === 1 ? 'watch' : 'watches';
  const decimal = value => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(value);
  const shortDate = value => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(value));
  const setLabel = value => ({ full: 'Full set', papers: 'Papers only', watch: 'Watch only' })[value] || '';

  function signedAmount(ctx, value) {
    if (!Number.isFinite(value)) return '<span class="pf-neutral">—</span>';
    const positive = value > 0, negative = value < 0;
    const money = ctx.moneyExact || ctx.money;
    return `<span class="pf-change ${positive ? 'pf-positive' : negative ? 'pf-negative' : 'pf-neutral'}">${ctx.icon(positive ? 'up' : negative ? 'falling' : 'flat')}<span>${positive ? '+' : negative ? '−' : ''}${ctx.esc(money(Math.abs(value)))}</span></span>`;
  }

  function chartSVG(ctx, { id, title, series, caption, unit = 'Index', baseline = null }) {
    const { esc, dateLabel } = ctx;
    const visible = series.filter(item => item.points.length);
    if (!visible.length) return '<p class="an-method">There is no history to show for this view.</p>';
    for (const item of visible) {
      if (item.points.some(point => !Number.isFinite(point.value))) throw new Error('Analytics history contains an invalid value.');
    }
    const points = visible[0].points;
    const values = visible.flatMap(item => item.points.map(point => point.value));
    const lowest = Math.min(...values), highest = Math.max(...values);
    const padding = (highest - lowest) * 0.15 || Math.max(highest * 0.02, 1);
    const low = Math.max(0, lowest - padding), high = highest + padding, spread = high - low || 1;
    const width = 680, height = 226, left = 48, right = 16, top = 18, bottom = 189;
    const x = (index, length = points.length) => left + index / Math.max(1, length - 1) * (width - left - right);
    const y = value => bottom - (value - low) / spread * (bottom - top);
    const axisValue = value => unit === 'Listings' ? String(Math.round(value)) : decimal(value);
    const ticks = Array.from({ length: 4 }, (_, index) => ({ value: low + spread * (1 - index / 3), y: top + (bottom - top) * index / 3 }));
    const dateTicks = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
    const description = `${caption} ${visible.map(item => item.label).join(' and ')}. A data table follows the chart.`;
    const lines = visible.map((item, index) => {
      const path = item.points.map((point, i) => `${i ? 'L' : 'M'}${x(i, item.points.length).toFixed(2)} ${y(point.value).toFixed(2)}`).join(' ');
      return `<path class="an-chart-line${index ? ' an-chart-benchmark' : ''}" d="${path}" fill="none" stroke="${index ? '#a1a9ae' : '#c7aa76'}" stroke-width="2.5"${index ? ' stroke-dasharray="5 5"' : ''}/>`;
    }).join('');
    return `<div class="an-chart"><span class="an-chart-unit">${esc(unit)}</span><svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${esc(id)}-title ${esc(id)}-desc"><title id="${esc(id)}-title">${esc(title)}</title><desc id="${esc(id)}-desc">${esc(description)}</desc>${ticks.map(tick => `<line x1="${left}" x2="${width - right}" y1="${tick.y}" y2="${tick.y}" class="an-chart-grid" stroke="#303634" stroke-width="1"/><text x="${left - 9}" y="${tick.y + 4}" text-anchor="end" class="an-chart-axis">${esc(axisValue(tick.value))}</text>`).join('')}${baseline !== null && baseline >= low && baseline <= high ? `<line x1="${left}" x2="${width - right}" y1="${y(baseline)}" y2="${y(baseline)}" class="an-chart-base" stroke="#68716c" stroke-dasharray="2 5"/>` : ''}${lines}${dateTicks.map(index => `<text x="${x(index)}" y="217" text-anchor="${index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}" class="an-chart-axis">${esc(shortDate(points[index].date))}</text>`).join('')}</svg><p class="an-method">${esc(caption)}</p></div><details class="an-data-table"><summary>View chart data</summary><div class="pf-table-wrap"><table><caption class="sr-only">${esc(title)}</caption><thead><tr><th scope="col">Date</th>${visible.map(item => `<th scope="col">${esc(item.label)}</th>`).join('')}</tr></thead><tbody>${points.map((point, index) => `<tr><td>${esc(dateLabel(point.date))}</td>${visible.map(item => `<td>${item.points[index] ? esc(unit === 'Listings' ? String(item.points[index].value) : decimal(item.points[index].value)) : '—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
  }

  function watchBreakdown(ctx, entryIds, title) {
    const { model, esc, money, watchCell, change } = ctx;
    const wanted = new Set(entryIds), period = periodFor(ctx.ui);
    const entries = model.collection().filter(entry => wanted.has(entry.id));
    if (!entries.length) return '';
    return `<section class="an-allocation-detail" aria-label="${esc(title)}"><h3>${esc(title)}</h3><div class="pf-table-wrap"><table class="pf-collection-table"><thead><tr><th scope="col">Your watch</th><th scope="col">Sample value</th><th scope="col">${esc(period)} move</th><th scope="col">Purchase details</th></tr></thead><tbody>${entries.map(entry => {
      const quote = model.quote(entry), movement = model.summary([entry], period);
      const hasCost = Number.isFinite(entry.purchasePriceGBP);
      return `<tr><td>${watchCell(quote, entry)}<span class="pf-row-sub">${entry.year} · ${esc(setLabel(entry.set))} · ${esc(entry.condition)}</span></td><td><span class="pf-row-value">${esc(money(quote.valueGBP))}</span><span class="pf-row-sub">${esc(money(quote.lowGBP))} – ${esc(money(quote.highGBP))}</span></td><td>${change(movement.changePercent)}</td><td><button class="pf-text-link" type="button" data-pf-action="purchase-info" data-id="${esc(entry.id)}">${hasCost ? 'Edit purchase details' : 'Add purchase details'} ${ctx.icon('chevron')}</button></td></tr>`;
    }).join('')}</tbody></table></div></section>`;
  }

  function ring(ctx, allocation, watchCount) {
    let offset = 0;
    const segments = allocation.map((brand, index) => {
      const share = Math.min(100, Math.max(0, brand.sharePercent));
      const segment = `<circle cx="110" cy="110" r="78" fill="none" stroke="${COLOURS[index % COLOURS.length]}" stroke-width="24" pathLength="100" stroke-dasharray="${share} ${100 - share}" stroke-dashoffset="${-offset}" transform="rotate(-90 110 110)"><title>${ctx.esc(brand.brand)}: ${ctx.esc(decimal(brand.sharePercent))}%</title></circle>`;
      offset += share;
      return segment;
    }).join('');
    return `<svg class="an-ring" viewBox="0 0 220 220" role="img" aria-label="Collection value by brand. The table contains exact values and links to your watches."><circle cx="110" cy="110" r="78" fill="none" stroke="#303634" stroke-width="24"/>${segments}<text x="110" y="105" text-anchor="middle" class="an-ring-number">${watchCount}</text><text x="110" y="128" text-anchor="middle" class="an-ring-label">${countLabel(watchCount)}</text></svg>`;
  }

  function performer(ctx, item, label) {
    if (!item) return `<div class="an-performer"><span class="an-metric-label">${label}</span><p class="an-metric-note">No percentage ranking is available for missing or zero purchase prices.</p></div>`;
    return `<a class="an-performer" href="#collection/${ctx.esc(encodeURIComponent(item.entryId))}"><span class="an-metric-label">${label}</span><strong>${ctx.esc(item.brand)} ${ctx.esc(item.model)}</strong><span class="pf-row-sub">${ctx.esc(item.reference)}</span>${ctx.change(item.gainPercent)}<span class="an-metric-note">${signedAmount(ctx, item.gainGBP)} vs recorded purchase ${ctx.icon('chevron')}</span></a>`;
  }

  function portfolio(ctx) {
    const { analytics, model, ui, money, esc, change, dateLabel, empty, icon } = ctx;
    const moneyExact = ctx.moneyExact || money;
    const period = periodFor(ui), entries = model.collection();
    if (!entries.length) return `<section class="pf-panel an-empty">${empty('Your collection is the starting point.', 'Add a watch to see your total value, its movement against the sample market and your brand allocation. Watches in the sample catalogue are not counted as yours.', '<a class="pf-btn pf-btn-primary" href="#add">' + icon('plus') + ' Add your first watch</a>')}<p class="an-method">Explore the Market indices and Trading tabs while your collection is empty.</p></section>`;
    const data = analytics.collection({ period }), total = data.summary, gain = data.gain;
    const selectedBrand = data.allocation.some(item => item.brand === ui.analyticsBrand) ? ui.analyticsBrand : 'all';
    const selected = data.allocation.find(item => item.brand === selectedBrand);
    const benchmark = analytics.index({ brand: 'all', period });
    const series = [
      { label: 'Your collection', points: data.benchmark.map(point => ({ date: point.date, value: point.collectionIndex })) },
      { label: 'Sample market index', points: data.benchmark.map(point => ({ date: point.date, value: point.marketIndex })) }
    ];
    const gainKnown = gain.knownCount > 0;
    const coverage = `${gain.knownCount} of ${gain.totalCount} ${countLabel(gain.totalCount)} with a recorded purchase price`;
    const gainCard = `<section class="pf-panel an-metric"><span class="an-metric-label">${gain.knownCount === gain.totalCount ? 'Gain since purchase' : 'Gain on recorded purchases'}</span><div class="an-metric-value">${gainKnown ? signedAmount(ctx, gain.gainGBP) : '—'}</div>${gainKnown && gain.gainPercent !== null ? change(gain.gainPercent) : ''}<p class="an-metric-note">${esc(coverage)}${gain.knownCount < gain.totalCount ? '. Partial coverage: watches without a purchase price are excluded.' : '.'}</p>${gainKnown ? `<p class="an-metric-note">${esc(moneyExact(gain.valueGBP))} sample value against ${esc(moneyExact(gain.costGBP))} recorded cost.${gain.gainPercent === null ? ' A percentage is unavailable because the recorded cost is zero.' : ''} Fees and other costs are not included.</p>` : '<p class="an-metric-note">Purchase prices are optional. No cost or return has been assumed.</p>'}<button class="pf-text-link" type="button" data-pf-action="purchase-info">${gain.knownCount < gain.totalCount ? 'Add purchase details' : 'Review purchase details'} ${icon('arrow')}</button></section>`;
    const allocationRows = data.allocation.map((item, index) => `<tr><th scope="row"><button type="button" class="an-brand-button" data-pf-action="analytics-brand" data-value="${esc(item.brand)}" aria-pressed="${selectedBrand === item.brand}"><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="4" fill="${COLOURS[index % COLOURS.length]}"/></svg>${esc(item.brand)} ${icon('chevron')}</button></th><td>${esc(decimal(item.sharePercent))}%</td><td>${esc(money(item.valueGBP))}</td><td>${change(item.changePercent)}</td></tr>`).join('');
    return `<section class="pf-panel an-overview" aria-label="Collection performance"><div class="an-headline"><div><p class="an-metric-label">Total collection value</p><div class="an-headline-number">${esc(money(total.valueGBP))}</div><div class="an-headline-change">${signedAmount(ctx, total.changeGBP)} ${change(total.changePercent)}<span>over ${PERIOD_LABELS[period]}</span></div></div>${ctx.periodControls()}</div>${chartSVG(ctx, { id: 'an-portfolio-chart', title: 'Your collection against the sample watch market', series, baseline: 100, caption: 'Both lines start at 100 for the selected period. This is the sample price history of your current watches, not your investment return or past ownership.' })}<div class="an-legend"><span class="an-legend-item"><span class="an-legend-dot" aria-hidden="true"></span>Your collection ${change(total.changePercent)}</span><button class="an-legend-item an-legend-market" type="button" data-pf-action="analytics-tab" data-value="indices"><span class="an-legend-dot" aria-hidden="true"></span>Sample market index ${change(benchmark.changePercent)} ${icon('chevron')}</button></div><details class="an-method-details"><summary>Value range and methodology</summary><p>Estimated range ${esc(money(total.lowGBP))} – ${esc(money(total.highGBP))}. Values reflect each watch’s recorded year, condition, box and papers. Regional comparisons, indices and prices use illustrative data dated ${esc(dateLabel(data.asOf))}; no live sales feed is connected.</p><p>The market benchmark uses the same reference basket as Market indices. Display-currency conversions use illustrative fixed rates.</p></details></section><div class="an-metrics">${gainCard}<section class="pf-panel an-metric"><span class="an-metric-label">Best and worst since purchase</span><div class="an-performers">${performer(ctx, data.performance.best[0], 'Best performer')}${performer(ctx, data.performance.worst[0], 'Worst performer')}</div><p class="an-metric-note">Ranked by percentage change from recorded purchase prices above zero. Watches without those prices are not ranked.${data.performance.unranked.length ? ` ${data.performance.unranked.length} ${countLabel(data.performance.unranked.length)} with zero recorded cost cannot have a percentage return.` : ''}</p></section></div><section class="pf-panel an-allocation" aria-labelledby="an-allocation-heading"><div class="pf-panel-heading"><div><h2 id="an-allocation-heading">Where the value sits.</h2><p class="an-metric-note">Your collection by brand. Select a brand to see its watches.</p></div>${selected ? '<button class="pf-text-link" type="button" data-pf-action="analytics-brand" data-value="all">Clear brand filter</button>' : ''}</div><div class="an-allocation-layout">${ring(ctx, data.allocation, entries.length)}<div class="pf-table-wrap"><table class="an-brand-table"><thead><tr><th scope="col">Brand</th><th scope="col">Share</th><th scope="col">Value</th><th scope="col">${esc(period)} move</th></tr></thead><tbody>${allocationRows}</tbody></table></div></div>${selected ? watchBreakdown(ctx, selected.entries, selected.brand + ' in your collection') : ''}</section><section class="pf-panel an-report"><div><span class="an-metric-label">A dated record of your collection</span><h2>Collection valuation.</h2><p>Download a Watchify PDF with each watch’s reference, recorded specification and sample value. Serial numbers appear only when you entered them.</p><p class="an-metric-note">An illustrative estimate, not a formal appraisal or evidence of insurance cover.</p></div><button class="pf-btn pf-btn-outline" type="button" data-pf-action="valuation-report"${ui.reportBusy ? ' disabled aria-busy="true"' : ''}>${icon('download')} ${ui.reportBusy ? 'Preparing your PDF…' : 'Download valuation PDF'}</button></section>`;
  }

  function indices(ctx) {
    const { analytics, model, ui, esc, change, icon, dateLabel, watchCell } = ctx;
    const period = periodFor(ui), brands = [...new Set(model.catalogue().map(watch => watch.brand))].sort((a, b) => a.localeCompare(b));
    const brand = brands.includes(ui.analyticsIndex) ? ui.analyticsIndex : 'all';
    const selected = analytics.index({ brand, period });
    const options = [analytics.index({ brand: 'all', period }), ...brands.map(name => analytics.index({ brand: name, period }))];
    const owned = new Set(model.collection().map(entry => entry.catalogueId));
    return `<section class="pf-panel an-overview" aria-label="Market index"><div class="an-headline"><div><p class="an-metric-label">${esc(selected.name)}</p><div class="an-headline-number">${esc(decimal(selected.value))}</div><div class="an-headline-change">${change(selected.changePercent)}<span>over ${PERIOD_LABELS[period]}</span></div></div>${ctx.periodControls()}</div>${chartSVG(ctx, { id: 'an-index-chart', title: selected.name + ' history', series: [{ label: selected.name, points: selected.points }], baseline: 100, caption: `Illustrative weighted reference basket. Index = 100 on ${dateLabel(selected.baseDate)}; changing the view period does not reset its origin.` })}<p class="an-method">Sample values as of ${esc(dateLabel(selected.asOf))}. This same overall index is rebased to 100 in your portfolio comparison.</p></section><section class="an-index-layout" aria-label="Market index breakdown"><div class="pf-panel an-index-list"><div class="pf-panel-heading"><h2>Choose an index.</h2></div>${options.map(item => `<button class="an-index-card" type="button" data-pf-action="analytics-index" data-value="${esc(item.brand)}" aria-pressed="${brand === item.brand}"><span><strong>${esc(item.name)}</strong><small>${item.constituents.length} sample reference${item.constituents.length === 1 ? '' : 's'}</small></span><span><strong>${esc(decimal(item.value))}</strong>${change(item.changePercent)}</span>${icon('chevron')}</button>`).join('')}</div><section class="pf-panel an-constituents"><div class="pf-panel-heading"><div><h2>What drives this index.</h2><p class="an-metric-note">${esc(selected.name)} · ${esc(period)} contribution</p></div></div><div class="pf-table-wrap"><table class="pf-collection-table"><thead><tr><th scope="col">Reference</th><th scope="col">Basket weight</th><th scope="col">${esc(period)} move</th><th scope="col">Contribution</th></tr></thead><tbody>${selected.constituents.map(item => `<tr><td>${watchCell(item, null, { owned: owned.has(item.catalogueId) })}</td><td>${esc(decimal(item.weightPercent))}%</td><td>${change(item.changePercent)}</td><td><span class="pf-change ${item.contributionPercent > 0 ? 'pf-positive' : item.contributionPercent < 0 ? 'pf-negative' : 'pf-neutral'}">${icon(item.contributionPercent > 0 ? 'up' : item.contributionPercent < 0 ? 'falling' : 'flat')}${item.contributionPercent > 0 ? '+' : item.contributionPercent < 0 ? '−' : ''}${esc(decimal(Math.abs(item.contributionPercent)))} pp</span></td></tr>`).join('')}</tbody></table></div><details class="an-method-details"><summary>How the basket is used</summary><p>Weights belong to the fixed starting basket. Contributions are percentage points of the index’s return over the selected period; they are not returns from owning these watches. The sample catalogue contains ${model.catalogue().length} references and does not represent the full watch market.</p></details></section></section>`;
  }

  function tradingDetail(ctx) {
    const { analytics, model, ui, esc, icon, change, dateLabel } = ctx;
    const period = periodFor(ui), catalogue = model.catalogue();
    const selectedId = catalogue.some(watch => watch.id === ui.analyticsWatch) ? ui.analyticsWatch : catalogue[0]?.id;
    if (!selectedId) return ctx.empty('No reference available.', 'Trading context will appear when the sample catalogue is available.');
    const data = analytics.trading(selectedId, { period }), watch = data.watch;
    const owned = model.collection().some(entry => entry.catalogueId === selectedId);
    return `<div class="an-trading-header"><div><h2>How a watch trades.</h2><p class="an-metric-note">Liquidity and supply context for a selected reference.</p></div><label for="pf-analytics-watch">Reference<select id="pf-analytics-watch">${catalogue.map(item => `<option value="${esc(item.id)}"${item.id === selectedId ? ' selected' : ''}>${esc(item.brand + ' ' + item.model + ' · ' + item.reference)}</option>`).join('')}</select></label></div><section class="pf-panel an-overview" aria-label="Trading context for ${esc(watch.brand + ' ' + watch.model)}"><div class="an-trading-watch">${ctx.watchCell(watch, null, { owned })}<a class="pf-text-link" href="#watch/${esc(encodeURIComponent(selectedId))}">View price details ${icon('arrow')}</a></div><div class="an-trading-metrics"><section class="an-trading-card"><span class="an-metric-label">Typical time to sell</span><div class="an-headline-number">${esc(String(data.medianDays))}<span class="an-value-unit"> days</span></div><span class="pf-pill">${esc(data.liquidityLabel)}</span><p class="an-metric-note">Illustrative 90-day median. No observed sales feed is connected.</p></section><section class="an-trading-card"><span class="an-metric-label">Sample active listings</span><div class="an-metric-value">${esc(String(data.supply))}</div><div class="an-headline-change">${change(data.supplyChange30dPercent)}<span>in 30 days</span></div><p class="an-metric-note">${data.supplyChange30d === 0 ? 'No change in listing count' : `${esc(String(Math.abs(data.supplyChange30d)))} ${data.supplyChange30d < 0 ? 'fewer' : 'more'} listings`} over the sample’s last 30 days.</p></section></div><div class="pf-panel-heading"><h2>Listings over time.</h2>${ctx.periodControls()}</div>${chartSVG(ctx, { id: 'an-supply-chart', title: watch.brand + ' ' + watch.model + ' sample supply', series: [{ label: 'Sample active listings', points: data.points.map(point => ({ date: point.date, value: point.numberListed })) }], unit: 'Listings', caption: 'Illustrative active-listing counts for this reference. These sample figures are not offers available through Watchify.' })}<details class="an-method-details"><summary>About liquidity and supply</summary><p>With observed market data, liquidity would use the median listing-to-sale time over 90 days and supply would count unique active listings. This preview uses illustrative liquidity values and listing-count histories dated ${esc(dateLabel(data.asOf))}; no live listing feed is connected and no real listings have been deduplicated. “Fast”, “Average” and “Slow” describe the sample, not a promise of when your watch will sell.</p></details></section>`;
  }

  function page(ctx) {
    const tab = ['portfolio', 'indices', 'trading'].includes(ctx.ui.analyticsTab) ? ctx.ui.analyticsTab : 'portfolio';
    const tabs = [['portfolio', 'Portfolio'], ['indices', 'Market indices'], ['trading', 'Trading']];
    const asOf = ctx.model.catalogue()[0]?.asOf;
    return `<div class="an-page">${ctx.pageHeading('Your collection, understood', 'Analytics.', 'A clear view of value, performance and market context.')}<div class="pf-tabs an-tabs" role="group" aria-label="Analytics view">${tabs.map(([value, label]) => `<button type="button" data-pf-action="analytics-tab" data-value="${value}" aria-pressed="${tab === value}">${label}</button>`).join('')}</div><p class="pf-source-note">${ctx.icon('info')}<span>Illustrative data${asOf ? ' · ' + ctx.esc(ctx.dateLabel(asOf)) : ''}. Values and market metrics are sample estimates, not live quotes.</span></p>${tab === 'indices' ? indices(ctx) : tab === 'trading' ? tradingDetail(ctx) : portfolio(ctx)}${ctx.footer()}</div>`;
  }

  const api = Object.freeze({ page, chartSVG, watchBreakdown, indices, tradingDetail });
  root.WatchifyAnalyticsViews = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
