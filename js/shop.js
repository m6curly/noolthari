/* =========================================================
   NOOLTHARI V2 SHOP — live facets, price range and sorting
========================================================= */
document.addEventListener('DOMContentLoaded', async () => {
  const grid = NL.qs('#product-grid');
  const form = NL.qs('#filters');
  if (!grid || !form) return;

  const controls = {
    search: NL.qs('#search'),
    category: NL.qs('#category'),
    fabric: NL.qs('#fabric'),
    minPrice: NL.qs('#min-price'),
    maxPrice: NL.qs('#max-price'),
    availability: NL.qs('#availability'),
    sort: NL.qs('#sort')
  };
  const summary = NL.qs('#filter-summary');
  const clearButton = NL.qs('#clear-filters');

  const fillOptions = (select, values, defaultLabel) => {
    if (!select) return;
    const current = select.value;
    select.replaceChildren(new Option(defaultLabel, ''));
    [...new Set((values || []).map(value => String(value || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'en'))
      .forEach(value => select.add(new Option(value, value)));
    if ([...select.options].some(option => option.value === current)) select.value = current;
  };

  try {
    const [categoriesResult, facetsResult] = await Promise.all([
      sb.from('categories').select('id,name').eq('active', true).order('name'),
      sb.from('products').select('fabric').eq('status', 'active')
    ]);
    if (categoriesResult.error) throw categoriesResult.error;
    if (facetsResult.error) throw facetsResult.error;

    (categoriesResult.data || []).forEach(category => {
      controls.category?.add(new Option(category.name || '', category.id));
    });
    const facets = facetsResult.data || [];
    fillOptions(controls.fabric, facets.map(item => item.fabric), 'All fabrics');
  } catch (error) {
    console.error('Shop filter options failed:', error);
    NL.toast('Some filters could not be loaded. You can still browse the collection.', 'warning');
  }

  let timer;
  let requestVersion = 0;
  const render = async () => {
    const thisRequest = ++requestVersion;
    const min = controls.minPrice?.value.trim() || '';
    const max = controls.maxPrice?.value.trim() || '';
    const minValue = min === '' ? null : Number(min);
    const maxValue = max === '' ? null : Number(max);
    const invalidRange = (minValue !== null && (!Number.isFinite(minValue) || minValue < 0)) ||
      (maxValue !== null && (!Number.isFinite(maxValue) || maxValue < 0)) ||
      (minValue !== null && maxValue !== null && minValue > maxValue);
    if (invalidRange) {
      NL.toast('Please enter a valid price range. The minimum cannot exceed the maximum.', 'error');
      (minValue !== null && maxValue !== null && minValue > maxValue ? controls.maxPrice : controls.minPrice)?.focus();
      return;
    }
    grid.setAttribute('aria-busy', 'true');
    await renderProducts(grid, {
      search: controls.search?.value || '',
      category: controls.category?.value || '',
      fabric: controls.fabric?.value || '',
      minPrice: min,
      maxPrice: max,
      availability: controls.availability?.value || '',
      sort: controls.sort?.value || 'newest'
    });
    if (thisRequest !== requestVersion) return;
    const count = grid.querySelectorAll('.product-card').length;
    if (summary) summary.textContent = `${count} ${count === 1 ? 'saree' : 'sarees'} shown`;
    grid.removeAttribute('aria-busy');
  };
  const schedule = (delay = 180) => {
    clearTimeout(timer);
    timer = setTimeout(render, delay);
  };

  form.addEventListener('submit', event => { event.preventDefault(); render(); });
  Object.values(controls).forEach(control => {
    if (!control) return;
    control.addEventListener('input', () => schedule(control === controls.search ? 220 : 120));
    control.addEventListener('change', () => schedule(80));
  });
  clearButton?.addEventListener('click', () => {
    form.reset();
    render();
    controls.search?.focus();
  });

  await render();
});
