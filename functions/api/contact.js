const HOLODIVE_CHANNEL = 'C0ARM8R3JE5'; // #proj-holodive

const SUBJECT_LABELS = {
  'early-access':  'Early Access / Waitlist',
  'partnership':   'Partnership Enquiry',
  'press':         'Press / Media',
  'research':      'Research Collaboration',
  'other':         'Other',
};

async function pushToHubspot(env, { name, email, subject, message }) {
  if (!env.HUBSPOT_TOKEN) return { skipped: true };

  const [firstname, ...rest] = (name || '').trim().split(' ');
  const lastname = rest.join(' ') || undefined;

  const properties = {
    email,
    firstname,
    ...(lastname  && { lastname }),
    ...(message   && { message }),
    hs_lead_status: 'NEW',
    lifecyclestage: 'lead',
  };

  const res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.HUBSPOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ properties }),
  });

  if (res.status === 409) {
    // Contact exists — update message/notes only
    const existing = await fetch(
      `https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(email)}?idProperty=email`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${env.HUBSPOT_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ properties: { message } }),
      }
    );
    return { patched: true, status: existing.status };
  }

  const body = await res.json();
  if (!res.ok) console.error('HubSpot error:', JSON.stringify(body));
  return { created: res.ok, id: body.id, status: res.status };
}

export async function onRequestPost(context) {
  const { env, request } = context;

  try {
    const data = await request.json();
    const { name, email, subject, message } = data;

    const timestamp = new Date().toISOString();
    const ip        = request.headers.get('CF-Connecting-IP') || '—';
    const country   = request.headers.get('CF-IPCountry')     || '—';

    const subjectLabel = SUBJECT_LABELS[subject] || subject || '—';

    // ── Slack ──────────────────────────────────────────────────────────────
    const slackMsg = {
      channel: HOLODIVE_CHANNEL,
      unfurl_links: false,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '📬 New HoloDive Contact Enquiry' }
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Name:*\n${name || '—'}` },
            { type: 'mrkdwn', text: `*Email:*\n${email || '—'}` },
            { type: 'mrkdwn', text: `*Subject:*\n${subjectLabel}` },
            { type: 'mrkdwn', text: `*Country:*\n${country}` }
          ]
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*Message:*\n${message || '—'}` }
        },
        {
          type: 'context',
          elements: [{
            type: 'mrkdwn',
            text: `Sent via holodive.io/contact.html • ${timestamp} • IP: ${ip} • Added to HubSpot CRM`
          }]
        }
      ]
    };

    // ── Run Slack + HubSpot in parallel ────────────────────────────────────
    const [slackRes, hubspotResult] = await Promise.all([
      fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.SLACK_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(slackMsg),
      }),
      pushToHubspot(env, { name, email, subject, message }),
    ]);

    const slackBody = await slackRes.json();
    if (!slackBody.ok) console.error('Slack error:', slackBody.error);
    if (hubspotResult.status >= 400) console.error('HubSpot result:', hubspotResult);

    return new Response(JSON.stringify({ success: true }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    console.error('contact handler error:', err);
    return new Response(JSON.stringify({ success: false }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
