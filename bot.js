const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, updateDoc } = require('firebase/firestore');

const TOKEN = '8527160088:AAGc2311QFkp6F7-Jx5k8MJfqlpvbueSl5E';
const MODERATOR_CHANNEL_ID = '-1003814894637';

const bot = new TelegramBot(TOKEN, { polling: true });

// Firebase конфиг
const firebaseConfig = {
    apiKey: "AIzaSyDUGYJY7pX7q02MS5SACMIIQXpjpQ97mPw",
    authDomain: "proranklive.firebaseapp.com",
    projectId: "proranklive",
    storageBucket: "proranklive.firebasestorage.app",
    messagingSenderId: "716836144015",
    appId: "1:716836144015:web:f1575147750608d0f881fa"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const app = express();
const PORT = process.env.PORT || 3000;

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
// Команда /verify UID
bot.onText(/\/verify (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const username = msg.from.username || msg.from.first_name;
    const uid = match[1];
    
    try {
        const fighterRef = doc(db, "fighters", uid);
        const fighterSnap = await getDoc(fighterRef);
        
        if (!fighterSnap.exists()) {
            await bot.sendMessage(chatId, 
                `❌ Ошибка: профиль с ID ${uid} не найден.\n\n` +
                `Убедитесь, что вы скопировали правильный ID из профиля на сайте.`);
            return;
        }
        
        await updateDoc(fighterRef, {
            telegramId: String(telegramId),
            telegramUsername: username
        });
        
        await bot.sendMessage(chatId, 
            `✅ *Аккаунт успешно привязан!*\n\n` +
            `👤 Боец: ${fighterSnap.data().name}\n` +
            `🔗 Telegram ID: ${telegramId}\n\n` +
            `Теперь вы будете получать уведомления о вызовах и сможете подтверждать рекорды.`,
            { parse_mode: 'Markdown' }
        );
        
    } catch (err) {
        console.error('Ошибка привязки:', err);
        await bot.sendMessage(chatId, `❌ Ошибка при привязке. Попробуйте позже.`);
    }
});

// Команда /verify без аргументов (подсказка)
bot.onText(/\/verify$/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 
        `🔗 *Как привязать аккаунт:*\n\n` +
        `1. Зайдите в свой профиль на сайте PRORANK\n` +
        `2. Нажмите кнопку "🔗 Привязать Telegram"\n` +
        `3. Бот сам подставит ваш ID\n\n` +
        `*Или вручную:*\n` +
        `/verify ВАШ_UID\n\n` +
        `UID можно найти в адресной строке профиля: profile.html?id=ВАШ_UID`,
        { parse_mode: 'Markdown' }
    );
});

// /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    const keyboard = {
        reply_markup: {
            keyboard: [
                [{ text: '📊 Мой профиль' }],
                [{ text: '🏆 Подтвердить рекорд' }],
                [{ text: '⚔️ Мои вызовы' }],
                [{ text: '🛒 Магазин вызовов' }],
                [{ text: '❓ Поддержка' }]
            ],
            resize_keyboard: true
        }
    };
    
    await bot.sendMessage(chatId, 
        `🥊 *Добро пожаловать в PRORANK!*\n\n` +
        `*Твой ID:* \`${userId}\`\n\n` +
        `🔗 Привяжи аккаунт: /verify твой_UID (UID из профиля на сайте)`,
        { parse_mode: 'Markdown', ...keyboard }
    );
});

