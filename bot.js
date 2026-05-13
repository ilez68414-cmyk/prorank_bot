const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

const TOKEN = '8527160088:AAGc2311QFkp6F7-Jx5k8MJfqlpvbueSl5E';
const MODERATOR_CHANNEL_ID = '-1003814894637';

const bot = new TelegramBot(TOKEN, { polling: true });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.get('/', (req, res) => res.send('PRORANK Bot is running!'));

app.listen(PORT, () => console.log(`✅ Express сервер запущен на порту ${PORT}`));

process.on('uncaughtException', (err) => console.error('❌', err));
process.on('unhandledRejection', (err) => console.error('❌', err));

const pendingVerifications = new Map();

function getTypeText(type) {
    const types = {
        'win': '🥊 Победа в бою',
        'finish': '💥 Финиш',
        'tournament': '🏆 Победа на турнире'
    };
    return types[type] || type;
}

// ========== ПРИВЯЗКА АККАУНТА ==========
bot.onText(/\/start verify_(.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const uid = match[1];
    const telegramId = msg.from.id;
    const username = msg.from.username || msg.from.first_name;
    
    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '✅ Подтвердить привязку', callback_data: `approve_tg_${uid}_${telegramId}` },
                    { text: '❌ Отклонить', callback_data: `reject_tg_${uid}` }
                ]
            ]
        }
    };
    
    await bot.sendMessage(MODERATOR_CHANNEL_ID,
        `🔔 *НОВАЯ ЗАЯВКА НА ПРИВЯЗКУ*\n\n` +
        `👤 Пользователь: @${username}\n` +
        `🆔 Telegram ID: \`${telegramId}\`\n` +
        `🔗 UID с сайта: \`${uid}\``,
        { parse_mode: 'Markdown', ...keyboard }
    );
    
    await bot.sendMessage(chatId,
        `✅ *Заявка на привязку отправлена!*\n\n` +
        `Модератор рассмотрит её в ближайшее время.`,
        { parse_mode: 'Markdown' }
    );
});

// ========== ОСНОВНЫЕ КОМАНДЫ ==========

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
        `🥊 *Добро пожаловать в PRORANK!*\n\n*Твой ID:* \`${userId}\``,
        { parse_mode: 'Markdown', ...keyboard }
    );
});

bot.onText(/📊 Мой профиль/, async (msg) => {
    await bot.sendMessage(msg.chat.id, 
        `📊 *Твой профиль*\n🆔 ID: \`${msg.from.id}\`\n\n` +
        `🔗 Привязка аккаунта: нажмите кнопку "🔗 Привязать Telegram" на сайте PRORANK.`,
        { parse_mode: 'Markdown' }
    );
});

// Автоматическая привязка аккаунта через /start verify_
bot.onText(/\/start verify_(.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const uid = match[1];
    const telegramId = msg.from.id;
    const username = msg.from.username || msg.from.first_name;
    
    try {
        const fighterRef = doc(db, "fighters", uid);
        const fighterSnap = await getDoc(fighterRef);
        
        if (!fighterSnap.exists()) {
            await bot.sendMessage(chatId, `❌ Профиль с ID ${uid} не найден. Проверьте ссылку.`);
            return;
        }
        
        await updateDoc(fighterRef, {
            telegramId: String(telegramId),
            telegramUsername: username
        });
        
        await bot.sendMessage(chatId, 
            `✅ *Аккаунт успешно привязан!*\n\n` +
            `👤 Боец: ${fighterSnap.data().name}\n` +
            `📢 Теперь вы будете получать уведомления о вызовах.`,
            { parse_mode: 'Markdown' }
        );
        
    } catch (err) {
        console.error('Ошибка привязки:', err);
        await bot.sendMessage(chatId, `❌ Ошибка при привязке. Попробуйте позже.`);
    }
});

bot.onText(/🏆 Подтвердить рекорд/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    pendingVerifications.set(userId, { step: 'waiting_for_type' });
    
    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🥊 Победа в бою', callback_data: 'record_win' }],
                [{ text: '💥 Финиш', callback_data: 'record_finish' }],
                [{ text: '🏆 Победа на турнире', callback_data: 'record_tournament' }]
            ]
        }
    };
    
    await bot.sendMessage(chatId, `🏆 *Выбери тип достижения:*`, { parse_mode: 'Markdown', ...keyboard });
});

bot.onText(/⚔️ Мои вызовы/, async (msg) => {
    await bot.sendMessage(msg.chat.id, `⚔️ *Мои вызовы*\n\nЗайдите на сайт в раздел "Мои вызовы".`, { parse_mode: 'Markdown' });
});

bot.onText(/❓ Поддержка/, async (msg) => {
    await bot.sendMessage(msg.chat.id, `❓ *Поддержка*\n\nЧат: @prorank_support`, { parse_mode: 'Markdown' });
});

