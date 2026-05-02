const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

const TOKEN = '8527160088:AAGc2311QFkp6F7-Jx5k8MJfqlpvbueSl5E';
const MODERATOR_CHANNEL_ID = '-1003814894637';

const bot = new TelegramBot(TOKEN, { polling: true });

// Express сервер для Railway
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('PRORANK Bot is running!');
});

app.listen(PORT, () => {
    console.log(`✅ Express сервер запущен на порту ${PORT}`);
});

// Обработка ошибок
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('❌ Unhandled Rejection:', err);
});

// Хранилище временных данных для верификации
const pendingVerifications = new Map();

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========

function getTypeText(type) {
    const types = {
        'win': '🥊 Победа в бою',
        'finish': '💥 Финиш (нокаут/сабмишен)',
        'tournament': '🏆 Победа на турнире'
    };
    return types[type] || type;
}

// ========== КОМАНДЫ ==========

// /start - главное меню
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    const keyboard = {
        reply_markup: {
            keyboard: [
                [{ text: '📊 Мой профиль' }],
                [{ text: '🏆 Подтвердить рекорд' }],
                [{ text: '⚔️ Мои вызовы' }],
                [{ text: '❓ Поддержка' }]
            ],
            resize_keyboard: true
        }
    };
    
    await bot.sendMessage(chatId, 
        `🥊 *Добро пожаловать в PRORANK!*\n\n` +
        `Здесь ты можешь подтверждать свои рекорды и следить за вызовами.\n\n` +
        `*Твой ID:* \`${userId}\``,
        { parse_mode: 'Markdown', ...keyboard }
    );
});

// 📊 Мой профиль
bot.onText(/📊 Мой профиль/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    await bot.sendMessage(chatId, 
        `📊 *Твой профиль*\n\n` +
        `🆔 ID: \`${userId}\`\n` +
        `📝 Имя: ${msg.from.first_name || '—'}\n` +
        `🏆 Подтверждённых рекордов: 0\n` +
        `⭐ FRS очков: 0\n\n` +
        `🔗 *Привяжи профиль на сайте:*\n` +
        `Перейди в личный кабинет PRORANK и нажми "Привязать Telegram"`,
        { parse_mode: 'Markdown' }
    );
});

// 🏆 Подтвердить рекорд
bot.onText(/🏆 Подтвердить рекорд/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    pendingVerifications.set(userId, { step: 'waiting_for_type' });
    
    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🥊 Победа в бою', callback_data: 'record_win' }],
                [{ text: '💥 Финиш (нокаут/сабмишен)', callback_data: 'record_finish' }],
                [{ text: '🏆 Победа на турнире', callback_data: 'record_tournament' }]
            ]
        }
    };
    
    await bot.sendMessage(chatId, 
        `🏆 *Подтверждение рекорда*\n\n` +
        `Выбери тип достижения:`,
        { parse_mode: 'Markdown', ...keyboard }
    );
});

// Обработка выбора типа рекорда
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;
    
    if (data.startsWith('record_')) {
        const type = data.replace('record_', '');
        pendingVerifications.set(userId, { step: 'waiting_for_description', type });
        
        await bot.sendMessage(chatId, 
            `📝 *Расскажи подробности*\n\n` +
            `Напиши информацию о рекорде:\n` +
            `• Соперник\n` +
            `• Дата\n` +
            `• Место\n` +
            `• Дополнительная информация\n\n` +
            `После этого отправь фото/видео доказательства.`,
            { parse_mode: 'Markdown' }
        );
    }
});

// Обработка текста (описание рекорда)
bot.on('text', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    
    // Игнорируем команды с кнопок-меню
    if (text === '📊 Мой профиль' || text === '🏆 Подтвердить рекорд' || 
        text === '⚔️ Мои вызовы' || text === '❓ Поддержка') {
        return;
    }
    
    const pending = pendingVerifications.get(userId);
    
    if (!pending) {
        return;
    }
    
    if (pending.step === 'waiting_for_description') {
        pending.description = text;
        pending.step = 'waiting_for_media';
        pendingVerifications.set(userId, pending);
        
        await bot.sendMessage(chatId, 
            `✅ Описание сохранено!\n\n` +
            `📸 Теперь отправь *фото или видео* доказательство.`,
            { parse_mode: 'Markdown' }
        );
    } else {
        await bot.sendMessage(chatId, 
            `❌ Сначала начни процесс: /start → "🏆 Подтвердить рекорд"`);
    }
});

// Обработка фото
bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || `${msg.from.first_name} ${msg.from.last_name || ''}`;
    
    const pending = pendingVerifications.get(userId);
    
    if (!pending || pending.step !== 'waiting_for_media') {
        await bot.sendMessage(chatId, 
            `❌ Сначала начни процесс подтверждения рекорда: /start → "🏆 Подтвердить рекорд"`);
        return;
    }
    
    try {
        const photo = msg.photo[msg.photo.length - 1];
        const fileId = photo.file_id;
        const fileLink = await bot.getFileLink(fileId);
        
        const requestId = Date.now();
        
        const moderatorMessage = 
            `🔔 *НОВАЯ ЗАЯВКА НА ПОДТВЕРЖДЕНИЕ* #${requestId}\n\n` +
            `👤 *Боец:* ${username}\n` +
            `🆔 *Telegram ID:* \`${userId}\`\n` +
            `📅 *Дата:* ${new Date().toLocaleString()}\n\n` +
            `🏆 *Тип:* ${getTypeText(pending.type)}\n\n` +
            `📝 *Описание:*\n${pending.description}\n\n` +
            `📎 *Фото:* [Смотреть](${fileLink})\n\n` +
            `---\n` +
            `✅ *Подтвердить:* /approve_${requestId}\n` +
            `❌ *Отклонить:* /reject_${requestId}\n` +
            `📝 *Уточнить:* /clarify_${requestId}`;
        
        await bot.sendMessage(MODERATOR_CHANNEL_ID, moderatorMessage, { parse_mode: 'Markdown' });
        
        pendingVerifications.delete(userId);
        
        await bot.sendMessage(chatId, 
            `✅ *Заявка отправлена!* #${requestId}\n\n` +
            `Модераторы рассмотрят её в ближайшее время.\n` +
            `Результат придёт сюда в виде уведомления.`,
            { parse_mode: 'Markdown' }
        );
        
    } catch (err) {
        console.error('Ошибка при обработке фото:', err);
        await bot.sendMessage(chatId, 
            `❌ Ошибка при отправке заявки. Попробуй ещё раз.`);
    }
});

