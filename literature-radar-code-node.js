// Literature Radar - n8n Code node
// Mode: "Run Once for All Items"  |  Language: JavaScript
//
// INPUT:  the XML string returned by the efetch HTTP Request node
// OUTPUT: one item -> { subject, html, count }
//         wire { subject } and { html } into the email node.

// 1. Grab the raw XML from the incoming item (tolerant about the field name,
//    so an empty-result day that returns no/garbled body just yields 0 papers)
const item = $input.first().json;
const xml =
  (typeof item === 'string' ? item : '') ||
  item.data ||
  item.body ||
  '';

// Small helper: strip inner tags (<i>, <sup>, ...) and decode HTML entities
const decode = (s = '') =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

const first = (block, re) => {
  const m = block.match(re);
  return m ? decode(m[1]) : '';
};

// 2. Split into individual <PubmedArticle> blocks and pull the fields we want
const blocks = xml.split('<PubmedArticle>').slice(1);

const papers = blocks
  .map((block) => {
    const pmid = (block.match(/<PMID[^>]*>(\d+)<\/PMID>/) || [])[1] || '';
    const title = first(block, /<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/) || 'Untitled';
    const journal = first(block, /<Title>([\s\S]*?)<\/Title>/);
    const year = first(block, /<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/);

    // Abstract -> brief summary: join sections, keep first ~2 sentences, cap length
    const parts = [...block.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g)]
      .map((m) => decode(m[1]));
    let summary = parts.join(' ');
    summary = (summary.match(/[^.!?]+[.!?]+/g) || [summary]).slice(0, 2).join(' ').trim();
    if (summary.length > 400) summary = summary.slice(0, 397) + '…';
    if (!summary) summary = 'No abstract available.';

    // Authors: first 3 + "et al."
    const authors = [...block.matchAll(
      /<Author[^>]*>[\s\S]*?<LastName>([\s\S]*?)<\/LastName>[\s\S]*?(?:<Initials>([\s\S]*?)<\/Initials>)?[\s\S]*?<\/Author>/g
    )].map((m) => `${decode(m[1])}${m[2] ? ' ' + decode(m[2]) : ''}`);
    const authorLine = authors.length
      ? authors.slice(0, 3).join(', ') + (authors.length > 3 ? ', et al.' : '')
      : '';

    return {
      pmid,
      title,
      journal,
      year,
      summary,
      authorLine,
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    };
  })
  .filter((p) => p.pmid);

// 3. Render the HTML email (inline styles = maximum email-client compatibility)
const today = new Date().toLocaleDateString('en-GB', {
  day: 'numeric', month: 'long', year: 'numeric',
});

const cards = papers.map((p) => `
  <tr><td style="padding:0 0 20px;">
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;background:#ffffff;">
      <a href="${p.url}" style="color:#1a56db;font-size:16px;font-weight:600;text-decoration:none;line-height:1.4;">${p.title}</a>
      <div style="color:#6b7280;font-size:12px;margin:6px 0 10px;">
        ${[p.authorLine, p.journal, p.year].filter(Boolean).join(' &middot; ')}
      </div>
      <div style="color:#374151;font-size:14px;line-height:1.55;">${p.summary}</div>
      <a href="${p.url}" style="display:inline-block;margin-top:12px;color:#1a56db;font-size:13px;font-weight:600;text-decoration:none;">Read on PubMed &rarr;</a>
    </div>
  </td></tr>`).join('');

const html = papers.length === 0
  ? `<p style="font-family:sans-serif;color:#374151;">No new papers matched your query in this window.</p>`
  : `<!doctype html><html><body style="margin:0;background:#f3f4f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
        <tr><td style="padding:0 0 20px;">
          <div style="font-size:20px;font-weight:700;color:#111827;">Literature Radar</div>
          <div style="font-size:13px;color:#6b7280;margin-top:4px;">${today} &middot; ${papers.length} new paper${papers.length === 1 ? '' : 's'}</div>
        </td></tr>
        ${cards}
        <tr><td style="padding:8px 0 0;color:#9ca3af;font-size:11px;">Sent by your n8n Literature Radar &middot; source: PubMed</td></tr>
      </table>
    </td></tr>
  </table></body></html>`;

return [{
  json: {
    subject: `Literature Radar - ${papers.length} new paper${papers.length === 1 ? '' : 's'} (${today})`,
    html,
    count: papers.length,
  },
}];