// 📊 Мой профиль
bot.onText(/📊 Мой профиль/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    // Проверяем, привязан ли аккаунт
    const fightersRef = collection(db, "fighters");
    const q = query(fightersRef, where("telegramId", "==", String(userId)));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
        await bot.sendMessage(chatId, 
            `📊 *Твой профиль*\n🆔 ID: \`${userId}\`\n\n` +
            `⚠️ Аккаунт не привязан. Используй /verify для привязки.`,
            { parse_mode: 'Markdown' }
        );
    } else {
        const fighter = snapshot.docs[0].data();
        await bot.sendMessage(chatId, 
            `📊 *Твой профиль*\n\n` +
            `👤 Имя: ${fighter.name || '—'}\n` +
            `🏆 Побед: ${fighter.wins || 0}\n` +
            `⭐ FRS: ${fighter.frs || 0}\n` +
            `🎯 Вызовов: ${(fighter.freeChallenges || 0) + (fighter.purchasedChallenges || 0)}`,
            { parse_mode: 'Markdown' }
        );
    }
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
                [{ text: '💥 Финиш', callback_data: 'record_finish' }],
                [{ text: '🏆 Победа на турнире', callback_data: 'record_tournament' }]
            ]
        }
    };
    
    await bot.sendMessage(chatId, `🏆 *Выбери тип достижения:*`, { parse_mode: 'Markdown', ...keyboard });
});

// 🛒 Магазин вызовов
bot.onText(/🛒 Магазин вызовов/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 
        `🛒 *Купить вызовы*\n\n` +
        `⭐ 5 звёзд → 5 вызовов (50₽)\n` +
        `⭐ 15 звёзд → 20 вызовов (150₽)\n\n` +
        `💎 Премиум → 30 звёзд (300₽)\n\n` +
        `👉 Купить на сайте: ${process.env.SITE_URL || 'https://ilez68414-cmyk.github.io/prorank-live/'}shop.html`,
        { parse_mode: 'Markdown' }
    );
});

// Выбор типа рекорда
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;
    
    if (data.startsWith('record_')) {
        const type = data.replace('record_', '');
        pendingVerifications.set(userId, { step: 'waiting_for_description', type });
        await bot.sendMessage(chatId, 
            `📝 *Напиши описание рекорда*\n(Соперник, дата, место)`,
            { parse_mode: 'Markdown' }
        );
        await bot.answerCallbackQuery(query.id);
    }
    
    if (data.startsWith('approve_')) {
        const requestId = data.replace('approve_', '');
        await bot.sendMessage(chatId, `✅ *Заявка #${requestId} ОДОБРЕНА!*`, { parse_mode: 'Markdown' });
        await bot.answerCallbackQuery(query.id);
    }
    
    if (data.startsWith('reject_')) {
        const requestId = data.replace('reject_', '');
        await bot.sendMessage(chatId, `❌ *Заявка #${requestId} ОТКЛОНЕНА*`, { parse_mode: 'Markdown' });
        await bot.answerCallbackQuery(query.id);
    }
});

// Обработка текста (описание)
bot.on('text', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    
    if (['📊 Мой профиль', '🏆 Подтвердить рекорд', '⚔️ Мои вызовы', '🛒 Магазин вызовов', '❓ Поддержка'].includes(text)) return;
    
    const pending = pendingVerifications.get(userId);
    if (!pending) return;
    
    if (pending.step === 'waiting_for_description') {
        pending.description = text;
        pending.step = 'waiting_for_media';
        pendingVerifications.set(userId, pending);
        await bot.sendMessage(chatId, `✅ Описание сохранено!\n\n📸 Теперь отправь *фото* доказательство.`, { parse_mode: 'Markdown' });
    }
});

// Обработка фото
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

// ⚔️ Мои вызовы
bot.onText(/⚔️ Мои вызовы/, async (msg) => {
    await bot.sendMessage(msg.chat.id, `⚔️ *Мои вызовы*\n\nВ разработке. Зайди на сайт в раздел "Мои вызовы".`, { parse_mode: 'Markdown' });
});

// ❓ Поддержка
bot.onText(/❓ Поддержка/, async (msg) => {
    await bot.sendMessage(msg.chat.id, `❓ *Поддержка*\n\nЧат: @prorank_support\n\nПо вопросам привязки аккаунта: /verify`, { parse_mode: 'Markdown' });
});

setInterval(() => console.log('💓 Бот жив'), 30000);
console.log('🤖 Бот PRORANK запущен с поддержкой привязки аккаунта!');