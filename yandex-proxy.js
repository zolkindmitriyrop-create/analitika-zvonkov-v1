// Прокси для Yandex SpeechKit v2 (longRunningRecognize + operations status).
// Нужен, потому что Yandex Cloud не отдаёт CORS-заголовки для прямых запросов
// из браузера — запрос должен идти через сервер.
//
// Использование с фронтенда:
//   POST /api/yandex-proxy?path=speech/stt/v2/longRunningRecognize
//   GET  /api/yandex-proxy?path=operations/<id>
// Заголовок Authorization передаётся клиентом как есть и пробрасывается дальше.

export default async function handler(req, res) {
  // Разрешаем кросс-доменные запросы к самому прокси (на случай если фронтенд
  // и API задеплоены раздельно), плюс отвечаем на preflight OPTIONS.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const path = req.query.path;
  if (!path || typeof path !== 'string') {
    res.status(400).json({ error: 'Missing "path" query parameter' });
    return;
  }

  // Операции статуса живут на operation.api.cloud.yandex.net,
  // сам запрос на распознавание — на transcribe.api.cloud.yandex.net.
  const isOperation = path.startsWith('operations/');
  const targetBase = isOperation
    ? 'https://operation.api.cloud.yandex.net'
    : 'https://transcribe.api.cloud.yandex.net';
  const targetUrl = targetBase + '/' + path.replace(/^\/+/, '');

  try {
    const upstreamHeaders = { 'Content-Type': 'application/json' };
    if (req.headers.authorization) {
      upstreamHeaders['Authorization'] = req.headers.authorization;
    }

    const upstreamRes = await fetch(targetUrl, {
      method: req.method,
      headers: upstreamHeaders,
      body: req.method === 'POST' ? JSON.stringify(req.body) : undefined
    });

    const contentType = upstreamRes.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await upstreamRes.json();
      res.status(upstreamRes.status).json(data);
    } else {
      const text = await upstreamRes.text();
      res.status(upstreamRes.status).send(text);
    }
  } catch (error) {
    res.status(502).json({ error: 'Proxy request failed: ' + error.message });
  }
}
