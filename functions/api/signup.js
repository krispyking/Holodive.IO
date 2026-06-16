const HOLODIVE_CHANNEL = 'C0ARM8R3JE5'; // #proj-holodive

export async function onRequestPost(context) {
  const { env, request } = context;

  try {
    const data = await request.json();
    const { name, email, diver_type, excitement } = data;

    // Post to Slack as HoloDiveClaw
    const slackMsg = {
      channel: HOLODIVE_CHANNEL,
      unfurl_links: false,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '🤿 New HoloDive Waitlist Signup!' }
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Name:*\n${name || '—'}` },
            { type: 'mrkdwn', text: `*Email:*\n${email || '—'}` },
            { type: 'mrkdwn', text: `*Diver Type:*\n${diver_type || '—'}` }
          ]
        },
        ...(excitement ? [{
          type: 'section',
          text: { type: 'mrkdwn', text: `*What excites them:*\n_${excitement}_` }
        }] : []),
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: `Signed up via holodive.io` }]
        }
      ]
    };

    const slackRes = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.SLACK_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(slackMsg)
    });

    // Write to Google Sheets via Apps Script (added once APPS_SCRIPT_URL is set)
    if (env.APPS_SCRIPT_URL) {
      await fetch(env.APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, diver_type, excitement })
      }).catch(() => {});
    }

    const slackBody = await slackRes.json();
    if (!slackBody.ok) console.error('Slack error:', slackBody.error);

    return new Response(JSON.stringify({ success: true }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err) {
    console.error('signup handler error:', err);
    return new Response(JSON.stringify({ success: false }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
