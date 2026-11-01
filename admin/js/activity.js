document.addEventListener('DOMContentLoaded', async () => {
  const profile = await NL.requireRole('admin');
  if (!profile) return;
  const tbody = NL.qs('#activity-table');
  if (!tbody) return;

  const result = await sb.from('admin_activity_logs')
    .select('id,actor_id,action,entity_table,entity_id,summary,created_at,profiles(name,email)')
    .order('created_at', { ascending: false })
    .limit(250);
  if (result.error) {
    console.error('Activity log load failed:', result.error);
    tbody.innerHTML = '<tr><td colspan="6">Activity log is unavailable. Apply the V2 database migration and refresh.</td></tr>';
    return;
  }
  const rows = result.data || [];
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6">No admin activity has been recorded yet. New tracked changes will appear here.</td></tr>';
    return;
  }

  const formatSummary = value => {
    if (!value || typeof value !== 'object') return '—';
    return Object.entries(value)
      .map(([key, item]) => `${key.replaceAll('_', ' ')}: ${String(item)}`)
      .join(' · ') || '—';
  };

  tbody.innerHTML = rows.map(row => {
    const date = row.created_at ? new Date(row.created_at) : null;
    const when = date && !Number.isNaN(date.valueOf())
      ? date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
      : '—';
    const actor = row.profiles?.name || row.profiles?.email || 'Admin account';
    return `<tr>
      <td>${NL.esc(when)}</td>
      <td>${NL.esc(actor)}</td>
      <td><span class="status">${NL.esc(row.action)}</span></td>
      <td>${NL.esc(row.entity_table)}</td>
      <td>${NL.esc(row.entity_id || '—')}</td>
      <td>${NL.esc(formatSummary(row.summary))}</td>
    </tr>`;
  }).join('');
});
