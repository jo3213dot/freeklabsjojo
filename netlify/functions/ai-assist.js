// Save this as netlify/functions/ai-assist.js in your site repo.
// Deploy to Netlify and set OPENAI_API_KEY in Netlify environment variables.
const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const message = (body.message || '').trim();
  if (!message) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No message provided' }) };
  }
  if (message.length > 4000) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Message too long' }) };
  }

  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server not configured (missing API key)' }) };
  }

  try {
    // Moderation check
    const modRes = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ input: message })
    });
    const modJson = await modRes.json();
    const flagged = modJson && modJson.results && modJson.results[0] && modJson.results[0].flagged;
    if (flagged) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Message violates content policy' }) };
    }

    // Chat completion (gpt-3.5-turbo)
    const payload = {
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are a helpful, concise high-school science tutor. Keep answers short, clear, and educational.' },
        { role: 'user', content: message }
      ],
      max_tokens: 600,
      temperature: 0.3
    };

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const aiJson = await aiRes.json();
    if (!aiRes.ok) {
      console.error('OpenAI error:', aiJson);
      return { statusCode: 502, body: JSON.stringify({ error: 'AI provider error', details: aiJson }) };
    }

    const reply = aiJson.choices && aiJson.choices[0] && aiJson.choices[0].message && aiJson.choices[0].message.content
      ? aiJson.choices[0].message.content.trim()
      : 'Sorry, no response from the AI.';

    return {
      statusCode: 200,
      body: JSON.stringify({ reply })
    };

  } catch (err) {
    console.error('Function error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Server error', details: err.message }) };
  }
};