// Обработка видео
bot.on('video', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || `${msg.from.first_name} ${msg.from.last_name || ''}`;
    
    const pending = pendingVerifications.get(userId);
    
    if (!pending || pending.step !== 'waiting_for_media') {
        await bot.sendMessage(chatId, 
            `❌ Сначала начни процесс подтверждения рекорда: /start → "🏆 Подтвердить рекорд"`);
        return;
    }
    
    try {
        const video = msg.video;
        const fileId = video.file_id;
        const fileLink = await bot.getFileLink(fileId);
        
        const requestId = Date.now();
        
        const moderatorMessage = 
            `🔔 *НОВАЯ ЗАЯВКА НА ПОДТВЕРЖДЕНИЕ* #${requestId}\n\n` +
            `👤 *Боец:* ${username}\n` +
            `🆔 *Telegram ID:* \`${userId}\`\n` +
            `📅 *Дата:* ${new Date().toLocaleString()}\n\n` +
            `🏆 *Тип:* ${getTypeText(pending.type)}\n\n` +
            `📝 *Описание:*\n${pending.description}\n\n` +
            `📎 *Видео:* [Смотреть](${fileLink})\n\n` +
            `---\n` +
            `✅ *Подтвердить:* /approve_${requestId}\n` +
            `❌ *Отклонить:* /reject_${requestId}\n` +
            `📝 *Уточнить:* /clarify_${requestId}`;
        
        await bot.sendMessage(MODERATOR_CHANNEL_ID, moderatorMessage, { parse_mode: 'Markdown' });
        
        pendingVerifications.delete(userId);
        
        await bot.sendMessage(chatId, 
            `✅ *Заявка отправлена!* #${requestId}\n\n` +
            `Модераторы рассмотрят её в ближайшее время.`,
            { parse_mode: 'Markdown' }
        );
        
    } catch (err) {
        console.error('Ошибка при обработке видео:', err);
        await bot.sendMessage(chatId, `❌ Ошибка. Попробуй ещё раз.`);
    }
});

// ⚔️ Мои вызовы
bot.onText(/⚔️ Мои вызовы/, async (msg) => {
    const chatId = msg.chat.id;
    
    await bot.sendMessage(chatId, 
        `⚔️ *Мои вызовы*\n\n` +
        `Здесь будут отображаться твои активные вызовы на спарринг.\n\n` +
        `Пока что эта функция в разработке.`,
        { parse_mode: 'Markdown' }
    );
});

// ❓ Поддержка
bot.onText(/❓ Поддержка/, async (msg) => {
    const chatId = msg.chat.id;
    
    await bot.sendMessage(chatId, 
        `❓ *Поддержка*\n\n` +
        `По всем вопросам обращайся:\n` +
        `📧 Email: support@prorank.ru\n` +
        `💬 Чат поддержки: @prorank_support\n\n` +
        `*Примечание:* Если ты хочешь стать модератором, напиши в поддержку.`,
        { parse_mode: 'Markdown' }
    );
});

// ========== КОМАНДЫ ДЛЯ МОДЕРАТОРОВ (работают в канале) ==========

bot.onText(/\/approve_(\d+)/, async (msg, match) => {
    const requestId = match[1];
    const chatId = msg.chat.id;
    
    if (chatId.toString() !== MODERATOR_CHANNEL_ID) return;
    
    await bot.sendMessage(chatId, 
        `✅ *Заявка #${requestId} ОДОБРЕНА!*\n\n` +
        `Модератор: @${msg.from.username || msg.from.first_name}\n` +
        `Время: ${new Date().toLocaleString()}`,
        { parse_mode: 'Markdown' }
    );
});

bot.onText(/\/reject_(\d+)/, async (msg, match) => {
    const requestId = match[1];
    const chatId = msg.chat.id;
    
    if (chatId.toString() !== MODERATOR_CHANNEL_ID) return;
    
    await bot.sendMessage(chatId, 
        `❌ *Заявка #${requestId} ОТКЛОНЕНА*\n\n` +
        `Модератор: @${msg.from.username || msg.from.first_name}`,
        { parse_mode: 'Markdown' }
    );
});

bot.onText(/\/clarify_(\d+)/, async (msg, match) => {
    const requestId = match[1];
    const chatId = msg.chat.id;
    
    if (chatId.toString() !== MODERATOR_CHANNEL_ID) return;
    
    await bot.sendMessage(chatId, 
        `📝 *Заявка #${requestId} ТРЕБУЕТ УТОЧНЕНИЯ*\n\n` +
        `Модератор: @${msg.from.username || msg.from.first_name}`,
        { parse_mode: 'Markdown' }
    );
});

// Пинг каждые 30 секунд, чтобы бот не засыпал
setInterval(() => {
    console.log('💓 Бот жив');
}, 30000);

console.log('🤖 Бот PRORANK запущен с поддержкой верификации рекордов!');