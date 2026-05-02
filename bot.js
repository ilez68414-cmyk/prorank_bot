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

function getTypeText(type) {
    const types = {
        'win': '🥊 Победа в бою',
        'finish': '💥 Финиш (нокаут/сабмишен)',
        'tournament': '🏆 Победа на турнире'
    };
    return types[type] || type;
}

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
        `🏆 *Подтверждение рекорда*\n\nВыбери тип достижения:`,
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
            `• Соперник\n• Дата\n• Место\n• Дополнительная информация\n\n` +
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
    
    if (text === '📊 Мой профиль' || text === '🏆 Подтвердить рекорд' || 
        text === '⚔️ Мои вызовы' || text === '❓ Поддержка') {
        return;
    }
    
    const pending = pendingVerifications.get(userId);
    
    if (!pending) return;
    
    if (pending.step === 'waiting_for_description') {
        pending.description = text;
        pending.step = 'waiting_for_media';
        pendingVerifications.set(userId, pending);
        
        await bot.sendMessage(chatId, 
            `✅ Описание сохранено!\n\n📸 Теперь отправь *фото или видео* доказательство.`,
            { parse_mode: 'Markdown' }
        );
    } else {
        await bot.sendMessage(chatId, 
            `❌ Сначала начни процесс: /start → "🏆 Подтвердить рекорд"`);
    }
});

// Обработка фото (исправленная версия)
bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || `${msg.from.first_name} ${msg.from.last_name || ''}`;
    
    const pending = pendingVerifications.get(userId);
    
    if (!pending || pending.step !== 'waiting_for_media') {
        await bot.sendMessage(chatId, 
            `❌ Сначала начни процесс: /start → "🏆 Подтвердить рекорд"`);
        return;
    }
    
    try {
        const photo = msg.photo[msg.photo.length - 1];
        const fileId = photo.file_id;
        
        const requestId = Date.now();
        
        // Получаем информацию о файле
        const fileInfo = await bot.getFile(fileId);
        const filePath = fileInfo.file_path;
        
        // Формируем прямую ссылку через API бота
        const fileLink = `https://api.telegram.org/file/bot${TOKEN}/${filePath}`;
        
        const moderatorMessage = 
            `🔔 *НОВАЯ ЗАЯВКА* #${requestId}\n\n` +
            `👤 *Боец:* ${username}\n` +
            `🆔 *ID:* \`${userId}\`\n` +
            `📅 *Дата:* ${new Date().toLocaleString()}\n\n` +
            `🏆 *Тип:* ${getTypeText(pending.type)}\n\n` +
            `📝 *Описание:*\n${pending.description}\n\n` +
            `📎 *Фото:* [Смотреть](${fileLink})\n\n` +
            `---\n` +
            `✅ /approve_${requestId}\n` +
            `❌ /reject_${requestId}`;
        
        await bot.sendMessage(MODERATOR_CHANNEL_ID, moderatorMessage, { parse_mode: 'Markdown' });
        
        // Отправляем фото отдельно (вторым сообщением)
        await bot.sendPhoto(MODERATOR_CHANNEL_ID, fileId);
        
        pendingVerifications.delete(userId);
        
        await bot.sendMessage(chatId, 
            `✅ *Заявка #${requestId} отправлена!*\n\nМодераторы рассмотрят её в ближайшее время.`,
            { parse_mode: 'Markdown' }
        );
        
    } catch (err) {
        console.error('Ошибка при обработке фото:', err);
        await bot.sendMessage(chatId, `❌ Ошибка. Попробуй ещё раз.`);
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
            `❌ Сначала начни процесс: /start → "🏆 Подтвердить рекорд"`);
        return;
    }
    
    try {
        const video = msg.video;
        const fileId = video.file_id;
        
        const requestId = Date.now();
        
        const fileInfo = await bot.getFile(fileId);
        const filePath = fileInfo.file_path;
        const fileLink = `https://api.telegram.org/file/bot${TOKEN}/${filePath}`;
        
        const moderatorMessage = 
            `🔔 *НОВАЯ ЗАЯВКА* #${requestId}\n\n` +
            `👤 *Боец:* ${username}\n` +
            `🆔 *ID:* \`${userId}\`\n` +
            `📅 *Дата:* ${new Date().toLocaleString()}\n\n` +
            `🏆 *Тип:* ${getTypeText(pending.type)}\n\n` +
            `📝 *Описание:*\n${pending.description}\n\n` +
            `📎 *Видео:* [Смотреть](${fileLink})\n\n` +
            `---\n` +
            `✅ /approve_${requestId}\n` +
            `❌ /reject_${requestId}`;
        
        await bot.sendMessage(MODERATOR_CHANNEL_ID, moderatorMessage, { parse_mode: 'Markdown' });
        await bot.sendVideo(MODERATOR_CHANNEL_ID, fileId);
        
        pendingVerifications.delete(userId);
        
        await bot.sendMessage(chatId, 
            `✅ *Заявка #${requestId} отправлена!*`,
            { parse_mode: 'Markdown' }
        );
        
    } catch (err) {
        console.error('Ошибка при обработке видео:', err);
        await bot.sendMessage(chatId, `❌ Ошибка. Попробуй ещё раз.`);
    }
});

// ⚔️ Мои вызовы
bot.onText(/⚔️ Мои вызовы/, async (msg) => {
    await bot.sendMessage(msg.chat.id, 
        `⚔️ *Мои вызовы*\n\nВ разработке.`,
        { parse_mode: 'Markdown' }
    );
});

// ❓ Поддержка
bot.onText(/❓ Поддержка/, async (msg) => {
    await bot.sendMessage(msg.chat.id, 
        `❓ *Поддержка*\n\nПо вопросам: @prorank_support`,
        { parse_mode: 'Markdown' }
    );
});

// Команды для модераторов
bot.onText(/\/approve_(\d+)/, async (msg, match) => {
    if (msg.chat.id.toString() !== MODERATOR_CHANNEL_ID) return;
    const requestId = match[1];
    await bot.sendMessage(MODERATOR_CHANNEL_ID, `✅ *Заявка #${requestId} ОДОБРЕНА*`, { parse_mode: 'Markdown' });
});

bot.onText(/\/reject_(\d+)/, async (msg, match) => {
    if (msg.chat.id.toString() !== MODERATOR_CHANNEL_ID) return;
    const requestId = match[1];
    await bot.sendMessage(MODERATOR_CHANNEL_ID, `❌ *Заявка #${requestId} ОТКЛОНЕНА*`, { parse_mode: 'Markdown' });
});

// Пинг
setInterval(() => console.log('💓 Бот жив'), 30000);

console.log('🤖 Бот PRORANK запущен!');