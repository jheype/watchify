/* Pure presentation for the sample market and private in-app alert feed. */
(function attachPortfolioViews(root) {
  'use strict';

  function market(ctx) {
    const { model, analytics, ui, money, esc, icon, change, spark, watchCell, pageHeading, footer, empty, dateLabel } = ctx;
    const catalogue = model.catalogue();
    const movePeriod = ['week', 'month', 'year'].includes(ui.marketPeriod) ? ui.marketPeriod : 'week';
    const moveLabel = { week: 'This week', month: 'This month', year: 'This year' }[movePeriod];
    const movements = new Map(['rising', 'falling'].flatMap(direction => analytics.marketMovers({period: movePeriod, direction, brand: 'all'}).items).map(watch => [watch.id, watch.changePercent]));
    const move = watch => movements.get(watch.id) || 0;
    const tab = ['rising', 'falling', 'region', 'following'].includes(ui.marketTab) ? ui.marketTab : 'rising';
    const brands = [...new Set(catalogue.map(watch => watch.brand))].sort((a, b) => a.localeCompare(b));
    const brand = brands.includes(ui.marketBrand) ? ui.marketBrand : 'all';
    const query = typeof ui.marketQuery === 'string' ? ui.marketQuery.slice(0, 200) : '';
    const search = query.trim().toLocaleLowerCase('en-GB');
    const followed = new Set(model.following());
    const owned = new Set(model.collection().map(entry => entry.catalogueId));
    const asOf = catalogue[0]?.asOf || '';
    const compareName = (a, b) => (a.brand + ' ' + a.model).localeCompare(b.brand + ' ' + b.model) || a.id.localeCompare(b.id);
    const weekly = [...catalogue].sort((a, b) => move(b) - move(a) || compareName(a, b));
    const average = catalogue.length ? Math.round(catalogue.reduce((sum, watch) => sum + move(watch), 0) / catalogue.length * 100) / 100 : 0;
    const leading = weekly[0];
    let rows = catalogue.filter(watch => (brand === 'all' || watch.brand === brand) && (!search || [watch.brand, watch.model, watch.reference].join(' ').toLocaleLowerCase('en-GB').includes(search)));
    if (tab === 'rising') rows = rows.filter(watch => move(watch) > 0).sort((a, b) => move(b) - move(a) || compareName(a, b)).slice(0, 10);
    else if (tab === 'falling') rows = rows.filter(watch => move(watch) < 0).sort((a, b) => move(a) - move(b) || compareName(a, b)).slice(0, 10);
    else if (tab === 'following') rows = rows.filter(watch => followed.has(watch.id)).sort(compareName);
    else rows.sort(compareName);

    const followButton = watch => `<button type="button" class="pf-icon-button pf-follow-button" data-pf-action="follow" data-id="${esc(watch.id)}" aria-pressed="${followed.has(watch.id)}" aria-label="${esc((followed.has(watch.id) ? 'Unfollow ' : 'Follow ') + watch.brand + ' ' + watch.model)}">${icon('heart')}</button>`;
    const valueCell = (value, label, className = '') => `<td${className ? ` class="${className}"` : ''}><span class="pf-row-value">${esc(money(value))}</span><span class="pf-row-sub">${esc(label)}</span></td>`;
    const tableRow = watch => {
      const cell = `<td>${watchCell(watch, undefined, { owned: owned.has(watch.id) })}</td>`;
      if (tab === 'region') {
        const regions = ['uk', 'us', 'hk'].map(id => watch.regions.find(region => region.id === id));
        return `<tr>${cell}${regions.map((region, index) => valueCell(region.valueGBP, index === 0 ? 'UK baseline' : (region.premiumPercent >= 0 ? '+' : '') + region.premiumPercent + '% to UK', index === 0 ? '' : 'pf-region-column')).join('')}<td>${change(move(watch))}</td><td class="pf-follow-column">${followButton(watch)}</td></tr>`;
      }
      return `<tr>${cell}${valueCell(watch.valueGBP, 'Full set · Excellent')}<td>${change(move(watch))}</td><td class="pf-spark-column">${spark(model.history({ catalogueId: watch.id, period: '6M' }), watch.change6M)}</td><td class="pf-follow-column">${followButton(watch)}</td></tr>`;
    };
    const tabs = [['rising', 'Rising'], ['falling', 'Falling'], ['region', 'By region'], ['following', 'Following']];
    const toolbar = `<div class="pf-market-toolbar"><div class="pf-tabs" role="group" aria-label="Market view">${tabs.map(([value, label]) => `<button type="button" data-pf-action="market-tab" data-value="${value}" aria-pressed="${tab === value}">${label}${value === 'following' && followed.size ? ` <span aria-label="${followed.size} followed references">${followed.size}</span>` : ''}</button>`).join('')}</div><div class="pf-market-filters"><label class="sr-only" for="pf-market-period">Movement period</label><select id="pf-market-period">${[['week','This week'],['month','This month'],['year','This year']].map(([value,label])=>`<option value="${value}"${movePeriod===value?' selected':''}>${label}</option>`).join('')}</select><label class="sr-only" for="pf-market-brand">Filter by brand</label><select id="pf-market-brand"><option value="all"${brand === 'all' ? ' selected' : ''}>All brands</option>${brands.map(name => `<option value="${esc(name)}"${brand === name ? ' selected' : ''}>${esc(name)}</option>`).join('')}</select><label class="pf-search" for="pf-market-query"><span class="sr-only">Search brand, model or reference</span>${icon('search')}<input type="search" id="pf-market-query" maxlength="200" autocomplete="off" placeholder="Search references" value="${esc(query)}"></label></div></div>`;
    const header = tab === 'region'
      ? `<th scope="col">Watch</th><th scope="col">United Kingdom</th><th scope="col" class="pf-region-column">United States</th><th scope="col" class="pf-region-column">Hong Kong</th><th scope="col">${esc(moveLabel)}</th><th scope="col" class="pf-follow-column"><span class="sr-only">Follow reference</span></th>`
      : `<th scope="col">Watch</th><th scope="col">Sample value</th><th scope="col">${esc(moveLabel)}</th><th scope="col" class="pf-spark-column">6-month trend</th><th scope="col" class="pf-follow-column"><span class="sr-only">Follow reference</span></th>`;
    const noFollowing = tab === 'following' && !followed.size;
    const emptyTitle = noFollowing ? 'Keep an eye on your favourites.' : 'No references in this view.';
    const emptyCopy = noFollowing ? 'Follow a reference with the heart button. It will appear here without being added to your collection.' : 'Try another brand or search term, or switch between rising and falling sample prices.';
    const content = rows.length
      ? `<div class="pf-table-wrap" tabindex="0" aria-label="${tab === 'region' ? 'Regional price comparison. Scroll horizontally to compare all three markets.' : 'Reference prices'}"><table class="pf-collection-table pf-market-table${tab === 'region' ? ' pf-region-table' : ''}"><caption class="sr-only">Illustrative watch prices, ${esc(dateLabel(asOf))}. Values are examples, not live quotes.</caption><thead><tr>${header}</tr></thead><tbody>${rows.map(tableRow).join('')}</tbody></table></div>`
      : `<div class="pf-panel-body">${empty(emptyTitle, emptyCopy, noFollowing ? '<button type="button" class="pf-btn pf-btn-outline pf-btn-small" data-pf-action="market-tab" data-value="rising">Explore rising references</button>' : '')}</div>`;
    return `<div class="pf-page pf-market-page">
      ${pageHeading('THE MARKET, IN PERSPECTIVE', 'Market overview', 'Explore the references you care about. Follow the sample movements and compare illustrative regional values.', '<a class="pf-btn pf-btn-outline" href="#analytics/indices">'+icon('analytics')+' Market indices</a>')}
      <div class="pf-market-summary" aria-label="Sample market summary">
        <section class="pf-market-summary-card">${icon('chart')}<span>Sample ${movePeriod} movement</span><h2>${change(average)}</h2><p>Average move across ${catalogue.length} sample references.</p></section>
        <section class="pf-market-summary-card">${icon('watch')}<span>Leading this sample ${movePeriod}</span><h2>${leading ? esc(leading.brand) : '—'}</h2><p>${leading ? `${esc(leading.model)} · ${change(move(leading))}` : 'No sample references available.'}</p></section>
        <section class="pf-market-summary-card">${icon('heart')}<span>Your watchlist</span><h2>${followed.size}</h2><p>Reference${followed.size === 1 ? '' : 's'} followed privately. Your collection is separate.</p></section>
      </div>
      <section class="pf-panel" aria-label="Reference market">
        ${toolbar}${content}
        <div class="pf-market-note"><span role="status" aria-live="polite">${rows.length} of ${catalogue.length} references · ${tab === 'region' ? 'Regional sample comparison' : tab === 'following' ? 'Your followed references' : 'Top movers · '+moveLabel.toLowerCase()}</span><span>Sample data · ${esc(dateLabel(asOf))}</span></div>
      </section>
      <p class="pf-source-note">Prices are illustrative examples dated ${esc(dateLabel(asOf))}, based on a full set in Excellent condition. Regional comparisons share a GBP base; display-currency conversions are illustrative. These figures are not live market quotes or an appraisal.</p>
      ${footer()}
    </div>`;
  }

  function alerts(ctx) {
    const { model, ui, money, esc, icon, change, pageHeading, footer, empty, dateLabel } = ctx;
    const tab = ['all', 'unread', 'price', 'digest', 'market'].includes(ui.alertTab) ? ui.alertTab : 'all';
    const all = model.alerts();
    const rules = model.rules();
    const prefs = model.preferences();
    const weekly = model.digest();
    const unread = all.filter(alert => !alert.read).length;
    const feed = all.filter(alert => tab === 'all' || (tab === 'unread' ? !alert.read : alert.type === tab)).sort((a, b) => b.date.localeCompare(a.date) || Number(a.read) - Number(b.read) || a.id.localeCompare(b.id));
    const labels = { price: 'Price alert', digest: 'Weekly digest', market: 'Market update' };
    const symbols = { price: 'chart', digest: 'document', market: 'globe' };
    const newRule = (extra = '') => `<button type="button" class="pf-btn pf-btn-primary ${extra}" data-pf-action="new-rule">${icon('plus')}Create an alert</button>`;
    const card = alert => `<article class="pf-alert-card${alert.read ? '' : ' is-unread'}"><div class="pf-alert-icon">${icon(symbols[alert.type] || 'info')}</div><div class="pf-alert-copy"><div class="pf-alert-meta"><span>${labels[alert.type] || 'Update'}${alert.read ? '' : '<span class="sr-only"> · Unread</span>'}</span><time datetime="${esc(alert.date)}">${esc(dateLabel(alert.date))}</time></div><h2>${esc(alert.title)}</h2><p>${esc(alert.body)}</p><div class="pf-alert-actions">${alert.catalogueId ? `<a class="pf-text-link" href="${alert.collectionId?'#collection/'+esc(encodeURIComponent(alert.collectionId)):'#watch/'+esc(encodeURIComponent(alert.catalogueId))}">${alert.collectionId?'View your watch':'View reference'} ${icon('arrow')}</a>` : '<span class="pf-alert-read">In-app sample summary</span>'}${alert.read ? `<span class="pf-alert-read">${icon('check')} Read</span>` : `<button type="button" class="pf-btn-quiet" data-pf-action="mark-read" data-id="${esc(alert.id)}">Mark as read</button>`}</div></div></article>`;
    const emptyFeed = () => {
      if (tab === 'unread') return empty('You’re all caught up.', 'There are no unread updates in your current sample feed.');
      if (!prefs.priceAlerts && !prefs.weeklyDigest) return empty('Your feed is paused.', 'Price updates and weekly digests are turned off in Settings. Your watches and saved rules are unchanged.');
      if (tab === 'price') return empty('No sample targets reached.', prefs.priceAlerts ? 'Create a rule for a reference and a target price. A matching sample value will appear here.' : 'Price alerts are turned off in Settings. Saved rules remain available below.', prefs.priceAlerts ? newRule('pf-btn-small') : '');
      if (tab === 'digest') return empty('Your weekly picture starts here.', weekly.watchCount ? 'Weekly digests are turned off in Settings. You can still review the sample snapshot alongside this feed.' : 'Add a watch to your private collection to see a weekly sample summary.');
      if (tab === 'market') return empty('A market feed of your own.', prefs.priceAlerts ? 'Follow references in Market overview to include their sample price movements here.' : 'Market updates are turned off with price alerts in Settings.');
      return empty('Keep the right references in view.', 'Follow a reference or create a price rule. Updates appear here using the dated sample catalogue.', newRule('pf-btn-small'));
    };
    const tabs = [['all', 'All'], ['unread', 'Unread'], ['price', 'Prices'], ['digest', 'Digests'], ['market', 'Market']];
    const topMover = weekly.topMover;
    const digestBody = weekly.watchCount
      ? `<div class="pf-digest-value">${esc(money(weekly.valueGBP))}</div>${change(weekly.changePercent)}<span class="pf-row-sub">${weekly.changeGBP === 0 ? 'No value change over the sample week' : `${esc(money(Math.abs(weekly.changeGBP)))} ${weekly.changeGBP < 0 ? 'lower' : 'higher'} over the sample week`}</span><p>${weekly.watchCount} watch${weekly.watchCount === 1 ? '' : 'es'} in your private collection. ${prefs.weeklyDigest ? 'Your weekly summary appears in this feed.' : 'The weekly digest feed is turned off.'}</p>${topMover ? `<div class="pf-digest-footer">${icon('chart')}<span>Largest weekly move in your collection: ${esc(topMover.brand)} ${esc(topMover.model)} ${change(topMover.changePercent)}</span></div>` : ''}`
      : '<p>Add your first watch to see the illustrative value of your collection and its weekly movement. Sample catalogue watches are not counted as yours.</p>';
    const ruleList = rules.length
      ? `<div class="pf-rule-list">${rules.map(rule => {
        const watch = model.find(rule.catalogueId);
        return `<div class="pf-rule"><div><strong>${esc(watch.brand)} ${esc(watch.model)}</strong><small>${rule.direction === 'above' ? 'At or above' : 'At or below'} ${esc(money(rule.targetGBP))}</small><small>${esc(watch.reference)} · GBP-based target</small></div><button type="button" class="pf-icon-button" data-pf-action="remove-rule" data-id="${esc(rule.id)}" aria-label="${esc('Remove alert for ' + watch.brand + ' ' + watch.model)}">${icon('close')}</button></div>`;
      }).join('')}</div>`
      : '<p class="pf-rule-list">No price rules yet. Choose a reference and the value you want to keep in view.</p>';
    return `<div class="pf-page pf-alerts-page">
      ${pageHeading('A QUIETER WAY TO KEEP UP', 'Alerts & insights', 'A private feed for the references you follow and the collection you build.', newRule())}
      <div class="pf-example-bar"><span><span class="pf-dot" aria-hidden="true"></span><strong>Sample feed</strong> · ${esc(dateLabel(weekly.asOf))} · Updates stay inside Watchify. No email is sent.</span></div>
      <div class="pf-alert-layout"><section aria-label="Your alert feed"><div class="pf-feed-toolbar"><div class="pf-tabs" role="group" aria-label="Filter alerts">${tabs.map(([value, label]) => `<button type="button" data-pf-action="alert-tab" data-value="${value}" aria-pressed="${tab === value}">${label}${value === 'unread' && unread ? ` <span>${unread}</span>` : ''}</button>`).join('')}</div><button type="button" class="pf-btn-quiet" data-pf-action="mark-all-read"${unread ? '' : ' disabled'}>Mark all as read</button></div><div aria-live="polite">${feed.length ? feed.map(card).join('') : emptyFeed()}</div></section>
        <aside class="pf-alert-side" aria-label="Digest and price rules"><section class="pf-panel pf-digest"><span class="pf-micro">Your sample week</span><h2>The collection, at a glance.</h2>${digestBody}<div class="pf-digest-footer">${icon('info')}<span>Sample values as of ${esc(dateLabel(weekly.asOf))}. In-app only.</span></div></section><section class="pf-panel pf-rules"><h2>Your price rules <span class="pf-count">${rules.length}</span></h2><p>${prefs.priceAlerts ? 'Compare your targets with the dated sample reference values.' : 'Price alerts are off. Your saved rules are retained.'} No live price monitoring is active.</p>${ruleList}${newRule('pf-btn-small')}</section></aside>
      </div>
      ${footer()}
    </div>`;
  }

  const api = Object.freeze({ market, alerts });
  root.WatchifyPortfolioViews = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