// ========== ОБРАБОТЧИКИ CALLBACK_QUERY ==========
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;
    
    // Привязка Telegram
    if (data.startsWith('approve_tg_')) {
        const parts = data.split('_');
        const uid = parts[2];
        const telegramId = parts[3];
        
        await bot.sendMessage(chatId, 
            `✅ *Привязка подтверждена!*\n\n` +
            `UID: ${uid}\nTelegram ID: ${telegramId}\n\n` +
            `❗ Добавьте этот Telegram ID в админке сайта.`,
            { parse_mode: 'Markdown' }
        );
        await bot.answerCallbackQuery(query.id);
    }
    
    if (data.startsWith('reject_tg_')) {
        const uid = data.split('_')[2];
        await bot.sendMessage(chatId, `❌ *Привязка отклонена*\nUID: ${uid}`, { parse_mode: 'Markdown' });
        await bot.answerCallbackQuery(query.id);
    }
    
    // Выбор типа рекорда
    if (data.startsWith('record_')) {
        const type = data.replace('record_', '');
        pendingVerifications.set(userId, { step: 'waiting_for_description', type });
        await bot.sendMessage(chatId, 
            `📝 *Напиши описание рекорда*\n(Соперник, дата, место)`,
            { parse_mode: 'Markdown' }
        );
        await bot.answerCallbackQuery(query.id);
    }
    
    // Подтверждение/отклонение рекордов
    if (data.startsWith('approve_') && !data.startsWith('approve_tg_')) {
        const requestId = data.replace('approve_', '');
        await bot.sendMessage(chatId, `✅ *Заявка #${requestId} ОДОБРЕНА!*`, { parse_mode: 'Markdown' });
        await bot.answerCallbackQuery(query.id);
    }
    
    if (data.startsWith('reject_') && !data.startsWith('reject_tg_')) {
        const requestId = data.replace('reject_', '');
        await bot.sendMessage(chatId, `❌ *Заявка #${requestId} ОТКЛОНЕНА*`, { parse_mode: 'Markdown' });
        await bot.answerCallbackQuery(query.id);
    }
});

// ========== ОБРАБОТКА ОПИСАНИЯ РЕКОРДА ==========
bot.on('text', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    
    if (['📊 Мой профиль', '🏆 Подтвердить рекорд', '⚔️ Мои вызовы', '❓ Поддержка'].includes(text)) return;
    
    const pending = pendingVerifications.get(userId);
    if (!pending) return;
    
    if (pending.step === 'waiting_for_description') {
        pending.description = text;
        pending.step = 'waiting_for_media';
        pendingVerifications.set(userId, pending);
        await bot.sendMessage(chatId, `✅ Описание сохранено!\n\n📸 Теперь отправь *фото* доказательство.`, { parse_mode: 'Markdown' });
    }
});

// ========== ОБРАБОТКА ФОТО ==========
bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name;
    
    const pending = pendingVerifications.get(userId);
    if (!pending || pending.step !== 'waiting_for_media') return;
    
    try {
        const photo = msg.photo[msg.photo.length - 1];
        const fileId = photo.file_id;
        const requestId = Date.now();
        
        const fileInfo = await bot.getFile(fileId);
        const fileLink = `https://api.telegram.org/file/bot${TOKEN}/${fileInfo.file_path}`;
        
        const moderatorMessage = 
            `🔔 *НОВАЯ ЗАЯВКА* #${requestId}\n\n` +
            `👤 *Боец:* ${username}\n🆔 *ID:* \`${userId}\`\n📅 *Дата:* ${new Date().toLocaleString()}\n\n` +
            `🏆 *Тип:* ${getTypeText(pending.type)}\n\n📝 *Описание:*\n${pending.description}\n\n` +
            `📎 *Фото:* [Смотреть](${fileLink})`;
        
        const keyboard = {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '✅ Подтвердить', callback_data: `approve_${requestId}` },
                        { text: '❌ Отклонить', callback_data: `reject_${requestId}` }
                    ]
                ]
            }
        };
        
        await bot.sendMessage(MODERATOR_CHANNEL_ID, moderatorMessage, { parse_mode: 'Markdown', ...keyboard });
        await bot.sendPhoto(MODERATOR_CHANNEL_ID, fileId);
        
        pendingVerifications.delete(userId);
        await bot.sendMessage(chatId, `✅ *Заявка #${requestId} отправлена модераторам!*`, { parse_mode: 'Markdown' });
        
    } catch (err) {
        console.error(err);
        await bot.sendMessage(chatId, `❌ Ошибка. Попробуй ещё раз.`);
    }
});

setInterval(() => console.log('💓 Бот жив'), 30000);
console.log('🤖 Бот PRORANK запущен!');