

// Maximo de tentativas para uma requisição
export const MAX_RETRIES = 5;

// Acima desta quantidade de imoveis pendentes, envia resumo agrupado em vez de mensagens individuais
export const DIGEST_THRESHOLD = 20;

// Intervalo entre mensagens ao Telegram (limite da API: ~1 msg/segundo por chat)
export const MESSAGE_DELAY_MS = 1100;

// Maximo de notificações pendentes processadas por rodada
export const MAX_PENDING_NOTIFICATIONS = 100;
