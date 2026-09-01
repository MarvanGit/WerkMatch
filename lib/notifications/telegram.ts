type MatchNotification = {
  title: string;
  company: string;
  location: string;
  score: number;
  summary: string;
  url: string;
};

export async function sendTelegramMatch(
  chatId: string,
  match: MatchNotification,
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured.');

  const text = [
    `🎯 ${match.score}% WerkMatch`,
    `${match.title}`,
    `${match.company} · ${match.location}`,
    '',
    match.summary,
    '',
    match.url,
  ].join('\n');

  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Telegram notification failed with status ${response.status}.`,
    );
  }
}
