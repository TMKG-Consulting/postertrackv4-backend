const RESEND_API_URL = "https://api.resend.com/emails";

const sendEmail = async ({ to, subject, text, html, attachments }) => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured.");
  }
  if (!from) {
    throw new Error("RESEND_FROM is not configured.");
  }

  const payload = { from, to, subject };
  if (text !== undefined) payload.text = text;
  if (html !== undefined) payload.html = html;
  if (attachments?.length) payload.attachments = attachments;

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  let responseBody;
  try {
    responseBody = responseText ? JSON.parse(responseText) : {};
  } catch {
    responseBody = { message: responseText };
  }

  if (!response.ok) {
    const message =
      responseBody.message || responseBody.name || `HTTP ${response.status}`;
    throw new Error(`Resend email request failed: ${message}`);
  }

  return responseBody;
};

module.exports = { sendEmail };
